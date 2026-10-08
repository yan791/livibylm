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
