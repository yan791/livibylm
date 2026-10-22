/*
  Conversa com a API do painel (/api/painel/...) e os tipos que vêm de lá.
  Se a sessão acabar no meio do uso, avisa o App, que volta para a tela de entrar.
*/

import type { TabelaFrete } from '../../worker/frete'

export type Admin = { id: number; email: string; nome: string; site: string }

/** endereço do site público (GitHub Pages); vazio = o próprio servidor do painel */
export let enderecoSite = ''
export const definirSite = (s: string) => {
  enderecoSite = s.replace(/\/$/, '')
}

export type CorPeca = { id: string; nome: string; hex: string }

export type Colecao = {
  id: number
  slug: string
  nome: string
  numero: string
  fundo: string
  tema: 'claro' | 'escuro'
  clima: string
  descricao: string
  capa: string | null
  capaProporcao: number
  ordem: number
  visivel: boolean
  pecas: number
}

export type ResumoPeca = {
  id: number
  colecaoId: number
  nome: string
  slug: string
  precoCentavos: number
  foto: string | null
  visivel: boolean
  sobEncomenda: boolean
  total: number
  combinacoes: number
  zeradas: number
}

export type Peca = {
  id: number
  colecaoId: number
  slug: string
  nome: string
  precoCentavos: number
  descricao: string
  tecido: string
  cores: CorPeca[]
  tamanhos: string[]
  fotos: string[]
  modeloAltura: string
  modeloVeste: string
  sobEncomenda: boolean
  prazoEncomenda: string
  visivel: boolean
  ordem: number
  /** reservado = unidades seguras agora em compras do site esperando pagamento */
  estoque: { cor: string; tamanho: string; quantidade: number; reservado: number }[]
}

export type Pessoa = { id: number; email: string; nome: string; ativo: boolean; ultimoAcesso: string | null; voce: boolean }

export type Ajustes = {
  vendasOnline: boolean
  /** PAC e SEDEX por região, em centavos; null = não envia por esse serviço para lá */
  freteCorreios: TabelaFrete
  taxaMaceioCentavos: number
  /** 1 = sem parcelamento */
  parcelasSemJuros: number
  /** 55 + DDD + número, só dígitos */
  whatsapp: string
  /** quem vende: aparece no rodapé do site e nas páginas de trocas e de privacidade (documento = CPF ou CNPJ sem pontuação; o CNPJ pode ter letras) */
  loja: { nome: string; documento: string; endereco: string; email: string }
  /** dias, contados do recebimento, para pedir troca */
  trocaDias: number
  /** quem paga o frete de uma troca */
  freteTroca: 'loja' | 'dividido' | 'cliente'
}

/** a última compra de teste (Ajustes): paga, ela libera as vendas pelo site */
export type CompraTeste = {
  id: number
  situacao: Situacao
  totalCentavos: number
  /** página de pagamento, enquanto ainda dá para pagar */
  pagar: string
  pago: boolean
  /** o aviso automático (webhook) da InfinitePay chegou */
  aviso: boolean
}

export type Situacao = 'aguardando' | 'expirado' | 'pago' | 'sem_estoque' | 'enviado' | 'entregue' | 'cancelado'

export type ResumoPedido = {
  id: number
  /** 'site' = compra pelo site; 'fora' = venda registrada no painel */
  origem: 'site' | 'fora'
  situacao: Situacao
  /** até quando as peças ficam seguras (ms), para quem ainda não pagou */
  reservaAte: number
  nome: string
  totalCentavos: number
  entrega: string
  criadoEm: string
  pagoEm: string | null
  unidades: number
  foto: string
  /** nome da primeira peça */
  primeira: string
}

export type Pedido = Omit<ResumoPedido, 'unidades' | 'foto' | 'primeira'> & {
  codigo: string
  estoqueBaixado: boolean
  whatsapp: string
  email: string
  cpf: string
  endereco: { cep: string; rua: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string }
  itensCentavos: number
  freteCentavos: number
  pagamento: string
  parcelas: number
  pagoCentavos: number
  recibo: string
  rastreio: string
  observacao: string
  enviadoEm: string | null
  entregueEm: string | null
  canceladoEm: string | null
  itens: {
    id: number
    pecaId: number | null
    nome: string
    cor: string
    tamanho: string
    quantidade: number
    precoCentavos: number
    colecao: string
    foto: string
    sobEncomenda: boolean
  }[]
}

/** uma peça para escolher ao registrar uma venda; livre = "idDaCor|Tamanho" -> quantas dá para vender agora */
export type OpcaoVenda = {
  id: number
  nome: string
  colecao: string
  precoCentavos: number
  foto: string
  visivel: boolean
  sobEncomenda: boolean
  cores: CorPeca[]
  tamanhos: string[]
  livre: Record<string, number>
}

export class ErroApi extends Error {
  status: number
  constructor(status: number, mensagem: string) {
    super(mensagem)
    this.status = status
  }
}

export const EVENTO_SAIU = 'painel:sessao-terminou'

export async function api<T = unknown>(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', caminho: string, corpo?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  let body: BodyInit | undefined
  if (corpo instanceof Blob) {
    headers['Content-Type'] = corpo.type
    body = corpo
  } else if (corpo !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(corpo)
  }

  let r: Response
  try {
    r = await fetch(`/api/painel${caminho}`, { method: metodo, headers, body, credentials: 'same-origin' })
  } catch {
    throw new ErroApi(0, 'Sem conexão. Verifique a internet e tente de novo.')
  }
  const dados = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null
  const abertas = ['/entrar', '/convite/', '/eu']
  if (r.status === 401 && !abertas.some((a) => caminho.startsWith(a))) window.dispatchEvent(new Event(EVENTO_SAIU))
  if (!r.ok) throw new ErroApi(r.status, (dados as { erro?: string } | null)?.erro ?? 'Não deu certo. Tente de novo em instantes.')
  return dados as T
}

export const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : 'Não deu certo. Tente de novo em instantes.')

export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: centavos % 100 ? 2 : 0 })

/** "1.234,56", "689,9" ou "689.90" em centavos; null se não for um valor */
export function centavosDe(texto: string): number | null {
  const t = texto.replace(/[^\d,.]/g, '')
  if (!t) return null
  let normal = t
  if (t.includes(',')) normal = t.replace(/\./g, '').replace(',', '.')
  else if (/\.\d{3}$/.test(t)) normal = t.replace(/\./g, '')
  const n = Number(normal)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

/** 5582998115324 vira "(82) 99811-5324" */
export function telefone(n: string) {
  const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n
}

/** valor para o campo de preço, sem o "R$" (ele fica fixo no campo) */
export const textoDe = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: centavos % 100 ? 2 : 0, maximumFractionDigits: 2 })
