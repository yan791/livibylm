/*
  Verificação em duas etapas do painel: ligar com o app, entrar com a senha e
  o código, códigos de recuperação, o link de senha nova e desligar.
*/
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { codigoDoPasso, CODIGOS_RECUPERACAO, deBase32, passoAtual } from '../worker/dois-fatores'
import { gerarHashSenha } from '../worker/seguranca'
import { painel } from './ajuda'

const SENHA = 'senha-da-livia-123'

/** uma pessoa do painel com senha; devolve o e-mail */
async function pessoa() {
  const email = `livia-${crypto.randomUUID().slice(0, 8)}@exemplo.com`
  await env.DB.prepare('INSERT INTO admins (email, nome, senha) VALUES (?1, ?2, ?3)')
    .bind(email, 'Livia', await gerarHashSenha(SENHA, env.SENHA_PEPPER))
    .run()
  return email
}

const idDe = async (email: string) => (await env.DB.prepare('SELECT id FROM admins WHERE email = ?1').bind(email).first<number>('id'))!

/** entra pela tela do painel; devolve a resposta e o cookie da sessão ('' se não abriu) */
async function entrar(email: string, senha = SENHA, codigo?: string) {
  const r = await painel('', 'POST', '/entrar', { email, senha, ...(codigo === undefined ? {} : { codigo }) })
  const sessao = /livi_sessao=([\w-]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1] ?? ''
  return { status: r.status, dados: (await r.json()) as { ok?: boolean; precisaCodigo?: boolean; recuperacaoRestantes?: number; erro?: string }, sessao }
}

/** o código que o app mostraria agora (passo: intervalos de 30 segundos antes ou depois) */
const codigo = (segredo: string, passo = 0) => codigoDoPasso(deBase32(segredo), passoAtual() + passo)
/** um código certamente errado */
const errado = async (segredo: string) => ((await codigo(segredo, 1)) === '123456' ? '654321' : '123456')

/** como se 30 segundos tivessem passado desde o último código usado */
const esperar = (email: string) => env.DB.prepare('UPDATE admins SET totp_ultimo = 0 WHERE email = ?1').bind(email).run()

/** liga a verificação como a tela "Acesso" faz; devolve o segredo, o endereço do QR code, os códigos de recuperação e a sessão */
async function ligar(email: string) {
  const { sessao } = await entrar(email)
  const comeco = (await (await painel(sessao, 'POST', '/dois-fatores/comecar', { senha: SENHA })).json()) as { segredo: string; uri: string }
  const r = await painel(sessao, 'POST', '/dois-fatores/ligar', { codigo: await codigo(comeco.segredo) })
  expect(r.status).toBe(200)
  const { codigos } = (await r.json()) as { codigos: string[] }
  return { ...comeco, codigos, sessao }
}

const conta = (email: string) =>
  env.DB.prepare('SELECT totp_segredo, totp_pendente, (SELECT COUNT(*) FROM codigos_recuperacao WHERE admin_id = a.id) AS codigos FROM admins a WHERE email = ?1')
    .bind(email)
    .first<{ totp_segredo: string | null; totp_pendente: string | null; codigos: number }>()

describe('ligar', () => {
  it('pede a senha de novo, mostra o QR code e só liga com um código certo do app', async () => {
    const email = await pessoa()
    const { sessao } = await entrar(email)
    expect((await painel('', 'POST', '/dois-fatores/comecar', { senha: SENHA })).status).toBe(401)
    expect((await painel(sessao, 'POST', '/dois-fatores/comecar', { senha: 'outra-senha-1' })).status).toBe(403)

    const r = await painel(sessao, 'POST', '/dois-fatores/comecar', { senha: SENHA })
    expect(r.status).toBe(200)
    const { segredo, uri } = (await r.json()) as { segredo: string; uri: string }
    expect(segredo).toMatch(/^[A-Z2-7]{32}$/)
    expect(uri).toBe(`otpauth://totp/Livi%20painel%3A${encodeURIComponent(email)}?secret=${segredo}&issuer=Livi%20painel&algorithm=SHA1&digits=6&period=30`)
    // o segredo fica cifrado, e ainda não está ligado
    const antes = await conta(email)
    expect(antes?.totp_segredo).toBeNull()
    expect(antes?.totp_pendente).toMatch(/^v1\$/)
    expect(antes?.totp_pendente).not.toContain(segredo)

    const recusado = await painel(sessao, 'POST', '/dois-fatores/ligar', { codigo: await errado(segredo) })
    expect(recusado.status).toBe(403)
    expect((await conta(email))?.totp_segredo).toBeNull()

    const ligado = await painel(sessao, 'POST', '/dois-fatores/ligar', { codigo: await codigo(segredo) })
    expect(ligado.status).toBe(200)
    const { codigos } = (await ligado.json()) as { codigos: string[] }
    expect(codigos).toHaveLength(CODIGOS_RECUPERACAO)
    for (const c of codigos) expect(c).toMatch(/^[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}$/)
    const depois = await conta(email)
    expect(depois).toMatchObject({ totp_pendente: null, codigos: CODIGOS_RECUPERACAO })
    expect(depois?.totp_segredo).not.toContain(segredo)
    const { results } = await env.DB.prepare('SELECT codigo_hash FROM codigos_recuperacao').all<{ codigo_hash: string }>()
    for (const c of codigos) expect(results.some((x) => x.codigo_hash.includes(c.replace('-', '')))).toBe(false)

    const pessoas = (await (await painel(sessao, 'GET', '/pessoas')).json()) as { email: string; doisFatores: boolean }[]
    expect(pessoas.find((p) => p.email === email)?.doisFatores).toBe(true)
    expect((await painel(sessao, 'POST', '/dois-fatores/comecar', { senha: SENHA })).status).toBe(409)
  })

  it('ao ligar, os outros aparelhos saem e este continua', async () => {
    const email = await pessoa()
    const outro = (await entrar(email)).sessao
    const { sessao } = await ligar(email)
    expect((await painel(outro, 'GET', '/eu')).status).toBe(401)
    expect((await painel(sessao, 'GET', '/eu')).status).toBe(200)
  })
})

