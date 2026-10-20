/*
  Endereços do painel:
    /painel                   peças
    /painel/peca/nova         peça nova (?colecao=ID já escolhe a coleção)
    /painel/peca/12           editar a peça 12
    /painel/colecoes          coleções
    /painel/colecao/nova      coleção nova
    /painel/colecao/3         editar a coleção 3
    /painel/pessoas           quem tem acesso
    /painel/ajustes           ajustes da loja
    /painel/entrar            login
    /painel/convite/<token>   criar senha pelo link de acesso
  Uma tela com alterações não salvas pode segurar a saída (segurarSaida).
*/
import { useSyncExternalStore } from 'react'

export type Tela =
  | { nome: 'pecas' }
  | { nome: 'peca'; id: number | 'nova'; colecao?: number }
  | { nome: 'colecoes' }
  | { nome: 'colecao'; id: number | 'nova' }
  | { nome: 'pessoas' }
  | { nome: 'ajustes' }
  | { nome: 'entrar' }
  | { nome: 'convite'; token: string }

export function interpretar(caminho: string, busca = ''): Tela {
  const p = caminho.replace(/^\/painel\/?/, '').split('/').filter(Boolean)
  const id = (v?: string) => (v === 'nova' ? 'nova' : Number(v) > 0 ? Number(v) : null)
  if (p[0] === 'peca' && id(p[1])) {
    const colecao = Number(new URLSearchParams(busca).get('colecao')) || undefined
    return { nome: 'peca', id: id(p[1])!, colecao }
  }
  if (p[0] === 'colecoes') return { nome: 'colecoes' }
  if (p[0] === 'colecao' && id(p[1])) return { nome: 'colecao', id: id(p[1])! }
  if (p[0] === 'pessoas') return { nome: 'pessoas' }
  if (p[0] === 'ajustes') return { nome: 'ajustes' }
  if (p[0] === 'entrar') return { nome: 'entrar' }
  if (p[0] === 'convite' && p[1]) return { nome: 'convite', token: p[1] }
  return { nome: 'pecas' }
}

const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())
const atual = () => location.pathname + location.search

let segurando: (() => boolean) | null = null

/** enquanto houver algo não salvo: a função pergunta se pode sair e devolve true para deixar */
export function segurarSaida(f: (() => boolean) | null) {
  segurando = f
}

export function ir(caminho: string, o: { substituir?: boolean; forcar?: boolean } = {}) {
  if (caminho === atual()) return
  if (!o.forcar && segurando && !segurando()) return
  segurando = null
  history[o.substituir ? 'replaceState' : 'pushState'](null, '', caminho)
  window.scrollTo(0, 0)
  avisar()
}

let ultimo = typeof location === 'undefined' ? '' : atual()
window.addEventListener('popstate', () => {
  // "voltar" com algo não salvo: pergunta, e se a pessoa quiser ficar, desfaz o voltar
  if (segurando && !segurando()) {
    history.pushState(null, '', ultimo)
    return
  }
  segurando = null
  ultimo = atual()
  avisar()
})

export function useTela() {
  const caminho = useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb)
      return () => ouvintes.delete(cb)
    },
    atual,
  )
  ultimo = caminho
  const [p, busca] = caminho.split('?')
  return interpretar(p, busca ? '?' + busca : '')
}

/** link interno: navega sem recarregar a página */
export function aoClicar(caminho: string) {
  return (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    ir(caminho)
  }
}
