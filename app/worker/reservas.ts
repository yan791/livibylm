/*
  Reservas: peças seguras em compras do site que esperam o pagamento
  (pedido 'aguardando' com a reserva ainda valendo). O disponível de uma
  combinação é o estoque menos isso; o site, o painel e os pedidos usam a mesma conta.
*/

/** peças seguras agora em pedidos esperando pagamento, por peça + cor + tamanho */
export const consultaReservas = (db: D1Database) =>
  db.prepare(
    `SELECT i.peca_id, i.cor, i.tamanho, SUM(i.quantidade) AS n
     FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
     WHERE i.sob_encomenda = 0 AND p.situacao = 'aguardando' AND p.reserva_ate > unixepoch()
     GROUP BY i.peca_id, i.cor, i.tamanho`,
  )

export type LinhaReserva = { peca_id: number; cor: string; tamanho: string; n: number }

export const chaveVariante = (pecaId: number | null, cor: string, tamanho: string) => `${pecaId}\u0000${cor}\u0000${tamanho}`

export function mapaReservas(linhas: LinhaReserva[]) {
  return new Map(linhas.map((r) => [chaveVariante(r.peca_id, r.cor, r.tamanho), r.n]))
}

/** o banco recusou deixar o estoque abaixo do reservado, ou tirar algo reservado (gatilhos em migrations/0004) */
export const estoqueReservado = (e: unknown) => /estoque_reservado/.test(String(e instanceof Error ? e.message : e))
