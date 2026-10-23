import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { limparCacheCatalogo } from '../worker/catalogo'
import { aviso, chamar, criarConta, criarPeca, entrar, estoqueDe, infinitePay, loja, painel, pedido, site } from './ajuda'

const MACEIO = { tipo: 'maceio', cep: '57020-000', rua: 'Rua do Sol', numero: '10', bairro: 'Centro' }
const item = (mudar: Record<string, unknown> = {}) => ({ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 1, ...mudar })

const comprar = (token: string, itens: unknown, entrega: unknown = MACEIO, ip = '198.51.100.7') => site('POST', '', { itens, cliente: {}, entrega }, ip, token)

const quantosPedidos = () => env.DB.prepare('SELECT COUNT(*) AS n FROM pedidos').first<number>('n')

afterEach(() => vi.restoreAllMocks())

describe('o que a compra aceita', () => {
  it('o preço vem do banco: o que o navegador mandar não vale', async () => {
    await criarPeca({ M: 3 })
    const chamadas = infinitePay()
    const r = await comprar(await criarConta(), [item({ qtd: 2, preco: 1, precoCentavos: 1, preco_centavos: 1 })])
    expect(r.status).toBe(201)
    const { codigo } = (await r.json()) as { codigo: string }
    const p = await env.DB.prepare('SELECT itens_centavos, frete_centavos, total_centavos FROM pedidos WHERE codigo = ?1').bind(codigo).first()
    expect(p).toEqual({ itens_centavos: 20_000, frete_centavos: 1500, total_centavos: 21_500 })
    const link = chamadas.find((c) => c.url.endsWith('/links'))!.corpo as { items: { price: number; quantity: number }[] }
    expect(link.items).toEqual([
      { description: 'Vestido Teste · Preto · M', price: 10_000, quantity: 2 },
      { description: 'Entrega em Maceió', price: 1500, quantity: 1 },
    ])
  })

  it('recusa sacola vazia, grande demais ou com quantidade fora do limite', async () => {
    await criarPeca({ M: 50 })
    infinitePay()
    const token = await criarConta()
    for (const [caso, itens] of [
      ['vazia', []],
      ['não é lista', { peca: 'vestido-teste' }],
      ['21 linhas', Array.from({ length: 21 }, () => item())],
      ['quantidade zero', [item({ qtd: 0 })]],
      ['quantidade 11', [item({ qtd: 11 })]],
      ['quantidade quebrada', [item({ qtd: 1.5 })]],
      ['quantidade em texto', [item({ qtd: '2' })]],
    ] as const)
      expect((await comprar(token, itens)).status, caso).toBe(400)
    expect(await quantosPedidos()).toBe(0)
  })

  it('peça escondida, de coleção escondida, inventada, ou cor e tamanho que não existem: 409 e nada reservado', async () => {
    const peca = await criarPeca({ M: 5 })
    infinitePay()
    const token = await criarConta()
    for (const [caso, itens] of [
      ['peça inventada', [item({ peca: 'nao-existe' })]],
      ['cor que não existe', [item({ cor: 'Azul' })]],
      ['tamanho que não existe', [item({ tamanho: 'XG' })]],
    ] as const)
      expect((await comprar(token, itens)).status, caso).toBe(409)

    await env.DB.prepare('UPDATE pecas SET visivel = 0 WHERE id = ?1').bind(peca).run()
    expect((await comprar(token, [item()])).status).toBe(409)
    await env.DB.prepare('UPDATE pecas SET visivel = 1 WHERE id = ?1').bind(peca).run()
    await env.DB.prepare(`UPDATE colecoes SET visivel = 0 WHERE slug = 'teste'`).run()
    expect((await comprar(token, [item()])).status).toBe(409)
    expect(await quantosPedidos()).toBe(0)
  })

  it('mais do que tem é recusado, inclusive somando a mesma peça em duas linhas', async () => {
    const peca = await criarPeca({ M: 1 })
    infinitePay()
    const token = await criarConta()
    expect((await comprar(token, [item({ qtd: 2 })])).status).toBe(409)
    expect((await comprar(token, [item(), item()])).status).toBe(409)
    expect(await quantosPedidos()).toBe(0)
    expect((await comprar(token, [item()])).status).toBe(201)
    expect(await estoqueDe(peca, 'M')).toBe(1)
  })

  it('peça sob encomenda compra mesmo sem estoque', async () => {
    const peca = await criarPeca({ M: 0 })
    await env.DB.prepare(`UPDATE pecas SET sob_encomenda = 1 WHERE id = ?1`).bind(peca).run()
    infinitePay()
    expect((await comprar(await criarConta(), [item({ qtd: 3 })])).status).toBe(201)
  })

  it('a peça reservada some do site para as outras clientes até a reserva vencer', async () => {
    await criarPeca({ M: 1 })
    infinitePay()
    const r = await comprar(await criarConta(), [item()])
    expect(r.status).toBe(201)
    expect((await comprar(await criarConta(), [item()])).status).toBe(409)
    const disponivel = async () => {
      limparCacheCatalogo()
      const l = (await (await loja()).json()) as { colecoes: { pecas: { slug: string; disponivel: Record<string, number> }[] }[] }
      return l.colecoes.flatMap((c) => c.pecas).find((p) => p.slug === 'vestido-teste')!.disponivel['Preto|M']
    }
    expect(await disponivel()).toBe(0)
    const { codigo } = (await r.json()) as { codigo: string }
    await env.DB.prepare('UPDATE pedidos SET reserva_ate = unixepoch() - 1 WHERE codigo = ?1').bind(codigo).run()
    expect(await disponivel()).toBe(1)
    expect((await comprar(await criarConta(), [item()])).status).toBe(201)
  })

  it('entrega mal preenchida é recusada', async () => {
    await criarPeca({ M: 5 })
    infinitePay()
    const token = await criarConta()
    for (const [caso, entrega] of [
      ['sem entrega', null],
      ['tipo inventado', { ...MACEIO, tipo: 'drone' }],
      ['CEP curto', { ...MACEIO, cep: '5702' }],
      ['sem rua', { ...MACEIO, rua: '' }],
      ['sem número', { ...MACEIO, numero: ' ' }],
      ['sem bairro', { ...MACEIO, bairro: '' }],
      ['rua enorme', { ...MACEIO, rua: 'x'.repeat(121) }],
    ] as const)
      expect((await comprar(token, [item()], entrega)).status, caso).toBe(400)
    expect(await quantosPedidos()).toBe(0)
  })
})

