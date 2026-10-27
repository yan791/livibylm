import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Worker local ("npm run api"): banco, fotos e API do painel */
const API_LOCAL = 'http://127.0.0.1:8787'

/*
  No desenvolvimento, o Vite faz o papel do Worker: põe o catálogo e os ajustes dentro da
  página inicial (como o Worker faz no site publicado) e manda qualquer
  endereço /painel/... para a página do painel.
*/
function lojaNoDev(): Plugin {
  return {
    name: 'livi-loja-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pedido = req as { url?: string }
        const caminho = pedido.url?.split('?')[0] ?? ''
        if (/^\/painel(\/[^.]*)?$/.test(caminho)) pedido.url = '/painel.html'
        next()
      })
    },
    async transformIndexHtml(html, ctx) {
      if (!ctx.filename.endsWith('index.html')) return html
      try {
        const dados = await (await fetch(`${API_LOCAL}/api/loja`)).text()
        const json = dados.replace(/</g, '\\u003c')
        return html.replace('</head>', `<script id="livi-loja" type="application/json">${json}</script></head>`)
      } catch {
        avisarSemApi()
        return html
      }
    },
  }
}

function avisarSemApi() {
  console.warn('\n[livi] A API local não respondeu. Rode "npm run api" junto com o "npm run dev".\n')
}

/*
  Versão do GitHub Pages (desde o domínio próprio o site mora no Worker e o
  GitHub Pages só redireciona; fica aqui para o caso de voltar a usá-lo):
  - /painel (e o que vier depois) leva ao painel, que mora no servidor da
    loja. Roda antes de qualquer outra coisa da página, sem carregar o site.
  - começa a baixar o catálogo e os ajustes junto com a página, antes do JavaScript.
*/
function paginaDoGithub(api: string): Plugin {
  let base = '/'
  return {
    name: 'livi-pagina-do-github',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml(html) {
      const painel =
        `<script>(function(){var b=${JSON.stringify(base)},p=location.pathname;` +
        `if(p===b+'painel'||p.indexOf(b+'painel/')===0)` +
        `location.replace(${JSON.stringify(api)}+'/'+p.slice(b.length)+location.search+location.hash)})()</script>`
      return html
        .replace('<head>', `<head>\n    ${painel}`)
        .replace('</head>', `<link rel="preload" href="${api}/api/loja" as="fetch" crossorigin="anonymous" /></head>`)
    },
  }
}

export default defineConfig(({ mode }) => {
  // VITE_API = endereço do Worker; só existe na versão do GitHub Pages (ver .github/workflows/publicar.yml)
  const api = loadEnv(mode, '.', 'VITE_').VITE_API?.replace(/\/$/, '')
  return {
    plugins: [react(), tailwindcss(), lojaNoDev(), ...(api ? [paginaDoGithub(api)] : [])],
    base: '/',
    server: {
      // mantém o Host do Vite: o Worker confere se os pedidos do painel vêm do próprio site
      proxy: {
        '/api': { target: API_LOCAL, changeOrigin: false },
        '/fotos': { target: API_LOCAL, changeOrigin: false },
      },
    },
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        // o painel mora só no Worker; no GitHub Pages vai apenas o site
        input: (api ? { site: 'index.html' } : { site: 'index.html', painel: 'painel.html' }) as Record<string, string>,
      },
    },
  }
})
