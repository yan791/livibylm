/*
  Roteador mínimo com URLs reais (/colecao/velvet/vestido-velvet).
  Toda troca de página passa pela View Transitions API quando o navegador
  suporta, para a peça "voar" de uma página para a outra sem corte seco.
*/
import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { movimentoReduzido } from './midia'

export type Rota =
  | { nome: 'inicio'; ancora?: string }
  | { nome: 'colecao'; colecao: string; peca?: string }

const ouvintes = new Set<() => void>()
const emitir = () => ouvintes.forEach((f) => f())

/** página atual, para o "voltar" ignorar passos que não trocam de página (ex.: o catálogo) */
let paginaAtual = typeof location === 'undefined' ? '/' : location.pathname

let antesDeTrocar: (() => void) | null = null
/** chamado logo antes de uma troca de página (ex.: guardar a rolagem da home) */
export function aoSairDaPagina(fn: (() => void) | null) {
  antesDeTrocar = fn
}

function assinar(cb: () => void) {
  ouvintes.add(cb)
  return () => ouvintes.delete(cb)
}

export function useCaminho() {
  return useSyncExternalStore(
    assinar,
    () => location.pathname + location.hash,
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
    const t = (document as Document & { startViewTransition: (cb: () => void) => { finished: Promise<void> } })
      .startViewTransition(() => flushSync(fn))
    t.finished.finally(() => {
      delete document.documentElement.dataset.transicao
    })
    return t.finished
  }
  fn()
  return Promise.resolve()
}

export function navegar(url: string, o: { substituir?: boolean; tipo?: string; semTransicao?: boolean } = {}) {
  const mesmaPagina = interpretar(url).nome === interpretar(location.pathname).nome
  if (!mesmaPagina) antesDeTrocar?.()
  const aplicar = () => {
    history[o.substituir ? 'replaceState' : 'pushState'](null, '', url)
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
    antesDeTrocar?.()
    comTransicao(emitir, 'voltar')
  })
}
