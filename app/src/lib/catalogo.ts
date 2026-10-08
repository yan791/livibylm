/*
  Catálogo rápido: a vitrine de uma coleção abre por cima da página inicial e
  tem endereço próprio, que pode ser compartilhado e abre direto no catálogo:
    /colecao/velvet                       vitrine da Velvet
    /colecao/velvet/vestido-velvet-longo  peça aberta
  O endereço manda: abrir, trocar de peça e voltar mexem só no endereço, e o
  catálogo mostra o que ele diz. Abrir o catálogo e abrir uma peça entram no
  histórico, então o "voltar" do celular volta um passo (peça > vitrine >
  página) em vez de sair do site.
*/
import { comTransicao, interpretar, navegar, useCaminho } from './rota'
import { semBase } from './base'

export type EstadoCatalogo = { colecao: string; peca: string | null }

/**
  Guardado em cada passo do histórico: quantos passos o catálogo empilhou e se
  ele foi aberto de dentro do site (quem chega por um link direto não tem uma
  página do site "atrás" para onde voltar).
*/
type Marca = { passos: number; deDentro: boolean }

const marcaAtual = (): Marca =>
  (history.state as { catalogo?: Marca } | null)?.catalogo ?? { passos: 0, deDentro: false }

const endereco = (colecao: string, peca?: string | null) => `/colecao/${colecao}${peca ? '/' + peca : ''}`

function lerEndereco(caminho: string): EstadoCatalogo | null {
  const rota = interpretar(caminho)
  return rota.nome === 'colecao' ? { colecao: rota.colecao, peca: rota.peca ?? null } : null
}

const aberto = () => lerEndereco(semBase(location.pathname))

function ir(estado: EstadoCatalogo, marca: Marca, substituir: boolean) {
  navegar(endereco(estado.colecao, estado.peca), { substituir, semTransicao: true, estado: { catalogo: marca } })
}

/** o catálogo aberto agora (ou null), lido do endereço */
export function useCatalogo() {
  return lerEndereco(useCaminho())
}

export function abrirCatalogo(colecao: string, peca: string | null = null) {
  const agora = aberto()
  if (!agora) {
    ir({ colecao, peca: null }, { passos: 1, deDentro: true }, false)
    if (peca) verPeca(peca)
    return
  }
  // já aberto (ex.: tocou numa peça da sacola): troca no lugar, sem empilhar passos repetidos
  if (agora.peca && peca) return ir({ colecao, peca }, marcaAtual(), true)
  ir({ colecao, peca: null }, marcaAtual(), true)
  if (peca) verPeca(peca)
}

/**
  Abre com passagem suave (View Transitions): a foto tocada, se houver, "voa"
  até a primeira peça da vitrine; sem foto, a página se dissolve no catálogo.
*/
export function mostrarCatalogo(colecao: string, foto?: HTMLImageElement | null) {
  if (foto) foto.style.viewTransitionName = 'peca'
  comTransicao(() => {
    if (foto) foto.style.viewTransitionName = ''
    abrirCatalogo(colecao)
  }, 'catalogo')
}

/** da vitrine para a peça empilha um passo; de uma peça para outra só troca */
export function verPeca(peca: string) {
  const agora = aberto()
  if (!agora) return
  const marca = marcaAtual()
  if (agora.peca) ir({ ...agora, peca }, marca, true)
  else ir({ ...agora, peca }, { ...marca, passos: marca.passos + 1 }, false)
}

export function trocarColecao(colecao: string) {
  if (aberto()) ir({ colecao, peca: null }, marcaAtual(), true)
}

export function voltarDaPeca() {
  const agora = aberto()
  if (!agora?.peca) return
  const marca = marcaAtual()
  // a vitrine está logo atrás no histórico? então é só voltar; se a peça veio de um link direto, troca pela vitrine
  const vitrineAtras = marca.passos > (marca.deDentro ? 1 : 0)
  if (vitrineAtras) history.back()
  else ir({ ...agora, peca: null }, marca, true)
}

export function fecharCatalogo() {
  const marca = marcaAtual()
  if (marca.deDentro) history.go(-marca.passos)
  else navegar('/', { substituir: true, semTransicao: true })
}
