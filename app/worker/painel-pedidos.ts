/*
  Pedidos no painel (/api/painel/pedidos/..., só com login):
    GET  /                 lista, do mais novo para o mais antigo
    GET  /contagem         quantos estão pagos esperando envio (o número na aba)
    GET  /opcoes           peças, cores, tamanhos e disponível, para registrar uma venda
    POST /                 registra uma venda feita fora do site (Instagram, WhatsApp, em mãos): já baixa o estoque
    GET  /:id              um pedido com as peças e os dados da cliente
    POST /:id/pago         marca como pago à mão (o dinheiro apareceu no app da InfinitePay)
    POST /:id/enviado      marca como enviado, com o código de rastreio (mandar de novo troca o código)
    POST /:id/entregue     marca como entregue
    POST /:id/cancelar     cancela; se o estoque já tinha baixado, as peças voltam (com devolverEstoque: false, ficam fora)
    PUT  /:id/observacao   anotação interna da loja
    POST /:id/nova-senha   link de senha nova para a conta da cliente deste pedido (a loja manda pelo WhatsApp da conta)
*/
import { Hono } from 'hono'
import type { Ambiente, CorPeca, LinhaEstoque, LinhaItemPedido, LinhaPeca, LinhaPedido } from './tipos'
import { falha, idDe, inteiro, lerCorpo, texto } from './validar'
import { numeroWhatsApp } from './ajustes'
import { agora } from './seguranca'
import { conferirDisponivel, gravarPedido, lerPedido, MAX_LINHAS, novoCodigo, semEstoque, situacaoDe, type ItemNovo } from './pedidos'
import { chaveVariante, consultaReservas, mapaReservas, type LinhaReserva } from './reservas'
import { criarLinkSenha } from './contas'
import { comDesconto } from './descontos'

export const painelPedidos = new Hono<Ambiente>()

/** formas de pagamento de uma venda registrada no painel */
const FORMAS = ['pix', 'dinheiro', 'cartao', 'outro']

const pedidoParaPainel = (p: LinhaPedido, itens: LinhaItemPedido[]) => ({
  id: p.id,
  codigo: p.codigo,
  origem: p.origem,
  situacao: situacaoDe(p),
  reservaAte: p.reserva_ate * 1000,
  estoqueBaixado: p.estoque_baixado === 1,
  nome: p.nome,
  whatsapp: p.whatsapp,
  email: p.email,
  cpf: p.cpf,
  entrega: p.entrega,
  endereco: { cep: p.cep, rua: p.rua, numero: p.numero, complemento: p.complemento, bairro: p.bairro, cidade: p.cidade, uf: p.uf },
  itensCentavos: p.itens_centavos,
  freteCentavos: p.frete_centavos,
  totalCentavos: p.total_centavos,
  cupom: p.cupom,
  cupomPercentual: p.cupom_percentual,
  descontoCentavos: p.desconto_centavos,
  pagamento: p.pagamento,
  parcelas: p.parcelas,
  pagoCentavos: p.pago_centavos,
  recibo: p.recibo,
  rastreio: p.rastreio,
  observacao: p.observacao,
  criadoEm: p.criado_em,
  pagoEm: p.pago_em,
  enviadoEm: p.enviado_em,
  entregueEm: p.entregue_em,
  canceladoEm: p.cancelado_em,
  /** a compra está numa conta do site (dá para mandar o link de senha nova) */
  conta: p.cliente_id !== null,
  itens: itens.map((i) => ({
    id: i.id,
    pecaId: i.peca_id,
    nome: i.nome,
    cor: i.cor_nome,
    tamanho: i.tamanho,
    quantidade: i.quantidade,
    precoCentavos: i.preco_centavos,
    colecao: i.colecao_nome,
    foto: i.foto,
    sobEncomenda: i.sob_encomenda === 1,
  })),
})

