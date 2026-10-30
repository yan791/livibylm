export type AdminLogado = { id: number; email: string; nome: string }

/** a cliente com a conta aberta no site (worker/contas.ts) */
export type ClienteLogada = { id: number; nome: string; whatsapp: string; email: string }

export type Ambiente = { Bindings: Env; Variables: { admin: AdminLogado; cliente: ClienteLogada } }

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
  /** desconto da peça, em % (0 = sem desconto) */
  desconto: number
  ordem: number
  visivel: number
}

export type LinhaEstoque = { peca_id: number; cor: string; tamanho: string; quantidade: number }

export type Situacao = 'aguardando' | 'expirado' | 'pago' | 'sem_estoque' | 'enviado' | 'entregue' | 'cancelado'

export type LinhaPedido = {
  id: number
  codigo: string
  origem: 'site' | 'fora'
  situacao: Situacao
  reserva_ate: number
  estoque_baixado: number
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
  itens_centavos: number
  frete_centavos: number
  /** itens - desconto do cupom + frete */
  total_centavos: number
  /** o cupom usado (vazio = sem cupom), com a porcentagem da hora da compra */
  cupom: string
  cupom_percentual: number
  desconto_centavos: number
  pagamento: string
  parcelas: number
  pago_centavos: number
  link_pagamento: string
  fatura: string
  transacao: string
  recibo: string
  rastreio: string
  observacao: string
  criado_em: string
  pago_em: string | null
  enviado_em: string | null
  entregue_em: string | null
  cancelado_em: string | null
  /** último aviso (webhook) da InfinitePay para este pedido */
  aviso_em: string | null
  /** conta da cliente no site (null: venda do painel, compra de teste ou pedido de antes das contas) */
  cliente_id: number | null
  /** quando a loja recebeu o e-mail da venda (worker/aviso-de-venda.ts) */
  venda_avisada_em: string | null
}

export type LinhaItemPedido = {
  id: number
  pedido_id: number
  peca_id: number | null
  cor: string
  tamanho: string
  quantidade: number
  preco_centavos: number
  sob_encomenda: number
  nome: string
  cor_nome: string
  colecao_nome: string
  foto: string
  /** endereço da peça no site, quando a consulta junta com pecas (null se a peça foi apagada) */
  peca_slug?: string | null
}

export type LinhaCupom = {
  id: number
  codigo: string
  percentual: number
  ativo: number
  criado_em: string
}
