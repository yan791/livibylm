/*
  Roteador mínimo com URLs reais: "/" é a página inicial e
  "/colecao/velvet/vestido-velvet" abre o catálogo por cima dela (lib/catalogo).
  As trocas passam pela View Transitions API quando o navegador suporta,
  para a peça "voar" de um lugar para o outro sem corte seco.
  As rotas são escritas sem a base ("/colecao/velvet"); a base do site
  publicado ("/livibylm/") entra e sai só aqui.
*/
import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { movimentoReduzido } from './midia'
import { comBase, semBase } from './base'

export type Rota =
  | { nome: 'inicio'; ancora?: string }
  | { nome: 'colecao'; colecao: string; peca?: string }

const ouvintes = new Set<() => void>()
const emitir = () => ouvintes.forEach((f) => f())

/** endereço atual, para o "voltar" ignorar passos que só mudam a âncora (#sobre) */
let paginaAtual = typeof location === 'undefined' ? '/' : location.pathname

function assinar(cb: () => void) {
  ouvintes.add(cb)
  return () => ouvintes.delete(cb)
}

export function useCaminho() {
  return useSyncExternalStore(
    assinar,
    () => semBase(location.pathname) + location.hash,
    () => '/',
  )
}

export function interpretar(caminho: string): Rota {
  const [semHash, hash] = caminho.split('#')
  const partes = semHash.split('/').filter(Boolean)
  if (partes[0] === 'colecao' && partes[1]) return { nome: 'colecao', colecao: partes[1], peca: partes[2] }
  return { nome: 'inicio', ancora: hash }
}

export const suportaTransicao = () =>
  typeof document !== 'undefined' &&
  'startViewTransition' in document &&
  !movimentoReduzido()

export function comTransicao(fn: () => void, tipo = 'pagina') {
  if (suportaTransicao()) {
    document.documentElement.dataset.transicao = tipo
    const t = (document as Document & { startViewTransition: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } })
      .startViewTransition(() => flushSync(fn))
    // se o navegador desistir da animação, a troca já aconteceu: não é erro
    t.ready.catch(() => {})
    t.finished.finally(() => {
      delete document.documentElement.dataset.transicao
    })
    return t.finished
  }
  fn()
  return Promise.resolve()
}

export function navegar(
  url: string,
  o: { substituir?: boolean; tipo?: string; semTransicao?: boolean; estado?: unknown } = {},
) {
  const aplicar = () => {
    history[o.substituir ? 'replaceState' : 'pushState'](o.estado ?? null, '', comBase(url))
    paginaAtual = location.pathname
    emitir()
  }
  if (o.semTransicao) {
    aplicar()
    return Promise.resolve()
  }
  return comTransicao(aplicar, o.tipo)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (location.pathname === paginaAtual) return
    paginaAtual = location.pathname
    comTransicao(emitir, 'voltar')
  })
}
