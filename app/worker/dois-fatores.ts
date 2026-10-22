/*
  Verificação em duas etapas do painel (TOTP, RFC 6238): depois da senha, o
  código de 6 números que um app autenticador (Google Authenticator,
  Microsoft Authenticator...) mostra e troca a cada 30 segundos. Cada pessoa
  liga a sua na tela "Acesso" (/api/painel/dois-fatores/...):
    POST /comecar    (senha) gera o segredo e o endereço do QR code
    POST /ligar      (código do app) confirma e devolve os códigos de recuperação
    POST /codigos    (senha) troca os códigos de recuperação
    POST /desligar   (senha e código) desliga
  Quem perdeu o celular entra com um código de recuperação, ou outra pessoa do
  painel desliga a verificação dela em "Acesso" (worker/painel.ts).
  - O segredo fica cifrado (AES-GCM) com uma chave tirada do SENHA_PEPPER:
    uma cópia do banco sozinha não gera os códigos.
  - Vale o código do intervalo atual e o de um antes ou depois (relógio do
    celular um pouco adiantado ou atrasado), e cada intervalo vale uma vez só.
  - Código errado conta como senha errada (worker/seguranca.ts): 5 em 15
    minutos travam o e-mail.
*/
import { Hono, type Context } from 'hono'
import type { Ambiente } from './tipos'
import { falha, lerCorpo } from './validar'
import { bloqueado, conferirSenha, deBase64, fecharOutrasSessoes, hashToken, paraBase64, registrarFalha } from './seguranca'

const PASSO = 30
const DIGITOS = 6
/** quantos códigos de recuperação a pessoa recebe de uma vez */
export const CODIGOS_RECUPERACAO = 10
/** o nome que aparece no app autenticador */
const EMISSOR = 'Livi painel'

/* ---------- o código do app ---------- */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function paraBase32(bytes: Uint8Array) {
  let s = ''
  let bits = 0
  let valor = 0
  for (const b of bytes) {
    valor = (valor << 8) | b
    bits += 8
    while (bits >= 5) {
      s += BASE32[(valor >>> (bits - 5)) & 31]
      bits -= 5
    }
    valor &= (1 << bits) - 1
  }
  return bits ? s + BASE32[(valor << (5 - bits)) & 31] : s
}

export function deBase32(texto: string) {
  const bytes: number[] = []
  let bits = 0
  let valor = 0
  for (const letra of texto.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    valor = (valor << 5) | BASE32.indexOf(letra)
    bits += 5
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255)
      bits -= 8
      valor &= (1 << bits) - 1
    }
  }
  return new Uint8Array(bytes)
}

/** o intervalo de 30 segundos de agora */
export const passoAtual = () => Math.floor(Date.now() / 1000 / PASSO)

/** o código de 6 números de um intervalo */
export async function codigoDoPasso(segredo: Uint8Array, passo: number) {
  const contador = new Uint8Array(8)
  new DataView(contador.buffer).setBigUint64(0, BigInt(passo))
  const chave = await crypto.subtle.importKey('raw', segredo, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', chave, contador))
  const i = h[h.length - 1] & 15
  const n = ((h[i] & 127) << 24) | (h[i + 1] << 16) | (h[i + 2] << 8) | h[i + 3]
  return String(n % 10 ** DIGITOS).padStart(DIGITOS, '0')
}

/* ---------- o segredo guardado cifrado ---------- */

async function chaveDoSegredo(pepper: string | undefined) {
  if (!pepper || pepper.length < 32) throw new Error('SENHA_PEPPER ausente ou curta: configure o segredo do Worker')
  const texto = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', texto.encode(pepper), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: texto.encode('livi-painel'), info: texto.encode('dois-fatores') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function cifrar(segredo: string, pepper: string | undefined) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chaveDoSegredo(pepper), new TextEncoder().encode(segredo))
  return `v1$${paraBase64(iv)}$${paraBase64(cifrado)}`
}

async function decifrar(guardado: string, pepper: string | undefined) {
  const [, iv, cifrado] = guardado.split('$')
  const aberto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64(iv) }, await chaveDoSegredo(pepper), deBase64(cifrado))
  return new TextDecoder().decode(aberto)
}

