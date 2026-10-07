/*
  ATO 1: a abertura (Referência 1).
  Ao rolar, o palco fica fixo um instante: a moldura cresce, as palavras
  saem pelas laterais, a modelo dá um passo para trás e o primeiro look da
  coleção (Lúmina) chega ao centro, exatamente onde os looks começam.
  Camadas: cores de fundo > brilho > palavras > moldura > fotos > interface.
*/
import { useLayoutEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { site, linkWhatsApp } from '../dados/site'
import { acharColecao, colecoes } from '../dados/colecoes'
import { gsap } from '../lib/scroll'
import { mostrarCatalogo } from '../lib/catalogo'
import { TextEffect } from '../components/core/text-effect'
import { Logo } from '../components/Logo'
import { abrirMenu, irPara } from '../components/Cabecalho'
import { IconeAgulha, Menu, SetaDiagonal } from '../components/icones'
import { PROPORCAO } from '../lib/cartao'
import { Ima } from '../components/Vivos'
import { BotaoSacola } from '../components/Sacola'

const ease = [0.22, 1, 0.36, 1] as const

export function Apresentacao() {
  const palco = useRef<HTMLDivElement>(null)
  const colecaoAbertura = acharColecao(site.abertura.colecao)!
  const primeira = colecoes[0]

  useLayoutEffect(() => {
    const el = palco.current
    if (!el) return
    const mm = gsap.matchMedia()

    mm.add(
      { desk: '(min-width: 861px) and (min-aspect-ratio: 11/10)', cel: '(max-width: 860px), (max-aspect-ratio: 11/10)' },
      () => {
        const q = gsap.utils.selector(el)
        const H = () => el.clientHeight
        const W = () => el.clientWidth
        const moldura = q('.ap-moldura')[0] as HTMLElement

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: el,
            start: 'top top',
            end: () => '+=' + H() * 1.1,
            pin: true,
            scrub: 1,
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
        tl.to(q('.ap-palavra.esq'), { xPercent: -70, opacity: 0, duration: 0.6, ease: 'power2.in' }, 0)
        tl.to(q('.ap-palavra.dir'), { xPercent: 70, opacity: 0, duration: 0.6, ease: 'power2.in' }, 0)
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
      },
    )

    // brilho de veludo nas palavras: segue o mouse
    const palavras = Array.from(el.querySelectorAll<HTMLElement>('.ap-palavra'))
    const mover = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse') return
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

  const abrirColecao = (e: React.MouseEvent) => {
    e.preventDefault()
    const img = (e.currentTarget.closest('.ap-cartao') as HTMLElement | null)?.querySelector('img')
    mostrarCatalogo(colecaoAbertura.slug, img)
  }

  const a = site.abertura

  return (
    <section className="ap" id="inicio" aria-label="Abertura">
      <div className="ap-palco" ref={palco}>
        <div className="ap-cor" aria-hidden="true" style={{ background: primeira.fundo }} />
        <div className="ap-brilho" aria-hidden="true" />

        <h1 className="ap-palavras">
          <span className="sr-only">
            {a.esquerda} {a.direita}, Livi by LM
          </span>
          {[
            ['esq', a.esquerda, 0.35],
            ['dir', a.direita, 0.55],
          ].map(([lado, texto, atraso]) => (
            <span key={lado as string} className={`ap-palavra ${lado}`} aria-hidden="true">
              <TextEffect
                as="span"
                per="char"
                preset="fade-in-blur"
                delay={atraso as number}
                speedReveal={0.45}
                speedSegment={0.32}
                className="ap-palavra-base grao"
              >
                {texto as string}
              </TextEffect>
              <motion.span
                className="ap-palavra-luz"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.2, delay: 1.8 }}
              >
                {texto as string}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.div
          className="ap-moldura"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, ease }}
        />

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
              transition={{ duration: 1.5, ease, delay: 0.15 }}
            >
              <img className="ap-hero-recorte" src={a.recorte} alt="" draggable={false} fetchPriority="high" />
            </motion.div>
          </div>
        </div>

        <div className="ap-ui">
          <motion.header
            className="ap-topo"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease, delay: 0.2 }}
          >
            <a href="/" className="ap-logo" aria-label="Livi by LM, início" onClick={(e) => e.preventDefault()}>
              <Logo />
            </a>
            <nav className="ap-menu" aria-label="Menu principal">
              {site.menu.map((m, i) => (
                <a
                  key={m.href}
                  href={'/' + m.href}
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
            <BotaoSacola className="ap-sacola" />
            <button type="button" className="ap-menu-botao" onClick={abrirMenu} aria-label="Abrir menu">
              <Menu />
            </button>
          </motion.header>

          <motion.div
            className="ap-intro"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease, delay: 0.9 }}
          >
            <IconeAgulha className="ap-intro-icone" />
            <h2>{a.titulo}</h2>
            <p>{a.apoio}</p>
          </motion.div>

          <motion.div
            className="ap-cartao"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease, delay: 1.05 }}
          >
            <a
              href={`/colecao/${colecaoAbertura.slug}`}
              className="ap-cartao-peca"
              onClick={abrirColecao}
              aria-label={`Ver a coleção ${colecaoAbertura.nome}`}
            >
              <img src={colecaoAbertura.capa} alt="" draggable={false} />
              <span className="ap-cartao-nome">{colecaoAbertura.nome}</span>
            </a>
            <Ima>
              <a href={`/colecao/${colecaoAbertura.slug}`} className="pilula" onClick={abrirColecao}>
                Ver coleção <SetaDiagonal className="seta" />
              </a>
            </Ima>
          </motion.div>

          {/* convite discreto para rolar: some junto com a interface quando a rolagem começa */}
          <motion.div
            className="ap-rolar"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease, delay: 2.2 }}
          >
            <span className="ap-rolar-linha" />
            <span>
              Role<span className="ap-rolar-extra"> para descobrir</span>
            </span>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
