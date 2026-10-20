/*
  Conversa com a API do painel (/api/painel/...) e os tipos que vêm de lá.
  Se a sessão acabar no meio do uso, avisa o App, que volta para a tela de entrar.
*/

export type Admin = { id: number; email: string; nome: string }

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
  estoque: { cor: string; tamanho: string; quantidade: number }[]
}

export type Pessoa = { id: number; email: string; nome: string; ativo: boolean; ultimoAcesso: string | null; voce: boolean }

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