painelPedidos.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.codigo, p.origem, p.situacao, p.reserva_ate, p.nome, p.total_centavos, p.entrega, p.criado_em, p.pago_em,
       (SELECT SUM(quantidade) FROM pedido_itens WHERE pedido_id = p.id) AS unidades,
       (SELECT foto FROM pedido_itens WHERE pedido_id = p.id ORDER BY id LIMIT 1) AS foto,
       (SELECT nome FROM pedido_itens WHERE pedido_id = p.id ORDER BY id LIMIT 1) AS primeira
     FROM pedidos p ORDER BY p.id DESC LIMIT 500`,
  ).all<
    Pick<LinhaPedido, 'id' | 'codigo' | 'origem' | 'situacao' | 'reserva_ate' | 'nome' | 'total_centavos' | 'entrega' | 'criado_em' | 'pago_em'> & {
      unidades: number
      foto: string | null
      primeira: string | null
    }
  >()
  return c.json(
    results.map((p) => ({
      id: p.id,
      origem: p.origem,
      situacao: situacaoDe(p),
      reservaAte: p.reserva_ate * 1000,
      nome: p.nome,
      totalCentavos: p.total_centavos,
      entrega: p.entrega,
      criadoEm: p.criado_em,
      pagoEm: p.pago_em,
      unidades: p.unidades ?? 0,
      foto: p.foto ?? '',
      primeira: p.primeira ?? '',
    })),
  )
})

painelPedidos.get('/contagem', async (c) => {
  const r = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM pedidos WHERE situacao IN ('pago', 'sem_estoque')").first<{ n: number }>()
  return c.json({ paraEnviar: r?.n ?? 0 })
})

painelPedidos.get('/opcoes', async (c) => {
  const db = c.env.DB
  const [pecas, estoque, reservas] = await db.batch([
    db.prepare(
      `SELECT p.*, c.nome AS colecao_nome FROM pecas p JOIN colecoes c ON c.id = p.colecao_id ORDER BY c.ordem, c.id, p.ordem, p.id`,
    ),
    db.prepare('SELECT * FROM estoque'),
    consultaReservas(db),
  ])
  const linhas = estoque.results as LinhaEstoque[]
  const seguras = mapaReservas(reservas.results as LinhaReserva[])
  return c.json(
    (pecas.results as (LinhaPeca & { colecao_nome: string })[]).map((p) => {
      const cores = JSON.parse(p.cores) as CorPeca[]
      const tamanhos = JSON.parse(p.tamanhos) as string[]
      const livre: Record<string, number> = {}
      for (const cor of cores)
        for (const t of tamanhos) {
          const qtd = linhas.find((e) => e.peca_id === p.id && e.cor === cor.id && e.tamanho === t)?.quantidade ?? 0
          livre[`${cor.id}|${t}`] = Math.max(0, qtd - (seguras.get(chaveVariante(p.id, cor.id, t)) ?? 0))
        }
      return {
        id: p.id,
        nome: p.nome,
        colecao: p.colecao_nome,
        // a venda fora do site já vem com o preço da loja (com o desconto da peça)
        precoCentavos: comDesconto(p.preco_centavos, p.desconto),
        foto: (JSON.parse(p.fotos) as string[])[0] ?? '',
        visivel: p.visivel === 1,
        sobEncomenda: p.sob_encomenda === 1,
        cores,
        tamanhos,
        livre,
      }
    }),
  )
})

/** venda feita fora do site: peças escolhidas no painel, com o preço que ela cobrou */
painelPedidos.post('/', async (c) => {
  const db = c.env.DB
  const corpo = await lerCorpo(c)
  if (!Array.isArray(corpo.itens) || !corpo.itens.length) throw falha(400, 'Escolha pelo menos uma peça.')
  if (corpo.itens.length > MAX_LINHAS) throw falha(400, `Até ${MAX_LINHAS} itens por venda.`)
  const entrada = corpo.itens.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>
    return {
      pecaId: inteiro(o.pecaId, 'Peça', 1, 1e9),
      cor: texto(o.cor, 'A cor', 12, true),
      tamanho: texto(o.tamanho, 'o tamanho', 12, true),
      quantidade: inteiro(o.quantidade, 'Quantidade', 1, 99),
      precoCentavos: inteiro(o.precoCentavos, 'Preço', 0, 10_000_000),
    }
  })
  const ids = [...new Set(entrada.map((i) => i.pecaId))]
  const { results: pecas } = await db
    .prepare(`SELECT p.*, c.nome AS colecao_nome FROM pecas p JOIN colecoes c ON c.id = p.colecao_id WHERE p.id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids)
    .all<LinhaPeca & { colecao_nome: string }>()
  const itens: ItemNovo[] = entrada.map((i) => {
    const p = pecas.find((x) => x.id === i.pecaId)
    if (!p) throw falha(409, 'Uma das peças não existe mais. Recarregue a página.')
    const cor = (JSON.parse(p.cores) as CorPeca[]).find((x) => x.id === i.cor)
    if (!cor || !(JSON.parse(p.tamanhos) as string[]).includes(i.tamanho)) throw falha(409, `${p.nome}: escolha a cor e o tamanho de novo.`)
    return {
      ...i,
      sobEncomenda: p.sob_encomenda === 1,
      nome: p.nome,
      corNome: cor.nome,
      colecaoNome: p.colecao_nome,
      foto: (JSON.parse(p.fotos) as string[])[0] ?? '',
    }
  })

  const nome = texto(corpo.nome, 'O nome', 80)
  const zap = texto(corpo.whatsapp, 'O WhatsApp', 30)
  const whatsapp = zap ? numeroWhatsApp(zap) : ''
  if (whatsapp === null) throw falha(400, 'Confira o WhatsApp: DDD e número, ex.: (82) 99999-9999.')
  const pagamento = typeof corpo.pagamento === 'string' && FORMAS.includes(corpo.pagamento) ? corpo.pagamento : 'outro'
  const entregue = corpo.entregue === true
  const codigo = novoCodigo()

  // grava como pedido e, no mesmo batch, já marca como pago (e entregue): o estoque baixa aqui
  const fechar = db
    .prepare(
      `UPDATE pedidos SET situacao = ?2, estoque_baixado = 1, pago_em = datetime('now'),
       entregue_em = CASE WHEN ?2 = 'entregue' THEN datetime('now') END WHERE codigo = ?1`,
    )
    .bind(codigo, entregue ? 'entregue' : 'pago')
  try {
    await gravarPedido(
      db,
      {
        codigo,
        origem: 'fora',
        reservaAte: agora() + 600,
        nome,
        whatsapp,
        email: '',
        cpf: '',
        entrega: entregue ? 'maos' : 'combinar',
        cep: '',
        rua: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        uf: '',
        freteCentavos: 0,
        pagamento,
        observacao: texto(corpo.observacao, 'A anotação', 1000),
      },
      await conferirDisponivel(db, itens),
      [fechar],
    )
  } catch (e) {
    if (semEstoque(e)) throw falha(409, 'Uma das peças não tem mais estoque (ou está reservada numa compra do site). Confira e tente de novo.')
    throw e
  }
  const novo = await db.prepare('SELECT id FROM pedidos WHERE codigo = ?1').bind(codigo).first<{ id: number }>()
  return c.json({ id: novo!.id }, 201)
})