describe('entrar', () => {
  it('a senha certa pede o código e não abre a sessão; com o código, entra', async () => {
    const email = await pessoa()
    const { segredo } = await ligar(email)
    const so = await entrar(email)
    expect(so).toMatchObject({ status: 200, dados: { precisaCodigo: true }, sessao: '' })
    const senhaErrada = await entrar(email, 'outra-senha-1', await codigo(segredo, 1))
    expect(senhaErrada.status).toBe(401)
    expect(senhaErrada.dados.erro).toMatch(/E-mail ou senha/)
    expect(senhaErrada.dados.precisaCodigo).toBeUndefined()

    const certo = await entrar(email, SENHA, await codigo(segredo, 1))
    expect(certo.status).toBe(200)
    expect(certo.sessao).not.toBe('')
    expect((await painel(certo.sessao, 'GET', '/eu')).status).toBe(200)
  })

  it('o mesmo código não vale duas vezes, nem um mais velho que o último usado', async () => {
    const email = await pessoa()
    const { segredo } = await ligar(email)
    const c = await codigo(segredo, 1)
    expect((await entrar(email, SENHA, c)).status).toBe(200)
    expect((await entrar(email, SENHA, c)).status).toBe(401)
    expect((await entrar(email, SENHA, await codigo(segredo))).status).toBe(401)
  })

  it('aceita o relógio do celular 30 segundos adiantado ou atrasado, não mais', async () => {
    const email = await pessoa()
    const { segredo } = await ligar(email)
    await esperar(email)
    expect((await entrar(email, SENHA, await codigo(segredo, -2))).status).toBe(401)
    expect((await entrar(email, SENHA, await codigo(segredo, 2))).status).toBe(401)
    expect((await entrar(email, SENHA, await codigo(segredo, -1))).status).toBe(200)
    await esperar(email)
    expect((await entrar(email, SENHA, ` ${(await codigo(segredo, 1)).replace(/^(\d{3})/, '$1 ')} `)).status).toBe(200)
  })

  it('5 códigos errados travam o e-mail por 15 minutos, e a senha certa sozinha não zera os erros', async () => {
    const email = await pessoa()
    const { segredo } = await ligar(email)
    for (let i = 0; i < 4; i++) expect((await entrar(email, SENHA, await errado(segredo))).status).toBe(401)
    expect((await entrar(email)).dados.precisaCodigo).toBe(true)
    expect((await entrar(email, SENHA, await errado(segredo))).status).toBe(401)
    const travado = await entrar(email, SENHA, await codigo(segredo, 1))
    expect(travado.status).toBe(429)
    expect(travado.sessao).toBe('')
  })

  it('código de recuperação entra uma vez só e avisa quantos sobram', async () => {
    const email = await pessoa()
    const { codigos } = await ligar(email)
    const r = await entrar(email, SENHA, codigos[0])
    expect(r.status).toBe(200)
    expect(r.dados.recuperacaoRestantes).toBe(CODIGOS_RECUPERACAO - 1)
    expect((await entrar(email, SENHA, codigos[0])).status).toBe(401)
    // digitado de qualquer jeito: maiúsculas, sem o traço, com espaço
    const outro = await entrar(email, SENHA, ` ${codigos[1].replace('-', ' ').toUpperCase()} `)
    expect(outro.status).toBe(200)
    expect(outro.dados.recuperacaoRestantes).toBe(CODIGOS_RECUPERACAO - 2)
  })

  it('quem não ligou entra só com a senha, como antes', async () => {
    const email = await pessoa()
    const r = await entrar(email)
    expect(r.status).toBe(200)
    expect(r.sessao).not.toBe('')
  })
})

