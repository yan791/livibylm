/*
  Sacola de desejos: a cliente junta várias peças e envia tudo numa
  mensagem só pelo WhatsApp. Fica salva no navegador dela.
*/
import { useSyncExternalStore } from 'react'
import { colecoes, precoBR } from '../dados/colecoes'
import { linkWhatsApp } from '../dados/site'

export type ItemSacola = { colecao: string; peca: string; cor: string; tamanho: string | null }

const CHAVE = 'livi-sacola'
const ouvintes = new Set<() => void>()

function carregar(): ItemSacola[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

let itens: ItemSacola[] = typeof window === 'undefined' ? [] : carregar()

function salvar(novos: ItemSacola[]) {
  itens = novos
  try {
    localStorage.setItem(CHAVE, JSON.stringify(itens))
  } catch {
    /* sem armazenamento: a sacola vive só nesta visita */
  }
  ouvintes.forEach((f) => f())
}

export function useSacola() {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb)
      return () => ouvintes.delete(cb)
    },
    () => itens,
    () => itens,
  )
}

export const naSacola = (peca: string) => itens.some((i) => i.peca === peca)

export function alternarNaSacola(item: ItemSacola) {
  if (naSacola(item.peca)) salvar(itens.filter((i) => i.peca !== item.peca))
  else {
    salvar([...itens, item])
    window.dispatchEvent(new CustomEvent('livi:sacola-adicionou', { detail: item }))
  }
}

export function adicionarNaSacola(item: ItemSacola) {
  if (naSacola(item.peca)) salvar(itens.map((i) => (i.peca === item.peca ? { ...i, ...item } : i)))
  else salvar([...itens, item])
  window.dispatchEvent(new CustomEvent('livi:sacola-adicionou', { detail: item }))
}

export const removerDaSacola = (peca: string) => salvar(itens.filter((i) => i.peca !== peca))
export const tamanhoNaSacola = (peca: string, tamanho: string) =>
  salvar(itens.map((i) => (i.peca === peca ? { ...i, tamanho } : i)))

export const abrirSacola = () => window.dispatchEvent(new CustomEvent('livi:sacola'))

/** dados completos de cada item (nome, preço, foto), a partir do arquivo de dados */
export function detalhar(lista: ItemSacola[]) {
  return lista.flatMap((i) => {
    const c = colecoes.find((x) => x.slug === i.colecao)
    const p = c?.pecas.find((x) => x.slug === i.peca)
    return c && p ? [{ ...i, colecaoNome: c.nome, fundo: c.fundo, peca: p }] : []
  })
}

export function mensagemSacola(lista: ItemSacola[]) {
  const linhas = detalhar(lista).map(
    (i) => `• ${i.peca.nome}, cor ${i.cor}, tamanho ${i.tamanho ?? 'a definir'} (${precoBR(i.peca.preco)})`,
  )
  return `Olá! Vim pelo site da Livi e separei estas peças:\n\n${linhas.join('\n')}\n\nPodemos conversar?`
}

export const linkSacola = (lista: ItemSacola[]) => linkWhatsApp(mensagemSacola(lista))
