import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chamar, conta, criarConta, criarPeca, entrar, infinitePay, painel, site } from './ajuda'

/** textos que tentam virar comando no banco */
const ATAQUES = ["' OR '1'='1", "'; DROP TABLE pedidos; --", '" OR ""="', '1; DELETE FROM admins', "admin'--", '%27%20OR%201%3D1', '\\x00\\x27']

const TABELAS = ['colecoes', 'pecas', 'estoque', 'pedidos', 'pedido_itens', 'pagamentos', 'admins', 'sessoes', 'clientes', 'configuracoes']

async function contagens() {
  const r: Record<string, number> = {}
  for (const t of TABELAS) r[t] = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<number>('n'))!
  return r
}

afterEach(() => vi.restoreAllMocks())

describe('texto de ataque vira só texto', () => {
  it('no login do painel e da conta: recusa, sem erro do servidor e sem mexer no banco', async () => {
    await entrar()
    const antes = await contagens()
    for (const a of ATAQUES) {
      const painelR = await chamar('https://livi.test/api/painel/entrar', {
        method: 'POST',
        headers: { Host: 'livi.test', Origin: 'https://livi.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.0.0.${ATAQUES.indexOf(a)}` },
        body: JSON.stringify({ email: `${a}@exemplo.com`, senha: a }),
      })
      expect([401, 429], a).toContain(painelR.status)
      expect([400, 401], a).toContain((await conta('POST', '/entrar', { whatsapp: a, senha: a })).status)
    }
    expect(await contagens()).toEqual(antes)
  })

  it('na sacola, no CEP e nos endereços com código ou número', async () => {
    await criarPeca({ M: 5 })
    infinitePay()
    const token = await criarConta()
    const antes = await contagens()
    for (const a of ATAQUES) {
      const sacola = await site('POST', '', { itens: [{ peca: a, cor: a, tamanho: 'M', qtd: 1 }], cliente: {}, entrega: { tipo: 'maceio', cep: '57020000', rua: a, numero: a, bairro: a } }, `10.1.0.${ATAQUES.indexOf(a)}`, token)
      // recusado: pela peça que não existe (409) ou pelo campo comprido demais (400)
      expect([400, 409], a).toContain(sacola.status)
      expect((await site('GET', `/frete?cep=${encodeURIComponent(a)}`)).status, a).toBe(400)
      expect((await site('GET', `/${encodeURIComponent(a)}`)).status, a).toBe(404)
      expect((await painel(await entrar(), 'GET', `/pecas/${encodeURIComponent(a)}`)).status, a).toBe(404)
    }
    const depois = await contagens()
    // só as sessões do painel abertas no laço e nada mais
    expect({ ...depois, admins: 0, sessoes: 0 }).toEqual({ ...antes, admins: 0, sessoes: 0 })
  })

  it('nome com HTML é guardado e devolvido como texto, igual ao digitado (a tela escapa ao mostrar)', async () => {
    const token = await entrar()
    const html = '<img src=x onerror=alert(1)>'
    const r = await painel(token, 'POST', '/colecoes', { nome: html, fundo: '#000000', descricao: '<script>alert(2)</script>' })
    expect(r.status).toBe(201)
    expect(await r.json()).toMatchObject({ nome: html, descricao: '<script>alert(2)</script>' })
    expect(r.headers.get('Content-Type')).toMatch(/application\/json/)
  })
})

describe('corpo estranho', () => {
  it('JSON ilegível, lista no lugar de objeto ou texto gigante: 400, nunca 500', async () => {
    const token = await entrar()
    const zap = { 'Content-Type': 'application/json' }
    for (const corpo of ['{', 'lixo', '[]', 'null', '123', '"x"']) {
      expect((await chamar('http://localhost/api/conta/entrar', { method: 'POST', headers: zap, body: corpo })).status, corpo).toBe(400)
      expect((await chamar('http://localhost/api/conta/criar', { method: 'POST', headers: zap, body: corpo })).status, corpo).toBe(400)
      expect((await painel(token, 'PUT', '/ajustes', undefined)).status).toBe(400)
    }
    const gigante = 'x'.repeat(1_000_000)
    expect((await conta('POST', '/entrar', { whatsapp: gigante, senha: gigante })).status).toBe(400)
    expect((await conta('POST', '/criar', { nome: gigante, whatsapp: '(82) 99999-1234', email: 'a@b.com', senha: 'senha-boa-123' })).status).toBe(400)
    expect((await painel(token, 'POST', '/colecoes', { nome: gigante, fundo: '#000000' })).status).toBe(400)
  })

  it('campo com o tipo errado (número, lista, objeto) é recusado', async () => {
    const token = await entrar()
    for (const nome of [123, ['a'], { a: 1 }, true]) expect((await painel(token, 'POST', '/colecoes', { nome, fundo: '#000000' })).status, JSON.stringify(nome)).toBe(400)
    for (const whatsapp of [82999991234, ['82999991234'], { n: 1 }]) expect((await conta('POST', '/entrar', { whatsapp, senha: 'x' })).status, JSON.stringify(whatsapp)).toBe(400)
  })
})

describe('outros sites (CORS)', () => {
  it('as rotas públicas liberam qualquer site; a resposta do painel não libera nenhum', async () => {
    for (const caminho of ['/api/pedidos', '/api/conta/entrar']) {
      const r = await chamar(`http://localhost${caminho}`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://yan791.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type, authorization' },
      })
      expect(r.headers.get('Access-Control-Allow-Origin'), caminho).toBe('*')
      expect(r.headers.get('Access-Control-Allow-Headers')?.toLowerCase(), caminho).toContain('authorization')
      // sem cookie em chamada de outro site: a sessão das clientes vai no cabeçalho
      expect(r.headers.get('Access-Control-Allow-Credentials'), caminho).toBeNull()
    }
    const doPainel = await chamar('https://livi.test/api/painel/colecoes', { headers: { Host: 'livi.test', Origin: 'https://site-mal.example' } })
    expect(doPainel.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('contas das clientes', () => {
  it('o token de uma cliente não abre o painel, e o do painel não abre a conta', async () => {
    const cliente = await criarConta()
    const admin = await entrar()
    expect((await painel(cliente, 'GET', '/eu')).status).toBe(401)
    expect((await conta('GET', '', undefined, admin)).status).toBe(401)
  })

  it('a senha da cliente não aparece em nenhuma resposta e fica guardada embaralhada', async () => {
    const senha = 'senha-bem-secreta-123'
    const r = await conta('POST', '/criar', { nome: 'Joana Teste', whatsapp: '(82) 97777-1111', email: 'joana@exemplo.com', senha })
    expect(r.status).toBe(201)
    const texto = await r.text()
    expect(texto).not.toContain(senha)
    const guardada = await env.DB.prepare(`SELECT senha FROM clientes WHERE whatsapp = '5582977771111'`).first<string>('senha')
    expect(guardada).not.toContain(senha)
    expect(guardada).toMatch(/^hmac-pbkdf2-sha256\$\d+\$/)
  })

  it('a resposta de "esse WhatsApp já tem conta" mostra quem é cliente da loja (achado, sem limite de tentativas)', async () => {
    await criarConta({ whatsapp: '(82) 96666-2222' })
    const respostas = []
    for (let i = 0; i < 25; i++) respostas.push((await conta('POST', '/criar', { nome: 'Curiosa', whatsapp: '(82) 96666-2222', email: 'c@exemplo.com', senha: 'senha-boa-123' }, undefined, '10.9.9.9')).status)
    // 25 tentativas do mesmo IP, todas respondidas: o limite de contas novas só conta as que deram certo
    expect(respostas.every((s) => s === 409)).toBe(true)
  })
})