/* ---------- códigos de recuperação ---------- */

// sem 0, o, 1, l e i, que se confundem no papel
const LETRAS = '23456789abcdefghjkmnpqrstuvwxyz'

function novoCodigoRecuperacao() {
  let s = ''
  while (s.length < 8)
    for (const b of crypto.getRandomValues(new Uint8Array(8)))
      // sem viés: só bytes que caem por igual nas 31 letras
      if (b < 248 && s.length < 8) s += LETRAS[b % LETRAS.length]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

const hashRecuperacao = (codigo: string) => hashToken(`recuperacao:${codigo.toLowerCase().replace(/[^a-z0-9]/g, '')}`)

/** códigos novos (os antigos deixam de valer); devolve os códigos para mostrar uma vez só */
async function novosCodigos(db: D1Database, adminId: number) {
  const codigos = Array.from({ length: CODIGOS_RECUPERACAO }, novoCodigoRecuperacao)
  const inserir = db.prepare('INSERT INTO codigos_recuperacao (codigo_hash, admin_id) VALUES (?1, ?2)')
  await db.batch([
    db.prepare('DELETE FROM codigos_recuperacao WHERE admin_id = ?1').bind(adminId),
    ...(await Promise.all(codigos.map(async (c) => inserir.bind(await hashRecuperacao(c), adminId)))),
  ])
  return codigos
}

/**
  Confere o código do app (ou um de recuperação) e gasta: o mesmo não vale de
  novo. 'app', 'recuperacao' ou null (errado ou já usado).
*/
export async function gastarCodigo(db: D1Database, adminId: number, segredoGuardado: string, codigo: unknown, pepper: string | undefined) {
  const digitado = typeof codigo === 'string' ? codigo.replace(/\s/g, '').slice(0, 20) : ''
  if (/^\d{6}$/.test(digitado)) {
    const segredo = deBase32(await decifrar(segredoGuardado, pepper))
    const atual = passoAtual()
    for (const passo of [atual - 1, atual, atual + 1]) {
      if ((await codigoDoPasso(segredo, passo)) !== digitado) continue
      // só um pedido gasta cada intervalo, e nenhum antes do último usado
      const r = await db.prepare('UPDATE admins SET totp_ultimo = ?1 WHERE id = ?2 AND totp_ultimo < ?1').bind(passo, adminId).run()
      return r.meta.changes ? 'app' : null
    }
    return null
  }
  if (digitado.replace(/[^a-z0-9]/gi, '').length !== 8) return null
  const r = await db
    .prepare('DELETE FROM codigos_recuperacao WHERE codigo_hash = ?1 AND admin_id = ?2')
    .bind(await hashRecuperacao(digitado), adminId)
    .run()
  return r.meta.changes ? 'recuperacao' : null
}

export const recuperacaoRestantes = async (db: D1Database, adminId: number) =>
  (await db.prepare('SELECT COUNT(*) AS n FROM codigos_recuperacao WHERE admin_id = ?1').bind(adminId).first<number>('n')) ?? 0

/* ---------- ligar e desligar (com login) ---------- */

export const doisFatores = new Hono<Ambiente>()

type Linha = { senha: string | null; totp_segredo: string | null; totp_pendente: string | null }

/**
  A senha de quem está no painel, de novo, antes de mexer na verificação: uma
  sessão esquecida aberta não basta. Errada conta como tentativa errada (403,
  e não 401, que o painel entende como sessão encerrada).
*/
export async function conferirSenhaDeNovo(c: Context<Ambiente>, senha: unknown) {
  const db = c.env.DB
  const admin = c.get('admin')
  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  if (await bloqueado(db, admin.email, ip)) throw falha(429, 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.')
  const linha = await db.prepare('SELECT senha, totp_segredo, totp_pendente FROM admins WHERE id = ?1').bind(admin.id).first<Linha>()
  const certa = await conferirSenha(typeof senha === 'string' ? senha.slice(0, 200) : '', linha?.senha ?? null, c.env.SENHA_PEPPER)
  if (!linha || !certa) {
    await registrarFalha(db, admin.email, ip)
    throw falha(403, 'Senha incorreta.')
  }
  return linha
}

doisFatores.post('/comecar', async (c) => {
  const corpo = await lerCorpo(c)
  const linha = await conferirSenhaDeNovo(c, corpo.senha)
  if (linha.totp_segredo) throw falha(409, 'A verificação em duas etapas já está ligada.')
  const segredo = paraBase32(crypto.getRandomValues(new Uint8Array(20)))
  await c.env.DB.prepare('UPDATE admins SET totp_pendente = ?1 WHERE id = ?2').bind(await cifrar(segredo, c.env.SENHA_PEPPER), c.get('admin').id).run()
  const conta = encodeURIComponent(`${EMISSOR}:${c.get('admin').email}`)
  const uri = `otpauth://totp/${conta}?secret=${segredo}&issuer=${encodeURIComponent(EMISSOR)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASSO}`
  return c.json({ segredo, uri })
})

doisFatores.post('/ligar', async (c) => {
  const db = c.env.DB
  const admin = c.get('admin')
  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  if (await bloqueado(db, admin.email, ip)) throw falha(429, 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.')
  const linha = await db.prepare('SELECT senha, totp_segredo, totp_pendente FROM admins WHERE id = ?1').bind(admin.id).first<Linha>()
  if (linha?.totp_segredo) throw falha(409, 'A verificação em duas etapas já está ligada.')
  if (!linha?.totp_pendente) throw falha(400, 'Comece de novo: toque em "Ligar" e leia o QR code.')
  const corpo = await lerCorpo(c)
  if ((await gastarCodigo(db, admin.id, linha.totp_pendente, corpo.codigo, c.env.SENHA_PEPPER)) !== 'app') {
    await registrarFalha(db, admin.email, ip)
    throw falha(403, 'Código errado. Confira no app e digite o que aparece agora.')
  }
  await db.batch([
    db.prepare('UPDATE admins SET totp_segredo = totp_pendente, totp_pendente = NULL WHERE id = ?1').bind(admin.id),
    // os outros aparelhos saem: para voltar, passam pela verificação
    await fecharOutrasSessoes(c, admin.id),
  ])
  return c.json({ codigos: await novosCodigos(db, admin.id) })
})

doisFatores.post('/codigos', async (c) => {
  const corpo = await lerCorpo(c)
  const linha = await conferirSenhaDeNovo(c, corpo.senha)
  if (!linha.totp_segredo) throw falha(409, 'Ligue a verificação em duas etapas primeiro.')
  return c.json({ codigos: await novosCodigos(c.env.DB, c.get('admin').id) })
})

doisFatores.post('/desligar', async (c) => {
  const db = c.env.DB
  const admin = c.get('admin')
  const corpo = await lerCorpo(c)
  const linha = await conferirSenhaDeNovo(c, corpo.senha)
  if (!linha.totp_segredo) throw falha(409, 'A verificação em duas etapas já está desligada.')
  if (!(await gastarCodigo(db, admin.id, linha.totp_segredo, corpo.codigo, c.env.SENHA_PEPPER))) {
    await registrarFalha(db, admin.email, c.req.header('CF-Connecting-IP') ?? 'local')
    throw falha(403, 'Código errado. Confira no app e digite o que aparece agora.')
  }
  await desligar(db, admin.id)
  return c.json({ ok: true })
})

/** desliga a verificação de uma pessoa (ela mesma, ou outra pessoa do painel quando o celular sumiu) */
export const desligar = (db: D1Database, adminId: number) =>
  db.batch([
    db.prepare('UPDATE admins SET totp_segredo = NULL, totp_pendente = NULL, totp_ultimo = 0 WHERE id = ?1').bind(adminId),
    db.prepare('DELETE FROM codigos_recuperacao WHERE admin_id = ?1').bind(adminId),
  ])
