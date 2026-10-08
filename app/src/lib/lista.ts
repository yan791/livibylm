/*
  Base das duas listas da cliente: a sacola (o que ela quer comprar) e a
  lista de desejos (o que ela salvou para ver depois). Cada uma fica guardada
  no navegador (localStorage), acompanha mudanças feitas em outra aba e avisa
  o React pelo useSyncExternalStore.
  A gaveta lateral mostra as duas, uma em cada aba.
*/
import { useSyncExternalStore } from 'react'
import { colecoes } from '../dados/colecoes'

export type ItemBase = { colecao: string; peca: string }

export function criarLista<T extends ItemBase>(chave: string) {
  const ouvintes = new Set<() => void>()

  const carregar = (): T[] => {
    try {
      const v = JSON.parse(localStorage.getItem(chave) ?? '[]')
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

  // a mesma lista aberta em outra aba
  if (typeof window !== 'undefined')
    window.addEventListener('storage', (e) => {
      if (e.key !== chave) return
      itens = carregar()
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
  }
}

/** dados completos de cada item (nome, preço, fotos), a partir do arquivo de dados */
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
