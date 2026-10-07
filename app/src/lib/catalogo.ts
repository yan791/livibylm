/*
  Catálogo rápido: a vitrine de uma coleção abre por cima da página, sem
  sair dela. Abrir o catálogo e abrir uma peça entram no histórico, então o
  "voltar" do celular volta um passo (peça > vitrine > página) em vez de
  sair do site.
*/
import { useSyncExternalStore } from 'react'
import { pausarRolagem } from './scroll'
import { comTransicao } from './rota'

export type EstadoCatalogo = { colecao: string; peca: string | null }

/** o que fica guardado no histórico: o estado e quantos passos o catálogo empilhou */
type Marca = EstadoCatalogo & { passos: number }

const ouvintes = new Set<() => void>()
const lerMarca = (): Marca | undefined =>
  typeof history === 'undefined' ? undefined : (history.state as { catalogo?: Marca } | null)?.catalogo

let estado: EstadoCatalogo | null = null
let passos = 0

function definir(novo: EstadoCatalogo | null, n: number) {
  estado = novo
  passos = n
  pausarRolagem(Boolean(novo), 'catalogo')
  ouvintes.forEach((f) => f())
}

function marcar(novo: EstadoCatalogo, n: number, substituir = false) {
  const marca: Marca = { ...novo, passos: n }
  history[substituir ? 'replaceState' : 'pushState']({ catalogo: marca }, '', location.href)
  definir(novo, n)
}

export function useCatalogo() {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb)
      return () => ouvintes.delete(cb)
    },
    () => estado,
    () => null,
  )
}

export function abrirCatalogo(colecao: string, peca: string | null = null) {
  if (estado) marcar({ colecao, peca: null }, passos, true)
  else marcar({ colecao, peca: null }, 1)
  if (peca) verPeca(peca)
}

/**
  Abre com passagem suave (View Transitions): a foto tocada, se houver, "voa"
  até a primeira peça da vitrine; sem foto, a página se dissolve no catálogo.
*/
export function mostrarCatalogo(colecao: string, foto?: HTMLImageElement | null) {
  if (foto) foto.style.viewTransitionName = 'peca'
  comTransicao(() => {
    if (foto) foto.style.viewTransitionName = ''
    abrirCatalogo(colecao)
  }, 'catalogo')
}

/** da vitrine para a peça empilha um passo; de uma peça para outra só troca */
export function verPeca(peca: string) {
  if (!estado) return
  if (estado.peca) marcar({ ...estado, peca }, passos, true)
  else marcar({ ...estado, peca }, passos + 1)
}

export function trocarColecao(colecao: string) {
  if (estado) marcar({ colecao, peca: null }, passos, true)
}

export function voltarDaPeca() {
  if (estado?.peca) history.back()
}

export function fecharCatalogo() {
  if (passos > 0) history.go(-passos)
  else definir(null, 0)
}

/** fecha sem mexer no histórico, para seguir para outra página (o "voltar" de lá reabre o catálogo) */
export function sairDoCatalogo() {
  definir(null, 0)
}

if (typeof window !== 'undefined') {
  // recarregou a página com o catálogo aberto: abre de novo onde estava
  const inicial = lerMarca()
  if (inicial) definir({ colecao: inicial.colecao, peca: inicial.peca }, inicial.passos)

  window.addEventListener('popstate', () => {
    const m = lerMarca()
    if (m) definir({ colecao: m.colecao, peca: m.peca }, m.passos)
    else if (estado) definir(null, 0)
  })
}
