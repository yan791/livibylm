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
  /** "Cor|Tamanho" -> quantas unidades a cliente pode levar (0 = esgotado; o servidor limita a 10) */
  disponivel: Record<string, number>
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
  return doServidor()
}

/** busca no servidor da loja; desiste em 8 s (a página avisa a visitante e oferece o WhatsApp) */
async function doServidor(tentativa = 1): Promise<unknown> {
  const parar = new AbortController()
  const tempo = setTimeout(() => parar.abort(), 8000)
  try {
    const r = await fetch(`${API}/api/catalogo`, { signal: parar.signal })
    return r.ok ? await r.json() : null
  } catch {
    // uma falha rápida de rede ganha mais uma chance; um tempo esgotado, não
    return tentativa < 2 && !parar.signal.aborted ? doServidor(tentativa + 1) : null
  } finally {
    clearTimeout(tempo)
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

/* ---------- estoque ---------- */

/** o máximo de unidades iguais (mesma peça, cor e tamanho) num pedido */
export const LIMITE_POR_ITEM = 10

/** quantas unidades dessa cor e tamanho a cliente pode levar (0 = esgotado) */
export function disponivel(peca: Peca, cor: string, tamanho: string) {
  const n = peca.disponivel?.[`${cor}|${tamanho}`]
  if (typeof n === 'number') return Math.min(LIMITE_POR_ITEM, n)
  return peca.esgotados?.includes(`${cor}|${tamanho}`) ? 0 : LIMITE_POR_ITEM
}

export const corEsgotada = (peca: Peca, cor: string) => !peca.sobEncomenda && peca.tamanhos.every((t) => disponivel(peca, cor, t) <= 0)

/** nenhuma cor em nenhum tamanho: a peça continua no site, com o selo "Esgotado" */
export const pecaEsgotada = (peca: Peca) => !peca.sobEncomenda && peca.cores.every((c) => corEsgotada(peca, c.nome))

/** "Único" aparece como "Tamanho único" */
export const rotuloTamanho = (t: string) => (/^[uú]nico$/i.test(t.trim()) ? 'Tamanho único' : t)

/** prazo da peça sob encomenda, como aparece no site */
export const textoEncomenda = (peca: Peca) =>
  peca.prazo ? `Sob encomenda: pronta em até ${peca.prazo.replace(/^até\s+/i, '')}` : 'Feita sob encomenda'
