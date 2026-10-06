import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { criarRenderer, iluminar } from '../tres/base'
import { montarPeca } from '../tres/pecas'
import { colecoes } from '../dados/colecoes'

/** /?teste=render&peca=slug : desenha uma peça sozinha, fundo transparente, para gerar a prévia */
export default function RenderPeca() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const slug = new URLSearchParams(location.search).get('peca')
    const peca = colecoes.flatMap((c) => c.pecas).find((p) => p.slug === slug)
    if (!peca?.midia.procedural) return
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    const canvas = ref.current!
    const r = criarRenderer(canvas, { pixelMax: 1 })
    r.setPixelRatio(1)
    r.setSize(800, 1000, false)
    const cena = new THREE.Scene()
    iluminar(cena, r)
    const p = montarPeca({
      modelo: peca.midia.procedural.modelo,
      cor: peca.cores[0].hex,
      comprimento: peca.midia.procedural.comprimento,
      cabide: true,
      qualidade: 1.2,
    })
    p.grupo.rotation.y = -0.32
    const caixa = new THREE.Box3().setFromObject(p.grupo)
    const centro = caixa.getCenter(new THREE.Vector3())
    const tam = caixa.getSize(new THREE.Vector3())
    p.grupo.position.sub(centro)
    cena.add(p.grupo)
    const cam = new THREE.PerspectiveCamera(22, 0.8, 0.1, 30)
    const d = Math.max(tam.y * 1.04, (tam.x * 1.25) / 0.8) / 2 / Math.tan(THREE.MathUtils.degToRad(11))
    cam.position.set(0, 0, d)
    cam.lookAt(0, 0, 0)
    r.render(cena, cam)
    document.body.dataset.pronto = 'sim'
  }, [])
  return <canvas ref={ref} width={800} height={1000} style={{ width: 800, height: 1000, display: 'block', background: 'transparent' }} />
}
