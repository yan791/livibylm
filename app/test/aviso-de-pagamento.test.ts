import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aviso, criarPeca, estoqueDe, pedido, reservar } from './ajuda'

/** a InfinitePay de mentira: cada payment_check responde o próximo da lista */
function conferencias(...respostas: Record<string, unknown>[]) {
  const pedidas: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    pedidas.push(String(url))
    return Response.json(respostas.shift() ?? { success: true, paid: false })
  })
  return pedidas
}

const totalDe = (codigo: string) => env.DB.prepare('SELECT total_centavos FROM pedidos WHERE codigo = ?1').bind(codigo).first<number>('total_centavos')

afterEach(() => vi.restoreAllMocks())

describe('aviso de pagamento da InfinitePay', () => {
  it('pede o aviso de novo enquanto a conferência ainda não mostra o pagamento', async () => {
    const peca = await criarPeca({ M: 2 })
    const codigo = await reservar(peca, 'M', 1)
    const total = (await totalDe(codigo))!
    const pedidas = conferencias({ success: true, paid: false }, { success: true, paid: true, amount: total, capture_method: 'pix' })
    const corpo = { order_nsu: codigo, transaction_nsu: 'tx-1', invoice_slug: 'fatura-1', amount: total }

    // a InfinitePay avisou, mas a conferência ainda diz que não: 400, para ela mandar de novo
    const primeiro = await aviso(corpo)
    expect(primeiro.status).toBe(400)
    expect(await primeiro.json()).toMatchObject({ resultado: 'nao_pago' })
    expect((await pedido(codigo))?.situacao).toBe('aguardando')
    expect(await estoqueDe(peca, 'M')).toBe(2)

    // o aviso de novo, já com o pagamento aparecendo: aprova e baixa o estoque
    const segundo = await aviso(corpo)
    expect(segundo.status).toBe(200)
    expect(await segundo.json()).toMatchObject({ resultado: 'pago' })
    expect(await pedido(codigo)).toMatchObject({ situacao: 'pago', estoque_baixado: 1 })
    expect(await estoqueDe(peca, 'M')).toBe(1)
    expect(pedidas.every((u) => u.endsWith('/payment_check'))).toBe(true)

    // o mesmo aviso mais uma vez: nada muda, e 200 para ela parar
    conferencias({ success: true, paid: true, amount: total })
    const terceiro = await aviso(corpo)
    expect(terceiro.status).toBe(200)
    expect(await terceiro.json()).toMatchObject({ resultado: 'ja' })
    expect(await estoqueDe(peca, 'M')).toBe(1)
  })

  it('valor diferente do pedido não aprova, e mandar de novo não adiantaria: 200', async () => {
    const peca = await criarPeca({ M: 2 })
    const codigo = await reservar(peca, 'M', 1)
    conferencias({ success: true, paid: true, amount: 100 })
    const r = await aviso({ order_nsu: codigo, transaction_nsu: 'tx-2', amount: 100 })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ resultado: 'valor_diferente' })
    expect((await pedido(codigo))?.situacao).toBe('aguardando')
    expect(await estoqueDe(peca, 'M')).toBe(2)
  })

  it('aviso de pedido que não existe responde 200 sem perguntar à InfinitePay', async () => {
    const pedidas = conferencias()
    const r = await aviso({ order_nsu: 'zzzzzzzzzzzzzzzz', transaction_nsu: 'x' })
    expect(r.status).toBe(200)
    expect(pedidas).toEqual([])
  })
})
