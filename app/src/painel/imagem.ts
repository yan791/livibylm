/*
  Prepara a foto antes de enviar: gira conforme a câmera e gera duas versões
  em WebP (ou JPEG, no navegador que não gera WebP):
    grande   lado maior com 1600 px, para a peça aberta
    pequena  lado maior com 640 px, para a vitrine, a sacola e as miniaturas
  Uma foto de celular de 4 a 8 MB vira algo perto de 200 a 400 KB (a grande)
  e 40 a 80 KB (a pequena).
*/
import { api } from './api'

const GRANDE = 1600
const PEQUENA = 640

export type FotoPronta = { grande: Blob; pequena: Blob; largura: number; altura: number }

function desenhar(bitmap: ImageBitmap, ladoMaior: number) {
  const escala = Math.min(1, ladoMaior / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function comprimir(canvas: HTMLCanvasElement) {
  const gerar = (tipo: string, qualidade: number) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, qualidade))
  let blob = await gerar('image/webp', 0.82)
  if (!blob || blob.type !== 'image/webp') blob = await gerar('image/jpeg', 0.85)
  if (!blob) throw new Error('Não deu para preparar essa foto. Tente outra.')
  return blob
}

export async function prepararFoto(arquivo: File): Promise<FotoPronta> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Não deu para abrir essa foto. Tente uma foto em JPG ou PNG.')
  }
  const canvasGrande = desenhar(bitmap, GRANDE)
  const canvasPequena = desenhar(bitmap, PEQUENA)
  bitmap.close()
  return {
    grande: await comprimir(canvasGrande),
    pequena: await comprimir(canvasPequena),
    largura: canvasGrande.width,
    altura: canvasGrande.height,
  }
}

/** prepara e envia as duas versões; devolve o endereço da grande no site */
export async function enviarFoto(arquivo: File) {
  const foto = await prepararFoto(arquivo)
  const { src } = await api<{ src: string }>('POST', '/fotos', foto.grande)
  // se a pequena falhar, o servidor entrega a grande no lugar: não vale travar o envio por isso
  await api('POST', `/fotos/pequena?de=${encodeURIComponent(src)}`, foto.pequena).catch(() => {})
  return { src, proporcao: foto.largura / foto.altura }
}

/** endereço da versão pequena (só as fotos enviadas pelo painel têm uma) */
export const pequena = (src: string) => (src.startsWith('/fotos/p/') ? src.replace(/\.(\w+)$/, '-p.$1') : src)

export const descartarFotos = (fotos: string[]) => {
  if (fotos.length) api('POST', '/fotos/descartar', { fotos }).catch(() => {})
}
