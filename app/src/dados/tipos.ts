/*
  PEÇAS POR TIPO (vestidos, blusas, saias...), de todas as coleções
  O tipo sai da primeira palavra do nome da peça ("Saia Muse marrom" -> Saias),
  então no painel não há nada para marcar: é só o nome começar pelo tipo.
  Um tipo novo ("Top Aurora") vira um filtro novo sozinho, na ordem em que
  aparece no catálogo. A página é /pecas/<tipo>, com ?tamanho=M opcional.
*/
import { colecoes, disponivel, pecaEsgotada, type Colecao, type Peca } from './colecoes'

export type ItemPeca = { colecao: Colecao; peca: Peca }
export type Tipo = { slug: string; nome: string; itens: ItemPeca[] }
export type Filtro = { tipo?: string; tamanho?: string }

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** plurais que não são só "+s"; a chave é a palavra sem acento */
const PLURAIS: Record<string, string> = {
  calca: 'Calças',
  macacao: 'Macacões',
  body: 'Bodies',
  biquini: 'Biquínis',
  maio: 'Maiôs',
  saida: 'Saídas',
  colar: 'Colares',
}

function plural(palavra: string) {
  const conhecido = PLURAIS[semAcento(palavra)]
  if (conhecido) return conhecido
  const nome = palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase()
  return /s$/i.test(nome) ? nome : nome + 's'
}

/** esgotadas vão para o fim da lista, sem mudar a ordem das outras */
const emOrdem = (itens: ItemPeca[]) => [...itens.filter((i) => !pecaEsgotada(i.peca)), ...itens.filter((i) => pecaEsgotada(i.peca))]

const catalogo: ItemPeca[] = colecoes.flatMap((colecao) => colecao.pecas.map((peca) => ({ colecao, peca })))

/** todas as peças do site, na ordem do catálogo */
export const todas = emOrdem(catalogo)

export const tipos: Tipo[] = (() => {
  const porTipo = new Map<string, Tipo>()
  for (const item of catalogo) {
    const palavra = item.peca.nome.trim().split(/\s+/)[0] ?? ''
    if (!palavra) continue
    const nome = plural(palavra)
    const slug = semAcento(nome)
    if (!porTipo.has(slug)) porTipo.set(slug, { slug, nome, itens: [] })
    porTipo.get(slug)!.itens.push(item)
  }
  return [...porTipo.values()].map((t) => ({ ...t, itens: emOrdem(t.itens) }))
})()

export const acharTipo = (slug?: string) => tipos.find((t) => t.slug === slug)

const ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EGG']
const unico = (t: string) => /^[uú]nico$/i.test(t.trim())
const posicaoTamanho = (t: string) => (unico(t) ? 999 : ORDEM_TAMANHOS.indexOf(t.toUpperCase()) + 1 || 500)

/** os tamanhos que essas peças têm, do menor ao maior ("Único" por último) */
export function tamanhosDe(itens: ItemPeca[]) {
  const todos = new Set(itens.flatMap((i) => i.peca.tamanhos))
  return [...todos].sort((a, b) => posicaoTamanho(a) - posicaoTamanho(b) || a.localeCompare(b))
}

/** "Único" fica curto no botão do filtro */
export const rotuloCurto = (t: string) => (unico(t) ? 'Único' : t)

/** a peça tem esse tamanho e ainda há alguma cor nele (sob encomenda, sempre há) */
export const temNoTamanho = (peca: Peca, tamanho: string) =>
  peca.tamanhos.includes(tamanho) && (peca.sobEncomenda || peca.cores.some((c) => disponivel(peca, c.nome, tamanho) > 0))

export function pecasDoFiltro(f: Filtro) {
  const itens = acharTipo(f.tipo)?.itens ?? todas
  return f.tamanho ? itens.filter((i) => temNoTamanho(i.peca, f.tamanho!)) : itens
}

export const nomeDoFiltro = (f: Filtro) => acharTipo(f.tipo)?.nome ?? 'Todas as peças'

export const enderecoPecas = (f: Filtro) =>
  `/pecas${f.tipo ? '/' + f.tipo : ''}${f.tamanho ? '?tamanho=' + encodeURIComponent(f.tamanho) : ''}`
