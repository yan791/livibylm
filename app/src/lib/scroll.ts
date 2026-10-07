/*
  Rolagem suave (Lenis) ligada ao GSAP ScrollTrigger.
  Com "reduzir movimento" ligado no sistema, fica a rolagem nativa.
*/
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { movimentoReduzido } from './midia'

gsap.registerPlugin(ScrollTrigger)

let lenis: Lenis | null = null
/** quem pediu para parar a rolagem (menu, sacola, catálogo...). Só volta quando todos soltam. */
const travas = new Set<string>()

export function iniciarRolagem() {
  if (lenis || movimentoReduzido()) return lenis
  lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 3.2), smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis?.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  if (travas.size) lenis.stop()
  return lenis
}

export function rolarPara(alvo: string | number | HTMLElement, o: { imediato?: boolean; deslocamento?: number } = {}) {
  if (lenis) {
    lenis.scrollTo(alvo, { immediate: o.imediato, offset: o.deslocamento ?? 0, duration: 1.6 })
    return
  }
  const y =
    typeof alvo === 'number'
      ? alvo
      : (typeof alvo === 'string' ? document.querySelector(alvo) : alvo)?.getBoundingClientRect().top ?? 0
  window.scrollTo({ top: typeof alvo === 'number' ? y : y + scrollY + (o.deslocamento ?? 0), behavior: o.imediato ? 'auto' : 'smooth' })
}

export function pausarRolagem(p: boolean, quem = 'geral') {
  if (p) travas.add(quem)
  else travas.delete(quem)
  if (!lenis) return
  if (travas.size) lenis.stop()
  else lenis.start()
}

export { gsap, ScrollTrigger }
