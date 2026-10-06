import { useEffect, useState } from 'react'

/** mesma regra do CSS: celular ou tablet em pé */
export const CONSULTA_CELULAR = '(max-width: 860px), (max-aspect-ratio: 11/10)'
export const CONSULTA_REDUZIDO = '(prefers-reduced-motion: reduce)'

export function useConsulta(q: string) {
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setV(m.matches)
    f()
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [q])
  return v
}

export const useCelular = () => useConsulta(CONSULTA_CELULAR)

/*
  Movimento: por decisão do projeto, as animações ficam sempre ligadas,
  mesmo quando o sistema pede menos movimento. A versão estática continua
  no código e pode ser religada trocando 'livre' por 'reduzido' abaixo.
*/
export function definirMovimento() {
  document.documentElement.dataset.movimento = 'livre'
}
export const movimentoReduzido = () => document.documentElement.dataset.movimento === 'reduzido'
export const useReduzido = () => movimentoReduzido()
