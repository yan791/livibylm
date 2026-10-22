/*
  Pedidos da loja: compras pelo site, pagas pela InfinitePay.
  Rotas abertas (o site do GitHub Pages também chama):
    POST /api/pedidos                    monta o pedido com os preços do banco, segura as peças e devolve o link de pagamento
                                         (só com a conta aberta: o pedido fica na conta da cliente, worker/contas.ts)
    GET  /api/pedidos/:codigo            situação do pedido (página /pedido/... do site)
    POST /api/pedidos/consulta           vários pedidos de uma vez (aba "Pedidos" da gaveta: os feitos naquele aparelho)
    POST /api/pedidos/:codigo/conferir   a cliente voltou da InfinitePay: confere o pagamento
    POST /api/pagamento/aviso            aviso (webhook) da InfinitePay de pagamento aprovado
  O painel cuida dos pedidos em worker/painel-pedidos.ts.

  Caminho de uma compra:
  1. O pedido entra como 'aguardando' e segura as peças por RESERVA_MINUTOS.
     O banco recusa a peça que não tiver disponível (gatilho em migrations/0003).
  2. A cliente paga na página da InfinitePay e volta para /pedido/<codigo>.
  3. A volta da cliente e o aviso da InfinitePay pedem a mesma conferência
     (payment_check). Só ela aprova: pago, e no valor exato do pedido.
  4. Aprovado, o pedido vira 'pago' e o estoque baixa. Se o pagamento chegar
     depois de a reserva vencer e a peça já tiver ido para outra cliente, o
     pedido vira 'sem_estoque' (pago, mas a loja precisa resolver com a cliente).
*/
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import type { Ambiente, LinhaItemPedido, LinhaPedido, CorPeca, LinhaPeca } from './tipos'
import { cpfValido, EMAIL, falha, inteiro, lerCorpo, texto, type Corpo } from './validar'
import { lerAjustes, numeroWhatsApp, type Ajustes } from './ajustes'
import { agora, clienteDaSessao } from './seguranca'
import { limparCacheCatalogo } from './catalogo'
import { conferirPagamento, criarLink, ErroInfinitePay, type DadosLink, type ItemLink } from './infinitepay'
import { chaveVariante, consultaReservas, mapaReservas, type LinhaReserva } from './reservas'
import { deMaceio, ehTipoEntrega, NOME_ENTREGA, opcoesDeEntrega, ufDoCep } from './frete'

/** quanto tempo as peças ficam seguras esperando o pagamento */
export const RESERVA_MINUTOS = 30
/** itens diferentes (peça + cor + tamanho) num pedido */
export const MAX_LINHAS = 20

/* ---------- peças e disponível ---------- */

/** uma linha do pedido já conferida, com as cópias que ficam guardadas */
export type ItemNovo = {
  /** null só no item da compra de teste do painel, que não é uma peça */
  pecaId: number | null
  cor: string
  tamanho: string
  quantidade: number
  precoCentavos: number
  sobEncomenda: boolean
  nome: string
  corNome: string
  colecaoNome: string
  foto: string
}

/**
  Junta linhas repetidas e confere o disponível (estoque menos reservas)
  antes de gravar, para a mensagem dizer qual peça faltou. O gatilho do
  banco confere de novo na hora de gravar.
*/
export async function conferirDisponivel(db: D1Database, itens: ItemNovo[]) {
  const juntos = new Map<string, ItemNovo>()
  for (const i of itens) {
    const k = chaveVariante(i.pecaId, i.cor, i.tamanho)
    const ja = juntos.get(k)
    juntos.set(k, ja ? { ...ja, quantidade: ja.quantidade + i.quantidade } : i)
  }
  const lista = [...juntos.values()]
  const ids = [...new Set(lista.filter((i) => !i.sobEncomenda).map((i) => i.pecaId))]
  if (!ids.length) return lista
  const [estoque, reservas] = await db.batch([
    db.prepare(`SELECT * FROM estoque WHERE peca_id IN (${ids.map(() => '?').join(',')})`).bind(...ids),
    consultaReservas(db),
  ])
  const seguras = mapaReservas(reservas.results as LinhaReserva[])
  for (const i of lista) {
    if (i.sobEncomenda) continue
    const k = chaveVariante(i.pecaId, i.cor, i.tamanho)
    const linha = (estoque.results as { peca_id: number; cor: string; tamanho: string; quantidade: number }[]).find(
      (e) => chaveVariante(e.peca_id, e.cor, e.tamanho) === k,
    )
    const livre = Math.max(0, (linha?.quantidade ?? 0) - (seguras.get(k) ?? 0))
    if (livre < i.quantidade) {
      const qual = `${i.nome} (${i.corNome}, ${i.tamanho})`
      throw falha(409, livre ? `${qual}: só ${livre === 1 ? 'resta 1 unidade' : `restam ${livre} unidades`}.` : `${qual} esgotou.`)
    }
  }
  return lista
}

