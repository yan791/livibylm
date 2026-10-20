/*
  Fotos enviadas pelo painel. Ficam no R2 com nome aleatório e nunca mudam
  (trocar a foto = enviar outra), então o navegador pode guardar por um ano.
  O painel já comprime a foto antes de enviar (lado maior com 1600 px).
*/

export const LIMITE_FOTO = 8 * 1024 * 1024

const EXTENSAO: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/avif': 'avif' }
const CHAVE_VALIDA = /^p\/[0-9a-f-]{36}\.(webp|jpg|png|avif)$/

export async function servirFoto(bucket: R2Bucket, chave: string, pedido: Request) {
  if (!CHAVE_VALIDA.test(chave)) return new Response('Foto não encontrada.', { status: 404 })
  const foto = await bucket.get(chave, { onlyIf: pedido.headers })
  if (!foto) return new Response('Foto não encontrada.', { status: 404 })
  const headers = new Headers()
  foto.writeHttpMetadata(headers)
  headers.set('ETag', foto.httpEtag)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  // o site do GitHub Pages também mostra essas fotos
  headers.set('Access-Control-Allow-Origin', '*')
  // o navegador já tem essa foto (If-None-Match)
  if (!('body' in foto)) return new Response(null, { status: 304, headers })
  return new Response(foto.body, { headers })
}

/** o tipo pelo começo do arquivo, e não pelo que o navegador diz */
function tipoDaImagem(b: Uint8Array): string | null {
  const ascii = (de: number, ate: number) => String.fromCharCode(...b.subarray(de, ate))
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) return 'image/avif'
  return null
}

/** guarda a foto e devolve o endereço dela no site, ou null se não for uma imagem aceita */
export async function guardarFoto(bucket: R2Bucket, corpo: ArrayBuffer) {
  const tipo = tipoDaImagem(new Uint8Array(corpo.slice(0, 16)))
  if (!tipo) return null
  const chave = `p/${crypto.randomUUID()}.${EXTENSAO[tipo]}`
  await bucket.put(chave, corpo, { httpMetadata: { contentType: tipo } })
  return `/fotos/${chave}`
}

/** apaga do R2 as fotos que nenhuma peça ou coleção usa mais */
export async function apagarFotosSemUso(db: D1Database, bucket: R2Bucket, enderecos: string[]) {
  for (const src of new Set(enderecos)) {
    const chave = src.startsWith('/fotos/') ? src.slice('/fotos/'.length) : ''
    if (!CHAVE_VALIDA.test(chave)) continue
    const emUso = await db
      .prepare('SELECT 1 FROM pecas WHERE instr(fotos, ?1) > 0 UNION ALL SELECT 1 FROM colecoes WHERE capa = ?2 LIMIT 1')
      .bind(`"${src}"`, src)
      .first()
    if (!emUso) await bucket.delete(chave)
  }
}
