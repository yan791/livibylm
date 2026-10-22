/*
  Compra de teste, feita pelo painel antes de ligar as vendas pelo site
  (rotas em /api/painel/compra-teste):
    GET  /   a última compra de teste e como ela está
    POST /   cria uma compra de teste { valorCentavos } e devolve o link de pagamento
  É um pedido de verdade, pago na InfinitePay de verdade, com um item só
  ("Compra de teste", sem peça e sem estoque). Ele passa pelo mesmo caminho de
  uma compra do site: página de pagamento, volta para /pedido/<codigo>,
  conferência (payment_check) e aviso (webhook). Paga, ela libera o
  interruptor "Vender pelo site" em Ajustes.
*/
import { Hono } from 'hono'
import type { Ambiente, LinhaPedido } from './tipos'
import { falha, inteiro, lerCorpo } from './validar'
import { lerAjustes } from './ajustes'
import { agora } from './seguranca'
import { abrirPagamento, gravarPedido, novoCodigo, RESERVA_MINUTOS, situacaoDe } from './pedidos'

const CHAVE = 'compra-teste'

export type EstadoTeste = {
  id: number
  situacao: ReturnType<typeof situacaoDe>
  totalCentavos: number
  /** a página de pagamento, enquanto ela ainda pode ser paga */
  pagar: string
  pago: boolean
  /** o aviso automático (webhook) da InfinitePay chegou */
  aviso: boolean
}

/** a última compra de teste; null se ainda não houve nenhuma */
export async function estadoTeste(db: D1Database): Promise<EstadoTeste | null> {
  const p = await db
    .prepare(
      `SELECT p.* FROM configuracoes c JOIN pedidos p ON p.codigo = json_extract(c.valor, '$.codigo') WHERE c.chave = ?1`,
    )
    .bind(CHAVE)
    .first<LinhaPedido>()
  if (!p) return null
  const situacao = situacaoDe(p)
  return {
    id: p.id,
    situacao,
    totalCentavos: p.total_centavos,
    pagar: situacao === 'aguardando' ? p.link_pagamento : '',
    pago: !!p.pago_em,
    aviso: !!p.aviso_em,
  }
}

export const compraTeste = new Hono<Ambiente>()

compraTeste.get('/', async (c) => c.json({ teste: await estadoTeste(c.env.DB) }))

compraTeste.post('/', async (c) => {
  const db = c.env.DB
  const corpo = await lerCorpo(c)
  const valor = inteiro(corpo.valorCentavos, 'Valor da compra de teste', 100, 10_000)
  const admin = c.get('admin')
  const ajustes = await lerAjustes(db)
  const codigo = novoCodigo()
  await gravarPedido(
    db,
    {
      codigo,
      origem: 'site',
      reservaAte: agora() + RESERVA_MINUTOS * 60,
      nome: admin.nome,
      whatsapp: ajustes.whatsapp,
      email: admin.email,
      cpf: '',
      entrega: 'combinar',
      cep: '',
      rua: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
      freteCentavos: 0,
      pagamento: '',
      observacao: 'Compra de teste feita pelo painel (Ajustes). Depois de conferir, pode cancelar este pedido e devolver o valor pelo app da InfinitePay.',
    },
    [
      {
        pecaId: null,
        cor: '',
        tamanho: '',
        quantidade: 1,
        precoCentavos: valor,
        sobEncomenda: true,
        nome: 'Compra de teste',
        corNome: '',
        colecaoNome: '',
        foto: '',
      },
    ],
  )
  let pagar: string
  try {
    // sem os dados de contato: quem paga o teste preenche os dele na InfinitePay (o painel não sabe o telefone de quem está logado)
    pagar = await abrirPagamento(c, codigo, { itens: [{ descricao: 'Compra de teste', quantidade: 1, precoCentavos: valor }] })
  } catch (e) {
    // aqui quem lê é a loja: o motivo ajuda a resolver
    throw falha(502, `A InfinitePay não abriu a página de pagamento. ${e instanceof Error ? e.message : ''}`.trim())
  }
  await db
    .prepare('INSERT INTO configuracoes (chave, valor) VALUES (?1, ?2) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor')
    .bind(CHAVE, JSON.stringify({ codigo }))
    .run()
  return c.json({ teste: await estadoTeste(db) }, 201)
})
