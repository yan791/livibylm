/*
  Base das duas listas da cliente: a sacola (o que ela quer comprar) e a
  lista de desejos (o que ela salvou para ver depois). Cada uma fica guardada
  no navegador (localStorage), acompanha mudanças feitas em outra aba e avisa
  o React pelo useSyncExternalStore.
  Ao abrir o site, peças que saíram do catálogo são tiradas da lista, e
  saiuDoSite conta quantas foram (a gaveta avisa a cliente). Peça que mudou
  de coleção continua na lista (o endereço da peça é único na loja). Se o
  catálogo não chegou (servidor fora do ar, internet ruim), a lista fica
  como está.
  Uma lista pode mudar de formato: "antiga" é a chave do formato anterior e
  "migrar" converte o que estava salvo lá.
  A gaveta lateral mostra as duas, uma em cada aba.
*/
import { useSyncExternalStore } from 'react'
import { colecoes } from '../dados/colecoes'

export type ItemBase = { colecao: string; peca: string }

/** a peça do item e a coleção onde ela está agora (mesmo se mudou de coleção) */
export function acharItem(i: ItemBase) {
  for (const c of colecoes) {
    const p = c.pecas.find((x) => x.slug === i.peca)
    if (p) return { colecao: c, peca: p }
  }
  return null
}

/** tira as peças que saíram do site e põe cada uma na coleção onde ela está agora */
function arrumar<T extends ItemBase>(lista: T[]): T[] {
  if (!colecoes.length) return lista
  return lista.flatMap((i) => {
    const achado = acharItem(i)
    return achado ? [achado.colecao.slug === i.colecao ? i : { ...i, colecao: achado.colecao.slug }] : []
  })
}

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

  // peças que saíram do site (ou mudaram de coleção) desde a última visita
  const ficam = arrumar(itens)
  const saiuDoSite = itens.length - ficam.length
  if (JSON.stringify(ficam) !== JSON.stringify(itens)) salvar(ficam)

  // a mesma lista aberta em outra aba
  if (typeof window !== 'undefined')
    window.addEventListener('storage', (e) => {
      if (e.key !== chave) return
      itens = arrumar(carregar())
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
    const achado = acharItem(i)
    return achado ? [{ ...i, colecao: achado.colecao.slug, colecaoNome: achado.colecao.nome, fundo: achado.colecao.fundo, peca: achado.peca }] : []
  })
}

/* gaveta: as duas listas e os pedidos do aparelho moram na mesma gaveta, cada um numa aba */
export type Aba = 'sacola' | 'desejos' | 'pedidos'
export const EVENTO_GAVETA = 'livi:gaveta'
export const abrirGaveta = (aba: Aba) => window.dispatchEvent(new CustomEvent<Aba>(EVENTO_GAVETA, { detail: aba }))
