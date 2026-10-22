/*
  Conversa com a InfinitePay (Checkout Integrado):
    POST /links           cria a página de pagamento de um pedido (Pix ou cartão)
    POST /payment_check   pergunta se um pagamento foi aprovado e de quanto foi
  A conta é a InfiniteTag da loja (INFINITEPAY_HANDLE, em wrangler.jsonc). Se
  um dia a loja criar uma chave de API no app, ela vai só como segredo
  (wrangler secret put INFINITEPAY_CHAVE) e segue no cabeçalho X-Api-Key.
  O aviso que a InfinitePay manda (webhook) não tem assinatura: quem aprova um
  pedido é sempre o payment_check, nunca o aviso sozinho.
*/

const API_PADRAO = 'https://api.checkout.infinitepay.io'

export class ErroInfinitePay extends Error {}

type Ambiente = Pick<Env, 'INFINITEPAY_HANDLE'> & { INFINITEPAY_API?: string; INFINITEPAY_CHAVE?: string }

async function chamar(env: Ambiente, caminho: string, corpo: Record<string, unknown>) {
  if (!env.INFINITEPAY_HANDLE) throw new ErroInfinitePay('INFINITEPAY_HANDLE não configurado')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (env.INFINITEPAY_CHAVE) headers['X-Api-Key'] = env.INFINITEPAY_CHAVE
  const enviar = () =>
    fetch((env.INFINITEPAY_API || API_PADRAO).replace(/\/$/, '') + caminho, {
      method: 'POST',
      headers,
      body: JSON.stringify({ handle: env.INFINITEPAY_HANDLE, ...corpo }),
      signal: AbortSignal.timeout(12_000),
    })
  let r: Response
  try {
    // a conexão caiu no caminho (sem resposta nenhuma): tenta mais uma vez antes de desistir
    r = await enviar().catch((e) => (e instanceof Error && e.name === 'TimeoutError' ? Promise.reject(e) : enviar()))
  } catch (e) {
    throw new ErroInfinitePay(`${caminho}: sem resposta (${e instanceof Error ? e.message : e})`)
  }
  const texto = await r.text()
  if (!r.ok) throw new ErroInfinitePay(`${caminho}: HTTP ${r.status} ${texto.slice(0, 300)}`)
  try {
    return JSON.parse(texto) as Record<string, unknown>
  } catch {
    throw new ErroInfinitePay(`${caminho}: resposta inválida ${texto.slice(0, 300)}`)
  }
}

export type ItemLink = { descricao: string; quantidade: number; precoCentavos: number }

export type DadosLink = {
  codigo: string
  itens: ItemLink[]
  /** para onde a cliente volta depois de pagar */
  voltar: string
  /** onde a InfinitePay avisa que o pagamento foi aprovado */
  aviso: string
  /** sem ela, quem paga preenche nome, e-mail e telefone na página da InfinitePay */
  cliente?: { nome: string; email: string; whatsapp: string }
  endereco?: { cep: string; rua: string; bairro: string; numero: string; complemento: string }
}

/** cria a página de pagamento; devolve o endereço dela e o código da fatura (quando vier) */
export async function criarLink(env: Ambiente, d: DadosLink) {
  const resposta = await chamar(env, '/links', {
    order_nsu: d.codigo,
    redirect_url: d.voltar,
    webhook_url: d.aviso,
    items: d.itens.map((i) => ({ quantity: i.quantidade, price: i.precoCentavos, description: i.descricao.slice(0, 120) })),
    ...(d.cliente && { customer: { name: d.cliente.nome, email: d.cliente.email, phone_number: '+' + d.cliente.whatsapp } }),
    ...(d.endereco && {
      address: {
        cep: d.endereco.cep,
        street: d.endereco.rua,
        neighborhood: d.endereco.bairro,
        number: d.endereco.numero,
        complement: d.endereco.complemento,
      },
    }),
  })
  // a documentação e as integrações conhecidas usam nomes diferentes para o endereço.
  // Só no PC (INFINITEPAY_API aponta para a InfinitePay de mentira, scripts/infinitepay-falsa.mjs) vale http
  const endereco = env.INFINITEPAY_API ? /^https?:\/\// : /^https:\/\//
  const url = [resposta.url, resposta.link, resposta.checkout_url, resposta.payment_url].find(
    (v): v is string => typeof v === 'string' && endereco.test(v),
  )
  if (!url) throw new ErroInfinitePay(`/links: resposta sem endereço ${JSON.stringify(resposta).slice(0, 300)}`)
  return { url, fatura: typeof resposta.slug === 'string' ? resposta.slug : '' }
}

export type Conferencia = {
  pago: boolean
  /** valor do pedido que a InfinitePay cobrou */
  valorCentavos: number
  /** o que a cliente pagou (com os juros do parcelamento, se ela pagou) */
  pagoCentavos: number
  parcelas: number
  forma: string
}

/** pergunta à InfinitePay se o pagamento foi aprovado */
export async function conferirPagamento(env: Ambiente, p: { codigo: string; transacao: string; fatura: string }): Promise<Conferencia> {
  const r = await chamar(env, '/payment_check', { order_nsu: p.codigo, transaction_nsu: p.transacao, slug: p.fatura })
  const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0)
  return {
    pago: r.success !== false && r.paid === true,
    valorCentavos: numero(r.amount),
    pagoCentavos: numero(r.paid_amount) || numero(r.amount),
    parcelas: numero(r.installments) || 1,
    forma: typeof r.capture_method === 'string' ? r.capture_method.slice(0, 20) : '',
  }
}