async function pedidoDe(c: Parameters<typeof idDe>[0]) {
  const achado = await lerPedido(c.env.DB, 'id', idDe(c, 'Pedido'))
  if (!achado) throw falha(404, 'Pedido não encontrado.')
  return achado
}

painelPedidos.get('/:id', async (c) => {
  const { pedido, itens } = await pedidoDe(c)
  return c.json(pedidoParaPainel(pedido, itens))
})

/** muda a situação e devolve o pedido atualizado; nada mudou = a situação não permitia */
async function mudar(c: Parameters<typeof idDe>[0], sql: string, ...valores: unknown[]) {
  const { pedido } = await pedidoDe(c)
  const r = await c.env.DB.prepare(sql)
    .bind(pedido.id, ...valores)
    .run()
  if (!r.meta.changes) throw falha(409, 'Esse pedido mudou enquanto a tela estava aberta. Recarregue a página.')
  const atual = await pedidoDe(c)
  return c.json(pedidoParaPainel(atual.pedido, atual.itens))
}

painelPedidos.post('/:id/pago', async (c) => {
  const corpo = await lerCorpo(c)
  const forma = typeof corpo.pagamento === 'string' && [...FORMAS, 'credit_card'].includes(corpo.pagamento) ? corpo.pagamento : ''
  try {
    return await mudar(
      c,
      `UPDATE pedidos SET situacao = 'pago', estoque_baixado = 1, pago_em = datetime('now'),
       pagamento = CASE WHEN ?2 != '' THEN ?2 ELSE pagamento END
       WHERE id = ?1 AND pago_em IS NULL AND situacao IN ('aguardando', 'expirado', 'cancelado')`,
      forma,
    )
  } catch (e) {
    if (semEstoque(e))
      throw falha(409, 'Uma das peças deste pedido não tem mais estoque. Ajuste o estoque da peça e tente de novo, ou fale com a cliente.')
    throw e
  }
})

