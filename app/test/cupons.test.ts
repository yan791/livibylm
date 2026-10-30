import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { limparCacheCatalogo } from '../worker/catalogo'
import { criarConta, criarPeca, entrar, infinitePay, loja, painel, salvarPeca, site } from './ajuda'

const MACEIO = { tipo: 'maceio', cep: '57020-000', rua: 'Rua do Sol', numero: '10', bairro: 'Centro' }
const item = (mudar: Record<string, unknown> = {}) => ({ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 1, ...mudar })
const comprar = (token: string, itens: unknown, cupom?: unknown, ip = '198.51.100.20') =>
  site('POST', '', { itens, cliente: {}, entrega: MACEIO, ...(cupom === undefined ? {} : { cupom }) }, ip, token)

type CupomPainel = { id: number; codigo: string; percentual: number; ativo: boolean; usos: number }
const listar = async (token: string) => (await (await painel(token, 'GET', '/cupons')).json()) as CupomPainel[]
const criarCupom = async (token: string, codigo: string, percentual: number) => {
  const r = await painel(token, 'POST', '/cupons', { codigo, percentual })
  expect(r.status, codigo).toBe(201)
  return ((await r.json()) as { id: number }).id
}
const conferirCupom = (codigo: string, ip = '198.51.100.21') => site('GET', `/cupom?codigo=${encodeURIComponent(codigo)}`, undefined, ip)
const pedidoDe = (codigo: string) =>
  env.DB.prepare('SELECT id, itens_centavos, frete_centavos, total_centavos, cupom, cupom_percentual, desconto_centavos FROM pedidos WHERE codigo = ?1')
    .bind(codigo)
    .first<Record<string, number | string>>()

afterEach(() => vi.restoreAllMocks())

describe('cupons no painel', () => {
  it('só com login', async () => {
    expect((await painel('', 'GET', '/cupons')).status).toBe(401)
    expect((await painel('', 'POST', '/cupons', { codigo: 'LIVI10', percentual: 10 })).status).toBe(401)
  })

  it('cria com o código em maiúsculas e sem espaços, e lista sem uso', async () => {
    const token = await entrar()
    await criarCupom(token, ' livi 10 ', 10)
    expect(await listar(token)).toMatchObject([{ codigo: 'LIVI10', percentual: 10, ativo: true, usos: 0 }])
  })

  it('recusa código ou porcentagem fora da regra, e código repetido (sem diferença de maiúsculas)', async () => {
    const token = await entrar()
    for (const [caso, corpo] of [
      ['código curto', { codigo: 'AB', percentual: 10 }],
      ['código com hífen', { codigo: 'LIVI-10', percentual: 10 }],
      ['código com acento', { codigo: 'PROMOÇÃO', percentual: 10 }],
      ['código comprido', { codigo: 'A'.repeat(21), percentual: 10 }],
      ['sem código', { percentual: 10 }],
      ['zero', { codigo: 'ZERO', percentual: 0 }],
      ['91%', { codigo: 'MUITO', percentual: 91 }],
      ['quebrado', { codigo: 'QUEBRADO', percentual: 10.5 }],
      ['em texto', { codigo: 'TEXTO', percentual: '10' }],
    ] as const)
      expect((await painel(token, 'POST', '/cupons', corpo)).status, caso).toBe(400)
    await criarCupom(token, 'LIVI10', 10)
    expect((await painel(token, 'POST', '/cupons', { codigo: 'livi10', percentual: 20 })).status).toBe(409)
    expect(await listar(token)).toHaveLength(1)
  })

  it('edita, desliga, liga e apaga; cupom que não existe dá 404', async () => {
    const token = await entrar()
    const id = await criarCupom(token, 'LIVI10', 10)
    const outro = await criarCupom(token, 'NATAL', 15)
    expect((await painel(token, 'PUT', `/cupons/${id}`, { codigo: 'LIVI15', percentual: 15, ativo: false })).status).toBe(200)
    expect((await listar(token)).find((c) => c.id === id)).toMatchObject({ codigo: 'LIVI15', percentual: 15, ativo: false })
    // trocar para um código que outro cupom já usa
    expect((await painel(token, 'PUT', `/cupons/${outro}`, { codigo: 'livi15', percentual: 15 })).status).toBe(409)
    expect((await painel(token, 'DELETE', `/cupons/${id}`)).status).toBe(200)
    expect((await listar(token)).map((c) => c.codigo)).toEqual(['NATAL'])
    for (const [metodo, corpo] of [
      ['PUT', { codigo: 'XYZ', percentual: 5 }],
      ['DELETE', undefined],
    ] as const)
      expect((await painel(token, metodo, `/cupons/999999`, corpo)).status, metodo).toBe(404)
  })
})