describe('limites da compra', () => {
  it('até 3 pedidos esperando pagamento por WhatsApp; vencido um, abre espaço', async () => {
    await criarPeca({ M: 20 })
    infinitePay()
    const token = await criarConta()
    const codigos = []
    for (let i = 0; i < 3; i++) {
      const r = await comprar(token, [item()], MACEIO, `198.51.100.${i + 1}`)
      expect(r.status).toBe(201)
      codigos.push(((await r.json()) as { codigo: string }).codigo)
    }
    expect((await comprar(token, [item()], MACEIO, '198.51.100.9')).status).toBe(429)
    await env.DB.prepare('UPDATE pedidos SET reserva_ate = unixepoch() - 1 WHERE codigo = ?1').bind(codigos[0]).run()
    expect((await comprar(token, [item()], MACEIO, '198.51.100.9')).status).toBe(201)
  })

  it('até 10 pedidos por hora do mesmo IP, mesmo com contas diferentes', async () => {
    await criarPeca({ M: 50 })
    infinitePay()
    const ip = '203.0.113.77'
    for (let i = 0; i < 10; i++) expect((await comprar(await criarConta(), [item()], MACEIO, ip)).status).toBe(201)
    expect((await comprar(await criarConta(), [item()], MACEIO, ip)).status).toBe(429)
    expect((await comprar(await criarConta(), [item()], MACEIO, '203.0.113.78')).status).toBe(201)
  }, 30_000)

  it('com as vendas desligadas, fora do PC, a compra é recusada', async () => {
    await criarPeca({ M: 5 })
    infinitePay()
    const token = await criarConta()
    const r = await chamar('https://livi.test/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ itens: [item()], cliente: {}, entrega: MACEIO }),
    })
    expect(r.status).toBe(409)
    expect(((await r.json()) as { erro: string }).erro).toMatch(/pausadas/)
  })

  it('corpo que não é JSON, ou não é um objeto: 400', async () => {
    const token = await criarConta()
    for (const corpo of ['lixo', '[]', 'null', '"texto"']) {
      const r = await chamar('http://localhost/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: corpo })
      expect(r.status, corpo).toBe(400)
    }
  })
})

