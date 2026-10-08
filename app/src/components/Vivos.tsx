/*
  Toques vivos: títulos que surgem letra a letra ao rolar, botões magnéticos
  (motion-primitives Magnetic) e a faixa infinita com os nomes das coleções
  (motion-primitives InfiniteSlider).
*/
import { Fragment, useRef } from 'react'
import { motion, useInView, type Variants } from 'motion/react'
import { colecoes } from '../dados/colecoes'
import { mostrarCatalogo } from '../lib/catalogo'
import { cn } from '../lib/cn'
import { Magnetic } from './core/magnetic'
import { InfiniteSlider } from './core/infinite-slider'
import { comBase } from '../lib/base'

const ease = [0.22, 1, 0.36, 1] as const

const letra: Variants = {
  oculto: { opacity: 0, y: '0.4em', filter: 'blur(8px)' },
  visivel: (i: number) => ({
    opacity: 1,
    y: '0em',
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease, delay: i * 0.022 },
  }),
}

type Parte = string | { em: string } | 'quebra'

/** título que surge letra a letra quando entra na tela */
export function TituloVivo({
  partes,
  className,
  as = 'h2',
  id,
}: {
  partes: Parte[]
  className?: string
  as?: 'h1' | 'h2' | 'h3' | 'p'
  id?: string
}) {
  const ref = useRef<HTMLHeadingElement>(null)
  const visto = useInView(ref, { once: true, margin: '0px 0px -12% 0px' })
  const Tag = motion[as] as typeof motion.h2
  const texto = partes.map((p) => (p === 'quebra' ? ' ' : typeof p === 'string' ? p : p.em)).join(' ').replace(/\s+/g, ' ')
  let n = 0
  const letras = (t: string) =>
    t.split(' ').map((palavra, wi, arr) => (
      <Fragment key={wi}>
        <span className="tv-palavra">
          {[...palavra].map((c, ci) => (
            <motion.span key={ci} className="tv-letra" variants={letra} custom={n++}>
              {c}
            </motion.span>
          ))}
        </span>
        {wi < arr.length - 1 ? ' ' : null}
      </Fragment>
    ))

  return (
    <Tag ref={ref} id={id} className={cn('titulo-vivo', className)} initial="oculto" animate={visto ? 'visivel' : 'oculto'} aria-label={texto}>
      {partes.map((p, i) => (
        <Fragment key={i}>
          {p === 'quebra' ? (
            <br />
          ) : typeof p === 'string' ? (
            <span aria-hidden="true">{letras(p)}</span>
          ) : (
            <em aria-hidden="true">{letras(p.em)}</em>
          )}
          {p !== 'quebra' && partes[i + 1] && partes[i + 1] !== 'quebra' ? ' ' : null}
        </Fragment>
      ))}
    </Tag>
  )
}

/** botão que puxa levemente o cursor (só no computador) */
export function Ima({ children, forca = 0.22 }: { children: React.ReactNode; forca?: number }) {
  return (
    <Magnetic intensity={forca} range={140} springOptions={{ stiffness: 160, damping: 14, mass: 0.3 }}>
      {children}
    </Magnetic>
  )
}

/**
  Convite visual para continuar rolando: dos dois lados do look centralizado,
  uma linha com um traço descendo e uma seta discreta. `ar` é a proporção do
  look, para as setas ficarem rente à foto.
*/
export function GuiaRolar({ ar, escuro = false }: { ar: number; escuro?: boolean }) {
  return (
    <div className={cn('guia-rolar', escuro && 'escuro')} style={{ '--ar': ar } as React.CSSProperties} aria-hidden="true">
      {['esq', 'dir'].map((lado) => (
        <span key={lado} className={cn('guia-rolar-lado', lado)}>
          <span className="guia-rolar-linha" />
          <svg className="guia-rolar-seta" viewBox="0 0 12 7">
            <path d="M1 1 L6 6 L11 1" />
          </svg>
        </span>
      ))}
    </div>
  )
}

/** faixa contínua com os nomes das coleções */
export function FaixaColecoes({ escura = false, reverso = false }: { escura?: boolean; reverso?: boolean }) {
  return (
    <section className={cn('faixa', escura && 'escura')} aria-label="Coleções Livi">
      <InfiniteSlider gap={0} speed={38} speedOnHover={14} reverse={reverso}>
        {colecoes.map((c) => (
          <a
            key={c.slug}
            href={comBase(`/colecao/${c.slug}`)}
            className="faixa-item"
            onClick={(e) => {
              e.preventDefault()
              mostrarCatalogo(c.slug)
            }}
          >
            <span className="faixa-nome">{c.nome}</span>
            <span className="faixa-estrela" aria-hidden="true">
              ✦
            </span>
          </a>
        ))}
      </InfiniteSlider>
    </section>
  )
}
