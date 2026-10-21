import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { criarPeca, entrar, estoqueDe, painel, pedido, reservar, salvarPeca } from './ajuda'

describe('estoque reservado numa compra do site', () => {
  it('o painel não baixa o estoque abaixo do reservado', async () => {
    const id = await criarPeca({ M: 2 })
    await reservar(id, 'M', 2)
    const token = await entrar()

    const r = await salvarPeca(token, id, (p) => {
      p.estoque[0].quantidade = 1
    })
    expect(r.status).toBe(409)
    expect(((await r.json()) as { erro: string }).erro).toMatch(/reservad/)
    expect(await estoqueDe(id, 'M')).toBe(2)
  })

  it('nem quando o painel manda a quantidade sem a de antes', async () => {
    const id = await criarPeca({ M: 2 })
    await reservar(id, 'M', 1)
    const token = await entrar()

    const r = await salvarPeca(token, id, (p) => {
      p.estoque[0].quantidade = 0
      p.estoque[0].antes = null
    })
    expect(r.status).toBe(409)
    expect(await estoqueDe(id, 'M')).toBe(2)
  })

  it('não tira da peça um tamanho que está reservado', async () => {
    const id = await criarPeca({ P: 1, M: 1 })
    await reservar(id, 'M', 1)
    const token = await entrar()

    const r = await salvarPeca(token, id, (p) => {
      p.tamanhos = ['P']
      p.estoque = p.estoque.filter((e) => e.tamanho === 'P')
    })
    expect(r.status).toBe(409)
    expect(await estoqueDe(id, 'M')).toBe(1)
  })

  it('não apaga uma peça que alguém está pagando', async () => {
    const id = await criarPeca({ M: 1 })
    await reservar(id, 'M', 1)
    const token = await entrar()

    const r = await painel(token, 'DELETE', `/pecas/${id}`)
    expect(r.status).toBe(409)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM pecas WHERE id = ?1').bind(id).first<number>('n')).toBe(1)
    expect(await estoqueDe(id, 'M')).toBe(1)
  })

  it('baixar até o reservado continua valendo', async () => {
    const id = await criarPeca({ M: 3 })
    await reservar(id, 'M', 1)
    const token = await entrar()

    const r = await salvarPeca(token, id, (p) => {
      p.estoque[0].quantidade = 1
    })
    expect(r.status).toBe(200)
    expect(await estoqueDe(id, 'M')).toBe(1)
  })

  it('reserva vencida não segura mais o estoque', async () => {
    const id = await criarPeca({ M: 1 })
    await reservar(id, 'M', 1, -1)
    const token = await entrar()

    const r = await salvarPeca(token, id, (p) => {
      p.estoque[0].quantidade = 0
    })
    expect(r.status).toBe(200)
    expect(await estoqueDe(id, 'M')).toBe(0)
    expect((await painel(token, 'DELETE', `/pecas/${id}`)).status).toBe(200)
  })

  it('o pagamento da reserva baixa o estoque, e cancelar devolve', async () => {
    const id = await criarPeca({ M: 2 })
    const codigo = await reservar(id, 'M', 2)
    const token = await entrar()
    const { id: pedidoId } = (await pedido(codigo))!

    expect((await painel(token, 'POST', `/pedidos/${pedidoId}/pago`, { pagamento: 'pix' })).status).toBe(200)
    expect(await estoqueDe(id, 'M')).toBe(0)
    expect(await pedido(codigo)).toMatchObject({ situacao: 'pago', estoque_baixado: 1 })

    expect((await painel(token, 'POST', `/pedidos/${pedidoId}/cancelar`, {})).status).toBe(200)
    expect(await estoqueDe(id, 'M')).toBe(2)
  })

  it('venda registrada no painel não leva a peça reservada no site', async () => {
    const id = await criarPeca({ M: 1 })
    await reservar(id, 'M', 1)
    const token = await entrar()

    const r = await painel(token, 'POST', '/pedidos', {
      itens: [{ pecaId: id, cor: 'c1', tamanho: 'M', quantidade: 1, precoCentavos: 10000 }],
      nome: 'Cliente do Instagram',
      pagamento: 'pix',
    })
    expect(r.status).toBe(409)
    expect(await estoqueDe(id, 'M')).toBe(1)
  })

  it('a última peça vai para uma compra só, mesmo com 20 ao mesmo tempo', async () => {
    const id = await criarPeca({ M: 1 })
    const compras = await Promise.allSettled(Array.from({ length: 20 }, () => reservar(id, 'M', 1)))
    expect(compras.filter((c) => c.status === 'fulfilled')).toHaveLength(1)
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM pedidos WHERE situacao = 'aguardando'`).first<number>('n')).toBe(1)
  })
})
