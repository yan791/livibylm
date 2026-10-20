import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Worker local ("npm run api"): banco, fotos e API do painel */
const API = 'http://127.0.0.1:8787'

/*
  No desenvolvimento, o Vite faz o papel do Worker: põe o catálogo dentro da
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
        const dados = await (await fetch(`${API}/api/catalogo`)).text()
        const json = dados.replace(/</g, '\\u003c')
        return html.replace('</head>', `<script id="livi-catalogo" type="application/json">${json}</script></head>`)
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

export default defineConfig({
  plugins: [react(), tailwindcss(), lojaNoDev()],
  base: '/',
  server: {
    // mantém o Host do Vite: o Worker confere se os pedidos do painel vêm do próprio site
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/fotos': { target: API, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { site: 'index.html', painel: 'painel.html' },
    },
  },
})
