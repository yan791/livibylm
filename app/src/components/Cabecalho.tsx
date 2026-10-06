import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { site, linkWhatsApp } from '../dados/site'
import { navegar, type Rota } from '../lib/rota'
import { rolarPara, pausarRolagem } from '../lib/scroll'
import { cn } from '../lib/cn'
import { Logo } from './Logo'
import { BotaoSacola } from './Sacola'
import { Fechar, Instagram, Menu, SetaDiagonal, WhatsApp } from './icones'

const ease = [0.22, 1, 0.36, 1] as const

/** abre o menu de qualquer lugar (ex.: o botão dentro da abertura) */
export const abrirMenu = () => window.dispatchEvent(new CustomEvent('livi:menu'))

export function irPara(href: string, rota: Rota) {
  if (rota.nome === 'inicio') {
    rolarPara(href === '#inicio' ? 0 : href)
    history.replaceState(null, '', href === '#inicio' ? '/' : '/' + href)
  } else navegar('/' + href)
}

export function Cabecalho({ rota }: { rota: Rota }) {
  const [compacto, setCompacto] = useState(rota.nome !== 'inicio')
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    if (rota.nome !== 'inicio') {
      setCompacto(true)
      return
    }
    const f = () => setCompacto(window.scrollY > window.innerHeight * 0.45)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [rota.nome])

  useEffect(() => {
    const abrir = () => setMenu(true)
    window.addEventListener('livi:menu', abrir)
    return () => window.removeEventListener('livi:menu', abrir)
  }, [])

  useEffect(() => {
    pausarRolagem(menu)
    if (!menu) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [menu])

  const clicar = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    setMenu(false)
    irPara(href, rota)
  }

  return (
    <>
      <header className={cn('cab', compacto && 'visivel')} aria-hidden={!compacto}>
        <a href="/" className="cab-logo" onClick={clicar('#inicio')} tabIndex={compacto ? 0 : -1}>
          <Logo />
        </a>
        <nav className="cab-acoes" aria-label="Atalhos">
          <a href="/#colecoes" className="cab-link" onClick={clicar('#colecoes')} tabIndex={compacto ? 0 : -1}>
            Coleções
          </a>
          <a
            href={linkWhatsApp()}
            target="_blank"
            rel="noreferrer"
            className="cab-whats"
            tabIndex={compacto ? 0 : -1}
          >
            <WhatsApp className="ico" />
            <span>WhatsApp</span>
          </a>
          <BotaoSacola className="cab-sacola" />
          <button type="button" className="cab-menu" onClick={() => setMenu(true)} aria-label="Abrir menu" tabIndex={compacto ? 0 : -1}>
            <Menu />
          </button>
        </nav>
      </header>

      <AnimatePresence>
        {menu && (
          <motion.div
            className="menu-tela"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease }}
          >
            <div className="menu-tela-topo">
              <Logo />
              <button type="button" className="menu-fechar" onClick={() => setMenu(false)} aria-label="Fechar menu" autoFocus>
                <Fechar />
              </button>
            </div>
            <nav className="menu-tela-links" aria-label="Menu principal">
              {site.menu.map((m, i) => (
                <motion.a
                  key={m.href}
                  href={'/' + m.href}
                  onClick={clicar(m.href)}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease, delay: 0.08 + i * 0.06 }}
                >
                  <span className="num">0{i + 1}</span>
                  {m.rotulo}
                </motion.a>
              ))}
            </nav>
            <motion.div
              className="menu-tela-rodape"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.45 }}
            >
              <a href={linkWhatsApp()} target="_blank" rel="noreferrer" className="pilula cheia">
                Atendimento pelo WhatsApp <SetaDiagonal className="seta" />
              </a>
              <a href={site.instagram} target="_blank" rel="noreferrer" className="menu-insta">
                <Instagram className="ico" /> {site.instagramArroba}
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
