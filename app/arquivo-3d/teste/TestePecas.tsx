import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { criarRenderer, iluminar } from '../tres/base'
import { montarPeca, type ModeloPeca } from '../tres/pecas'

/** página de teste: /?teste=pecas  (só para conferir as peças 3D) */
export default function TestePecas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const params = new URLSearchParams(location.search)
    const angulo = Number(params.get('ang') ?? 0)
    const r = criarRenderer(canvas, { sombras: true })
    const cena = new THREE.Scene()
    iluminar(cena, r, { sombras: true })
    const lista: [ModeloPeca, string][] = [
      ['halter-longo', '#efeae3'],
      ['drapeado', '#3e1d12'],
      ['conjunto', '#120c0b'],
      ['tomara-que-caia', '#0f0b0a'],
    ]
    lista.forEach(([modelo, cor], i) => {
      const p = montarPeca({ modelo, cor })
      p.grupo.position.set((i - 1.5) * 0.72, 1.62, 0)
      p.grupo.rotation.y = angulo
      cena.add(p.grupo)
    })
    const arara = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 6, 16),
      new THREE.MeshStandardMaterial({ color: '#c9a160', metalness: 1, roughness: 0.28 }),
    )
    arara.rotation.z = Math.PI / 2
    arara.position.y = 1.62
    cena.add(arara)
    const parede = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.ShadowMaterial({ opacity: 0.12 }))
    parede.position.set(0, 1, -0.24)
    parede.receiveShadow = true
    cena.add(parede)

    const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 50)
    cam.position.set(0, 0.9, 4.3)
    const ctl = new OrbitControls(cam, canvas)
    ctl.target.set(0, 0.88, 0)
    const tam = () => {
      const w = innerWidth
      const h = innerHeight
      r.setSize(w, h, false)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    }
    tam()
    addEventListener('resize', tam)
    let raf = 0
    const loop = () => {
      ctl.update()
      r.render(cena, cam)
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', tam)
      r.dispose()
    }
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#e9e3dd' }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
