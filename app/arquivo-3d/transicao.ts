/*
  Ponte da transição de elemento compartilhado: a peça clicada na arara vira
  uma imagem fixa com view-transition-name "peca"; na página da coleção o
  palco 3D tem o mesmo nome, então o navegador "voa" de um para o outro.
*/
export const ponte: { imagem: string | null; colecao: string | null; camada: HTMLImageElement | null } = {
  imagem: null,
  colecao: null,
  camada: null,
}

export function prepararPonte(url: string, rect: { x: number; y: number; w: number; h: number }, colecao: string) {
  limparPonte()
  const img = document.createElement('img')
  img.src = url
  img.alt = ''
  img.className = 'ponte-peca'
  Object.assign(img.style, {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.w}px`,
    height: `${rect.h}px`,
  })
  document.body.appendChild(img)
  ponte.imagem = url
  ponte.colecao = colecao
  ponte.camada = img
  return new Promise<void>((ok) => (img.complete ? ok() : (img.onload = () => ok())))
}

/** chamada pela página nova, dentro da troca, para a imagem antiga sair de cena */
export function limparPonte() {
  ponte.camada?.remove()
  ponte.camada = null
}
