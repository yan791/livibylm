/*
  Prepara a foto antes de enviar: gira conforme a câmera, reduz o lado maior
  para 1600 px e converte para WebP (ou JPEG, no navegador que não gera WebP).
  Uma foto de celular de 4 a 8 MB vira algo perto de 200 a 400 KB.
*/
import { api } from './api'

const LADO_MAIOR = 1600

export type FotoPronta = { blob: Blob; largura: number; altura: number }

export async function prepararFoto(arquivo: File): Promise<FotoPronta> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Não deu para abrir essa foto. Tente uma foto em JPG ou PNG.')
  }
  const escala = Math.min(1, LADO_MAIOR / Math.max(bitmap.width, bitmap.height))
  const largura = Math.round(bitmap.width * escala)
  const altura = Math.round(bitmap.height * escala)
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close()

  const gerar = (tipo: string, qualidade: number) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, qualidade))
  let blob = await gerar('image/webp', 0.82)
  if (!blob || blob.type !== 'image/webp') blob = await gerar('image/jpeg', 0.85)
  if (!blob) throw new Error('Não deu para preparar essa foto. Tente outra.')
  return { blob, largura, altura }
}

/** prepara e envia; devolve o endereço da foto no site */
export async function enviarFoto(arquivo: File) {
  const foto = await prepararFoto(arquivo)
  const { src } = await api<{ src: string }>('POST', '/fotos', foto.blob)
  return { src, proporcao: foto.largura / foto.altura }
}

export const descartarFotos = (fotos: string[]) => {
  if (fotos.length) api('POST', '/fotos/descartar', { fotos }).catch(() => {})
}
