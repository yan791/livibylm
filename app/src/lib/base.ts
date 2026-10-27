/*
  Endereço base do site. No computador é "/"; publicado no GitHub Pages o site
  fica numa subpasta ("/livibylm/"). Todo caminho interno ("/img/...",
  "/colecao/...", "/#colecoes") passa por aqui para funcionar nos dois casos.
  A base vem do Vite (opção --base na hora de gerar a versão publicada).
*/
export const BASE = import.meta.env.BASE_URL

/** "/img/x.webp" -> "/livibylm/img/x.webp" */
export const comBase = (caminho: string) => (caminho.startsWith('/') ? BASE + caminho.slice(1) : caminho)

/** "/livibylm/colecao/velvet" -> "/colecao/velvet" */
export const semBase = (caminho: string) => (caminho.startsWith(BASE) ? '/' + caminho.slice(BASE.length) : caminho)

/*
  Servidor da loja (Worker na Cloudflare). Vazio quando o site é publicado
  pelo próprio Worker; no GitHub Pages vem de VITE_API (o endereço do Worker),
  e o site busca lá as peças e as fotos enviadas pelo painel.
*/
export const API = (import.meta.env.VITE_API ?? '').replace(/\/$/, '')

/** endereço de uma foto do catálogo: as do painel (/fotos/...) moram no servidor da loja */
export const enderecoFoto = (caminho: string) => (caminho.startsWith('/fotos/') ? API + caminho : comBase(caminho))

/**
  versão pequena (vitrine, sacola, miniaturas) de uma foto enviada pelo painel
  ou das que vieram no projeto (/img/pecas/<coleção>/<peça>/1.webp); as outras ficam como estão
*/
export const fotoPequena = (src: string) =>
  src.replace(/(\/fotos\/p\/[0-9a-f-]{36})\.(\w+)$/, '$1-p.$2').replace(/(\/img\/pecas\/[a-z0-9-]+\/[a-z0-9-]+\/\d+)\.webp$/, '$1-p.webp')
