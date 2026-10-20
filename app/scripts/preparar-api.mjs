// o Worker exige a pasta do site gerado; no desenvolvimento quem serve o site é o Vite
import { mkdirSync } from 'node:fs'
mkdirSync(new URL('../dist-cloudflare', import.meta.url), { recursive: true })
