/*
  Lista de desejos: as peças que a cliente salvou no coração para ver depois,
  sem compromisso de compra. Nada abre sozinho ao salvar: um aviso discreto
  confirma e oferece "Ver lista". Daqui a peça pode ir para a sacola quando
  ela decidir comprar.
*/
import { abrirGaveta, criarLista, detalhar } from './lista'
import { adicionarNaSacola, naSacola, removerDaSacola } from './sacola'
import { colecoes } from '../dados/colecoes'

export type ItemDesejo = { colecao: string; peca: string }

/** disparado ao salvar uma peça (detail = o item), para o aviso e o contador do topo */
export const EVENTO_DESEJO_SALVO = 'livi:desejo-salvo'

const desejos = criarLista<ItemDesejo>('livi-desejos')

export const useDesejos = desejos.usar
export const nosDesejos = desejos.tem

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

/** leva a peça salva para a sacola (na primeira cor, com o tamanho a escolher); ela continua salva */
export function desejoParaSacola(item: ItemDesejo) {
  if (naSacola(item.peca)) return
  const peca = colecoes.find((c) => c.slug === item.colecao)?.pecas.find((p) => p.slug === item.peca)
  if (!peca) return
  adicionarNaSacola({ colecao: item.colecao, peca: item.peca, cor: peca.cores[0].nome, tamanho: null })
}

/** "Salvar para depois": tira a peça da sacola e guarda na lista de desejos */
export function moverParaDesejos(item: ItemDesejo) {
  removerDaSacola(item.peca)
  if (!desejos.tem(item.peca)) desejos.salvar([{ colecao: item.colecao, peca: item.peca }, ...desejos.ler()])
}

export const abrirDesejos = () => abrirGaveta('desejos')

export { detalhar }
