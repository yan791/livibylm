/*
  Pedidos feitos neste aparelho (aba "Pedidos" da gaveta): o código
  de cada compra pelo site, que é o que abre a página /pedido/<código>. Entra
  quando a cliente vai para o pagamento e quando ela abre a página de um
  pedido (por exemplo, pelo link que a loja manda no WhatsApp). A situação de
  cada um vem do servidor (POST /api/pedidos/consulta). Com a conta aberta
  (lib/conta), os pedidos vêm da conta, e os códigos daqui que são dela entram nela.
*/
import { useSyncExternalStore } from 'react'
import { API } from './base'

const CHAVE = 'livi-meus-pedidos'
/** o servidor consulta até 30 de uma vez (MAX_CONSULTA em worker/pedidos.ts) */
const MAXIMO = 30
const CODIGO = /^[2-9a-z]{16}$/

const ouvintes = new Set<() => void>()

function carregar(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string' && CODIGO.test(c)).slice(0, MAXIMO) : []
  } catch {
    return []
  }
}

let codigos: string[] = typeof window === 'undefined' ? [] : carregar()

function salvar(novos: string[]) {
  codigos = novos
  try {
    localStorage.setItem(CHAVE, JSON.stringify(codigos))
  } catch {
    /* sem armazenamento: a lista vive só nesta visita */
  }
  ouvintes.forEach((f) => f())
}

// o mesmo site aberto em outra aba
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key !== CHAVE) return
    codigos = carregar()
    ouvintes.forEach((f) => f())
  })

/** guarda o pedido no aparelho (o mais novo primeiro) */
export function guardarPedido(codigo: string) {
  if (!CODIGO.test(codigo) || codigos[0] === codigo) return
  salvar([codigo, ...codigos.filter((c) => c !== codigo)].slice(0, MAXIMO))
}

/** tira da lista (pedido que não foi pago, ou que o servidor não conhece mais) */
export const esquecerPedidos = (tirar: string[]) => salvar(codigos.filter((c) => !tirar.includes(c)))

/** esquece todos (ao sair da conta, para a próxima pessoa no aparelho não ver) */
export const esquecerTodos = () => salvar([])

export const useMeusPedidos = () =>
  useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb)
      return () => ouvintes.delete(cb)
    },
    () => codigos,
    () => codigos,
  )

export type Situacao = 'aguardando' | 'expirado' | 'pago' | 'sem_estoque' | 'enviado' | 'entregue' | 'cancelado'

/** o que a página e a aba mostram de um pedido (sem dados pessoais: é o que o servidor devolve para quem tem o código) */
export type PedidoPublico = {
  codigo: string
  numero: number
  criadoEm: number
  /** quando foi pago, enviado, entregue e cancelado (ms; null = ainda não) */
  pagoEm: number | null
  enviadoEm: number | null
  entregueEm: number | null
  canceladoEm: number | null
  situacao: Situacao
  nome: string
  entrega: string
  itens: { peca: string; nome: string; cor: string; tamanho: string; quantidade: number; precoCentavos: number; foto: string }[]
  itensCentavos: number
  freteCentavos: number
  totalCentavos: number
  pagamento: string
  parcelas: number
  recibo: string
  rastreio: string
  pagar: string
  reservaAte: number
}

export async function consultarPedidos(lista: string[]) {
  const r = await fetch(`${API}/api/pedidos/consulta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigos: lista }),
  })
  if (!r.ok) throw new Error(String(r.status))
  return ((await r.json()) as { pedidos: PedidoPublico[] }).pedidos
}

export const PAGOS: Situacao[] = ['pago', 'enviado', 'entregue']
export const pelosCorreios = (entrega: string) => entrega === 'pac' || entrega === 'sedex'

/** a situação em poucas palavras, para a lista */
export function situacaoTexto(p: Pick<PedidoPublico, 'situacao' | 'entrega'>) {
  const correios = pelosCorreios(p.entrega)
  switch (p.situacao) {
    case 'aguardando':
      return 'Esperando o pagamento'
    case 'expirado':
      return 'Não foi pago'
    case 'pago':
      return correios ? 'Pago · preparando o envio' : 'Pago · vamos combinar a entrega'
    case 'sem_estoque':
      return 'Pago · vamos falar com você'
    case 'enviado':
      return correios ? 'Postado nos Correios' : 'Saiu para entrega'
    case 'entregue':
      return 'Entregue'
    default:
      return 'Cancelado'
  }
}

export type Etapa = { titulo: string; texto?: string; em: number | null; feita: boolean }

/**
  As 4 etapas do pedido, todas automáticas: feito (na compra), pagamento
  confirmado (pela InfinitePay), enviado e entregue (quando a loja marca no
  painel). Cancelado entra no lugar das que não aconteceram.
*/
export function etapasDo(p: PedidoPublico): Etapa[] {
  const correios = pelosCorreios(p.entrega)
  const chegou = (s: Situacao[]) => s.includes(p.situacao)
  const pago = p.pagoEm !== null
  const enviado = chegou(['enviado', 'entregue']) || (p.enviadoEm !== null && p.situacao === 'cancelado')
  const entregue = chegou(['entregue'])
  const etapas: Etapa[] = [
    { titulo: 'Pedido feito', em: p.criadoEm, feita: true },
    {
      titulo: 'Pagamento confirmado',
      texto: pago ? (p.situacao === 'sem_estoque' ? 'Uma peça acabou: a gente fala com você no WhatsApp.' : 'A loja recebeu o seu pedido.') : undefined,
      em: p.pagoEm,
      feita: pago,
    },
    {
      titulo: correios ? 'Enviado aos Correios' : p.entrega === 'maceio' ? 'Saiu para entrega' : 'Enviado',
      texto: correios && enviado && !entregue ? 'O código de rastreio a gente manda pelo WhatsApp.' : undefined,
      em: p.enviadoEm,
      feita: enviado || entregue,
    },
    { titulo: 'Entregue', em: p.entregueEm, feita: entregue },
  ]
  if (p.situacao !== 'cancelado') return etapas
  // cancelado: fica o que aconteceu antes, e o cancelamento no fim
  return [...etapas.filter((e) => e.feita), { titulo: 'Pedido cancelado', em: p.canceladoEm, feita: true }]
}

/** "22 de out., 14:52" */
export const quandoEtapa = (ms: number) =>
  new Date(ms).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** mensagem para pedir o código de rastreio pelo WhatsApp */
export const mensagemRastreio = (numero: number) => `Olá! Fiz o pedido nº ${numero} no site da Liví e queria o código de rastreio.`

/** "22 de out. de 2026" */
export const dataDoPedido = (ms: number) => new Date(ms).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
