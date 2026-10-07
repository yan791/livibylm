/*
  Microinterações modernas (ideias do microkit e do bencho.dev, adaptadas à Livi):
  - TextoTroca: as letras do botão sobem em cascata no hover (microkit, MIT)
  - preenchimento das pílulas a partir do ponto onde o mouse entra (microkit, MIT)
  - Tamanhos: o destaque desliza de um tamanho para o outro
  - Ilha: aviso em pílula no topo quando uma peça vai para a sacola
  - Cortina: abertura rápida em vinho na primeira visita
  - GraoFilme: grão de filme sutil sobre o site
*/
import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { acharColecao } from '../dados/colecoes'
import { abrirSacola, useSacola, type ItemSacola } from '../lib/sacola'
import { pausarRolagem } from '../lib/scroll'
import { cn } from '../lib/cn'
import { IconeSacola } from './icones'

const ease = [0.22, 1, 0.36, 1] as const

/** texto de botão com troca de letras em cascata */
export function TextoTroca({ children }: { children: string }) {
  return (
    <span className="troca" aria-label={children}>
      {[...children].map((c, i) => (
        <span key={i} className="troca-letra" style={{ '--d': `${i * 22}ms` } as React.CSSProperties} aria-hidden="true">
          <span className="troca-atual">{c === ' ' ? ' ' : c}</span>
          <span className="troca-nova">{c === ' ' ? ' ' : c}</span>
        </span>
      ))}
    </span>
  )
}

/** guarda o ponto por onde o mouse entrou em cada pílula, para o preenchimento nascer dali */
export function usePreenchimentoPilulas() {
  useEffect(() => {
    const marcar = (e: PointerEvent) => {
      const alvo = (e.target as Element | null)?.closest?.('.pilula') as HTMLElement | null
      if (!alvo) return
      const de = e.relatedTarget as Node | null
      if (de && alvo.contains(de)) return
      const r = alvo.getBoundingClientRect()
      alvo.style.setProperty('--px', `${e.clientX - r.left}px`)
      alvo.style.setProperty('--py', `${e.clientY - r.top}px`)
    }
    document.addEventListener('pointerover', marcar)
    document.addEventListener('pointerout', marcar)
    return () => {
      document.removeEventListener('pointerover', marcar)
      document.removeEventListener('pointerout', marcar)
    }
  }, [])
}

/** escolha de tamanho com um destaque que desliza */
export function Tamanhos({
  opcoes,
  valor,
  aoEscolher,
  className,
  rotulo = 'Tamanho',
}: {
  opcoes: string[]
  valor: string | null
  aoEscolher: (t: string) => void
  className?: string
  rotulo?: string
}) {
  const id = useId()
  return (
    <div className={cn('tamanhos', className)} role="radiogroup" aria-label={rotulo}>
      {opcoes.map((t) => (
        <button key={t} type="button" role="radio" aria-checked={valor === t} className={cn(valor === t && 'ativo')} onClick={() => aoEscolher(t)}>
          {valor === t && <motion.span layoutId={`tam-${id}`} className="tamanhos-marca" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
          <span className="tamanhos-texto">{t}</span>
        </button>
      ))}
    </div>
  )
}

/** aviso em pílula no topo ("ilha") quando uma peça vai para a sacola */
export function Ilha() {
  const [item, setItem] = useState<ItemSacola | null>(null)
  const [aberta, setAberta] = useState(false)
  const lista = useSacola()

  useEffect(() => {
    let t = 0
    const f = (e: Event) => {
      const it = (e as CustomEvent<ItemSacola>).detail
      if (!it) return
      setItem(it)
      setAberta(true)
      window.clearTimeout(t)
      t = window.setTimeout(() => setAberta(false), 2800)
    }
    const fechar = () => setAberta(false)
    window.addEventListener('livi:sacola-adicionou', f)
    window.addEventListener('livi:sacola', fechar)
    return () => {
      window.removeEventListener('livi:sacola-adicionou', f)
      window.removeEventListener('livi:sacola', fechar)
      window.clearTimeout(t)
    }
  }, [])

  const col = item ? acharColecao(item.colecao) : undefined
  const peca = col?.pecas.find((p) => p.slug === item?.peca)

  return (
    <AnimatePresence>
      {aberta && peca && col && (
        <motion.div
          className="ilha"
          role="status"
          initial={{ opacity: 0, y: -16, width: 46, borderRadius: 23 }}
          animate={{ opacity: 1, y: 0, width: 'auto', borderRadius: 28 }}
          exit={{ opacity: 0, y: -12, scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        >
          <motion.div className="ilha-conteudo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15, duration: 0.3 }}>
            <span className="ilha-foto" style={{ background: col.fundo }}>
              {peca.fotos[0] ? <img src={peca.fotos[0]} alt="" /> : <IconeSacola />}
            </span>
            <span className="ilha-texto">
              <strong>Guardado na sacola</strong>
              <span>
                {peca.nome} · {lista.length} {lista.length > 1 ? 'peças' : 'peça'}
              </span>
            </span>
            <button
              type="button"
              className="ilha-ver"
              onClick={() => {
                setAberta(false)
                abrirSacola()
              }}
            >
              Ver
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- cortina de entrada ---------- */

const CHAVE_CORTINA = 'livi-cortina'
let cortinaVai: boolean | null = null

/** a cortina aparece só na primeira visita da sessão, e só na página inicial */
export function cortinaVaiAparecer() {
  if (cortinaVai !== null) return cortinaVai
  try {
    cortinaVai = location.pathname === '/' && !sessionStorage.getItem(CHAVE_CORTINA)
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
      /* ignora */
    }
    pausarRolagem(true)
    const t = window.setTimeout(() => {
      setViva(false)
      pausarRolagem(false)
    }, 1500)
    return () => window.clearTimeout(t)
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

/** grão de filme sutil por cima de tudo, para o clima de editorial */
export function GraoFilme() {
  return <div className="grao-filme" aria-hidden="true" />
}
