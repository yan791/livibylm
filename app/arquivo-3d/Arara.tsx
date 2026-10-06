/*
  ATO 4: a arara (Referência 2). Uma peça 3D por coleção, pendurada numa
  barra dourada. Hover balança e destaca; clique leva à página da coleção
  com transição contínua. No celular vira carrossel por arraste e toque.
*/
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { colecoes } from '../dados/colecoes'
import { site, linkWhatsApp } from '../dados/site'
import { navegar } from '../lib/rota'
import { prepararPonte } from '../lib/transicao'
import { useCelular, usePerto, useReduzido, temWebGL } from '../lib/midia'
import { cn } from '../lib/cn'
import type { CenaArara } from '../tres/arara'
import {
  IconeAgulha,
  IconeConversa,
  IconeTecido,
  IconeVestido,
  Instagram,
  SetaDiagonal,
  SetaDireita,
  SetaEsquerda,
  WhatsApp,
} from '../components/icones'

const FUNDO_PADRAO = '#ece5de'
const ease = [0.22, 1, 0.36, 1] as const

const diferenciais = [
  { Icone: IconeAgulha, texto: ['Peças', 'autorais'] },
  { Icone: IconeVestido, texto: ['Caimento', 'fluido'] },
  { Icone: IconeTecido, texto: ['Detalhes', 'de ateliê'] },
  { Icone: IconeConversa, texto: ['Atendimento', 'pelo WhatsApp'] },
]

