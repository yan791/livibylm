/*
  Worker da Livi: publica o site, a API do painel e as fotos.
    /api/loja         coleções e peças visíveis e os ajustes públicos (o site usa, inclusive o do GitHub Pages)
    /api/pedidos/...  compras pelo site (worker/pedidos.ts)
    /api/conta/...    conta da cliente no site: entrar, criar e os pedidos dela (worker/contas.ts)
    /api/pagamento/aviso  aviso da InfinitePay de pagamento aprovado
    /api/painel/...   painel da loja (login obrigatório, menos entrar e convite)
    /fotos/...        fotos enviadas pelo painel (R2)
    /painel/...       o painel em si
    o resto           o site, já com o catálogo dentro do HTML
  Páginas e painel abertos fora do endereço do site (SITE_PUBLICO, o domínio
  da loja) vão para ele, com o mesmo caminho: o workers.dev, o www e o http.
*/
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { lerLoja } from './catalogo'
import { painel } from './painel'
import { avisoDePagamento, compras } from './pedidos'
import { contas } from './contas'
import { servirFoto } from './fotos'
import type { Ambiente } from './tipos'

const app = new Hono<Ambiente>()

app.onError((e, c) => {
  if (e instanceof HTTPException) return c.json({ erro: e.message }, e.status)
  console.error(e)
  return c.json({ erro: 'Algo deu errado do nosso lado. Tente de novo em instantes.' }, 500)
})

/*
  Um endereço só para o site e o painel (a sessão do painel e a conta da cliente
  ficam presas ao endereço). A API e as fotos seguem respondendo em qualquer um:
  pedidos feitos antes do domínio mandam o aviso de pagamento para o workers.dev.
*/
app.use('*', async (c, next) => {
  if (!c.env.SITE_PUBLICO) return next()
  const url = new URL(c.req.url)
  const site = new URL(c.env.SITE_PUBLICO)
  if (url.origin === site.origin || /^\/(api|fotos)\//.test(url.pathname)) return next()
  return c.redirect(site.origin + site.pathname.replace(/\/$/, '') + url.pathname + url.search, 301)
})

app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

// dados públicos: qualquer site pode ler (o do GitHub Pages lê daqui)
app.get('/api/loja', async (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  return c.json(await lerLoja(c.env.DB))
})
// só o catálogo, para páginas publicadas antes dos ajustes (pode sair depois que o GitHub Pages atualizar)
app.get('/api/catalogo', async (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  return c.json((await lerLoja(c.env.DB)).colecoes)
})
app.route('/api/painel', painel)
app.route('/api/pedidos', compras)
app.route('/api/conta', contas)
app.post('/api/pagamento/aviso', (c) => avisoDePagamento(c))
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
  Páginas do site: o catálogo e os ajustes vão dentro do HTML (<script id="livi-loja">),
  assim o site já abre com as peças, sem esperar outra requisição.
*/
app.get('*', async (c) => {
  const r = await c.env.ASSETS.fetch(c.req.raw)
  if (!r.headers.get('content-type')?.includes('text/html')) return r
  let dados: string
  try {
    dados = JSON.stringify(await lerLoja(c.env.DB))
  } catch (e) {
    // sem o banco, o site abre mesmo assim e avisa a visitante para tentar de novo
    console.error('catálogo indisponível', e)
    return r
  }
  const json = dados.replace(/</g, '\\u003c')
  const pagina = new HTMLRewriter()
    .on('head', {
      element(el) {
        el.append(`<script id="livi-loja" type="application/json">${json}</script>`, { html: true })
      },
    })
    .transform(r)
  const resposta = new Response(pagina.body, pagina)
  resposta.headers.delete('ETag')
  resposta.headers.set('Cache-Control', 'no-cache')
  return resposta
})

export default app
