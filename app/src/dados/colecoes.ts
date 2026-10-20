/*
  COLEÇÕES E PEÇAS DA LIVI
  Agora moram no banco da loja e são editadas pelo painel (/painel).
  - Publicado pelo Worker: o catálogo já vem dentro da página (<script id="livi-catalogo">).
  - Publicado no GitHub Pages: a página é fixa, então o site busca o catálogo
    no servidor da loja ao abrir (index.html já começa esse download cedo).
  Este módulo espera o catálogo (await no topo) antes de o resto do site rodar.
  As peças iniciais (nomes e preços fictícios) estão em migrations/0002_pecas_iniciais.sql.
*/

import { API, enderecoFoto } from '../lib/base'

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

async function buscar(): Promise<unknown> {
  const embutido = document.getElementById('livi-catalogo')?.textContent
  if (embutido) {
    try {
      return JSON.parse(embutido)
    } catch {
      /* segue para a busca no servidor */
    }
  }
  try {
    const r = await fetch(`${API}/api/catalogo`)
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

/** o catálogo pronto para o site; [] se não chegou (o main.tsx avisa a visitante) */
function preparar(dados: unknown): Colecao[] {
  if (!Array.isArray(dados)) return []
  return (dados as Colecao[]).map((c) => ({
    ...c,
    capa: c.capa ? enderecoFoto(c.capa) : '',
    pecas: c.pecas.map((p) => ({ ...p, fotos: p.fotos.map(enderecoFoto) })),
  }))
}

export const colecoes: Colecao[] = preparar(await buscar())

export function acharColecao(slug?: string) {
  return colecoes.find((c) => c.slug === slug)
}

export function acharPeca(colecao: Colecao, slug?: string) {
  return colecao.pecas.find((p) => p.slug === slug) ?? colecao.pecas[0]
}

export const precoBR = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number.isInteger(v) ? 0 : 2 })
