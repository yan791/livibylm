/*
  Cortina de entrada (versão do Yan): abertura rápida em vinho com "LIVI"
  subindo letra a letra, só na primeira visita da sessão e só na página
  inicial. A abertura espera a cortina sair para começar a entrar.
*/
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { pausarRolagem } from '../lib/scroll'
import { semBase } from '../lib/base'

const ease = [0.22, 1, 0.36, 1] as const
const CHAVE_CORTINA = 'livi-cortina'
let cortinaVai: boolean | null = null

/** a cortina aparece só na primeira visita da sessão, e só na página inicial */
export function cortinaVaiAparecer() {
  if (cortinaVai !== null) return cortinaVai
  try {
    cortinaVai = semBase(location.pathname) === '/' && !sessionStorage.getItem(CHAVE_CORTINA)
  } catch {
    cortinaVai = false
  }
  return cortinaVai
}

/** quanto as entradas da abertura esperam a cortina sair */
export const atrasoAbertura = () => (cortinaVaiAparecer() ? 1.35 : 0)

export function Cortina() {
  const [viva, setViva] = useState(cortinaVaiAparecer)

  useEffect(() => {
    if (!viva) return
    try {
      sessionStorage.setItem(CHAVE_CORTINA, '1')
    } catch {
      /* sem armazenamento: a cortina só não lembra que já apareceu */
    }
    pausarRolagem(true, 'cortina')
    const t = window.setTimeout(() => {
      setViva(false)
      pausarRolagem(false, 'cortina')
    }, 1500)
    return () => {
      window.clearTimeout(t)
      pausarRolagem(false, 'cortina')
    }
  }, [viva])

  return (
    <AnimatePresence>
      {viva && (
        <motion.div
          className="cortina"
          aria-hidden="true"
          initial={{ clipPath: 'inset(0 0 0 0)' }}
          exit={{ clipPath: 'inset(0 0 100% 0)' }}
          transition={{ duration: 0.95, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="cortina-marca">
            {'LIVI'.split('').map((l, i) => (
              <motion.span
                key={i}
                initial={{ y: '110%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                transition={{ duration: 0.8, ease, delay: 0.08 + i * 0.07 }}
              >
                {l}
              </motion.span>
            ))}
          </div>
          <motion.p className="cortina-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.6 }}>
            by LM · moda autoral
          </motion.p>
          <motion.span
            className="cortina-linha"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.2, ease: [0.65, 0, 0.35, 1], delay: 0.15 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
