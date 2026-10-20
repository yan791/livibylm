/*
  Sacola: as peças que a cliente quer comprar. Cada item é uma peça numa cor
  e num tamanho, com a quantidade: o mesmo vestido em P e em M são dois itens.
  A quantidade nunca passa do que tem em estoque (nem de 10 iguais). Por
  enquanto ela envia tudo numa mensagem só pelo WhatsApp. (Peças salvas só
  para ver depois ficam na lista de desejos, em lib/desejos.)
  Sacolas salvas no formato antigo (uma peça, sem quantidade) são convertidas.
*/
import { disponivel, LIMITE_POR_ITEM, precoBR, rotuloTamanho } from '../dados/colecoes'
import { linkWhatsApp } from '../dados/site'
import { abrirGaveta, acharItem, criarLista, detalhar as detalharBase } from './lista'

/** tamanho null: veio da sacola antiga ou dos desejos sem tamanho escolhido */
export type ItemSacola = { colecao: string; peca: string; cor: string; tamanho: string | null; qtd: number }
type Variante = Pick<ItemSacola, 'colecao' | 'peca' | 'cor' | 'tamanho'>

export const EVENTO_SACOLA_ADICIONOU = 'livi:sacola-adicionou'

export const idDoItem = (i: Pick<ItemSacola, 'peca' | 'cor' | 'tamanho'>) => `${i.peca}|${i.cor}|${i.tamanho ?? ''}`

const sacola = criarLista<ItemSacola>('livi-sacola-v2', {
  antiga: 'livi-sacola',
  migrar: (velhos) =>
    velhos.flatMap((v) => {
      const i = v as Partial<ItemSacola>
      return typeof i?.peca === 'string' && typeof i.colecao === 'string' && typeof i.cor === 'string'
        ? [{ colecao: i.colecao, peca: i.peca, cor: i.cor, tamanho: i.tamanho ?? null, qtd: 1 }]
        : []
    }),
})

const pecaDe = (i: Variante) => acharItem(i)?.peca

/** até quantas unidades desse item a cliente pode levar (0 = esgotou; sem tamanho, ainda não dá para saber) */
export function limiteDe(i: Variante) {
  const p = pecaDe(i)
  if (!p || !p.cores.some((c) => c.nome === i.cor)) return 0
  return i.tamanho ? disponivel(p, i.cor, i.tamanho) : LIMITE_POR_ITEM
}

// ao abrir o site: junta itens repetidos e ajusta quantidades ao estoque de agora
{
  const juntos = new Map<string, ItemSacola>()
  for (const i of sacola.ler()) {
    const qtd = Math.max(1, Math.floor(Number(i.qtd)) || 1)
    const ja = juntos.get(idDoItem(i))
    juntos.set(idDoItem(i), ja ? { ...ja, qtd: ja.qtd + qtd } : { ...i, qtd })
  }
  const arrumados = [...juntos.values()].map((i) => {
    const limite = limiteDe(i)
    return limite > 0 && i.qtd > limite ? { ...i, qtd: limite } : i
  })
  if (JSON.stringify(arrumados) !== JSON.stringify(sacola.ler())) sacola.salvar(arrumados)
}

export const useSacola = sacola.usar
/** a peça está na sacola (em qualquer cor ou tamanho) */
export const naSacola = sacola.tem
export const itemNaSacola = (v: Pick<ItemSacola, 'peca' | 'cor' | 'tamanho'>) => sacola.ler().find((i) => idDoItem(i) === idDoItem(v))
/** peças da sacola que saíram do site desde a última visita */
export const sairamDaSacola = sacola.saiuDoSite
/** total de unidades (o número do botão da sacola) */
export const unidades = (lista: ItemSacola[]) => lista.reduce((s, i) => s + i.qtd, 0)

/** põe a peça na sacola; se a mesma cor e tamanho já estiverem lá, soma a quantidade */
export function adicionarNaSacola(v: Variante, qtd = 1) {
  const limite = limiteDe(v)
  if (limite <= 0) return
  const itens = sacola.ler()
  const ja = itens.find((i) => idDoItem(i) === idDoItem(v))
  if (ja) sacola.salvar(itens.map((i) => (i === ja ? { ...i, qtd: Math.min(limite, i.qtd + qtd) } : i)))
  else sacola.salvar([...itens, { ...v, qtd: Math.min(limite, qtd) }])
  window.dispatchEvent(new CustomEvent(EVENTO_SACOLA_ADICIONOU))
}

export function quantidadeNaSacola(id: string, qtd: number) {
  sacola.salvar(sacola.ler().map((i) => (idDoItem(i) === id ? { ...i, qtd: Math.max(1, Math.min(limiteDe(i) || 1, qtd)) } : i)))
}

/** troca o tamanho de um item; se a peça já estiver na sacola nesse tamanho, os dois viram um */
export function tamanhoNaSacola(id: string, tamanho: string) {
  const itens = sacola.ler()
  const item = itens.find((i) => idDoItem(i) === id)
  if (!item) return
  const novo = { ...item, tamanho }
  const igual = itens.find((i) => i !== item && idDoItem(i) === idDoItem(novo))
  const limite = limiteDe(novo)
  if (igual)
    sacola.salvar(
      itens.filter((i) => i !== item).map((i) => (i === igual ? { ...i, qtd: Math.max(1, Math.min(limite || 1, i.qtd + item.qtd)) } : i)),
    )
  else sacola.salvar(itens.map((i) => (i === item ? { ...novo, qtd: Math.max(1, Math.min(limite || 1, item.qtd)) } : i)))
}

export const removerDaSacola = (id: string) => sacola.salvar(sacola.ler().filter((i) => idDoItem(i) !== id))

export const abrirSacola = () => abrirGaveta('sacola')

/** dados completos de cada item, com o limite de agora e se esgotou (id e limite saem antes de "peca" virar a peça inteira) */
export function detalhar(lista: ItemSacola[]) {
  return detalharBase(lista.map((i) => ({ ...i, id: idDoItem(i), limite: limiteDe(i) }))).map((i) => ({
    ...i,
    esgotado: Boolean(i.tamanho) && i.limite <= 0,
  }))
}

/** a sacola inteira numa mensagem: uma peça por bloco, total e uma pergunta que muda conforme o caso */
export function mensagemSacola(lista: ItemSacola[]) {
  const itens = detalhar(lista).filter((i) => i.tamanho && !i.esgotado)
  const varias = unidades(itens) > 1
  const pecas = itens.map((i, n) =>
    [
      `${itens.length > 1 ? `${n + 1}. ` : ''}${i.qtd > 1 ? `${i.qtd}x ` : ''}*${i.peca.nome}*`,
      `Coleção ${i.colecaoNome} · Cor ${i.cor} · ${rotuloTamanho(i.tamanho!)}`,
      i.qtd > 1 ? `${precoBR(i.peca.preco)} cada` : precoBR(i.peca.preco),
    ].join('\n'),
  )
  const total = itens.reduce((s, i) => s + i.peca.preco * i.qtd, 0)
  return [
    `Olá! Vim pelo site da Livi e separei ${varias ? 'estas peças' : 'esta peça'}:`,
    ...pecas,
    varias ? `*Total: ${precoBR(total)}*` : '',
    'Podemos combinar o pagamento e a entrega?',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const linkSacola = (lista: ItemSacola[]) => linkWhatsApp(mensagemSacola(lista))
