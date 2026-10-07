/*
  ATO 3: a coleção. Continua exatamente de onde o Ato 2 parou (o cartão da
  Lúmina no centro). Os looks passam um a um, com escala e fundo
  acompanhando a foto, e terminam lado a lado como uma capa de coleção.
*/
import { useLayoutEffect, useRef } from 'react'
import { colecoes } from '../dados/colecoes'
import { gsap, ScrollTrigger } from '../lib/scroll'
import { mostrarCatalogo } from '../lib/catalogo'
import { movimentoReduzido } from '../lib/midia'
import { alturaCartao, PROPORCAO } from '../lib/cartao'
import { SetaDiagonal } from '../components/icones'
import { FotoTecido } from '../components/FotoTecido'
import { PontosLook } from '../components/PontosLook'

const FUNDO_FINAL = '#ece5de'
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const suave = (t: number) => t * t * (3 - 2 * t)

export function Looks() {
  const palco = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = palco.current
    if (!el) return
    const mm = gsap.matchMedia()
    mm.add(
      { desk: '(min-width: 861px) and (min-aspect-ratio: 11/10)', cel: '(max-width: 860px), (max-aspect-ratio: 11/10)' },
      (ctx) => {
        const { desk } = ctx.conditions as { desk: boolean }
        if (movimentoReduzido()) return
        const q = gsap.utils.selector(el)

        const cartoes = q('.lk-cartao') as HTMLElement[]
        const nomes = q('.lk-nome') as HTMLElement[]
        const infos = q('.lk-info') as HTMLElement[]
        const rotulos = q('.lk-rotulo') as HTMLElement[]
        const cores = q('.lk-cor') as HTMLElement[]
        const corFinal = q('.lk-cor-final')[0] as HTMLElement
        const ars = colecoes.map((c) => PROPORCAO[c.slug])
        const n = colecoes.length
        const estado = { pos: 0, fim: 0, intro: 0 }

        const aplicar = () => {
          const w = el.clientWidth
          const h = el.clientHeight
          const cardH = h * alturaCartao(desk)
          const larg = ars.map((a) => a * cardH)
          const G = desk ? w * 0.075 : w * 0.1
          const cs = [0]
          for (let i = 1; i < n; i++) cs.push(cs[i - 1] + larg[i - 1] / 2 + G + larg[i] / 2)
          const p = estado.pos
          const i0 = Math.floor(p)
          const i1 = Math.min(i0 + 1, n - 1)
          const atual = lerp(cs[i0], cs[i1], p - i0)
          const e = suave(estado.fim)
          // capa final: quatro lado a lado no computador, grade 2 x 2 no celular
          const colunas = desk ? n : 2
          const linhas = Math.ceil(n / colunas)
          const vao = desk ? w * 0.022 : w * 0.04
          const maxAr = Math.max(...ars)
          const rowH = desk
            ? Math.min(h * 0.52, (w * 0.84 - vao * (n - 1)) / ars.reduce((a, b) => a + b, 0))
            : Math.min((h * 0.7 - vao * (linhas - 1)) / linhas, (w * 0.88 - vao) / (colunas * maxAr))
          const largCel = rowH * maxAr
          let rx = (w - (desk ? rowH * ars.reduce((a, b) => a + b, 0) + vao * (n - 1) : colunas * largCel + vao)) / 2
          cartoes.forEach((c, i) => {
            const d = Math.min(Math.abs(p - i), 1)
            const lw = rowH * ars[i]
            let xRow: number
            let yRow: number
            if (desk) {
              xRow = rx + lw / 2 - w / 2
              rx += lw + vao
              yRow = -h * 0.045
            } else {
              const col = i % colunas
              const lin = Math.floor(i / colunas)
              xRow = rx + col * (largCel + vao) + largCel / 2 - w / 2
              yRow = (lin - (linhas - 1) / 2) * (rowH + vao + 34) - h * 0.03
            }
            gsap.set(c, {
              x: lerp(cs[i] - atual, xRow, e),
              y: lerp(0, yRow, e),
              scale: lerp(1 - 0.2 * d, rowH / cardH, e),
              opacity: lerp(1 - 0.55 * d, 1, e),
            })
            const rot = rotulos[i]
            rot.style.transform = `translate(${w / 2 + xRow}px, ${h / 2 + yRow + rowH / 2 + (desk ? 18 : 8)}px) translateX(-50%)`
            rot.style.opacity = String(Math.max(0, (e - 0.55) / 0.45))
            gsap.set(nomes[i], { opacity: (1 - d) * (1 - e) * estado.intro, xPercent: -50 + (i - p) * 22 })
            infos[i].style.opacity = String(Math.max(0, 1 - d * 2.5) * (1 - e) * estado.intro)
            cartoes[i].dataset.ativo = d < 0.5 && e < 0.5 ? 'sim' : 'nao'
          })
          cores.forEach((c, i) => (c.style.opacity = String(i === 0 ? 1 : Math.min(1, Math.max(0, p - (i - 1))))))
          corFinal.style.opacity = String(e)
          const tema = colecoes[Math.round(p)].tema
          el.dataset.tema = e > 0.5 ? 'claro' : tema
        }

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          onUpdate: aplicar,
          scrollTrigger: {
            trigger: el,
            start: 'top top',
            end: () => '+=' + el.clientHeight * 2.6,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            onRefresh: aplicar,
            onToggle: (st) => (el.style.visibility = st.isActive || st.progress > 0 ? 'visible' : 'hidden'),
            onLeaveBack: () => (el.style.visibility = 'hidden'),
          },
        })
        el.style.visibility = 'hidden'
        tl.to(estado, { intro: 1, duration: 0.3 }, 0)
        for (let i = 1; i < n; i++) tl.to(estado, { pos: i, duration: 0.75, ease: 'power2.inOut' }, 0.3 + (i - 1) * 1.05)
        tl.to(estado, { fim: 1, duration: 0.9, ease: 'power1.inOut' }, 0.3 + (n - 1) * 1.05 + 0.2)
        aplicar()
        return () => {
          el.style.visibility = ''
        }
      },
    )
    return () => mm.revert()
  }, [])

  // a foto tocada "voa" até a primeira peça do catálogo da coleção (View Transitions)
  const abrir = (slug: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    const alvo = e.currentTarget as HTMLElement
    const img =
      alvo.querySelector('img') ??
      document.querySelector<HTMLImageElement>(`.lk-cartao[data-slug="${slug}"] img`) ??
      document.querySelector<HTMLImageElement>(`.lk-bloco[data-slug="${slug}"] img`)
    mostrarCatalogo(slug, img)
  }

  return (
    <section className="lk" id="colecoes" aria-label="As coleções">
      <div className="lk-palco" ref={palco}>
        <div className="lk-cores" aria-hidden="true">
          {colecoes.map((c) => (
            <div key={c.slug} className="lk-cor" style={{ background: c.fundo }} />
          ))}
          <div className="lk-cor-final" style={{ background: FUNDO_FINAL }} />
        </div>

        {colecoes.map((c) => (
          <p key={c.slug} className={`lk-nome tema-${c.tema}`} aria-hidden="true">
            {c.nome}
          </p>
        ))}

        {colecoes.map((c) => (
          <div key={c.slug} className="lk-cartao" data-slug={c.slug} style={{ '--ar': PROPORCAO[c.slug] } as React.CSSProperties}>
            <a href={`/colecao/${c.slug}`} className="lk-cartao-link" onClick={abrir(c.slug)} aria-label={`Coleção ${c.nome}`}>
              <FotoTecido src={c.capa} alt={`Look da coleção ${c.nome}`} carregamento={c.slug === 'lumina' ? 'eager' : 'lazy'} />
            </a>
            <PontosLook colecao={c} />
          </div>
        ))}

        {colecoes.map((c) => (
          <div key={c.slug} className={`lk-info tema-${c.tema}`}>
            <span className="lk-num">
              {c.numero} <i>/</i> 0{colecoes.length}
            </span>
            <span className="lk-clima">{c.clima}</span>
            <a href={`/colecao/${c.slug}`} onClick={abrir(c.slug)} className="lk-ver">
              Ver coleção <SetaDiagonal className="seta" />
            </a>
          </div>
        ))}

        {colecoes.map((c) => (
          <a key={c.slug} href={`/colecao/${c.slug}`} className="lk-rotulo" onClick={abrir(c.slug)}>
            <strong>{c.nome}</strong>
            <span>
              Ver coleção <SetaDiagonal className="seta" />
            </span>
          </a>
        ))}

        {/* celular e movimento reduzido: um look por bloco */}
        <div className="lk-lista">
          {colecoes.map((c) => (
            <article key={c.slug} className={`lk-bloco tema-${c.tema}`} data-slug={c.slug}>
              <p className="lk-bloco-nome">{c.nome}</p>
              <a href={`/colecao/${c.slug}`} onClick={abrir(c.slug)} className="lk-bloco-foto">
                <img src={c.capa} alt={`Look da coleção ${c.nome}`} loading="lazy" draggable={false} />
              </a>
              <div className="lk-bloco-info">
                <span className="lk-num">
                  {c.numero} <i>/</i> 0{colecoes.length}
                </span>
                <span className="lk-clima">{c.clima}</span>
                <a href={`/colecao/${c.slug}`} onClick={abrir(c.slug)} className="lk-ver">
                  Ver coleção <SetaDiagonal className="seta" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