describe('cupom na compra', () => {
  it('a sacola confere o cupom antes de pagar: ligado vale, desligado ou inventado não', async () => {
    const token = await entrar()
    const id = await criarCupom(token, 'LIVI10', 10)
    const ok = await conferirCupom(' livi10 ')
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ codigo: 'LIVI10', percentual: 10 })
    expect((await conferirCupom('NAOEXISTE')).status).toBe(404)
    await painel(token, 'PUT', `/cupons/${id}`, { codigo: 'LIVI10', percentual: 10, ativo: false })
    expect((await conferirCupom('LIVI10')).status).toBe(404)
    expect((await conferirCupom('LIVI-10')).status).toBe(400)
    expect((await conferirCupom('')).status).toBe(400)
  })

  it('quem chuta códigos para depois de 30 tentativas em 15 minutos', async () => {
    for (let i = 0; i < 30; i++) expect((await conferirCupom(`CHUTE${i}`, '198.51.100.99')).status).toBe(404)
    expect((await conferirCupom('CHUTE31', '198.51.100.99')).status).toBe(429)
    // outro IP segue normal
    expect((await conferirCupom('CHUTE31', '198.51.100.98')).status).toBe(404)
  })

  it('o servidor aplica o desconto nas peças (não na entrega), guarda o cupom e cobra o total certo', async () => {
    await criarPeca({ M: 5 })
    const painelToken = await entrar()
    await criarCupom(painelToken, 'LIVI10', 10)
    const chamadas = infinitePay()
    const r = await comprar(await criarConta(), [item({ qtd: 2 })], 'livi10')
    expect(r.status).toBe(201)
    const { codigo } = (await r.json()) as { codigo: string }
    expect(await pedidoDe(codigo)).toMatchObject({
      itens_centavos: 20_000,
      desconto_centavos: 2000,
      frete_centavos: 1500,
      total_centavos: 19_500,
      cupom: 'LIVI10',
      cupom_percentual: 10,
    })
    // cada peça vai para a InfinitePay já com o desconto: a soma é o total do pedido
    const link = chamadas.find((c) => c.url.endsWith('/links'))!.corpo as { items: { price: number; quantity: number; description: string }[] }
    expect(link.items).toEqual([
      { description: 'Vestido Teste · Preto · M · cupom LIVI10', price: 9000, quantity: 2 },
      { description: 'Entrega em Maceió', price: 1500, quantity: 1 },
    ])
    expect(link.items.reduce((s, i) => s + i.price * i.quantity, 0)).toBe(19_500)
  })

  it('cupom desligado ou inventado: a compra é recusada e nada fica reservado; código fora da regra: 400', async () => {
    await criarPeca({ M: 5 })
    const painelToken = await entrar()
    const id = await criarCupom(painelToken, 'LIVI10', 10)
    await painel(painelToken, 'PUT', `/cupons/${id}`, { codigo: 'LIVI10', percentual: 10, ativo: false })
    infinitePay()
    const token = await criarConta()
    const recusada = await comprar(token, [item()], 'LIVI10')
    expect(recusada.status).toBe(409)
    expect(((await recusada.json()) as { erro: string }).erro).toContain('LIVI10')
    expect((await comprar(token, [item()], 'INVENTADO')).status).toBe(409)
    expect((await comprar(token, [item()], 'LIVI 10%')).status).toBe(400)
    expect((await comprar(token, [item()], 10)).status).toBe(400)
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM pedidos').first<number>('n')).toBe(0)
    // sem cupom (vazio) segue normal
    expect((await comprar(token, [item()], '')).status).toBe(201)
  })

  it('o pedido guarda a porcentagem da hora; mudar o cupom depois não muda o pedido. Usos contam só as compras pagas', async () => {
    await criarPeca({ M: 5 })
    const painelToken = await entrar()
    const id = await criarCupom(painelToken, 'LIVI10', 10)
    infinitePay()
    const { codigo } = (await (await comprar(await criarConta(), [item()], 'LIVI10')).json()) as { codigo: string }
    await painel(painelToken, 'PUT', `/cupons/${id}`, { codigo: 'LIVI10', percentual: 50 })
    expect(await pedidoDe(codigo)).toMatchObject({ cupom_percentual: 10, desconto_centavos: 1000, total_centavos: 10_500 })
    expect((await listar(painelToken))[0].usos).toBe(0)
    const { id: pedidoId } = (await pedidoDe(codigo)) as { id: number }
    expect((await painel(painelToken, 'POST', `/pedidos/${pedidoId}/pago`, { pagamento: 'pix' })).status).toBe(200)
    expect((await listar(painelToken))[0].usos).toBe(1)
    // o painel mostra o cupom no pedido
    const detalhe = (await (await painel(painelToken, 'GET', `/pedidos/${pedidoId}`)).json()) as Record<string, unknown>
    expect(detalhe).toMatchObject({ cupom: 'LIVI10', cupomPercentual: 10, descontoCentavos: 1000, totalCentavos: 10_500 })
  })
})