describe('link de senha nova', () => {
  it('quem ligou a verificação precisa do código para criar a senha pelo link', async () => {
    const email = await pessoa()
    const { segredo, sessao } = await ligar(email)
    const { link } = (await (await painel(sessao, 'POST', `/pessoas/${await idDe(email)}/link`)).json()) as { link: string }
    const token = link.split('/painel/convite/')[1]
    expect(await (await painel('', 'GET', `/convite/${token}`)).json()).toMatchObject({ doisFatores: true })

    const semCodigo = await painel('', 'POST', `/convite/${token}`, { nome: 'Livia', senha: 'senha-nova-456' })
    expect(semCodigo.status).toBe(401)
    expect(semCodigo.headers.get('set-cookie')).toBeNull()
    // nada mudou: a senha antiga continua valendo e o link também
    expect((await entrar(email)).dados.precisaCodigo).toBe(true)

    const r = await painel('', 'POST', `/convite/${token}`, { nome: 'Livia', senha: 'senha-nova-456', codigo: await codigo(segredo, 1) })
    expect(r.status).toBe(200)
    expect(r.headers.get('set-cookie')).toMatch(/livi_sessao=/)
    expect((await entrar(email, 'senha-nova-456')).dados.precisaCodigo).toBe(true)
  })

  it('sem a verificação, o link não pede código', async () => {
    const email = await pessoa()
    const { sessao } = await entrar(email)
    const { link } = (await (await painel(sessao, 'POST', `/pessoas/${await idDe(email)}/link`)).json()) as { link: string }
    const token = link.split('/painel/convite/')[1]
    expect(await (await painel('', 'GET', `/convite/${token}`)).json()).toMatchObject({ doisFatores: false })
    expect((await painel('', 'POST', `/convite/${token}`, { nome: 'Livia', senha: 'senha-nova-456' })).status).toBe(200)
  })
})

describe('desligar e trocar os códigos', () => {
  it('a própria pessoa desliga com a senha e o código do app', async () => {
    const email = await pessoa()
    const { segredo, sessao } = await ligar(email)
    expect((await painel(sessao, 'POST', '/dois-fatores/desligar', { senha: 'outra-senha-1', codigo: await codigo(segredo, 1) })).status).toBe(403)
    expect((await painel(sessao, 'POST', '/dois-fatores/desligar', { senha: SENHA, codigo: await errado(segredo) })).status).toBe(403)
    expect((await painel(sessao, 'POST', '/dois-fatores/desligar', { senha: SENHA, codigo: await codigo(segredo, 1) })).status).toBe(200)
    expect(await conta(email)).toMatchObject({ totp_segredo: null, codigos: 0 })
    expect((await entrar(email)).sessao).not.toBe('')
    expect((await painel(sessao, 'POST', '/dois-fatores/desligar', { senha: SENHA, codigo: '123456' })).status).toBe(409)
  })

  it('quem perdeu o celular: outra pessoa do painel desliga a verificação dela, com a própria senha', async () => {
    const livia = await pessoa()
    await ligar(livia)
    const yan = await pessoa()
    const { sessao } = await entrar(yan)
    const caminho = `/pessoas/${await idDe(livia)}/dois-fatores/desligar`
    expect((await painel(sessao, 'POST', caminho, { senha: 'outra-senha-1' })).status).toBe(403)
    expect((await painel(sessao, 'POST', caminho, { senha: SENHA })).status).toBe(200)
    expect(await conta(livia)).toMatchObject({ totp_segredo: null, codigos: 0 })
    expect((await entrar(livia)).sessao).not.toBe('')
    expect((await painel(sessao, 'POST', caminho, { senha: SENHA })).status).toBe(409)
    // a própria pessoa não usa esse caminho: desliga com o código do app
    expect((await painel(sessao, 'POST', `/pessoas/${await idDe(yan)}/dois-fatores/desligar`, { senha: SENHA })).status).toBe(400)
  })

  it('códigos de recuperação novos: os antigos deixam de valer', async () => {
    const email = await pessoa()
    const { codigos, sessao } = await ligar(email)
    expect((await painel(sessao, 'POST', '/dois-fatores/codigos', { senha: 'outra-senha-1' })).status).toBe(403)
    const r = await painel(sessao, 'POST', '/dois-fatores/codigos', { senha: SENHA })
    const novos = ((await r.json()) as { codigos: string[] }).codigos
    expect(novos).toHaveLength(CODIGOS_RECUPERACAO)
    expect((await entrar(email, SENHA, codigos[0])).status).toBe(401)
    expect((await entrar(email, SENHA, novos[0])).status).toBe(200)
  })
})

describe('o código do app', () => {
  it('bate com o exemplo da RFC 6238 (SHA-1, 59 segundos: 94287082, com 6 números: 287082)', async () => {
    const segredo = new TextEncoder().encode('12345678901234567890')
    expect(await codigoDoPasso(segredo, Math.floor(59 / 30))).toBe('287082')
    expect(await codigoDoPasso(segredo, Math.floor(1111111109 / 30))).toBe('081804')
  })
})
