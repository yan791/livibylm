/*
  Acesso ao painel: senhas, sessões, convites e freio de tentativas.
  - Senha: HMAC com uma chave secreta do Worker (SENHA_PEPPER, fora do banco)
    e depois PBKDF2-SHA256 com sal próprio. O plano grátis dá 10 ms de CPU
    por pedido, então as voltas do PBKDF2 são poucas; a chave secreta é o que
    impede quebrar as senhas mesmo se uma cópia do banco vazar. O número de
    voltas fica junto do hash, então dá para aumentar depois sem invalidar as
    senhas antigas.
  - Sessão e convite: um token aleatório vai para o cookie ou para o link, e
    só o hash dele fica no banco.
  - Cookie HttpOnly, Secure e SameSite=Strict, e todo pedido que altera algo
    precisa vir do próprio site (cabeçalho Origin).
*/
import { createMiddleware } from 'hono/factory'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import type { AdminLogado, Ambiente } from './tipos'

const COOKIE = 'livi_sessao'
const DIA = 24 * 60 * 60
const SESSAO_DIAS = 30
export const CONVITE_DIAS = 7
const VOLTAS = 10_000

// limites de tentativas erradas numa janela de 15 minutos
const JANELA = 15 * 60
const LIMITE_EMAIL = 5
const LIMITE_IP = 20

export const agora = () => Math.floor(Date.now() / 1000)

const paraBase64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const deBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export function novoToken() {
  return paraBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function derivar(senha: string, pepper: string | undefined, sal: Uint8Array, voltas: number) {
  if (!pepper || pepper.length < 32) throw new Error('SENHA_PEPPER ausente ou curta: configure o segredo do Worker')
  const texto = new TextEncoder()
  const hmac = await crypto.subtle.importKey('raw', texto.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const comPepper = await crypto.subtle.sign('HMAC', hmac, texto.encode(senha))
  const chave = await crypto.subtle.importKey('raw', comPepper, 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: voltas }, chave, 256)
}

const FORMATO = 'hmac-pbkdf2-sha256'

export async function gerarHashSenha(senha: string, pepper: string | undefined) {
  const sal = crypto.getRandomValues(new Uint8Array(16))
  return `${FORMATO}$${VOLTAS}$${paraBase64(sal)}$${paraBase64(await derivar(senha, pepper, sal, VOLTAS))}`
}

const SEM_SENHA = `${FORMATO}$${VOLTAS}$${paraBase64(new Uint8Array(16))}$${paraBase64(new Uint8Array(32))}`

export async function conferirSenha(senha: string, guardado: string | null, pepper: string | undefined) {
  // sem senha guardada a conta é feita do mesmo jeito: o tempo de resposta não revela se o e-mail existe
  const [formato, voltas, sal, hash] = (guardado ?? SEM_SENHA).split('$')
  if (formato !== FORMATO) return false
  const calculado = new Uint8Array(await derivar(senha, pepper, deBase64(sal), Number(voltas)))
  const esperado = deBase64(hash)
  return guardado !== null && calculado.length === esperado.length && crypto.subtle.timingSafeEqual(calculado, esperado)
}

export function validarSenha(senha: unknown) {
  if (typeof senha !== 'string' || senha.length < 10)
    throw new HTTPException(400, { message: 'A senha precisa ter pelo menos 10 caracteres.' })
  if (senha.length > 200) throw new HTTPException(400, { message: 'Essa senha é longa demais.' })
  return senha
}

/* ---------- freio de tentativas ---------- */

export async function bloqueado(db: D1Database, email: string, ip: string) {
  const { results } = await db
    .prepare('SELECT chave, falhas FROM tentativas WHERE chave IN (?1, ?2) AND desde > ?3')
    .bind(`email:${email}`, `ip:${ip}`, agora() - JANELA)
    .all<{ chave: string; falhas: number }>()
  return results.some((r) => r.falhas >= (r.chave.startsWith('email:') ? LIMITE_EMAIL : LIMITE_IP))
}

export async function registrarFalha(db: D1Database, email: string, ip: string) {
  const sql = db.prepare(
    `INSERT INTO tentativas (chave, falhas, desde) VALUES (?1, 1, ?2)
     ON CONFLICT (chave) DO UPDATE SET
       falhas = CASE WHEN desde <= ?2 - ${JANELA} THEN 1 ELSE falhas + 1 END,
       desde = CASE WHEN desde <= ?2 - ${JANELA} THEN ?2 ELSE desde END`,
  )
  await db.batch([sql.bind(`email:${email}`, agora()), sql.bind(`ip:${ip}`, agora())])
}

export const limparFalhas = (db: D1Database, email: string) =>
  db.prepare('DELETE FROM tentativas WHERE chave = ?1 OR desde <= ?2').bind(`email:${email}`, agora() - JANELA).run()

/* ---------- sessão ---------- */

export async function abrirSessao(c: Context<Ambiente>, adminId: number) {
  const token = novoToken()
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessoes WHERE expira_em <= ?1').bind(agora()),
    c.env.DB.prepare('INSERT INTO sessoes (token_hash, admin_id, expira_em) VALUES (?1, ?2, ?3)').bind(
      await hashToken(token),
      adminId,
      agora() + SESSAO_DIAS * DIA,
    ),
    c.env.DB.prepare("UPDATE admins SET ultimo_acesso = datetime('now') WHERE id = ?1").bind(adminId),
  ])
  setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: SESSAO_DIAS * DIA })
}

export async function fecharSessao(c: Context<Ambiente>) {
  const token = getCookie(c, COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessoes WHERE token_hash = ?1').bind(await hashToken(token)).run()
  deleteCookie(c, COOKIE, { path: '/', secure: true })
}

/** só passa quem tem sessão válida; renova a sessão quando falta menos da metade do prazo */
export const exigirAdmin = createMiddleware<Ambiente>(async (c, next) => {
  const token = getCookie(c, COOKIE)
  if (!token) throw new HTTPException(401, { message: 'Entre para continuar.' })
  const hash = await hashToken(token)
  const linha = await c.env.DB.prepare(
    'SELECT a.id, a.email, a.nome, s.expira_em FROM sessoes s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?1 AND s.expira_em > ?2',
  )
    .bind(hash, agora())
    .first<AdminLogado & { expira_em: number }>()
  if (!linha) {
    deleteCookie(c, COOKIE, { path: '/', secure: true })
    throw new HTTPException(401, { message: 'Sua sessão terminou. Entre de novo.' })
  }
  if (linha.expira_em - agora() < (SESSAO_DIAS * DIA) / 2) {
    await c.env.DB.prepare('UPDATE sessoes SET expira_em = ?1 WHERE token_hash = ?2').bind(agora() + SESSAO_DIAS * DIA, hash).run()
    setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: SESSAO_DIAS * DIA })
  }
  c.set('admin', { id: linha.id, email: linha.email, nome: linha.nome })
  await next()
})

/** pedidos que mudam algo só valem vindos do próprio site */
export const mesmaOrigem = createMiddleware<Ambiente>(async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origem = c.req.header('Origin')
    const host = c.req.header('Host')
    let ok = false
    try {
      ok = !!origem && !!host && new URL(origem).host === host
    } catch {
      ok = false
    }
    if (!ok) throw new HTTPException(403, { message: 'Pedido recusado.' })
  }
  await next()
})
