import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bodoni-moda/opsz.css'
import '@fontsource-variable/bodoni-moda/opsz-italic.css'
import '@fontsource-variable/jost'
import './painel.css'
import { App } from './App'

createRoot(document.getElementById('painel')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
