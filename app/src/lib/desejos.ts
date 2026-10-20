/*
  Lista de desejos: as peças que a cliente salvou no coração para ver depois,
  sem compromisso de compra. Nada abre sozinho ao salvar: um aviso discreto
  confirma e oferece "Ver lista". Daqui a peça pode ir para a sacola quando
  ela decidir comprar: se a peça tem um tamanho só, vai direto; se não, a peça
  abre para ela escolher o tamanho.
*/
import { abrirGaveta, acharItem, criarLista, detalhar } from './lista'
import { adicionarNaSacola, idDoItem, removerDaSacola, type ItemSacola } from './sacola'
import { corEsgotada, pecaEsgotada } from '../dados/colecoes'

export type ItemDesejo = { colecao: string; peca: string }

/** disparado ao salvar uma peça (detail = o item), para o aviso e o contador do topo */
export const EVENTO_DESEJO_SALVO = 'livi:desejo-salvo'

const desejos = criarLista<ItemDesejo>('livi-desejos')

export const useDesejos = desejos.usar
export const nosDesejos = desejos.tem
/** peças salvas que saíram do site desde a última visita */
export const sairamDosDesejos = desejos.saiuDoSite

/** salva ou tira a peça da lista; devolve se ela ficou salva */
export function alternarDesejo(item: ItemDesejo) {
  if (desejos.tem(item.peca)) {
    removerDesejo(item.peca)
    return false
  }
  // a mais recente aparece primeiro
  desejos.salvar([{ colecao: item.colecao, peca: item.peca }, ...desejos.ler()])
  window.dispatchEvent(new CustomEvent<ItemDesejo>(EVENTO_DESEJO_SALVO, { detail: item }))
  return true
}

export const removerDesejo = (peca: string) => desejos.salvar(desejos.ler().filter((i) => i.peca !== peca))

/**
  leva a peça salva para a sacola (ela continua salva). Com um tamanho só, vai
  direto, na primeira cor que tiver; com mais de um, devolve 'escolher' para a
  peça abrir e a cliente escolher o tamanho
*/
export function desejoParaSacola(item: ItemDesejo): 'foi' | 'escolher' {
  const achado = acharItem(item)
  const peca = achado?.peca
  if (!achado || !peca || pecaEsgotada(peca) || peca.tamanhos.length !== 1) return 'escolher'
  const cor = peca.cores.find((c) => !corEsgotada(peca, c.nome)) ?? peca.cores[0]
  adicionarNaSacola({ colecao: achado.colecao.slug, peca: item.peca, cor: cor.nome, tamanho: peca.tamanhos[0] })
  return 'foi'
}

/** "Salvar para depois": tira o item da sacola e guarda a peça na lista de desejos */
export function moverParaDesejos(item: Pick<ItemSacola, 'colecao' | 'peca' | 'cor' | 'tamanho'>) {
  removerDaSacola(idDoItem(item))
  if (!desejos.tem(item.peca)) desejos.salvar([{ colecao: item.colecao, peca: item.peca }, ...desejos.ler()])
}

export const abrirDesejos = () => abrirGaveta('desejos')

export { detalhar }