describe('pagamento e página do pedido', () => {
  it('InfinitePay fora do ar: a cliente vê o erro, o pedido some e a peça volta na hora', async () => {
    await criarPeca({ M: 1 })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('erro', { status: 500 }))
    const r = await comprar(await criarConta(), [item()])
    expect(r.status).toBe(502)
    expect(await quantosPedidos()).toBe(0)
    vi.restoreAllMocks()
    infinitePay()
    expect((await comprar(await criarConta(), [item()])).status).toBe(201)
  })

  it('a página do pedido não mostra CPF, e-mail, telefone nem endereço', async () => {
    await env.DB.prepare(`UPDATE configuracoes SET valor = json_set(valor, '$.freteCorreios.nordeste.pac', 2500) WHERE chave = 'ajustes'`).run()
    await criarPeca({ M: 2 })
    infinitePay()
    const token = await criarConta({ nome: 'Maria Silva Teste', email: 'maria.secreta@exemplo.com', whatsapp: '(82) 98765-4321' })
    const correios = { tipo: 'pac', cep: '50030-000', rua: 'Rua Secreta', numero: '777', bairro: 'Bairro Escondido', cidade: 'Recife' }
    let r = await site('POST', '', { itens: [item()], cliente: { cpf: '529.982.247-25' }, entrega: correios }, '198.51.100.7', token)
    if (r.status === 400) {
      // sem a tabela de frete salva antes, salva pelo painel e tenta de novo
      const admin = await entrar()
      await painel(admin, 'PUT', '/ajustes', { vendasOnline: false, taxaMaceioCentavos: 1500, parcelasSemJuros: 3, whatsapp: '5582998115324', freteCorreios: { nordeste: { pac: 2500, sedex: null } } })
      r = await site('POST', '', { itens: [item()], cliente: { cpf: '529.982.247-25' }, entrega: correios }, '198.51.100.7', token)
    }
    expect(r.status).toBe(201)
    const { codigo } = (await r.json()) as { codigo: string }
    const publico = JSON.stringify(await (await site('GET', `/${codigo}`)).json())
    for (const segredo of ['52998224725', '529.982', 'maria.secreta', '98765', '4321', 'Rua Secreta', '777', 'Bairro Escondido', '50030', 'Silva'])
      expect(publico, segredo).not.toContain(segredo)
    expect(publico).toContain('"nome":"Maria"')
  })

  it('código inválido, desconhecido ou de venda do painel: 404', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 2 })
    await painel(token, 'POST', '/pedidos', { itens: [{ pecaId: peca, cor: 'c1', tamanho: 'M', quantidade: 1, precoCentavos: 100 }] })
    const { codigo } = (await env.DB.prepare(`SELECT codigo FROM pedidos WHERE origem = 'fora'`).first<{ codigo: string }>())!
    for (const c of ['abc', 'zzzzzzzzzzzzzzzz', codigo, "' OR 1=1 --"]) {
      expect((await site('GET', `/${encodeURIComponent(c)}`)).status, c).toBe(404)
      expect((await site('POST', `/${encodeURIComponent(c)}/conferir`, { transacao: 'tx' })).status, c).toBe(404)
    }
  })

  it('volta da cliente com a InfinitePay fora do ar: a página abre, e o pedido segue esperando', async () => {
    await criarPeca({ M: 2 })
    infinitePay()
    const { codigo } = (await (await comprar(await criarConta(), [item()])).json()) as { codigo: string }
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('fora do ar', { status: 503 }))
    const r = await site('POST', `/${codigo}/conferir`, { transacao: 'tx-1' })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ situacao: 'aguardando' })
  })

  it('a volta da cliente com outro valor não aprova; até 30 conferências por pedido em 15 minutos', async () => {
    await criarPeca({ M: 2 })
    infinitePay()
    const { codigo } = (await (await comprar(await criarConta(), [item()])).json()) as { codigo: string }
    vi.restoreAllMocks()
    infinitePay({ success: true, paid: true, amount: 100 })
    for (let i = 0; i < 30; i++) expect(((await (await site('POST', `/${codigo}/conferir`, { transacao: `tx-${i}` })).json()) as { situacao: string }).situacao).toBe('aguardando')
    expect((await site('POST', `/${codigo}/conferir`, { transacao: 'tx-31' })).status).toBe(429)
  }, 30_000)

  it('aviso da InfinitePay e volta da cliente ao mesmo tempo: aprova uma vez e baixa o estoque uma vez', async () => {
    const peca = await criarPeca({ M: 2 })
    infinitePay()
    const { codigo } = (await (await comprar(await criarConta(), [item()])).json()) as { codigo: string }
    const total = (await env.DB.prepare('SELECT total_centavos FROM pedidos WHERE codigo = ?1').bind(codigo).first<number>('total_centavos'))!
    vi.restoreAllMocks()
    infinitePay({ success: true, paid: true, amount: total, capture_method: 'pix' })

    const respostas = await Promise.all([
      aviso({ order_nsu: codigo, transaction_nsu: 'tx-1' }),
      site('POST', `/${codigo}/conferir`, { transacao: 'tx-1' }),
      aviso({ order_nsu: codigo, transaction_nsu: 'tx-1' }),
      site('POST', `/${codigo}/conferir`, { transacao: 'tx-1' }),
    ])
    expect(respostas.map((r) => r.status).every((s) => s === 200)).toBe(true)
    expect(await pedido(codigo)).toMatchObject({ situacao: 'pago', estoque_baixado: 1 })
    expect(await estoqueDe(peca, 'M')).toBe(1)
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM pagamentos').first<number>('n')).toBe(1)
  })

  describe('pedido já pago recebendo outra transação', () => {
    /** um pedido do site pago pelo aviso com a transação tx-1; devolve o código e as chamadas à InfinitePay de mentira */
    async function pedidoPago(conferencia: (total: number) => Record<string, unknown> = (total) => ({ success: true, paid: true, amount: total })) {
      const peca = await criarPeca({ M: 2 })
      infinitePay()
      const { codigo } = (await (await comprar(await criarConta(), [item()])).json()) as { codigo: string }
      const total = (await env.DB.prepare('SELECT total_centavos FROM pedidos WHERE codigo = ?1').bind(codigo).first<number>('total_centavos'))!
      vi.restoreAllMocks()
      const chamadas = infinitePay(conferencia(total))
      expect(await (await aviso({ order_nsu: codigo, transaction_nsu: 'tx-1' })).json()).toMatchObject({ resultado: 'pago' })
      return { peca, codigo, total, chamadas }
    }
    const linha = (codigo: string) =>
      env.DB.prepare('SELECT observacao, transacao, situacao FROM pedidos WHERE codigo = ?1').bind(codigo).first<{ observacao: string; transacao: string; situacao: string }>()
    const pagamentos = () => env.DB.prepare('SELECT transacao FROM pagamentos ORDER BY transacao').all<{ transacao: string }>()

    it('a cliente pagou de novo: o pagamento fica registrado e o pedido ganha a anotação para devolver', async () => {
      const { peca, codigo } = await pedidoPago()
      expect(await (await aviso({ order_nsu: codigo, transaction_nsu: 'tx-2' })).json()).toMatchObject({ resultado: 'repetido' })
      expect(await linha(codigo)).toMatchObject({ transacao: 'tx-1', situacao: 'pago', observacao: expect.stringMatching(/Pagamento repetido.*tx-2/) })
      expect((await pagamentos()).results.map((p) => p.transacao)).toEqual(['tx-1', 'tx-2'])
      // a peça saiu uma vez só
      expect(await estoqueDe(peca, 'M')).toBe(1)

      // o aviso da segunda vez chegando de novo não anota duas vezes
      expect(await (await aviso({ order_nsu: codigo, transaction_nsu: 'tx-2' })).json()).toMatchObject({ resultado: 'ja' })
      expect((await linha(codigo))?.observacao.match(/Pagamento repetido/g)).toHaveLength(1)
    })

    it('a mesma transação de novo (aviso repetido ou a página recarregada) não pergunta nada à InfinitePay', async () => {
      const { codigo, chamadas } = await pedidoPago()
      const antes = chamadas.length
      await aviso({ order_nsu: codigo, transaction_nsu: 'tx-1' })
      await site('POST', `/${codigo}/conferir`, { transacao: 'tx-1' })
      await site('POST', `/${codigo}/conferir`, {})
      expect(chamadas.length).toBe(antes)
      expect((await linha(codigo))?.observacao).toBe('')
    })

    it('a volta da cliente de um segundo pagamento também registra', async () => {
      const { codigo } = await pedidoPago()
      const r = await site('POST', `/${codigo}/conferir`, { transacao: 'tx-volta' })
      expect(r.status).toBe(200)
      expect(await r.json()).toMatchObject({ situacao: 'pago' })
      expect((await linha(codigo))?.observacao).toMatch(/Pagamento repetido.*tx-volta/)
    })

    it('transação que a InfinitePay não confirma não anota nada, e o aviso pede para mandar de novo', async () => {
      const { codigo } = await pedidoPago()
      vi.restoreAllMocks()
      infinitePay({ success: true, paid: false })
      const r = await aviso({ order_nsu: codigo, transaction_nsu: 'tx-forjada' })
      expect(r.status).toBe(400)
      expect(await linha(codigo)).toMatchObject({ observacao: '', transacao: 'tx-1', situacao: 'pago' })
      expect((await pagamentos()).results).toHaveLength(1)
    })

    it('o aviso e a volta da cliente do segundo pagamento chegando juntos registram uma vez', async () => {
      const { codigo } = await pedidoPago()
      await Promise.all([
        aviso({ order_nsu: codigo, transaction_nsu: 'tx-2' }),
        site('POST', `/${codigo}/conferir`, { transacao: 'tx-2' }),
        aviso({ order_nsu: codigo, transaction_nsu: 'tx-2' }),
      ])
      expect((await pagamentos()).results.map((p) => p.transacao)).toEqual(['tx-1', 'tx-2'])
      expect((await linha(codigo))?.observacao.match(/Pagamento repetido/g)).toHaveLength(1)
    })

    it('o painel mostra o alerta de pago duas vezes', async () => {
      const { codigo } = await pedidoPago()
      await aviso({ order_nsu: codigo, transaction_nsu: 'tx-2' })
      const { id } = (await pedido(codigo))!
      const r = (await (await painel(await entrar(), 'GET', `/pedidos/${id}`)).json()) as { observacao: string; situacao: string }
      expect(r).toMatchObject({ situacao: 'pago', observacao: expect.stringContaining('Pagamento repetido') })
    })
  })
})