export function Arara() {
  const secao = useRef<HTMLElement>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const cena = useRef<CenaArara | null>(null)
  const celular = useCelular()
  const reduzido = useReduzido()
  const perto = usePerto(secao, '900px')
  const [hover, setHover] = useState<number | null>(null)
  const [ativo, setAtivo] = useState(0)
  const [rotulos, setRotulos] = useState<{ x: number; y: number }[]>([])
  const [semWebGL, setSemWebGL] = useState(false)
  const [pronta, setPronta] = useState(false)

  const destaque = celular ? ativo : hover
  const fundo = destaque !== null ? colecoes[destaque].fundo : FUNDO_PADRAO
  const tema = destaque !== null ? colecoes[destaque].tema : 'claro'

  useEffect(() => {
    cena.current?.setFundo(fundo)
  }, [fundo])

  useEffect(() => {
    if (!perto || !canvas.current) return
    if (!temWebGL()) {
      setSemWebGL(true)
      return
    }
    let viva = true
    let ro: ResizeObserver | null = null
    let io: IntersectionObserver | null = null
    import('../tres/arara').then(({ CenaArara }) => {
      if (!viva || !canvas.current || !caixa.current) return
      const c = new CenaArara(
        canvas.current,
        colecoes.map((col) => ({
          slug: col.slug,
          modelo: col.pecas[0].midia.procedural!.modelo,
          cor: col.pecas[0].cores[0].hex,
          comprimento: col.pecas[0].midia.procedural!.comprimento,
        })),
        {
          aoPassar: setHover,
          aoClicar: (i) => abrir(i),
          aoAtivo: setAtivo,
        },
        { celular, reduzido },
      )
      cena.current = c
      c.setFundo(FUNDO_PADRAO)
      const medir = () => {
        const r = caixa.current!.getBoundingClientRect()
        c.tamanho(r.width, r.height)
        setRotulos(c.rotulos())
      }
      medir()
      ro = new ResizeObserver(medir)
      ro.observe(caixa.current)
      io = new IntersectionObserver(
        ([e]) => {
          c.ligar(e.isIntersecting)
          if (e.isIntersecting && e.intersectionRatio > 0.25) c.chegar()
        },
        { threshold: [0, 0.25, 0.5] },
      )
      io.observe(caixa.current)
      setPronta(true)
    })
    return () => {
      viva = false
      ro?.disconnect()
      io?.disconnect()
      cena.current?.destruir()
      cena.current = null
      setPronta(false)
    }
    // recria a cena quando muda entre celular e computador
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perto, celular, reduzido])

  async function abrir(i: number) {
    const col = colecoes[i]
    const c = cena.current
    if (c && caixa.current) {
      const { url, rect } = c.capturar(i)
      const r = caixa.current.getBoundingClientRect()
      await prepararPonte(url, { x: r.left + rect.x, y: r.top + rect.y, w: rect.w, h: rect.h }, col.slug)
    }
    navegar(`/colecao/${col.slug}`, { tipo: 'peca' })
  }

  return (
    <section
      ref={secao}
      id="colecoes"
      className={cn('ar', `tema-${tema}`)}
      style={{ '--fundo': fundo } as React.CSSProperties}
      aria-label="Coleções na arara"
    >
      <motion.div
        className="ar-topo"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 1.1, ease }}
      >
        <h2 className="ar-titulo grao">Coleções</h2>
        <div className="ar-lema">
          <i aria-hidden="true" />
          <span>Caimento fluido. Essência autoral.</span>
          <i aria-hidden="true" />
        </div>
      </motion.div>

      <div className="ar-palco" ref={caixa}>
        <canvas ref={canvas} className={cn('ar-canvas', pronta && 'pronta')} aria-hidden="true" />

        {semWebGL && (
          <div className="ar-sem3d">
            {colecoes.map((c) => (
              <a key={c.slug} href={`/colecao/${c.slug}`} onClick={(e) => (e.preventDefault(), navegar(`/colecao/${c.slug}`))}>
                <img src={c.capa} alt={`Coleção ${c.nome}`} loading="lazy" />
              </a>
            ))}
          </div>
        )}

        {!celular && (
          <div className="ar-rotulos">
            {colecoes.map((c, i) => (
              <button
                key={c.slug}
                type="button"
                className={cn('ar-rotulo', hover === i && 'ativo', hover !== null && hover !== i && 'apagado')}
                style={{ left: rotulos[i]?.x ?? `${12.5 + i * 25}%` }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => abrir(i)}
              >
                <span className="ar-rotulo-nome">{c.nome}</span>
                <span className="ar-rotulo-ver">
                  Ver coleção <SetaDiagonal className="seta" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {celular && (
        <div className="ar-carrossel">
          <button type="button" className="ar-seta" onClick={() => cena.current?.irPara(ativo - 1)} disabled={ativo === 0} aria-label="Coleção anterior">
            <SetaEsquerda />
          </button>
          <div className="ar-carrossel-info" aria-live="polite">
            <span className="ar-carrossel-num">
              {colecoes[ativo].numero} / 0{colecoes.length}
            </span>
            <strong>{colecoes[ativo].nome}</strong>
            <button type="button" className="pilula" onClick={() => abrir(ativo)}>
              Ver coleção <SetaDiagonal className="seta" />
            </button>
            <div className="ar-pontos">
              {colecoes.map((c, i) => (
                <button
                  key={c.slug}
                  type="button"
                  className={cn(i === ativo && 'ativo')}
                  onClick={() => cena.current?.irPara(i)}
                  aria-label={`Ver ${c.nome}`}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            className="ar-seta"
            onClick={() => cena.current?.irPara(ativo + 1)}
            disabled={ativo === colecoes.length - 1}
            aria-label="Próxima coleção"
          >
            <SetaDireita />
          </button>
        </div>
      )}

      <p className="ar-dica">
        {celular ? 'Deslize para ver as coleções. Toque na peça para abrir.' : 'Passe o mouse sobre uma peça e clique para ver a coleção.'}
      </p>

      <ul className="ar-diferenciais">
        {diferenciais.map(({ Icone, texto }, i) => (
          <motion.li
            key={texto[0]}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.8, ease, delay: i * 0.08 }}
          >
            <span className="ar-dif-icone">
              <Icone />
            </span>
            <span className="ar-dif-texto">
              {texto[0]}
              <br />
              {texto[1]}
            </span>
          </motion.li>
        ))}
      </ul>

      <div className="ar-fecho">
        <div>
          <p className="ar-disponivel">Disponível agora</p>
          <p className="ar-fecho-apoio">Escolha a peça e fale com a gente. A conversa é direta e sem pressa.</p>
        </div>
        <div className="ar-fecho-acoes">
          <a className="pilula cheia" href={linkWhatsApp()} target="_blank" rel="noreferrer">
            <WhatsApp className="ico" /> Falar no WhatsApp <SetaDiagonal className="seta" />
          </a>
          <a className="pilula" href={site.instagram} target="_blank" rel="noreferrer">
            <Instagram className="ico" /> {site.instagramArroba}
          </a>
        </div>
      </div>
    </section>
  )
}
