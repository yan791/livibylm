import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bodoni-moda/opsz.css'
import '@fontsource-variable/bodoni-moda/opsz-italic.css'
import '@fontsource-variable/jost'
import './index.css'
import App from './App'
import { definirMovimento } from './lib/midia'
import { colecoes } from './dados/colecoes'
import { linkWhatsApp } from './dados/site'

definirMovimento()

/** o servidor não conseguiu mandar as peças junto com a página (raro): avisa em vez de abrir o site pela metade */
function SemCatalogo() {
  return (
    <main className="sem-catalogo">
      <p className="sem-catalogo-marca">Livi</p>
      <p>Não conseguimos carregar as peças agora.</p>
      <button type="button" onClick={() => location.reload()}>
        Tentar de novo
      </button>
      <a href={linkWhatsApp()} target="_blank" rel="noreferrer">
        Falar no WhatsApp
      </a>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode>{colecoes.length ? <App /> : <SemCatalogo />}</StrictMode>)