describe('desconto da peça', () => {
  const pecaNoSite = async () => {
    limparCacheCatalogo()
    const { colecoes } = (await (await loja()).json()) as { colecoes: { pecas: Record<string, unknown>[] }[] }
    return colecoes.flatMap((c) => c.pecas).find((p) => p.slug === 'vestido-teste')
  }

  it('o painel salva o desconto e o site recebe o preço com desconto e o preço cheio', async () => {
    const id = await criarPeca({ M: 5 })
    const token = await entrar()
    expect(await pecaNoSite()).toMatchObject({ preco: 100, precoCheio: 100, desconto: 0 })
    expect((await salvarPeca(token, id, (p) => void Object.assign(p, { desconto: 30 }))).status).toBe(200)
    expect(await pecaNoSite()).toMatchObject({ preco: 70, precoCheio: 100, desconto: 30 })
    for (const desconto of [91, -1, 2.5, '30'])
      expect((await salvarPeca(token, id, (p) => void Object.assign(p, { desconto }))).status, String(desconto)).toBe(400)
  })

  it('o painel antigo (sem o campo) não apaga o desconto da peça', async () => {
    const id = await criarPeca({ M: 5 })
    const token = await entrar()
    await salvarPeca(token, id, (p) => void Object.assign(p, { desconto: 30 }))
    expect((await salvarPeca(token, id, (p) => void delete (p as Record<string, unknown>).desconto)).status).toBe(200)
    expect(await pecaNoSite()).toMatchObject({ desconto: 30 })
  })

  it('a compra cobra o preço com desconto, e o cupom vale em cima dele', async () => {
    const id = await criarPeca({ M: 5 })
    const token = await entrar()
    await salvarPeca(token, id, (p) => void Object.assign(p, { desconto: 30 }))
    await criarCupom(token, 'LIVI10', 10)
    infinitePay()
    const { codigo } = (await (await comprar(await criarConta(), [item({ qtd: 2 })], 'LIVI10')).json()) as { codigo: string }
    // 100,00 com 30% = 70,00; o cupom tira 10% de 70,00 = 7,00 por unidade
    expect(await pedidoDe(codigo)).toMatchObject({ itens_centavos: 14_000, desconto_centavos: 1400, total_centavos: 14_100 })
    const precoItem = await env.DB.prepare('SELECT preco_centavos FROM pedido_itens').first<number>('preco_centavos')
    expect(precoItem).toBe(7000)
  })

  it('a venda fora do site já vem com o preço com desconto', async () => {
    const id = await criarPeca({ M: 5 })
    const token = await entrar()
    await salvarPeca(token, id, (p) => void Object.assign(p, { desconto: 25 }))
    const opcoes = (await (await painel(token, 'GET', '/pedidos/opcoes')).json()) as { id: number; precoCentavos: number }[]
    expect(opcoes.find((o) => o.id === id)?.precoCentavos).toBe(7500)
  })

  it('as peças em promoção do catálogo passam a mostrar o preço cheio, cobrando o mesmo', async () => {
    limparCacheCatalogo()
    const { colecoes } = (await (await loja()).json()) as { colecoes: { pecas: Record<string, unknown>[] }[] }
    const pecas = colecoes.flatMap((c) => c.pecas)
    expect(pecas.find((p) => p.slug === 'vestido-solar-verde')).toMatchObject({ preco: 249, precoCheio: 498, desconto: 50 })
    expect(pecas.find((p) => p.slug === 'vestido-soneto-vinho')).toMatchObject({ preco: 278.6, precoCheio: 398, desconto: 30 })
    // peça sem promoção fica igual
    expect(pecas.find((p) => p.slug === 'saia-melodia-vinho')).toMatchObject({ preco: 338, precoCheio: 338, desconto: 0 })
  })
})