/** a peça do pedido que o banco recusou por falta de estoque (gatilho) ou estoque negativo */
export const semEstoque = (e: unknown) => /sem_estoque|CHECK constraint failed/i.test(String(e instanceof Error ? e.message : e))

const repetido = (e: unknown) => /UNIQUE constraint failed: pagamentos/i.test(String(e instanceof Error ? e.message : e))

/* ---------- gravar ---------- */

const ALFABETO = '23456789abcdefghjkmnpqrstuvwxyz'

/** código do pedido: aleatório e difícil de adivinhar (é o que abre a página do pedido) */
export function novoCodigo() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => ALFABETO[b % ALFABETO.length]).join('')
}

export const CODIGO = /^[2-9a-z]{16}$/

export type DadosPedido = {
  codigo: string
  origem: 'site' | 'fora'
  reservaAte: number
  nome: string
  whatsapp: string
  email: string
  cpf: string
  entrega: string
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  freteCentavos: number
  pagamento: string
  observacao: string
  /** conta da cliente no site (compra pelo site) */
  clienteId?: number | null
}

/**
  Grava o pedido e as peças num batch só (tudo ou nada). `depois` entra no
  mesmo batch (ex.: a venda do painel já baixa o estoque).
*/
export async function gravarPedido(db: D1Database, p: DadosPedido, itens: ItemNovo[], depois: D1PreparedStatement[] = []) {
  const itensCentavos = itens.reduce((s, i) => s + i.precoCentavos * i.quantidade, 0)
  const doCodigo = '(SELECT id FROM pedidos WHERE codigo = ?1)'
  await db.batch([
    db
      .prepare(
        `INSERT INTO pedidos (codigo, origem, situacao, reserva_ate, nome, whatsapp, email, cpf, entrega, cep, rua, numero,
         complemento, bairro, cidade, uf, itens_centavos, frete_centavos, total_centavos, pagamento, observacao, cliente_id)
         VALUES (?1, ?2, 'aguardando', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)`,
      )
      .bind(
        p.codigo,
        p.origem,
        p.reservaAte,
        p.nome,
        p.whatsapp,
        p.email,
        p.cpf,
        p.entrega,
        p.cep,
        p.rua,
        p.numero,
        p.complemento,
        p.bairro,
        p.cidade,
        p.uf,
        itensCentavos,
        p.freteCentavos,
        itensCentavos + p.freteCentavos,
        p.pagamento,
        p.observacao,
        p.clienteId ?? null,
      ),
    ...itens.map((i) =>
      db
        .prepare(
          `INSERT INTO pedido_itens (pedido_id, peca_id, cor, tamanho, quantidade, preco_centavos, sob_encomenda, nome, cor_nome, colecao_nome, foto)
           VALUES (${doCodigo}, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        )
        .bind(p.codigo, i.pecaId, i.cor, i.tamanho, i.quantidade, i.precoCentavos, i.sobEncomenda ? 1 : 0, i.nome, i.corNome, i.colecaoNome, i.foto),
    ),
    ...depois,
  ])
}

export async function lerPedido(db: D1Database, campo: 'id' | 'codigo', valor: number | string) {
  const [pedido, itens] = await db.batch([
    db.prepare(`SELECT * FROM pedidos WHERE ${campo} = ?1`).bind(valor),
    db
      .prepare(
        `SELECT i.*, pc.slug AS peca_slug FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
         LEFT JOIN pecas pc ON pc.id = i.peca_id WHERE p.${campo} = ?1 ORDER BY i.id`,
      )
      .bind(valor),
  ])
  const p = (pedido.results as LinhaPedido[])[0]
  return p ? { pedido: p, itens: itens.results as LinhaItemPedido[] } : null
}

/** a situação de agora: 'aguardando' com a reserva vencida já é 'expirado' */
export const situacaoDe = (p: Pick<LinhaPedido, 'situacao' | 'reserva_ate'>) =>
  p.situacao === 'aguardando' && p.reserva_ate <= agora() ? 'expirado' : p.situacao

/* ---------- pagamento ---------- */

type Pagamento = { transacao: string; fatura: string; recibo: string; forma: string; parcelas: number; valorCentavos: number; pagoCentavos: number }

/**
  Marca o pedido como pago (e baixa o estoque) depois que a InfinitePay
  confirmou. Repetir com a mesma transação não faz nada de novo.
*/
async function aprovar(db: D1Database, p: LinhaPedido, pg: Pagamento) {
  const registro = db
    .prepare('INSERT INTO pagamentos (transacao, pedido_id, valor_centavos, pago_centavos) VALUES (?1, ?2, ?3, ?4)')
    .bind(pg.transacao, p.id, pg.valorCentavos, pg.pagoCentavos)
  const marcar = (situacao: 'pago' | 'sem_estoque') =>
    db
      .prepare(
        `UPDATE pedidos SET situacao = ?2, estoque_baixado = ?3, pago_em = datetime('now'), pagamento = ?4, parcelas = ?5,
         pago_centavos = ?6, transacao = ?7, fatura = CASE WHEN ?8 != '' THEN ?8 ELSE fatura END, recibo = ?9
         WHERE id = ?1 AND pago_em IS NULL`,
      )
      .bind(p.id, situacao, situacao === 'pago' ? 1 : 0, pg.forma, pg.parcelas, pg.pagoCentavos, pg.transacao, pg.fatura, pg.recibo)

  try {
    const [, marcado] = await db.batch([registro, marcar('pago')])
    if (!marcado.meta.changes) {
      // outro pagamento já tinha aprovado este pedido: a cliente pagou duas vezes
      await db
        .prepare(`UPDATE pedidos SET observacao = trim(observacao || char(10) || ?2) WHERE id = ?1`)
        .bind(p.id, `Pagamento repetido na InfinitePay (transação ${pg.transacao}). Confira no app e devolva o valor, se for o caso.`)
        .run()
    }
    return 'pago'
  } catch (e) {
    if (repetido(e)) return 'ja'
    if (!semEstoque(e)) throw e
  }
  // pagou depois de a reserva vencer e a peça já foi vendida: registra o pagamento sem baixar o estoque
  try {
    await db.batch([registro, marcar('sem_estoque')])
  } catch (e) {
    if (repetido(e)) return 'ja'
    throw e
  }
  return 'sem_estoque'
}

/** só guarda recibo com cara de recibo da InfinitePay (o endereço vem de fora) */
function reciboValido(v: unknown) {
  if (typeof v !== 'string' || v.length > 500) return ''
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && /(^|\.)(infinitepay\.io|cloudwalk\.io)$/.test(u.hostname) ? v : ''
  } catch {
    return ''
  }
}

/** confere com a InfinitePay e, se estiver pago no valor certo, aprova */
export async function processarPagamento(env: Env, p: LinhaPedido, d: { transacao: string; fatura: string; recibo: unknown }) {
  if (p.pago_em) return 'ja'
  const r = await conferirPagamento(env, { codigo: p.codigo, transacao: d.transacao, fatura: d.fatura || p.fatura })
  if (!r.pago) return 'nao_pago'
  if (r.valorCentavos !== p.total_centavos) {
    console.warn(`pedido ${p.id}: InfinitePay diz ${r.valorCentavos}, o pedido é de ${p.total_centavos}`)
    return 'valor_diferente'
  }
  const resultado = await aprovar(env.DB, p, {
    transacao: d.transacao,
    fatura: d.fatura,
    recibo: reciboValido(d.recibo),
    forma: r.forma,
    parcelas: r.parcelas,
    valorCentavos: r.valorCentavos,
    pagoCentavos: r.pagoCentavos,
  })
  limparCacheCatalogo()
  return resultado
}

/* ---------- limites de uso ---------- */

// Sempre confere antes de contar: passou do limite, o pedido é recusado sem gravar nada no banco.

/** avisos de pagamento por pedido em 15 minutos: a InfinitePay manda poucos, e cada um pergunta a ela */
export const AVISOS_POR_PEDIDO = 20
/** consultas de frete por IP em 15 minutos: a cliente digita o CEP poucas vezes */
export const FRETES_POR_IP = 60
/** consultas da aba "Pedidos" por IP em 15 minutos: ela abre a gaveta algumas vezes */
export const CONSULTAS_POR_IP = 120
/** pedidos numa consulta só (o site guarda os últimos 30 do aparelho) */
export const MAX_CONSULTA = 30

/** quantas vezes algo aconteceu (pedidos de um IP, conferências de um pedido) dentro da janela */
export async function usou(db: D1Database, chave: string, janela: number) {
  const r = await db.prepare('SELECT falhas FROM tentativas WHERE chave = ?1 AND desde > ?2').bind(chave, agora() - janela).first<{ falhas: number }>()
  return r?.falhas ?? 0
}

export async function contar(db: D1Database, chave: string, janela: number) {
  await db
    .prepare(
      `INSERT INTO tentativas (chave, falhas, desde) VALUES (?1, 1, ?2)
       ON CONFLICT (chave) DO UPDATE SET
         falhas = CASE WHEN desde <= ?2 - ?3 THEN 1 ELSE falhas + 1 END,
         desde = CASE WHEN desde <= ?2 - ?3 THEN ?2 ELSE desde END`,
    )
    .bind(chave, agora(), janela)
    .run()
}

/* ---------- compra pelo site ---------- */

function objeto(v: unknown): Corpo {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Corpo) : {}
}

/** nome, WhatsApp e e-mail da cliente (a conta guarda, e cada pedido leva uma cópia) */
export function lerContato(v: unknown) {
  const o = objeto(v)
  const nome = texto(o.nome, 'seu nome', 80, true)
  if (nome.length < 3) throw falha(400, 'Preencha seu nome completo.')
  const whatsapp = numeroWhatsApp(texto(o.whatsapp, 'seu WhatsApp', 30, true))
  if (!whatsapp) throw falha(400, 'Confira o WhatsApp: DDD e número, ex.: (82) 99999-9999.')
  const email = texto(o.email, 'seu e-mail', 200, true).toLowerCase()
  if (!EMAIL.test(email)) throw falha(400, 'Confira o e-mail.')
  return { nome, whatsapp, email }
}

/** o CPF (só nos envios pelos Correios); vazio se não veio */
function lerCpf(v: unknown) {
  const digitado = texto(objeto(v).cpf, 'O CPF', 20)
  const cpf = digitado ? cpfValido(digitado) : ''
  if (cpf === null) throw falha(400, 'Confira o CPF.')
  return cpf
}

/** entrega e frete: Maceió (taxa única) ou Correios, PAC ou SEDEX, pela tabela por região dos Ajustes (worker/frete.ts) */
function lerEntrega(v: unknown, ajustes: Ajustes) {
  const o = objeto(v)
  const tipo = o.tipo
  if (!ehTipoEntrega(tipo)) throw falha(400, 'Escolha a forma de entrega.')
  const cep = texto(o.cep, 'o CEP', 10, true).replace(/\D/g, '')
  if (cep.length !== 8) throw falha(400, 'Confira o CEP: são 8 números.')
  // o estado sai do CEP, nunca do que o navegador mandou
  const uf = ufDoCep(cep)
  if (!uf) throw falha(400, 'Confira o CEP: ele não parece ser do Brasil.')
  // o preço sai da tabela de agora, nunca do que o navegador mandou
  const opcao = opcoesDeEntrega(cep, ajustes.taxaMaceioCentavos, ajustes.freteCorreios).find((x) => x.tipo === tipo)
  if (!opcao)
    throw falha(
      400,
      tipo === 'maceio'
        ? 'Esse CEP não é de Maceió. Escolha a entrega pelos Correios ou fale com a gente pelo WhatsApp.'
        : deMaceio(cep)
          ? 'Para Maceió, escolha a entrega em Maceió.'
          : `Ainda não enviamos por ${NOME_ENTREGA[tipo]} para esse CEP. Escolha outra entrega ou fale com a gente pelo WhatsApp.`,
    )
  const correios = tipo !== 'maceio'
  return {
    entrega: tipo,
    cep,
    rua: texto(o.rua, 'a rua', 120, true),
    numero: texto(o.numero, 'o número', 20, true),
    complemento: texto(o.complemento, 'O complemento', 80),
    bairro: texto(o.bairro, 'o bairro', 80, true),
    cidade: correios ? texto(o.cidade, 'a cidade', 80, true) : 'Maceió',
    uf,
    freteCentavos: opcao.centavos,
  }
}

/** a sacola do site: peça (endereço), cor (nome) e tamanho, com os preços do banco */
async function itensDaSacola(db: D1Database, v: unknown): Promise<ItemNovo[]> {
  if (!Array.isArray(v) || !v.length) throw falha(400, 'Sua sacola está vazia.')
  if (v.length > MAX_LINHAS) throw falha(400, `Dá para comprar até ${MAX_LINHAS} itens diferentes de uma vez.`)
  const pedidos = v.map((x) => {
    const o = objeto(x)
    return {
      slug: texto(o.peca, 'A peça', 80, true),
      cor: texto(o.cor, 'A cor', 40, true),
      tamanho: texto(o.tamanho, 'o tamanho', 12, true),
      qtd: inteiro(o.qtd, 'Quantidade', 1, 10),
    }
  })
  const slugs = [...new Set(pedidos.map((p) => p.slug))]
  const { results } = await db
    .prepare(
      `SELECT p.*, c.nome AS colecao_nome FROM pecas p JOIN colecoes c ON c.id = p.colecao_id
       WHERE p.visivel = 1 AND c.visivel = 1 AND p.slug IN (${slugs.map(() => '?').join(',')})`,
    )
    .bind(...slugs)
    .all<LinhaPeca & { colecao_nome: string }>()
  return pedidos.map((x) => {
    const p = results.find((r) => r.slug === x.slug)
    if (!p) throw falha(409, 'Uma das peças da sacola saiu do site. Confira a sacola e tente de novo.')
    const cor = (JSON.parse(p.cores) as CorPeca[]).find((c) => c.nome === x.cor)
    if (!cor) throw falha(409, `${p.nome}: a cor ${x.cor} não está mais disponível.`)
    if (!(JSON.parse(p.tamanhos) as string[]).includes(x.tamanho)) throw falha(409, `${p.nome}: o tamanho ${x.tamanho} não está mais disponível.`)
    return {
      pecaId: p.id,
      cor: cor.id,
      tamanho: x.tamanho,
      quantidade: x.qtd,
      precoCentavos: p.preco_centavos,
      sobEncomenda: p.sob_encomenda === 1,
      nome: p.nome,
      corNome: cor.nome,
      colecaoNome: p.colecao_nome,
      foto: (JSON.parse(p.fotos) as string[])[0] ?? '',
    }
  })
}

/** o que a página do pedido mostra: nada de CPF, e-mail, telefone ou endereço */
/** "2026-10-22 14:52:10" (UTC, como o banco guarda) em milissegundos; null se não aconteceu */
const emMs = (t: string | null) => (t ? Date.parse(t.replace(' ', 'T') + 'Z') : null)

export function pedidoPublico(p: LinhaPedido, itens: LinhaItemPedido[]) {
  const situacao = situacaoDe(p)
  return {
    codigo: p.codigo,
    numero: p.id,
    /** quando o pedido foi feito, pago, enviado, entregue e cancelado (ms; null = ainda não) */
    criadoEm: emMs(p.criado_em)!,
    pagoEm: emMs(p.pago_em),
    enviadoEm: emMs(p.enviado_em),
    entregueEm: emMs(p.entregue_em),
    canceladoEm: emMs(p.cancelado_em),
    situacao,
    nome: p.nome.split(/\s+/)[0] ?? '',
    entrega: p.entrega,
    itens: itens.map((i) => ({
      // endereço da peça no site (vazio se ela saiu): a página do pedido tira da sacola o que foi pago
      peca: i.peca_slug ?? '',
      nome: i.nome,
      cor: i.cor_nome,
      tamanho: i.tamanho,
      quantidade: i.quantidade,
      precoCentavos: i.preco_centavos,
      foto: i.foto,
    })),
    itensCentavos: p.itens_centavos,
    freteCentavos: p.frete_centavos,
    totalCentavos: p.total_centavos,
    pagamento: p.pagamento,
    parcelas: p.parcelas,
    recibo: p.recibo,
    rastreio: situacao === 'enviado' || situacao === 'entregue' ? p.rastreio : '',
    pagar: situacao === 'aguardando' ? p.link_pagamento : '',
    reservaAte: p.reserva_ate * 1000,
  }
}

/**
  Cria a página de pagamento de um pedido já gravado e devolve o endereço dela.
  A cliente volta para /pedido/<codigo> no site, e o aviso vem para este Worker.
  Se a InfinitePay falhar, o pedido não serve: some, e as peças voltam na hora.
*/
export async function abrirPagamento(
  c: Context<Ambiente>,
  codigo: string,
  d: { itens: ItemLink[]; cliente?: DadosLink['cliente']; endereco?: DadosLink['endereco'] },
) {
  const origem = new URL(c.req.url).origin
  const site = (c.env.SITE_PUBLICO || origem).replace(/\/$/, '')
  try {
    const link = await criarLink(c.env, { codigo, ...d, voltar: `${site}/pedido/${codigo}`, aviso: `${origem}/api/pagamento/aviso` })
    await c.env.DB.prepare('UPDATE pedidos SET link_pagamento = ?1, fatura = ?2 WHERE codigo = ?3').bind(link.url, link.fatura, codigo).run()
    return link.url
  } catch (e) {
    console.error('InfinitePay: não abriu o pagamento', e)
    await c.env.DB.prepare('DELETE FROM pedidos WHERE codigo = ?1').bind(codigo).run()
    limparCacheCatalogo()
    throw e
  }
}

export const compras = new Hono<Ambiente>()

// o site do GitHub Pages mora em outro endereço
compras.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST'], allowHeaders: ['Content-Type', 'Authorization'], maxAge: 86400 }))

/** as entregas possíveis para um CEP, com o preço (a sacola pergunta antes de fechar a compra) */
compras.get('/frete', async (c) => {
  const cep = (c.req.query('cep') ?? '').replace(/\D/g, '')
  const uf = ufDoCep(cep)
  if (!uf) throw falha(400, 'Confira o CEP: são 8 números.')
  const chave = `frete:${c.req.header('CF-Connecting-IP') ?? 'local'}`
  if ((await usou(c.env.DB, chave, 900)) >= FRETES_POR_IP) throw falha(429, 'Muitas consultas seguidas. Espere um pouco e tente de novo.')
  await contar(c.env.DB, chave, 900)
  const ajustes = await lerAjustes(c.env.DB)
  return c.json({ uf, opcoes: opcoesDeEntrega(cep, ajustes.taxaMaceioCentavos, ajustes.freteCorreios) })
})

compras.post('/', async (c) => {
  const db = c.env.DB
  const ajustes = await lerAjustes(db)
  // no PC (npm run api), TESTE_VENDAS=sim no .dev.vars deixa testar com as vendas desligadas
  const teste = c.env.TESTE_VENDAS === 'sim' && ['localhost', '127.0.0.1'].includes(new URL(c.req.url).hostname)
  if (!ajustes.vendasOnline && !teste) throw falha(409, 'As compras pelo site estão pausadas no momento. Fale com a gente pelo WhatsApp.')

  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  if ((await usou(db, `pedido:${ip}`, 3600)) >= 10) throw falha(429, 'Muitos pedidos seguidos. Espere um pouco e tente de novo.')

  // a compra fica na conta da cliente: nome, WhatsApp e e-mail vêm dela
  const conta = await clienteDaSessao(c)
  if (!conta) throw falha(401, 'Entre na sua conta (ou crie uma) para fechar a compra.')

  const corpo = await lerCorpo(c)
  const cliente = { nome: conta.nome, whatsapp: conta.whatsapp, email: conta.email, cpf: lerCpf(corpo.cliente) }
  const entrega = lerEntrega(corpo.entrega, ajustes)
  if (entrega.entrega !== 'maceio' && !cliente.cpf)
    throw falha(400, 'Para enviar pelos Correios, preencha o CPF: ele vai na declaração de conteúdo do pacote.')
  const itens = await conferirDisponivel(db, await itensDaSacola(db, corpo.itens))

  const abertos = await db
    .prepare("SELECT COUNT(*) AS n FROM pedidos WHERE whatsapp = ?1 AND situacao = 'aguardando' AND reserva_ate > unixepoch()")
    .bind(cliente.whatsapp)
    .first<{ n: number }>()
  if ((abertos?.n ?? 0) >= 3)
    throw falha(429, `Você já tem pedidos esperando pagamento. Pague um deles ou espere ${RESERVA_MINUTOS} minutos para fazer outro.`)

  const codigo = novoCodigo()
  try {
    await gravarPedido(
      db,
      { codigo, origem: 'site', reservaAte: agora() + RESERVA_MINUTOS * 60, ...cliente, ...entrega, pagamento: '', observacao: '', clienteId: conta.id },
      itens,
    )
  } catch (e) {
    if (semEstoque(e)) throw falha(409, 'Uma das peças acabou de esgotar. Confira a sacola e tente de novo.')
    throw e
  }
  await contar(db, `pedido:${ip}`, 3600)
  limparCacheCatalogo()

  try {
    const pagar = await abrirPagamento(c, codigo, {
      itens: [
        ...itens.map((i) => ({ descricao: `${i.nome} · ${i.corNome} · ${i.tamanho}`, quantidade: i.quantidade, precoCentavos: i.precoCentavos })),
        ...(entrega.freteCentavos > 0 ? [{ descricao: NOME_ENTREGA[entrega.entrega], quantidade: 1, precoCentavos: entrega.freteCentavos }] : []),
      ],
      cliente,
      endereco: entrega,
    })
    return c.json({ codigo, pagar }, 201)
  } catch {
    throw falha(502, 'Não conseguimos abrir o pagamento agora. Tente de novo em instantes.')
  }
})

async function pedidoDoSite(db: D1Database, codigo: string) {
  const achado = CODIGO.test(codigo) ? await lerPedido(db, 'codigo', codigo) : null
  if (!achado || achado.pedido.origem !== 'site') throw falha(404, 'Pedido não encontrado.')
  return achado
}

/**
  Os pedidos que o aparelho guardou (aba "Pedidos" da gaveta), do mais novo
  para o mais antigo. Só os do site, e só os códigos que vieram: quem não tem o
  código não acha o pedido. Código inválido ou de pedido que não existe some da resposta.
*/
compras.post('/consulta', async (c) => {
  const db = c.env.DB
  const corpo = await lerCorpo(c)
  if (!Array.isArray(corpo.codigos) || corpo.codigos.length > MAX_CONSULTA) throw falha(400, 'Consulta inválida.')
  const codigos = [...new Set(corpo.codigos.filter((x): x is string => typeof x === 'string' && CODIGO.test(x)))]
  if (!codigos.length) return c.json({ pedidos: [] })
  const chave = `consulta:${c.req.header('CF-Connecting-IP') ?? 'local'}`
  if ((await usou(db, chave, 900)) >= CONSULTAS_POR_IP) throw falha(429, 'Muitas consultas seguidas. Espere um pouco e tente de novo.')
  await contar(db, chave, 900)

  const marcas = codigos.map((_, i) => `?${i + 1}`).join(',')
  const [pedidos, itens] = await db.batch([
    db.prepare(`SELECT * FROM pedidos WHERE origem = 'site' AND codigo IN (${marcas}) ORDER BY id DESC`).bind(...codigos),
    db
      .prepare(
        `SELECT i.*, pc.slug AS peca_slug FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
         LEFT JOIN pecas pc ON pc.id = i.peca_id WHERE p.origem = 'site' AND p.codigo IN (${marcas}) ORDER BY i.id`,
      )
      .bind(...codigos),
  ])
  const todos = itens.results as LinhaItemPedido[]
  return c.json({ pedidos: (pedidos.results as LinhaPedido[]).map((p) => pedidoPublico(p, todos.filter((i) => i.pedido_id === p.id))) })
})

compras.get('/:codigo', async (c) => {
  const { pedido, itens } = await pedidoDoSite(c.env.DB, c.req.param('codigo'))
  return c.json(pedidoPublico(pedido, itens))
})

/** a cliente voltou da InfinitePay com os dados do pagamento no endereço */
compras.post('/:codigo/conferir', async (c) => {
  const db = c.env.DB
  const codigo = c.req.param('codigo')
  let { pedido, itens } = await pedidoDoSite(db, codigo)
  const corpo = await lerCorpo(c)
  const transacao = texto(corpo.transacao, 'A transação', 100)
  if (!pedido.pago_em && transacao) {
    if ((await usou(db, `conferir:${codigo}`, 900)) >= 30) throw falha(429, 'Muitas tentativas. Espere um pouco e recarregue a página.')
    await contar(db, `conferir:${codigo}`, 900)
    try {
      await processarPagamento(c.env, pedido, { transacao, fatura: texto(corpo.fatura, 'A fatura', 100), recibo: corpo.recibo })
    } catch (e) {
      // a InfinitePay não respondeu: o pedido segue aguardando, e o aviso dela ou a próxima tentativa da página resolvem
      if (!(e instanceof ErroInfinitePay)) throw e
      console.error('conferir pagamento', e)
    }
    ;({ pedido, itens } = await pedidoDoSite(db, codigo))
  } else if (pedido.pago_em && !pedido.recibo && transacao && transacao === pedido.transacao) {
    // o aviso chegou antes e veio sem o comprovante: guarda o que veio na volta da cliente (mesma transação)
    const recibo = reciboValido(corpo.recibo)
    if (recibo) {
      await db.prepare(`UPDATE pedidos SET recibo = ?1 WHERE id = ?2 AND recibo = ''`).bind(recibo, pedido.id).run()
      ;({ pedido, itens } = await pedidoDoSite(db, codigo))
    }
  }
  return c.json(pedidoPublico(pedido, itens))
})

/**
  Aviso da InfinitePay. Responde 200 quando terminou (ou quando não há o que
  fazer) e 400 quando algo falhou do nosso lado ou do dela, para ela mandar de novo.
  Também 400 quando a conferência ainda diz que não foi pago: ela só avisa
  pagamento aprovado, então pode ser só atraso, e a cliente talvez nem volte ao
  site para conferir de novo. Um aviso forjado também cai aqui, sem aprovar nada.
  429 quando o mesmo pedido recebe avisos demais em pouco tempo.
*/
export async function avisoDePagamento(c: { env: Env; req: { json: () => Promise<unknown> }; json: (d: unknown, s?: 200 | 400 | 429) => Response }) {
  let d: Corpo
  try {
    d = objeto(await c.req.json())
  } catch {
    return c.json({ ok: false }, 400)
  }
  const codigo = typeof d.order_nsu === 'string' ? d.order_nsu : ''
  const transacao = typeof d.transaction_nsu === 'string' ? d.transaction_nsu.slice(0, 100) : ''
  const achado = CODIGO.test(codigo) && transacao ? await lerPedido(c.env.DB, 'codigo', codigo) : null
  if (!achado) {
    console.warn('aviso da InfinitePay sem pedido conhecido', JSON.stringify(d).slice(0, 300))
    return c.json({ ok: true })
  }
  // quem sabe o código de um pedido não pode fazer o Worker perguntar à InfinitePay sem parar
  const chave = `aviso:${codigo}`
  if ((await usou(c.env.DB, chave, 900)) >= AVISOS_POR_PEDIDO) return c.json({ ok: false }, 429)
  await contar(c.env.DB, chave, 900)
  // a compra de teste do painel mostra se o aviso chegou
  await c.env.DB.prepare(`UPDATE pedidos SET aviso_em = datetime('now') WHERE id = ?1`).bind(achado.pedido.id).run()
  try {
    const r = await processarPagamento(c.env, achado.pedido, {
      transacao,
      fatura: typeof d.invoice_slug === 'string' ? d.invoice_slug.slice(0, 100) : '',
      recibo: d.receipt_url,
    })
    if (r === 'nao_pago') return c.json({ ok: false, resultado: r }, 400)
    return c.json({ ok: true, resultado: r })
  } catch (e) {
    console.error('aviso da InfinitePay', e)
    return c.json({ ok: false }, 400)
  }
}
