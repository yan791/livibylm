/*
  O que as telas de pedidos usam em comum: nomes das situações, das entregas
  e das formas de pagamento, datas e as mensagens prontas do WhatsApp.
*/
import { enderecoSite, type Pedido, type Situacao } from './api'

export const SITUACOES: Record<Situacao, { rotulo: string; selo: string }> = {
  aguardando: { rotulo: 'Aguardando pagamento', selo: 'selo-claro' },
  expirado: { rotulo: 'Não pago', selo: 'selo-cinza' },
  pago: { rotulo: 'Pago · pra enviar', selo: '' },
  sem_estoque: { rotulo: 'Pago sem estoque', selo: 'selo-perigo' },
  enviado: { rotulo: 'Enviado', selo: 'selo-alerta' },
  entregue: { rotulo: 'Entregue', selo: 'selo-ok' },
  cancelado: { rotulo: 'Cancelado', selo: 'selo-cinza' },
}

export const ENTREGAS: Record<string, string> = {
  maceio: 'Entrega em Maceió',
  pac: 'Correios (PAC)',
  sedex: 'Correios (SEDEX)',
  maos: 'Entregue em mãos',
  combinar: 'A combinar',
}

export const PAGAMENTOS: Record<string, string> = {
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
  outro: 'Outro',
}

export const pelosCorreios = (entrega: string) => entrega === 'pac' || entrega === 'sedex'

export function pagamentoTexto(p: Pick<Pedido, 'pagamento' | 'parcelas'>) {
  const forma = PAGAMENTOS[p.pagamento] ?? ''
  return p.pagamento === 'credit_card' && p.parcelas > 1 ? `${forma} em ${p.parcelas}x` : forma
}

/** "2026-10-21 17:32:05" (horário de Greenwich, como o banco guarda) */
const dataDe = (s: string) => new Date(s.replace(' ', 'T') + 'Z')

const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** "hoje, 14:32", "ontem, 09:10", "12 de out., 14:32" */
export function quando(s: string) {
  const d = dataDe(s)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const hoje = new Date()
  const ontem = new Date(hoje.getTime() - 86_400_000)
  if (mesmoDia(d, hoje)) return `hoje, ${hora}`
  if (mesmoDia(d, ontem)) return `ontem, ${hora}`
  const dia = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== hoje.getFullYear() && { year: 'numeric' }) })
  return `${dia}, ${hora}`
}

/** "21/10/2026, 14:32" (papel impresso fica guardado: sem "hoje") */
export const dataCompleta = (s: string) =>
  dataDe(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** "14:52" de um instante em milissegundos */
export const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** "529.982.247-25" */
export const cpfTexto = (n: string) => n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')

/** "57035-180" */
export const cepTexto = (n: string) => n.replace(/^(\d{5})(\d{3})$/, '$1-$2')

/** endereço em linhas, para mostrar, copiar e imprimir */
export function enderecoLinhas(p: Pick<Pedido, 'endereco'>) {
  const e = p.endereco
  if (!e.rua) return []
  return [
    `${e.rua}, ${e.numero}${e.complemento ? ` - ${e.complemento}` : ''}`,
    `${e.bairro} - ${e.cidade}/${e.uf}`,
    `CEP ${cepTexto(e.cep)}`,
  ]
}

export const linkConversa = (numero: string, texto?: string) => `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? ''

/** página do pedido no site, para a cliente acompanhar (só as compras do site têm) */
export const linkDoPedido = (p: Pick<Pedido, 'codigo'>) => `${enderecoSite || location.origin}/pedido/${p.codigo}`
const acompanhar = (p: Pick<Pedido, 'codigo' | 'origem'>, texto = 'Acompanhe o seu pedido aqui:') =>
  p.origem === 'site' ? [`${texto} ${linkDoPedido(p)}`] : []

/** link de senha nova da conta do site (vale por 24 horas e uma vez só) */
export const mensagemSenhaNova = (nome: string, link: string) =>
  `Oi, ${primeiroNome(nome)}! Para criar uma senha nova na sua conta do site da Livi, é só abrir este link (ele vale por 24 horas):\n\n${link}`

/** "pagamento confirmado": a primeira mensagem depois que a compra cai */
export function mensagemConfirmacao(p: Pedido) {
  const proximo = pelosCorreios(p.entrega)
    ? 'Assim que postarmos nos Correios, mandamos o código de rastreio por aqui.'
    : p.entrega === 'maceio'
      ? 'Vamos combinar o melhor horário para a entrega por aqui.'
      : 'Vamos combinar a entrega por aqui.'
  return [
    `Oi, ${primeiroNome(p.nome)}! Aqui é da Livi.`,
    `Recebemos o seu pedido nº ${p.id} e o pagamento está confirmado. ${proximo}`,
    ...acompanhar(p),
    'Obrigada pela compra!',
  ].join('\n\n')
}

/** "seu pedido foi enviado": com o código de rastreio, nos Correios */
export function mensagemEnvio(p: Pedido) {
  const oi = `Oi, ${primeiroNome(p.nome)}! Aqui é da Livi.`
  if (pelosCorreios(p.entrega) && p.rastreio)
    return [
      oi,
      `O seu pedido nº ${p.id} foi postado nos Correios. O código de rastreio é ${p.rastreio}.`,
      'Dá para acompanhar em https://rastreamento.correios.com.br',
      ...acompanhar(p, 'Os detalhes do pedido ficam aqui:'),
    ].join('\n\n')
  return [oi, `O seu pedido nº ${p.id} saiu para entrega. Qualquer coisa, é só chamar por aqui.`, ...acompanhar(p)].join('\n\n')
}
