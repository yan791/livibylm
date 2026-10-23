import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { criarPeca, entrar, estoqueDe, painel, pedido, reservar } from './ajuda'

type PedidoPainel = Record<string, unknown> & { id: number; situacao: string; rastreio: string; itens: unknown[] }

const venda = (pecaId: number, mudar: Record<string, unknown> = {}, item: Record<string, unknown> = {}) => ({
  itens: [{ pecaId, cor: 'c1', tamanho: 'M', quantidade: 2, precoCentavos: 9000, ...item }],
  nome: 'Ana Cliente',
  whatsapp: '(82) 98888-7777',
  pagamento: 'pix',
  ...mudar,
})

const verPedido = async (token: string, id: number) => (await (await painel(token, 'GET', `/pedidos/${id}`)).json()) as PedidoPainel

describe('venda feita fora do site', () => {
  it('registra, baixa o estoque e já entra como paga, com o preço que a loja cobrou', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 5 })
    const r = await painel(token, 'POST', '/pedidos', venda(peca))
    expect(r.status).toBe(201)
    const { id } = (await r.json()) as { id: number }
    expect(await estoqueDe(peca, 'M')).toBe(3)
    expect(await verPedido(token, id)).toMatchObject({
      origem: 'fora',
      situacao: 'pago',
      totalCentavos: 18_000,
      pagamento: 'pix',
      whatsapp: '5582988887777',
      entrega: 'combinar',
      estoqueBaixado: true,
    })
  })

  it('entregue em mãos já fecha como entregue', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 5 })
    const { id } = (await (await painel(token, 'POST', '/pedidos', venda(peca, { entregue: true }))).json()) as { id: number }
    expect(await verPedido(token, id)).toMatchObject({ situacao: 'entregue', entrega: 'maos' })
  })

  it('recusa venda mal preenchida, sem mexer no estoque', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 1 })
    const casos: [string, unknown, number][] = [
      ['sem peças', { ...venda(peca), itens: [] }, 400],
      ['21 linhas', { ...venda(peca), itens: Array.from({ length: 21 }, () => venda(peca).itens[0]) }, 400],
      ['quantidade zero', venda(peca, {}, { quantidade: 0 }), 400],
      ['quantidade 100', venda(peca, {}, { quantidade: 100 }), 400],
      ['preço negativo', venda(peca, {}, { precoCentavos: -1 }), 400],
      ['peça que não existe', venda(999_999), 409],
      ['cor que não existe', venda(peca, {}, { cor: 'c9', quantidade: 1 }), 409],
      ['tamanho que não existe', venda(peca, {}, { tamanho: 'XG', quantidade: 1 }), 409],
      ['WhatsApp errado', venda(peca, { whatsapp: '123' }, { quantidade: 1 }), 400],
      ['mais do que tem', venda(peca), 409],
    ]
    for (const [caso, corpo, status] of casos) expect((await painel(token, 'POST', '/pedidos', corpo)).status, caso).toBe(status)
    expect(await estoqueDe(peca, 'M')).toBe(1)
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM pedidos').first<number>('n')).toBe(0)
  })

  it('peça sob encomenda vende sem estoque; forma de pagamento desconhecida vira "outro"', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 0 })
    await env.DB.prepare('UPDATE pecas SET sob_encomenda = 1 WHERE id = ?1').bind(peca).run()
    const r = await painel(token, 'POST', '/pedidos', venda(peca, { pagamento: 'bitcoin' }))
    expect(r.status).toBe(201)
    expect(await verPedido(token, ((await r.json()) as { id: number }).id)).toMatchObject({ pagamento: 'outro' })
    expect(await estoqueDe(peca, 'M')).toBe(0)
  })

  it('as opções da venda descontam o que está reservado no site e incluem peças escondidas', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 5 })
    await reservar(peca, 'M', 2)
    await env.DB.prepare('UPDATE pecas SET visivel = 0 WHERE id = ?1').bind(peca).run()
    const opcoes = (await (await painel(token, 'GET', '/pedidos/opcoes')).json()) as { id: number; visivel: boolean; livre: Record<string, number> }[]
    expect(opcoes.find((o) => o.id === peca)).toMatchObject({ visivel: false, livre: { 'c1|M': 3 } })
  })
})

