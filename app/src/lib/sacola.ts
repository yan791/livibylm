/*
  Sacola: as peças que a cliente quer comprar, com cor e tamanho. Ela envia
  tudo numa mensagem só pelo WhatsApp. (Peças salvas só para ver depois ficam
  na lista de desejos, em lib/desejos.)
*/
import { precoBR } from '../dados/colecoes'
import { linkWhatsApp } from '../dados/site'
import { abrirGaveta, criarLista, detalhar } from './lista'

export type ItemSacola = { colecao: string; peca: string; cor: string; tamanho: string | null }

export const EVENTO_SACOLA_ADICIONOU = 'livi:sacola-adicionou'

const sacola = criarLista<ItemSacola>('livi-sacola')

export const useSacola = sacola.usar
export const naSacola = sacola.tem

/** põe a peça na sacola (ou atualiza cor e tamanho, se ela já estiver lá) */
export function adicionarNaSacola(item: ItemSacola) {
  const itens = sacola.ler()
  if (sacola.tem(item.peca)) sacola.salvar(itens.map((i) => (i.peca === item.peca ? { ...i, ...item } : i)))
  else sacola.salvar([...itens, item])
  window.dispatchEvent(new CustomEvent(EVENTO_SACOLA_ADICIONOU))
}

export const removerDaSacola = (peca: string) => sacola.salvar(sacola.ler().filter((i) => i.peca !== peca))
export const tamanhoNaSacola = (peca: string, tamanho: string) =>
  sacola.salvar(sacola.ler().map((i) => (i.peca === peca ? { ...i, tamanho } : i)))

export const abrirSacola = () => abrirGaveta('sacola')

export { detalhar }

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
