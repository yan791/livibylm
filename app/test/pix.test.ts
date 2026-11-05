import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { limparCacheCatalogo } from '../worker/catalogo'
import { aviso, criarConta, criarPeca, entrar, infinitePay, loja, painel, site } from './ajuda'

const ambiente = env as unknown as Record<string, unknown>
const MACEIO = { tipo: 'maceio', cep: '57020-000', rua: 'Rua do Sol', numero: '10', bairro: 'Centro' }
const comprar = async () =>
  site('POST', '', { itens: [{ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 1 }], cliente: {}, entrega: MACEIO }, '198.51.100.40', await criarConta())

const descontoNoSite = async () => {
  limparCacheCatalogo()
  return ((await (await loja()).json()) as { ajustes: { descontoPix: number } }).ajustes.descontoPix
}
const linkCriado = (chamadas: { url: string; corpo: Record<string, unknown> }[]) => chamadas.find((c) => c.url.endsWith('/links'))!.corpo

const AJUSTES = { vendasOnline: false, taxaMaceioCentavos: 1500, parcelasSemJuros: 3, whatsapp: '5582998115324', freteCorreios: {} }

afterEach(() => {
  delete ambiente.INFINITEPAY_CHAVE
  limparCacheCatalogo()
  vi.restoreAllMocks()
})

describe('desconto no Pix', () => {
  it('sem a chave de API da InfinitePay: o site não promete o desconto e o link vai sem ele', async () => {
    expect(await descontoNoSite()).toBe(0)
    await criarPeca({ M: 3 })
    const chamadas = infinitePay()
    expect((await comprar()).status).toBe(201)
    expect(linkCriado(chamadas)).not.toHaveProperty('options')
  })

  it('com a chave: o site mostra os 5% e o link pede à InfinitePay o desconto no Pix', async () => {
    ambiente.INFINITEPAY_CHAVE = 'inchk_teste'
    expect(await descontoNoSite()).toBe(5)
    await criarPeca({ M: 3 })
    const chamadas = infinitePay()
    expect((await comprar()).status).toBe(201)
    expect(linkCriado(chamadas)).toMatchObject({ options: { discounts: { pix: 5 } } })
  })

  it('o painel muda o desconto (0 tira), recusa fora de 0 a 30 e mostra se a chave existe', async () => {
    const token = await entrar()
    expect(await (await painel(token, 'GET', '/ajustes')).json()).toMatchObject({ descontoPix: 5, chaveInfinitePay: false })
    expect((await painel(token, 'PUT', '/ajustes', { ...AJUSTES, descontoPix: 10 })).status).toBe(200)
    ambiente.INFINITEPAY_CHAVE = 'inchk_teste'
    expect(await (await painel(token, 'GET', '/ajustes')).json()).toMatchObject({ descontoPix: 10, chaveInfinitePay: true })
    expect(await descontoNoSite()).toBe(10)
    for (const descontoPix of [31, -1, 2.5, '5'])
      expect((await painel(token, 'PUT', '/ajustes', { ...AJUSTES, descontoPix })).status, String(descontoPix)).toBe(400)
    // o painel antigo (sem o campo) mantém o que estava
    expect((await painel(token, 'PUT', '/ajustes', AJUSTES)).status).toBe(200)
    expect(await descontoNoSite()).toBe(10)
    expect((await painel(token, 'PUT', '/ajustes', { ...AJUSTES, descontoPix: 0 })).status).toBe(200)
    expect(await descontoNoSite()).toBe(0)
    await criarPeca({ M: 3 })
    const chamadas = infinitePay()
    await comprar()
    expect(linkCriado(chamadas)).not.toHaveProperty('options')
  })

  it('pago no Pix com o desconto: o pedido é aprovado e guarda o que a cliente pagou de verdade', async () => {
    ambiente.INFINITEPAY_CHAVE = 'inchk_teste'
    await criarPeca({ M: 3 })
    infinitePay()
    const { codigo } = (await (await comprar()).json()) as { codigo: string }
    const total = (await env.DB.prepare('SELECT total_centavos FROM pedidos WHERE codigo = ?1').bind(codigo).first<number>('total_centavos'))!
    vi.restoreAllMocks()
    // a InfinitePay devolve o valor do pedido (amount) e o que foi pago, com os 5% a menos (paid_amount)
    infinitePay({ success: true, paid: true, amount: total, paid_amount: total - Math.round(total * 0.05), capture_method: 'pix' })
    expect(await (await aviso({ order_nsu: codigo, transaction_nsu: 'tx-pix' })).json()).toMatchObject({ resultado: 'pago' })
    const publico = (await (await site('GET', `/${codigo}`)).json()) as Record<string, number | string>
    expect(publico).toMatchObject({ situacao: 'pago', totalCentavos: 11_500, pagoCentavos: 10_925 })
  })
})
