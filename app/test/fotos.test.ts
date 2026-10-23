import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { LIMITE_FOTO, servirFoto } from '../worker/fotos'
import { chamar, criarPeca, doPainel, entrar, painel } from './ajuda'

/** o começo de cada tipo de imagem (é por ele que o servidor reconhece, e não pelo nome do arquivo) */
const CABECALHOS = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpg: [0xff, 0xd8, 0xff, 0xe0],
  webp: [...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))),
  avif: [0, 0, 0, 0x20, ...[...'ftypavif'].map((c) => c.charCodeAt(0))],
}
const imagem = (tipo: keyof typeof CABECALHOS, tamanho = 64) => {
  const b = new Uint8Array(tamanho)
  b.set(CABECALHOS[tipo])
  return b
}

const enviar = (token: string, caminho: string, corpo: Uint8Array) =>
  chamar(`https://livi.test/api/painel${caminho}`, { method: 'POST', headers: doPainel(token, { 'Content-Type': 'application/octet-stream' }), body: corpo })

const verFoto = (src: string, cabecalhos: Record<string, string> = {}) => chamar(`http://localhost${src}`, { headers: cabecalhos })

async function enviarFoto(token: string, tipo: keyof typeof CABECALHOS = 'webp') {
  const r = await enviar(token, '/fotos', imagem(tipo))
  expect(r.status).toBe(201)
  return ((await r.json()) as { src: string }).src
}

describe('fotos do painel', () => {
  it('aceita JPG, PNG, WebP e AVIF pelo conteúdo do arquivo, e o site mostra com cache longo', async () => {
    const token = await entrar()
    for (const [tipo, extensao, mime] of [
      ['png', 'png', 'image/png'],
      ['jpg', 'jpg', 'image/jpeg'],
      ['webp', 'webp', 'image/webp'],
      ['avif', 'avif', 'image/avif'],
    ] as const) {
      const src = await enviarFoto(token, tipo)
      expect(src).toMatch(new RegExp(`^/fotos/p/[0-9a-f-]{36}\\.${extensao}$`))
      const r = await verFoto(src)
      expect(r.status, tipo).toBe(200)
      expect(r.headers.get('Content-Type')).toBe(mime)
      expect(r.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
      expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(new Uint8Array(await r.arrayBuffer()).slice(0, 4)).toEqual(imagem(tipo).slice(0, 4))
    }
  })

  it('recusa o que não é foto (inclusive SVG, que pode levar script) e o arquivo vazio', async () => {
    const token = await entrar()
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    expect((await enviar(token, '/fotos', svg)).status).toBe(415)
    expect((await enviar(token, '/fotos', new TextEncoder().encode('isto é um texto qualquer'))).status).toBe(415)
    expect((await enviar(token, '/fotos', new Uint8Array(0))).status).toBe(400)
  })

  it(`recusa foto acima de ${LIMITE_FOTO / 1024 / 1024} MB`, async () => {
    const token = await entrar()
    expect((await enviar(token, '/fotos', imagem('webp', LIMITE_FOTO + 1))).status).toBe(413)
  })

  it('o navegador que já tem a foto recebe 304, sem baixar de novo', async () => {
    const src = await enviarFoto(await entrar())
    const etag = (await verFoto(src)).headers.get('ETag')!
    expect(etag).toBeTruthy()
    expect((await verFoto(src, { 'If-None-Match': etag })).status).toBe(304)
  })

  it('a versão pequena só entra para uma foto grande que existe; sem ela, o site recebe a grande', async () => {
    const token = await entrar()
    const src = await enviarFoto(token)
    const pequena = src.replace(/\.webp$/, '-p.webp')
    expect((await verFoto(pequena)).status).toBe(200)

    expect((await enviar(token, `/fotos/pequena?de=${encodeURIComponent(src)}`, imagem('webp', 32))).status).toBe(201)
    expect((await (await verFoto(pequena)).arrayBuffer()).byteLength).toBe(32)

    const inventada = '/fotos/p/00000000-0000-0000-0000-000000000000.webp'
    expect((await enviar(token, `/fotos/pequena?de=${encodeURIComponent(inventada)}`, imagem('webp'))).status).toBe(400)
    expect((await enviar(token, `/fotos/pequena?de=${encodeURIComponent('/etc/passwd')}`, imagem('webp'))).status).toBe(400)
  })

  it('endereço fora do padrão não acha nada, nem sai da pasta das fotos', async () => {
    for (const chave of ['../../wrangler.jsonc', 'p/../segredo.webp', 'p/abc.webp', 'x.svg', 'p/00000000-0000-0000-0000-000000000000.svg', ''])
      expect((await servirFoto(env.FOTOS, chave, new Request('http://localhost/'))).status, chave).toBe(404)
    expect((await verFoto('/fotos/p/00000000-0000-0000-0000-000000000000.webp')).status).toBe(404)
  })

  it('descartar apaga só as fotos que nenhuma peça usa', async () => {
    const token = await entrar()
    const usada = await enviarFoto(token)
    const solta = await enviarFoto(token)
    const peca = await criarPeca({ M: 1 })
    await env.DB.prepare('UPDATE pecas SET fotos = ?1 WHERE id = ?2').bind(JSON.stringify([usada]), peca).run()

    expect((await painel(token, 'POST', '/fotos/descartar', { fotos: [usada, solta] })).status).toBe(200)
    expect((await verFoto(usada)).status).toBe(200)
    expect((await verFoto(solta)).status).toBe(404)
    expect((await painel(token, 'POST', '/fotos/descartar', { fotos: 'tudo' })).status).toBe(400)
  })

  it('apagar a peça vendida não apaga a foto que o pedido antigo mostra', async () => {
    const token = await entrar()
    const src = await enviarFoto(token)
    const peca = await criarPeca({ M: 2 })
    await env.DB.prepare('UPDATE pecas SET fotos = ?1 WHERE id = ?2').bind(JSON.stringify([src]), peca).run()
    const venda = await painel(token, 'POST', '/pedidos', { itens: [{ pecaId: peca, cor: 'c1', tamanho: 'M', quantidade: 1, precoCentavos: 10_000 }] })
    expect(venda.status).toBe(201)

    expect((await painel(token, 'DELETE', `/pecas/${peca}`)).status).toBe(200)
    expect((await verFoto(src)).status).toBe(200)
    const { id } = (await venda.json()) as { id: number }
    const pedido = (await (await painel(token, 'GET', `/pedidos/${id}`)).json()) as { itens: { nome: string; foto: string }[] }
    expect(pedido.itens[0]).toMatchObject({ nome: 'Vestido Teste', foto: src })
  })
})
