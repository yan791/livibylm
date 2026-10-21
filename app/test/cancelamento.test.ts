import { describe, expect, it } from 'vitest'
import { criarPeca, entrar, estoqueDe, painel, pedido, reservar } from './ajuda'

/** uma compra do site marcada como paga no painel: a peça já saiu do estoque */
async function pedidoPago(token: string, estoque: number) {
  const peca = await criarPeca({ M: estoque })
  const codigo = await reservar(peca, 'M', 1)
  const { id } = (await pedido(codigo))!
  expect((await painel(token, 'POST', `/pedidos/${id}/pago`, {})).status).toBe(200)
  expect(await estoqueDe(peca, 'M')).toBe(estoque - 1)
  return { peca, id, codigo }
}

describe('cancelar pedido no painel', () => {
  it('as peças voltam para o estoque, como antes', async () => {
    const token = await entrar()
    const { peca, id } = await pedidoPago(token, 2)
    const r = await painel(token, 'POST', `/pedidos/${id}/cancelar`, { devolverEstoque: true })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ situacao: 'cancelado', estoqueBaixado: false })
    expect(await estoqueDe(peca, 'M')).toBe(2)
  })

  it('sem dizer nada, também devolvem (o painel aberto antes da mudança manda o corpo vazio)', async () => {
    const token = await entrar()
    const { peca, id } = await pedidoPago(token, 2)
    expect((await painel(token, 'POST', `/pedidos/${id}/cancelar`, {})).status).toBe(200)
    expect(await estoqueDe(peca, 'M')).toBe(2)
  })

  it('com devolverEstoque: false, as peças ficam fora do estoque', async () => {
    const token = await entrar()
    const { peca, id, codigo } = await pedidoPago(token, 2)
    const r = await painel(token, 'POST', `/pedidos/${id}/cancelar`, { devolverEstoque: false })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ situacao: 'cancelado', estoqueBaixado: true })
    expect(await estoqueDe(peca, 'M')).toBe(1)
    expect(await pedido(codigo)).toMatchObject({ situacao: 'cancelado', estoque_baixado: 1 })

    // cancelar de novo não faz nada, nem devolve depois
    expect((await painel(token, 'POST', `/pedidos/${id}/cancelar`, { devolverEstoque: true })).status).toBe(409)
    expect(await estoqueDe(peca, 'M')).toBe(1)
  })

  it('pedido ainda esperando pagamento: a reserva some e o estoque não muda', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 1 })
    const { id } = (await pedido(await reservar(peca, 'M', 1)))!
    const reservado = async () =>
      ((await (await painel(token, 'GET', `/pecas/${peca}`)).json()) as { estoque: { reservado: number }[] }).estoque[0].reservado
    expect(await reservado()).toBe(1)
    const r = await painel(token, 'POST', `/pedidos/${id}/cancelar`, { devolverEstoque: false })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ situacao: 'cancelado', estoqueBaixado: false })
    expect(await estoqueDe(peca, 'M')).toBe(1)
    expect(await reservado()).toBe(0)
  })

  it('recusa um valor que não seja sim ou não', async () => {
    const token = await entrar()
    const { peca, id } = await pedidoPago(token, 2)
    expect((await painel(token, 'POST', `/pedidos/${id}/cancelar`, { devolverEstoque: 'não' })).status).toBe(400)
    expect(await estoqueDe(peca, 'M')).toBe(1)
  })
})
