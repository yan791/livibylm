/*
  ATO 1: a abertura, como capa de revista (versão do Yan).
  Estúdio terracota (o próprio fundo da foto), o nome da marca gigante
  atrás da modelo, selo girando e detalhes de editorial. Ao rolar, a moldura
  cresce, o título sobe, a modelo dá um passo para trás e o primeiro look
  (Lúmina) chega ao centro, exatamente onde os looks começam.
  Camadas: estúdio > cor de passagem > brilho > título > moldura > modelo > interface.
*/
import { useLayoutEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { site, linkWhatsApp } from '../dados/site'
import { colecoes } from '../dados/colecoes'
import { gsap } from '../lib/scroll'
import { TextEffect } from '../components/core/text-effect'
import { SpinningText } from '../components/core/spinning-text'
import { Logo } from '../components/Logo'
import { abrirMenu, irPara } from '../components/Cabecalho'
import { Menu, SetaDiagonal } from '../components/icones'
import { PROPORCAO } from '../lib/cartao'
import { GuiaRolar } from '../components/Vivos'
import { BotaoDesejos, BotaoSacola } from '../components/Gaveta'
import { atrasoAbertura } from '../components/Cortina'
import { comBase } from '../lib/base'
import { irParaColecoes } from './Looks'

const ease = [0.22, 1, 0.36, 1] as const

export function Apresentacao() {
  const palco = useRef<HTMLDivElement>(null)
  const primeira = colecoes[0]

  useLayoutEffect(() => {
    const el = palco.current
    if (!el) return
    const mm = gsap.matchMedia()

    mm.add(
      { desk: '(min-width: 861px) and (min-aspect-ratio: 11/10)', cel: '(max-width: 860px), (max-aspect-ratio: 11/10)' },
      (ctx) => {
        const { desk } = ctx.conditions as { desk: boolean }
        const q = gsap.utils.selector(el)
        const H = () => el.clientHeight
        const W = () => el.clientWidth
        const moldura = q('.ap-moldura')[0] as HTMLElement

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: el,
            start: 'top top',
            // no celular a passagem é um pouco mais curta: lá se desliza rápido e a trava longa cansa
            end: () => '+=' + H() * (desk ? 1.3 : 1.1),
            pin: true,
            scrub: 0.5,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        })

        tl.to(
          moldura,
          {
            scaleX: () => W() / moldura.offsetWidth,
            scaleY: () => H() / moldura.offsetHeight,
            opacity: 0,
            duration: 0.75,
            ease: 'power2.inOut',
          },
          0,
        )
        tl.to(q('.ap-palavra.esq'), { xPercent: -60, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0)
        tl.to(q('.ap-palavra.dir'), { yPercent: -45, opacity: 0, duration: 0.65, ease: 'power2.in' }, 0)
        tl.to(q('.ap-ui'), { opacity: 0, y: 30, duration: 0.35, ease: 'power1.in' }, 0)
        tl.to(q('.ap-brilho'), { opacity: 0, duration: 0.5 }, 0)
        tl.to(
          q('.ap-hero'),
          { scale: 0.86, yPercent: -3, opacity: 0, transformOrigin: '50% 100%', duration: 0.45, ease: 'power2.in' },
          0.1,
        )
        tl.to(q('.ap-cor'), { opacity: 1, duration: 0.55 }, 0.25)
        tl.fromTo(
          q('.ap-look'),
          { scale: 0.72, y: 60, opacity: 0 },
          { scale: 1, y: 0, opacity: 1, duration: 0.6, ease: 'power2.out', immediateRender: true },
          0.5,
        )
        // o look chegou sozinho ao centro: o convite para continuar rolando aparece dos lados
        tl.fromTo(q('.guia-rolar'), { opacity: 0 }, { opacity: 1, duration: 0.25, immediateRender: true }, 0.85)
      },
    )

    // brilho de veludo nas palavras: segue o mouse
    const palavras = Array.from(el.querySelectorAll<HTMLElement>('.ap-palavra'))
    const mover = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse') return
      // parallax das camadas: cada uma anda um pouco, em direções diferentes
      const r0 = el.getBoundingClientRect()
      el.style.setProperty('--ax', ((ev.clientX - r0.left) / r0.width - 0.5).toFixed(3))
      el.style.setProperty('--ay', ((ev.clientY - r0.top) / r0.height - 0.5).toFixed(3))
      for (const p of palavras) {
        const r = p.getBoundingClientRect()
        p.style.setProperty('--mx', `${ev.clientX - r.left}px`)
        p.style.setProperty('--my', `${ev.clientY - r.top}px`)
      }
    }
    el.addEventListener('pointermove', mover)

    return () => {
      el.removeEventListener('pointermove', mover)
      mm.revert()
    }
  }, [])

  const a = site.abertura
  const d0 = atrasoAbertura()

  return (
    <section className="ap" id="inicio" aria-label="Abertura">
      <div className="ap-palco" ref={palco}>
        <div className="ap-estudio" aria-hidden="true" />
        <div className="ap-cor" aria-hidden="true" style={{ background: primeira.fundo }} />
        <div className="ap-brilho" aria-hidden="true" />

        <h1 className="ap-palavras">
          <span className="sr-only">
            Livi by LM, {a.esquerda} {a.direita}
          </span>
          {/* a entrada anima por dentro e a rolagem (GSAP) por fora: se os dois mexessem no
              mesmo elemento, ao mudar o tamanho da tela o GSAP o devolveria invisível */}
          <span className="ap-palavra esq" aria-hidden="true">
            <motion.span
              className="ap-capa-titulo"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease, delay: 0.3 + d0 }}
            >
              <em>
                {a.esquerda} {a.direita}
              </em>
              <span className="ap-edicao">{a.edicao}</span>
            </motion.span>
          </span>
          <span className="ap-palavra dir" aria-hidden="true">
            <TextEffect
              as="span"
              per="char"
              preset="fade-in-blur"
              delay={0.45 + d0}
              speedReveal={0.45}
              speedSegment={0.32}
              className="ap-palavra-base grao"
            >
              {a.marca}
            </TextEffect>
            <motion.span
              className="ap-palavra-luz"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 1.8 + d0 }}
            >
              {a.marca}
            </motion.span>
          </span>
        </h1>

        {/* mesma separação: a moldura aparece pela caixa de fora e some (ao rolar) pela de dentro */}
        <motion.div
          className="ap-moldura-entrada"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, ease, delay: d0 }}
        >
          <div className="ap-moldura" />
        </motion.div>

        <div className="ap-fotos" aria-hidden="true">
          {/* o primeiro look chega aqui no fim da abertura, no mesmo lugar em que os looks começam */}
          <div className="ap-look" style={{ '--ar': PROPORCAO[primeira.slug] } as React.CSSProperties}>
            <img src={primeira.capa} alt="" draggable={false} />
          </div>
          <div className="ap-hero" style={{ aspectRatio: String(a.proporcao), '--ar': a.proporcao } as React.CSSProperties}>
            <motion.div
              className="ap-hero-entrada"
              initial={{ opacity: 0, y: 46 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.5, ease, delay: 0.15 + d0 }}
            >
              <img className="ap-hero-recorte" src={a.recorte} alt="" draggable={false} fetchPriority="high" />
            </motion.div>
          </div>
        </div>

        <GuiaRolar ar={PROPORCAO[primeira.slug]} escuro={primeira.tema === 'escuro'} />

        <div className="ap-ui">
          <motion.header
            className="ap-topo"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease, delay: 0.2 + d0 }}
          >
            <a href={comBase('/')} className="ap-logo" aria-label="Livi by LM, início" onClick={(e) => e.preventDefault()}>
              <Logo claro />
            </a>
            <nav className="ap-menu" aria-label="Menu principal">
              {site.menu.map((m, i) => (
                <a
                  key={m.href}
                  href={comBase('/' + m.href)}
                  className={i === 0 ? 'ativo' : undefined}
                  aria-current={i === 0 ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    irPara(m.href, { nome: 'inicio' })
                  }}
                >
                  {m.rotulo}
                </a>
              ))}
            </nav>
            <a href={linkWhatsApp()} target="_blank" rel="noreferrer" className="ap-whats">
              Atendimento pelo WhatsApp <SetaDiagonal className="seta" />
            </a>
            <BotaoDesejos className="ap-desejos" />
            <BotaoSacola className="ap-sacola" />
            <button type="button" className="ap-menu-botao" onClick={abrirMenu} aria-label="Abrir menu">
              <Menu />
            </button>
          </motion.header>

          <motion.div
            className="ap-intro"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease, delay: 0.9 + d0 }}
          >
            <span className="ap-intro-linha" aria-hidden="true" />
            <h2>{a.titulo}</h2>
            <p>{a.apoio}</p>
          </motion.div>

          {/* o selo rola a página até o carrossel das coleções (o "Coleções" do menu é que abre o catálogo) */}
          <motion.a
            href={comBase('/#colecoes')}
            className="ap-selo"
            aria-label="Ver as coleções"
            initial={{ opacity: 0, scale: 0.8, rotate: -20 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1.2, ease, delay: 1.1 + d0 }}
            onClick={(e) => {
              e.preventDefault()
              irParaColecoes()
            }}
          >
            <SpinningText className="ap-selo-texto" duration={20} radius={10.6} fontSize={0.62}>
              {a.selo}
            </SpinningText>
            <span className="ap-selo-centro">
              <SetaDiagonal className="seta" />
            </span>
          </motion.a>
        </div>
      </div>
    </section>
  )
}