describe('situação dos pedidos', () => {
  it('caminho normal: pago, enviado com rastreio (limpo e em maiúsculas) e entregue, com as datas', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 2 })
    const { id } = (await pedido(await reservar(peca, 'M', 1)))!
    expect((await painel(token, 'POST', `/pedidos/${id}/pago`, { pagamento: 'pix' })).status).toBe(200)
    expect(await estoqueDe(peca, 'M')).toBe(1)
    const enviado = (await (await painel(token, 'POST', `/pedidos/${id}/enviado`, { rastreio: ' qb 123 456 789 br ' })).json()) as PedidoPainel
    expect(enviado).toMatchObject({ situacao: 'enviado', rastreio: 'QB123456789BR' })
    const entregue = (await (await painel(token, 'POST', `/pedidos/${id}/entregue`, {})).json()) as PedidoPainel
    expect(entregue.situacao).toBe('entregue')
    for (const campo of ['pagoEm', 'enviadoEm', 'entregueEm']) expect(entregue[campo], campo).toBeTruthy()
  })

  it('não pula etapas nem volta atrás', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 2 })
    const { id } = (await pedido(await reservar(peca, 'M', 1)))!
    expect((await painel(token, 'POST', `/pedidos/${id}/enviado`, { rastreio: 'QB1' })).status).toBe(409)
    expect((await painel(token, 'POST', `/pedidos/${id}/entregue`, {})).status).toBe(409)
    await painel(token, 'POST', `/pedidos/${id}/pago`, {})
    expect((await painel(token, 'POST', `/pedidos/${id}/pago`, {})).status).toBe(409)
    await painel(token, 'POST', `/pedidos/${id}/entregue`, {})
    expect((await painel(token, 'POST', `/pedidos/${id}/enviado`, { rastreio: 'QB1' })).status).toBe(409)
    await painel(token, 'POST', `/pedidos/${id}/cancelar`, {})
    // cancelado depois de pago não volta a pago
    expect((await painel(token, 'POST', `/pedidos/${id}/pago`, {})).status).toBe(409)
    expect((await painel(token, 'POST', `/pedidos/${id}/cancelar`, {})).status).toBe(409)
  })

  it('mandar o rastreio de novo troca o código e mantém a data do envio', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 2 })
    const { id } = (await pedido(await reservar(peca, 'M', 1)))!
    await painel(token, 'POST', `/pedidos/${id}/pago`, {})
    const primeiro = (await (await painel(token, 'POST', `/pedidos/${id}/enviado`, { rastreio: 'AA111' })).json()) as PedidoPainel
    const segundo = (await (await painel(token, 'POST', `/pedidos/${id}/enviado`, { rastreio: 'BB222' })).json()) as PedidoPainel
    expect(segundo.rastreio).toBe('BB222')
    expect(segundo.enviadoEm).toBe(primeiro.enviadoEm)
    expect((await painel(token, 'POST', `/pedidos/${id}/enviado`, { rastreio: 'X'.repeat(41) })).status).toBe(400)
  })

  it('marcar como pago depois de a reserva vencer: vale se ainda houver peça; sem peça, avisa', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 1 })
    const vencido = (await pedido(await reservar(peca, 'M', 1, -1)))!
    expect((await verPedido(token, vencido.id)).situacao).toBe('expirado')
    expect((await painel(token, 'POST', `/pedidos/${vencido.id}/pago`, {})).status).toBe(200)
    expect(await estoqueDe(peca, 'M')).toBe(0)

    const outro = (await pedido(await reservar(await criarPeca({ M: 1 }, 'outra-peca'), 'M', 1, -1)))!
    await env.DB.prepare(`UPDATE estoque SET quantidade = 0 WHERE peca_id = (SELECT id FROM pecas WHERE slug = 'outra-peca')`).run()
    const r = await painel(token, 'POST', `/pedidos/${outro.id}/pago`, {})
    expect(r.status).toBe(409)
    expect(((await r.json()) as { erro: string }).erro).toMatch(/estoque/)
  })

  it('anotação: guarda, tem limite de tamanho e não muda a situação', async () => {
    const token = await entrar()
    const { id } = (await pedido(await reservar(await criarPeca({ M: 1 }), 'M', 1)))!
    const r = (await (await painel(token, 'PUT', `/pedidos/${id}/observacao`, { observacao: 'Embrulhar para presente' })).json()) as PedidoPainel
    expect(r).toMatchObject({ observacao: 'Embrulhar para presente', situacao: 'aguardando' })
    expect((await painel(token, 'PUT', `/pedidos/${id}/observacao`, { observacao: 'x'.repeat(1001) })).status).toBe(400)
  })

  it('a contagem da aba mostra só os pagos esperando envio', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 10 })
    const ids = []
    for (let i = 0; i < 4; i++) ids.push((await pedido(await reservar(peca, 'M', 1)))!.id)
    await painel(token, 'POST', `/pedidos/${ids[1]}/pago`, {})
    await painel(token, 'POST', `/pedidos/${ids[2]}/pago`, {})
    await painel(token, 'POST', `/pedidos/${ids[3]}/pago`, {})
    await painel(token, 'POST', `/pedidos/${ids[3]}/enviado`, { rastreio: 'QB1' })
    expect(await (await painel(token, 'GET', '/pedidos/contagem')).json()).toEqual({ paraEnviar: 2 })
  })

  it('a lista vem do mais novo para o mais antigo; pedido que não existe dá 404', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 5 })
    const primeiro = (await pedido(await reservar(peca, 'M', 2)))!.id
    const segundo = (await pedido(await reservar(peca, 'M', 1)))!.id
    const lista = (await (await painel(token, 'GET', '/pedidos')).json()) as { id: number; unidades: number; primeira: string }[]
    expect(lista.map((p) => p.id)).toEqual([segundo, primeiro])
    expect(lista[1]).toMatchObject({ unidades: 2, primeira: 'Vestido Teste' })
    for (const caminho of ['/pedidos/999999', '/pedidos/abc', '/pedidos/0', '/pedidos/-1'])
      expect((await painel(token, 'GET', caminho)).status, caminho).toBe(404)
  })
})
