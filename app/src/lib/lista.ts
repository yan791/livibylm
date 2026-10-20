/*
  Base das duas listas da cliente: a sacola (o que ela quer comprar) e a
  lista de desejos (o que ela salvou para ver depois). Cada uma fica guardada
  no navegador (localStorage), acompanha mudanças feitas em outra aba e avisa
  o React pelo useSyncExternalStore.
  Ao abrir o site, peças que saíram do catálogo são tiradas da lista, e
  saiuDoSite conta quantas foram (a gaveta avisa a cliente).
  Uma lista pode mudar de formato: "antiga" é a chave do formato anterior e
  "migrar" converte o que estava salvo lá.
  A gaveta lateral mostra as duas, uma em cada aba.
*/
import { useSyncExternalStore } from 'react'
import { colecoes } from '../dados/colecoes'

export type ItemBase = { colecao: string; peca: string }

const existe = (i: ItemBase) => colecoes.some((c) => c.slug === i.colecao && c.pecas.some((p) => p.slug === i.peca))

export function criarLista<T extends ItemBase>(chave: string, o: { antiga?: string; migrar?: (velhos: unknown[]) => T[] } = {}) {
  const ouvintes = new Set<() => void>()

  const carregar = (): T[] => {
    try {
      const bruto = localStorage.getItem(chave)
      if (bruto === null && o.antiga && o.migrar) {
        const velhos = JSON.parse(localStorage.getItem(o.antiga) ?? '[]')
        const migrados = Array.isArray(velhos) ? o.migrar(velhos) : []
        localStorage.setItem(chave, JSON.stringify(migrados))
        localStorage.removeItem(o.antiga)
        return migrados
      }
      const v = JSON.parse(bruto ?? '[]')
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  }

  let itens: T[] = typeof window === 'undefined' ? [] : carregar()
  const avisar = () => ouvintes.forEach((f) => f())

  const salvar = (novos: T[]) => {
    itens = novos
    try {
      localStorage.setItem(chave, JSON.stringify(itens))
    } catch {
      /* sem armazenamento: a lista vive só nesta visita */
    }
    avisar()
  }

  // peças que saíram do site desde a última visita
  const ficam = itens.filter(existe)
  const saiuDoSite = itens.length - ficam.length
  if (saiuDoSite) salvar(ficam)

  // a mesma lista aberta em outra aba
  if (typeof window !== 'undefined')
    window.addEventListener('storage', (e) => {
      if (e.key !== chave) return
      itens = carregar().filter(existe)
      avisar()
    })

  const assinar = (cb: () => void) => {
    ouvintes.add(cb)
    return () => {
      ouvintes.delete(cb)
    }
  }

  return {
    ler: () => itens,
    salvar,
    tem: (peca: string) => itens.some((i) => i.peca === peca),
    usar: () => useSyncExternalStore(assinar, () => itens, () => itens),
    saiuDoSite,
  }
}

/** dados completos de cada item (nome, preço, fotos), a partir do catálogo */
export function detalhar<T extends ItemBase>(lista: T[]) {
  return lista.flatMap((i) => {
    const c = colecoes.find((x) => x.slug === i.colecao)
    const p = c?.pecas.find((x) => x.slug === i.peca)
    return c && p ? [{ ...i, colecaoNome: c.nome, fundo: c.fundo, peca: p }] : []
  })
}

/* gaveta: as duas listas moram na mesma gaveta, cada uma numa aba */
export type Aba = 'sacola' | 'desejos'
export const EVENTO_GAVETA = 'livi:gaveta'
export const abrirGaveta = (aba: Aba) => window.dispatchEvent(new CustomEvent<Aba>(EVENTO_GAVETA, { detail: aba }))
