/*
  Aviso de venda por e-mail: quando um pedido do site é pago pela InfinitePay,
  a loja recebe um e-mail no endereço dos dados da loja (Ajustes), com as
  peças, a entrega, o total, o contato da cliente e o link do pedido no painel.
  Vai pelo Resend (resend.com):
  - A chave fica só como segredo do Worker: npx wrangler secret put RESEND_CHAVE.
    Sem a chave, ou sem o e-mail da loja, nada é enviado.
  - Sem domínio próprio, o remetente é o de teste do Resend
    (onboarding@resend.dev), que só entrega para o e-mail de quem criou a conta
    no Resend: crie a conta com o mesmo e-mail da loja. Com o domínio
    verificado no Resend, ponha o remetente novo no segredo EMAIL_REMETENTE
    (ex.: Livi <pedidos@livibylm.com.br>).
  - Cada pedido avisa uma vez só (pedidos.venda_avisada_em): o aviso da
    InfinitePay e a volta da cliente podem aprovar o pedido ao mesmo tempo.
    Se o Resend falhar, a marca sai, e o próximo aviso do pedido tenta de novo.
  O e-mail vai só em texto, sem HTML: o nome da cliente vem de fora.
*/
import type { LinhaItemPedido, LinhaPedido } from './tipos'
import { lerAjustes } from './ajustes'

type Ambiente = { DB: D1Database; RESEND_CHAVE?: string; EMAIL_REMETENTE?: string }

const API_RESEND = 'https://api.resend.com/emails'
const REMETENTE_PADRAO = 'Livi <onboarding@resend.dev>'

/** 31890 -> "R$ 318,90" */
const reais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`

/** 5582999991234 -> (82) 99999-1234 */
const telefone = (n: string) => n.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')

const ENTREGAS: Record<string, string> = { maceio: 'Entrega em Maceió', pac: 'Correios PAC', sedex: 'Correios SEDEX', maos: 'Em mãos' }

const FORMAS: Record<string, string> = { pix: 'Pix', credit_card: 'cartão de crédito' }

/** a compra de teste do painel: um item só, que não é uma peça */
const deTeste = (itens: LinhaItemPedido[]) => itens.length === 1 && itens[0].peca_id === null

function assunto(p: LinhaPedido, itens: LinhaItemPedido[]) {
  if (deTeste(itens)) return `Compra de teste paga: pedido nº ${p.id}`
  if (p.situacao === 'sem_estoque') return `Pagamento sem estoque: pedido nº ${p.id}, fale com a cliente`
  return `Venda no site: pedido nº ${p.id}, ${reais(p.total_centavos)}`
}

function texto(p: LinhaPedido, itens: LinhaItemPedido[], painel: string) {
  const forma = FORMAS[p.pagamento] ?? p.pagamento
  const pagamento = [forma, p.parcelas > 1 ? `em ${p.parcelas}x` : ''].filter(Boolean).join(' ')
  const entrega = ENTREGAS[p.entrega] ?? 'A combinar'
  const destino = p.cidade ? ` · ${p.cidade}${p.uf ? `/${p.uf}` : ''}` : ''
  return [
    `Pedido nº ${p.id}, pago agora pelo site.`,
    p.situacao === 'sem_estoque'
      ? '\nAtenção: o pagamento chegou depois que a reserva venceu e uma das peças já tinha sido vendida. Fale com a cliente: dá para esperar a peça voltar, trocar por outra ou devolver o valor.'
      : '',
    '',
    'Peças:',
    ...itens.map((i) => `- ${i.quantidade}x ${[i.nome, i.cor_nome, i.tamanho].filter(Boolean).join(' · ')}: ${reais(i.preco_centavos * i.quantidade)}`),
    '',
    `Entrega: ${entrega}${destino}${p.frete_centavos ? `: ${reais(p.frete_centavos)}` : ''}`,
    `Total: ${reais(p.total_centavos)}${pagamento ? ` (${pagamento})` : ''}`,
    '',
    `Cliente: ${p.nome}${p.whatsapp ? ` · WhatsApp ${telefone(p.whatsapp)}` : ''}`,
    '',
    `Abrir no painel: ${painel}/painel/pedido/${p.id}`,
  ]
    .filter((linha, i, todas) => linha !== '' || todas[i - 1] !== '')
    .join('\n')
}

/**
  Manda o e-mail da venda, se o pedido estiver pago e a loja ainda não tiver
  sido avisada. Nunca lança erro: quem chama é o pagamento, que não pode falhar
  por causa do e-mail. painel = endereço do Worker (onde mora o painel).
*/
export async function avisarVenda(env: Ambiente, pedidoId: number, painel: string) {
  if (!env.RESEND_CHAVE) return
  const db = env.DB
  try {
    const para = (await lerAjustes(db)).loja.email
    if (!para) return
    // marca antes de mandar: dos dois caminhos que aprovam ao mesmo tempo, só um manda.
    // Só pedido pago pela InfinitePay (com transação): o marcado como pago à mão no painel a loja já sabe
    const marcado = await db
      .prepare(`UPDATE pedidos SET venda_avisada_em = datetime('now') WHERE id = ?1 AND pago_em IS NOT NULL AND transacao != '' AND venda_avisada_em IS NULL`)
      .bind(pedidoId)
      .run()
    if (!marcado.meta.changes) return
    const [pedido, itens] = await db.batch([
      db.prepare('SELECT * FROM pedidos WHERE id = ?1').bind(pedidoId),
      db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?1 ORDER BY id').bind(pedidoId),
    ])
    const achado = { pedido: pedido.results[0] as LinhaPedido, itens: itens.results as LinhaItemPedido[] }
    try {
      const r = await fetch(API_RESEND, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_CHAVE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.EMAIL_REMETENTE || REMETENTE_PADRAO,
          to: [para],
          subject: assunto(achado.pedido, achado.itens),
          text: texto(achado.pedido, achado.itens, painel.replace(/\/$/, '')),
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 300)}`)
    } catch (e) {
      // não chegou: tira a marca, e o próximo aviso do pedido tenta de novo
      await db.prepare('UPDATE pedidos SET venda_avisada_em = NULL WHERE id = ?1').bind(pedidoId).run()
      throw e
    }
  } catch (e) {
    console.error(`aviso de venda por e-mail (pedido ${pedidoId})`, e)
  }
}
