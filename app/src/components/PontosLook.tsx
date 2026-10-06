/*
  "Compre o look": pontos discretos sobre a foto. Ao passar o mouse ou tocar,
  aparecem o nome e o preço da peça, com o coração da sacola e o link.
*/
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { precoBR, type Colecao } from '../dados/colecoes'
import { navegar } from '../lib/rota'
import { cn } from '../lib/cn'
import { BotaoDesejo } from './Sacola'
import { SetaDiagonal } from './icones'

const ease = [0.22, 1, 0.36, 1] as const

export function PontosLook({ colecao, className }: { colecao: Colecao; className?: string }) {
  const [aberto, setAberto] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (aberto === null) return
    const fora = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(null)
    window.addEventListener('pointerdown', fora)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', fora)
      window.removeEventListener('keydown', esc)
    }
  }, [aberto])

  if (!colecao.pontos?.length) return null

  return (
    <div ref={ref} className={cn('pontos', className)}>
      {colecao.pontos.map((pt, i) => {
        const peca = colecao.pecas.find((p) => p.slug === pt.peca)
        if (!peca) return null
        const lado = pt.x > 0.55 ? 'esq' : 'dir'
        return (
          <div
            key={pt.peca}
            className={cn('ponto', aberto === i && 'aberto')}
            style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
            onMouseEnter={() => setAberto(i)}
            onMouseLeave={() => setAberto(null)}
          >
            <button
              type="button"
              className="ponto-botao"
              aria-label={`Ver ${peca.nome}`}
              aria-expanded={aberto === i}
              onClick={(e) => {
                e.stopPropagation()
                setAberto(aberto === i ? null : i)
              }}
            >
              <span />
            </button>
            <AnimatePresence>
              {aberto === i && (
                <motion.div
                  className={cn('ponto-cartao', lado)}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.35, ease }}
                >
                  <p className="ponto-nome">{peca.nome}</p>
                  <p className="ponto-preco">{precoBR(peca.preco)}</p>
                  <div className="ponto-acoes">
                    <button
                      type="button"
                      className="ponto-ver"
                      onClick={(e) => {
                        e.stopPropagation()
                        navegar(`/colecao/${colecao.slug}/${peca.slug}`)
                      }}
                    >
                      Ver peça <SetaDiagonal className="seta" />
                    </button>
                    <BotaoDesejo item={{ colecao: colecao.slug, peca: peca.slug, cor: peca.cores[0].nome, tamanho: null }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
