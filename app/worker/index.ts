/*
  Worker da Livi: publica o site, a API do painel e as fotos.
    /api/catalogo     coleções e peças visíveis (o site usa, inclusive o do GitHub Pages)
    /api/painel/...   painel da loja (login obrigatório, menos entrar e convite)
    /fotos/...        fotos enviadas pelo painel (R2)
    /painel/...       o painel em si
    o resto           o site, já com o catálogo dentro do HTML; ou, se
                      SITE_PUBLICO estiver definido, um redirecionamento para lá
*/
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { lerCatalogo } from './catalogo'
import { painel } from './painel'
import { servirFoto } from './fotos'
import type { Ambiente } from './tipos'

const app = new Hono<Ambiente>()

app.onError((e, c) => {
  if (e instanceof HTTPException) return c.json({ erro: e.message }, e.status)
  console.error(e)
  return c.json({ erro: 'Algo deu errado do nosso lado. Tente de novo em instantes.' }, 500)
})

app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

// dados públicos: qualquer site pode ler (o do GitHub Pages lê daqui)
app.get('/api/catalogo', async (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  return c.json(await lerCatalogo(c.env.DB))
})
app.route('/api/painel', painel)
app.all('/api/*', (c) => c.json({ erro: 'Endereço não encontrado.' }, 404))

app.get('/fotos/*', (c) => servirFoto(c.env.FOTOS, c.req.path.slice('/fotos/'.length), c.req.raw))

/** o painel é outra página (painel.html), com qualquer endereço depois de /painel */
const paginaPainel = async (c: { req: { url: string }; env: Env }) => {
  const r = await c.env.ASSETS.fetch(new URL('/painel', c.req.url))
  const resposta = new Response(r.body, r)
  resposta.headers.set('Cache-Control', 'no-cache')
  resposta.headers.set('X-Robots-Tag', 'noindex, nofollow')
  resposta.headers.set('X-Frame-Options', 'DENY')
  resposta.headers.set('Referrer-Policy', 'same-origin')
  return resposta
}
app.get('/painel', paginaPainel)
app.get('/painel/*', paginaPainel)

/*
  Páginas do site: o catálogo vai dentro do HTML (<script id="livi-catalogo">),
  assim o site já abre com as peças, sem esperar outra requisição.
*/
app.get('*', async (c) => {
  // o site público mora em outro endereço (GitHub Pages): aqui fica só o painel
  if (c.env.SITE_PUBLICO) {
    const url = new URL(c.req.url)
    return c.redirect(c.env.SITE_PUBLICO.replace(/\/$/, '') + url.pathname + url.search, 302)
  }
  const r = await c.env.ASSETS.fetch(c.req.raw)
  if (!r.headers.get('content-type')?.includes('text/html')) return r
  let dados: string
  try {
    dados = JSON.stringify(await lerCatalogo(c.env.DB))
  } catch (e) {
    // sem o banco, o site abre mesmo assim e avisa a visitante para tentar de novo
    console.error('catálogo indisponível', e)
    return r
  }
  const json = dados.replace(/</g, '\\u003c')
  const pagina = new HTMLRewriter()
    .on('head', {
      element(el) {
        el.append(`<script id="livi-catalogo" type="application/json">${json}</script>`, { html: true })
      },
    })
    .transform(r)
  const resposta = new Response(pagina.body, pagina)
  resposta.headers.delete('ETag')
  resposta.headers.set('Cache-Control', 'no-cache')
  return resposta
})

export default app
