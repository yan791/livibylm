/*
  COLEÇÕES E PEÇAS DA LIVI
  Agora moram no banco da loja e são editadas pelo painel (/painel). O
  servidor já manda tudo dentro da página (<script id="livi-catalogo">), então
  o site abre com as peças prontas, sem esperar outra requisição.
  As peças iniciais (nomes e preços fictícios) estão em migrations/0002_pecas_iniciais.sql.
*/

import { comBase } from '../lib/base'

export type Cor = { nome: string; hex: string }

export type Peca = {
  slug: string
  nome: string
  preco: number
  descricao: string
  tecido: string
  cores: Cor[]
  tamanhos: string[]
  /**
   * fotos da peça vestida (ex.: frente, costas e detalhe). A primeira aparece na
   * vitrine e em destaque; as outras viram miniaturas na peça aberta. Vazio = espaço para foto.
   */
  fotos: string[]
  modelo: { altura: string; veste: string }
  /** combinações sem estoque, no formato "Cor|Tamanho" */
  esgotados: string[]
  /** feita sob encomenda: sem controle de estoque, com prazo de produção */
  sobEncomenda: boolean
  prazo: string
}

export type Colecao = {
  slug: string
  nome: string
  numero: string
  /** cor de fundo da coleção (acompanha o fundo das fotos) */
  fundo: string
  /** 'escuro' = textos claros por cima do fundo */
  tema: 'claro' | 'escuro'
  clima: string
  descricao: string
  capa: string
  /** proporção da foto de capa (largura / altura) */
  proporcao: number
  pecas: Peca[]
}

/** o catálogo que veio dentro da página; [] se não veio (o main.tsx avisa a visitante) */
function lerCatalogo(): Colecao[] {
  try {
    const dados = JSON.parse(document.getElementById('livi-catalogo')?.textContent ?? 'null') as Colecao[] | null
    if (!Array.isArray(dados)) return []
    return dados.map((c) => ({
      ...c,
      capa: comBase(c.capa),
      pecas: c.pecas.map((p) => ({ ...p, fotos: p.fotos.map(comBase) })),
    }))
  } catch {
    return []
  }
}

export const colecoes: Colecao[] = lerCatalogo()

export function acharColecao(slug?: string) {
  return colecoes.find((c) => c.slug === slug)
}

export function acharPeca(colecao: Colecao, slug?: string) {
  return colecao.pecas.find((p) => p.slug === slug) ?? colecao.pecas[0]
}

export const precoBR = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number.isInteger(v) ? 0 : 2 })
