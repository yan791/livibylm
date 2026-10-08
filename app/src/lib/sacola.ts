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
    window.dispatchEvent(new CustomEvent('livi:sacola-adicionou'))
  }
}

export function adicionarNaSacola(item: ItemSacola) {
  if (naSacola(item.peca)) salvar(itens.map((i) => (i.peca === item.peca ? { ...i, ...item } : i)))
  else salvar([...itens, item])
  window.dispatchEvent(new CustomEvent('livi:sacola-adicionou'))
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

/** a sacola inteira numa mensagem: uma peça por bloco, total e uma pergunta que muda conforme o caso */
export function mensagemSacola(lista: ItemSacola[]) {
  const itens = detalhar(lista)
  const varias = itens.length > 1
  const pecas = itens.map((i, n) =>
    [
      `${varias ? `${n + 1}. ` : ''}*${i.peca.nome}*`,
      `Coleção ${i.colecaoNome} · Cor ${i.cor} · ${i.tamanho ? `Tamanho ${i.tamanho}` : 'Tamanho a definir'}`,
      precoBR(i.peca.preco),
    ].join('\n'),
  )
  const total = itens.reduce((s, i) => s + i.peca.preco, 0)
  const faltaTamanho = itens.some((i) => !i.tamanho)
  return [
    `Olá! Vim pelo site da Livi e separei ${varias ? 'estas peças' : 'esta peça'}:`,
    ...pecas,
    varias ? `*Total estimado: ${precoBR(total)}*` : '',
    faltaTamanho
      ? 'Pode me ajudar com os tamanhos e ver a disponibilidade?'
      : 'Podemos conversar sobre a disponibilidade e o envio?',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const linkSacola = (lista: ItemSacola[]) => linkWhatsApp(mensagemSacola(lista))
