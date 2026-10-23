import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { agora, gerarHashSenha, hashToken, novoToken } from '../worker/seguranca'
import { chamar, doPainel, entrar, painel } from './ajuda'

const SENHA = 'senha-forte-da-livia'

/** alguém do painel com senha de verdade (a ajuda "entrar" abre a sessão direto no banco) */
async function criarAdmin(email = 'livia@exemplo.com', senha = SENHA) {
  const hash = await gerarHashSenha(senha, env.SENHA_PEPPER)
  await env.DB.prepare(`INSERT INTO admins (email, nome, senha) VALUES (?1, 'Livia', ?2)`).bind(email, hash).run()
  return email
}

const entrarComSenha = (corpo: unknown, ip = '198.51.100.1', origem = 'https://livi.test') =>
  chamar('https://livi.test/api/painel/entrar', {
    method: 'POST',
    headers: { Host: 'livi.test', Origin: origem, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(corpo),
  })

const tokenDoCookie = (r: Response) => /livi_sessao=([^;]+)/.exec(r.headers.get('Set-Cookie') ?? '')?.[1] ?? ''

describe('entrar no painel', () => {
  it('com a senha certa: cookie só deste site, fora do alcance de JavaScript e só por HTTPS', async () => {
    await criarAdmin()
    const r = await entrarComSenha({ email: 'LIVIA@exemplo.com ', senha: SENHA })
    expect(r.status).toBe(200)
    const cookie = r.headers.get('Set-Cookie') ?? ''
    expect(cookie).toMatch(/livi_sessao=[\w-]{40,}/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=Strict/i)
    expect(cookie).toMatch(/Path=\//)
    const eu = await painel(tokenDoCookie(r), 'GET', '/eu')
    expect(eu.status).toBe(200)
    expect(await eu.json()).toMatchObject({ email: 'livia@exemplo.com' })
  })

  it('a sessão fica guardada só como hash: o token do cookie não está no banco', async () => {
    await criarAdmin()
    const token = tokenDoCookie(await entrarComSenha({ email: 'livia@exemplo.com', senha: SENHA }))
    const { results } = await env.DB.prepare('SELECT token_hash FROM sessoes').all<{ token_hash: string }>()
    expect(results.map((r) => r.token_hash)).not.toContain(token)
    expect(results.map((r) => r.token_hash)).toContain(await hashToken(token))
  })

  it('senha errada e e-mail que não existe dão a mesma resposta', async () => {
    await criarAdmin()
    const errada = await entrarComSenha({ email: 'livia@exemplo.com', senha: 'outra-senha-qualquer' })
    const ninguem = await entrarComSenha({ email: 'ninguem@exemplo.com', senha: SENHA })
    expect(errada.status).toBe(401)
    expect(ninguem.status).toBe(401)
    expect(await errada.json()).toEqual(await ninguem.json())
    expect(errada.headers.get('Set-Cookie')).toBeNull()
  })

  it('5 senhas erradas travam o e-mail por 15 minutos, até para a senha certa', async () => {
    await criarAdmin()
    for (let i = 0; i < 5; i++) expect((await entrarComSenha({ email: 'livia@exemplo.com', senha: `errada-${i}` }, `198.51.100.${i + 10}`)).status).toBe(401)
    expect((await entrarComSenha({ email: 'livia@exemplo.com', senha: SENHA }, '198.51.100.99')).status).toBe(429)
    // passou a janela: entra
    await env.DB.prepare('UPDATE tentativas SET desde = desde - 901').run()
    expect((await entrarComSenha({ email: 'livia@exemplo.com', senha: SENHA }, '198.51.100.99')).status).toBe(200)
  })

  it('20 erros do mesmo IP travam aquele IP, para qualquer e-mail; outro IP entra', async () => {
    await criarAdmin()
    for (let i = 0; i < 20; i++) expect((await entrarComSenha({ email: `tentativa-${i}@exemplo.com`, senha: 'x' }, '203.0.113.50')).status).toBe(401)
    expect((await entrarComSenha({ email: 'livia@exemplo.com', senha: SENHA }, '203.0.113.50')).status).toBe(429)
    expect((await entrarComSenha({ email: 'livia@exemplo.com', senha: SENHA }, '203.0.113.51')).status).toBe(200)
  }, 30_000)

  it('pedido de entrar vindo de outro site é recusado', async () => {
    await criarAdmin()
    expect((await entrarComSenha({ email: 'livia@exemplo.com', senha: SENHA }, '198.51.100.1', 'https://site-mal.example')).status).toBe(403)
  })

  it('sair apaga a sessão: o cookie antigo não entra mais', async () => {
    await criarAdmin()
    const token = tokenDoCookie(await entrarComSenha({ email: 'livia@exemplo.com', senha: SENHA }))
    expect((await painel(token, 'POST', '/sair')).status).toBe(200)
    expect((await painel(token, 'GET', '/eu')).status).toBe(401)
  })

  it('sessão vencida ou inventada não entra, e o cookie é apagado', async () => {
    const token = novoToken()
    const admin = await env.DB.prepare(`INSERT INTO admins (email, nome, senha) VALUES ('velha@exemplo.com', 'V', 'x') RETURNING id`).first<number>('id')
    await env.DB.prepare('INSERT INTO sessoes (token_hash, admin_id, expira_em) VALUES (?1, ?2, ?3)').bind(await hashToken(token), admin, agora() - 1).run()
    const vencida = await painel(token, 'GET', '/colecoes')
    expect(vencida.status).toBe(401)
    expect(vencida.headers.get('Set-Cookie')).toMatch(/livi_sessao=;.*Max-Age=0/i)
    expect((await painel(novoToken(), 'GET', '/colecoes')).status).toBe(401)
  })

  it('o painel só aceita a sessão no cookie, não no cabeçalho Authorization', async () => {
    const token = await entrar()
    const r = await chamar('https://livi.test/api/painel/eu', { headers: { Host: 'livi.test', Authorization: `Bearer ${token}` } })
    expect(r.status).toBe(401)
  })
})

describe('tudo do painel pede login', () => {
  const ROTAS: [string, string][] = [
    ['GET', '/eu'],
    ['GET', '/colecoes'],
    ['POST', '/colecoes'],
    ['PUT', '/colecoes/1'],
    ['DELETE', '/colecoes/1'],
    ['POST', '/colecoes/ordem'],
    ['GET', '/pecas'],
    ['GET', '/pecas/1'],
    ['POST', '/pecas'],
    ['PUT', '/pecas/1'],
    ['DELETE', '/pecas/1'],
    ['POST', '/pecas/ordem'],
    ['POST', '/fotos'],
    ['POST', '/fotos/pequena'],
    ['POST', '/fotos/descartar'],
    ['GET', '/pessoas'],
    ['POST', '/pessoas'],
    ['POST', '/pessoas/1/link'],
    ['POST', '/pessoas/1/dois-fatores/desligar'],
    ['DELETE', '/pessoas/1'],
    ['GET', '/ajustes'],
    ['PUT', '/ajustes'],
    ['GET', '/pedidos'],
    ['GET', '/pedidos/contagem'],
    ['GET', '/pedidos/opcoes'],
    ['POST', '/pedidos'],
    ['GET', '/pedidos/1'],
    ['POST', '/pedidos/1/pago'],
    ['POST', '/pedidos/1/enviado'],
    ['POST', '/pedidos/1/entregue'],
    ['POST', '/pedidos/1/cancelar'],
    ['PUT', '/pedidos/1/observacao'],
    ['POST', '/pedidos/1/nova-senha'],
    ['GET', '/compra-teste'],
    ['POST', '/compra-teste'],
    ['POST', '/dois-fatores/comecar'],
    ['POST', '/dois-fatores/ligar'],
    ['POST', '/dois-fatores/codigos'],
    ['POST', '/dois-fatores/desligar'],
  ]

  it(`sem sessão, as ${ROTAS.length} rotas respondem 401 e nada muda no banco`, async () => {
    const antes = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM colecoes) + (SELECT COUNT(*) FROM pecas) + (SELECT COUNT(*) FROM admins) AS n').first<number>('n')
    for (const [metodo, caminho] of ROTAS) {
      const r = await painel('', metodo, caminho, metodo === 'GET' ? undefined : {})
      expect(r.status, `${metodo} ${caminho}`).toBe(401)
    }
    const depois = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM colecoes) + (SELECT COUNT(*) FROM pecas) + (SELECT COUNT(*) FROM admins) AS n').first<number>('n')
    expect(depois).toBe(antes)
  })

  it('com sessão, o que altera algo só vale vindo do próprio painel (sem Origin ou de outro site: 403)', async () => {
    const token = await entrar()
    const corpo = JSON.stringify({ nome: 'Coleção nova', fundo: '#4f0f10' })
    const semOrigem = await chamar('https://livi.test/api/painel/colecoes', {
      method: 'POST',
      headers: { Host: 'livi.test', Cookie: `livi_sessao=${token}`, 'Content-Type': 'application/json' },
      body: corpo,
    })
    const deFora = await chamar('https://livi.test/api/painel/colecoes', {
      method: 'POST',
      headers: { ...doPainel(token), Origin: 'https://livi.test.site-mal.example', 'Content-Type': 'application/json' },
      body: corpo,
    })
    expect(semOrigem.status).toBe(403)
    expect(deFora.status).toBe(403)
    expect((await painel(token, 'POST', '/colecoes', { nome: 'Coleção nova', fundo: '#4f0f10' })).status).toBe(201)
    // ler continua valendo sem Origin (o navegador não manda em GET)
    expect((await chamar('https://livi.test/api/painel/colecoes', { headers: { Host: 'livi.test', Cookie: `livi_sessao=${token}` } })).status).toBe(200)
  })

  it('outro site não recebe licença (CORS) para ler o painel', async () => {
    const r = await chamar('https://livi.test/api/painel/eu', {
      method: 'OPTIONS',
      headers: { Host: 'livi.test', Origin: 'https://site-mal.example', 'Access-Control-Request-Method': 'GET' },
    })
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('pessoas com acesso', () => {
  async function convidar(token: string, email = 'nova@exemplo.com') {
    const r = await painel(token, 'POST', '/pessoas', { nome: 'Pessoa Nova', email })
    expect(r.status).toBe(201)
    const { link } = (await r.json()) as { link: string }
    expect(link).toMatch(/^https:\/\/livi\.test\/painel\/convite\/[\w-]{40,}$/)
    return link.split('/').at(-1)!
  }

  it('o convite cria a pessoa sem senha e um link que vale uma vez; com a senha, ela entra', async () => {
    const token = await entrar()
    const convite = await convidar(token)
    const ver = await painel('', 'GET', `/convite/${convite}`)
    expect(await ver.json()).toMatchObject({ email: 'nova@exemplo.com', primeiroAcesso: true })

    const usar = await painel('', 'POST', `/convite/${convite}`, { nome: 'Pessoa Nova', senha: 'uma-senha-boa' })
    expect(usar.status).toBe(200)
    expect(tokenDoCookie(usar)).toBeTruthy()
    expect((await painel('', 'POST', `/convite/${convite}`, { nome: 'Outra', senha: 'outra-senha-boa' })).status).toBe(404)
    expect((await entrarComSenha({ email: 'nova@exemplo.com', senha: 'uma-senha-boa' })).status).toBe(200)
  })

  it('e-mail repetido ou estranho não convida', async () => {
    const token = await entrar()
    await convidar(token)
    expect((await painel(token, 'POST', '/pessoas', { nome: 'De novo', email: 'NOVA@exemplo.com' })).status).toBe(409)
    expect((await painel(token, 'POST', '/pessoas', { nome: 'Ruim', email: 'nao-e-email' })).status).toBe(400)
    expect((await painel(token, 'POST', '/pessoas', { nome: '', email: 'x@exemplo.com' })).status).toBe(400)
  })

  it('link novo invalida o anterior; link vencido ou inventado não vale', async () => {
    const token = await entrar()
    const primeiro = await convidar(token)
    const { id } = (await env.DB.prepare(`SELECT id FROM admins WHERE email = 'nova@exemplo.com'`).first<{ id: number }>())!
    const segundo = ((await (await painel(token, 'POST', `/pessoas/${id}/link`)).json()) as { link: string }).link.split('/').at(-1)!
    expect((await painel('', 'GET', `/convite/${primeiro}`)).status).toBe(404)
    expect((await painel('', 'GET', `/convite/${segundo}`)).status).toBe(200)
    await env.DB.prepare('UPDATE convites SET expira_em = ?1').bind(agora() - 1).run()
    expect((await painel('', 'GET', `/convite/${segundo}`)).status).toBe(404)
    expect((await painel('', 'GET', `/convite/${novoToken()}`)).status).toBe(404)
  })

  it('senha curta no convite é recusada, e o link continua valendo', async () => {
    const convite = await convidar(await entrar())
    expect((await painel('', 'POST', `/convite/${convite}`, { nome: 'Pessoa', senha: 'curta' })).status).toBe(400)
    expect((await painel('', 'GET', `/convite/${convite}`)).status).toBe(200)
  })

  it('tirar o acesso de alguém fecha as sessões dela; ninguém tira o próprio acesso', async () => {
    const eu = await entrar()
    const outra = await entrar()
    const { id: idOutra } = (await (await painel(outra, 'GET', '/eu')).json()) as { id: number }
    const { id: meuId } = (await (await painel(eu, 'GET', '/eu')).json()) as { id: number }

    expect((await painel(eu, 'DELETE', `/pessoas/${meuId}`)).status).toBe(400)
    expect((await painel(eu, 'DELETE', `/pessoas/${idOutra}`)).status).toBe(200)
    expect((await painel(outra, 'GET', '/eu')).status).toBe(401)
    expect((await painel(eu, 'DELETE', '/pessoas/999999')).status).toBe(404)
    expect((await painel(eu, 'DELETE', '/pessoas/abc')).status).toBe(404)
  })

  it('a lista mostra quem é você e quem ainda não criou a senha', async () => {
    const token = await entrar()
    await convidar(token)
    const lista = (await (await painel(token, 'GET', '/pessoas')).json()) as { email: string; ativo: boolean; voce: boolean }[]
    expect(lista.find((p) => p.email === 'nova@exemplo.com')).toMatchObject({ ativo: false, voce: false })
    expect(lista.filter((p) => p.voce)).toHaveLength(1)
    expect(JSON.stringify(lista)).not.toMatch(/senha|token/i)
  })
})