painelPedidos.post('/:id/enviado', async (c) => {
  const corpo = await lerCorpo(c)
  const rastreio = texto(corpo.rastreio, 'O código de rastreio', 40).toUpperCase().replace(/\s+/g, '')
  return mudar(
    c,
    `UPDATE pedidos SET situacao = 'enviado', rastreio = ?2, enviado_em = COALESCE(enviado_em, datetime('now'))
     WHERE id = ?1 AND situacao IN ('pago', 'sem_estoque', 'enviado')`,
    rastreio,
  )
})

painelPedidos.post('/:id/entregue', (c) =>
  mudar(c, `UPDATE pedidos SET situacao = 'entregue', entregue_em = datetime('now') WHERE id = ?1 AND situacao IN ('pago', 'sem_estoque', 'enviado')`),
)

painelPedidos.post('/:id/cancelar', async (c) => {
  const corpo = await lerCorpo(c)
  if (corpo.devolverEstoque !== undefined && typeof corpo.devolverEstoque !== 'boolean') throw falha(400, 'Pedido inválido.')
  // estoque_baixado de 1 para 0 devolve as peças (gatilho do banco); mantido em 1, elas ficam fora:
  // a peça voltou com defeito, se perdeu no envio ou ainda está com a cliente
  const devolver = corpo.devolverEstoque !== false
  return mudar(
    c,
    `UPDATE pedidos SET situacao = 'cancelado', estoque_baixado = CASE WHEN ?2 = 1 THEN 0 ELSE estoque_baixado END, cancelado_em = datetime('now')
     WHERE id = ?1 AND situacao != 'cancelado'`,
    devolver ? 1 : 0,
  )
})

painelPedidos.put('/:id/observacao', async (c) => {
  const corpo = await lerCorpo(c)
  return mudar(c, 'UPDATE pedidos SET observacao = ?2 WHERE id = ?1', texto(corpo.observacao, 'A anotação', 1000))
})

/** link de senha nova para a conta da cliente deste pedido; o painel abre o WhatsApp da conta com ele */
painelPedidos.post('/:id/nova-senha', async (c) => {
  const id = idDe(c, 'Pedido')
  const conta = await c.env.DB.prepare('SELECT cl.id, cl.nome, cl.whatsapp FROM pedidos p JOIN clientes cl ON cl.id = p.cliente_id WHERE p.id = ?1')
    .bind(id)
    .first<{ id: number; nome: string; whatsapp: string }>()
  if (!conta) throw falha(404, 'Esta compra não está numa conta do site.')
  const token = await criarLinkSenha(c.env.DB, conta.id)
  const site = (c.env.SITE_PUBLICO || new URL(c.req.url).origin).replace(/\/$/, '')
  return c.json({ link: `${site}/nova-senha/${token}`, whatsapp: conta.whatsapp, nome: conta.nome })
})
