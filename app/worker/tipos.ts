export type AdminLogado = { id: number; email: string; nome: string }

export type Ambiente = { Bindings: Env; Variables: { admin: AdminLogado } }

export type CorPeca = { id: string; nome: string; hex: string }

export type LinhaColecao = {
  id: number
  slug: string
  nome: string
  numero: string
  fundo: string
  tema: 'claro' | 'escuro'
  clima: string
  descricao: string
  capa: string | null
  capa_proporcao: number
  ordem: number
  visivel: number
}

export type LinhaPeca = {
  id: number
  colecao_id: number
  slug: string
  nome: string
  preco_centavos: number
  descricao: string
  tecido: string
  cores: string
  tamanhos: string
  fotos: string
  modelo_altura: string
  modelo_veste: string
  sob_encomenda: number
  prazo_encomenda: string
  ordem: number
  visivel: number
}

export type LinhaEstoque = { peca_id: number; cor: string; tamanho: string; quantidade: number }
