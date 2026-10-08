/*
  Efeito tecido: ao passar o mouse (só no computador), a foto ondula de
  leve como cetim se movendo, com um brilho suave onde o mouse está.
  A foto normal fica sempre por baixo; o WebGL (three.js) só liga durante o
  efeito e desliga sozinho quando a foto volta ao repouso.
*/
import { useEffect, useRef } from 'react'
import { cn } from '../lib/cn'

type Motor = {
  iniciar: (canvas: HTMLCanvasElement, src: string) => Promise<void>
  tocar: (x: number, y: number) => void
  sair: () => void
  tamanho: (w: number, h: number) => void
  destruir: () => void
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec2 uMouse;
  uniform float uForca;
  uniform float uTempo;
  uniform vec2 uEscala;
  uniform vec2 uDesloc;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    float d = distance(uv, uMouse);
    float queda = smoothstep(0.6, 0.0, d);
    float onda = sin(uv.y * 20.0 - uTempo * 2.0 + uv.x * 5.0) * 0.6 + sin(uv.x * 13.0 + uTempo * 1.3) * 0.4;
    vec2 off = vec2(onda * 0.0035, onda * 0.006) * uForca * (0.3 + queda);
    off += (uMouse - uv) * 0.018 * queda * uForca;
    vec4 c = texture2D(uTex, (uv + off) * uEscala + uDesloc);
    float brilho = smoothstep(0.4, 0.0, d) * 0.07 * uForca * (0.65 + 0.35 * onda);
    c.rgb += brilho;
    gl_FragColor = c;
  }
`

function criarMotor(): Motor {
  let pronto = false
  let raf = 0
  let forca = 0
  let alvo = 0
  let ultimo = 0
  let tempo = 0
  const mouse = { x: 0.5, y: 0.5, ax: 0.5, ay: 0.5 }
  // carregado sob demanda, só quando a visitante interage
  let THREE: typeof import('three') | null = null
  let r: import('three').WebGLRenderer | null = null
  let cena: import('three').Scene | null = null
  let cam: import('three').Camera | null = null
  let mat: import('three').ShaderMaterial | null = null
  let tex: import('three').Texture | null = null
  let tela: HTMLCanvasElement | null = null
  let larg = 1
  let alt = 1

  const ajustarCapa = () => {
    if (!mat || !tex?.image) return
    const img = tex.image as HTMLImageElement
    const arTex = img.width / img.height
    const arCaixa = larg / alt
    if (arCaixa > arTex) {
      const s = arTex / arCaixa
      mat.uniforms.uEscala.value.set(1, s)
      mat.uniforms.uDesloc.value.set(0, (1 - s) / 2)
    } else {
      const s = arCaixa / arTex
      mat.uniforms.uEscala.value.set(s, 1)
      mat.uniforms.uDesloc.value.set((1 - s) / 2, 0)
    }
  }

  const quadro = (t: number) => {
    const dt = Math.min(0.05, (t - (ultimo || t)) / 1000)
    ultimo = t
    tempo += dt
    forca += (alvo - forca) * Math.min(1, dt * (alvo > forca ? 5 : 2.4))
    mouse.ax += (mouse.x - mouse.ax) * Math.min(1, dt * 8)
    mouse.ay += (mouse.y - mouse.ay) * Math.min(1, dt * 8)
    if (mat && r && cena && cam) {
      mat.uniforms.uForca.value = forca
      mat.uniforms.uTempo.value = tempo
      mat.uniforms.uMouse.value.set(mouse.ax, 1 - mouse.ay)
      r.render(cena, cam)
    }
    if (tela) tela.style.opacity = forca > 0.01 ? '1' : '0'
    if (alvo === 0 && forca < 0.005) {
      raf = 0
      ultimo = 0
      return
    }
    raf = requestAnimationFrame(quadro)
  }

  const ligar = () => {
    if (!raf && pronto) raf = requestAnimationFrame(quadro)
  }

  return {
    async iniciar(canvas, src) {
      if (pronto || THREE) return
      tela = canvas
      THREE = await import('three')
      r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' })
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      r.outputColorSpace = THREE.LinearSRGBColorSpace
      r.setSize(larg, alt, false)
      cena = new THREE.Scene()
      cam = new THREE.Camera()
      tex = await new THREE.TextureLoader().loadAsync(src)
      tex.colorSpace = THREE.NoColorSpace
      tex.minFilter = THREE.LinearFilter
      tex.generateMipmaps = false
      mat = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTex: { value: tex },
          uMouse: { value: new THREE.Vector2(0.5, 0.5) },
          uForca: { value: 0 },
          uTempo: { value: 0 },
          uEscala: { value: new THREE.Vector2(1, 1) },
          uDesloc: { value: new THREE.Vector2(0, 0) },
        },
      })
      cena.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat))
      ajustarCapa()
      pronto = true
      ligar()
    },
    tocar(x, y) {
      mouse.x = x
      mouse.y = y
      alvo = 1
      ligar()
    },
    sair() {
      alvo = 0
      ligar()
    },
    tamanho(w, h) {
      larg = Math.max(1, w)
      alt = Math.max(1, h)
      r?.setSize(larg, alt, false)
      ajustarCapa()
    },
    destruir() {
      cancelAnimationFrame(raf)
      mat?.dispose()
      tex?.dispose()
      r?.dispose()
      r?.forceContextLoss()
    },
  }
}

export function FotoTecido({
  src,
  alt,
  className,
  imgStyle,
  carregamento = 'lazy',
}: {
  src: string
  alt: string
  className?: string
  imgStyle?: React.CSSProperties
  carregamento?: 'lazy' | 'eager'
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const motor = useRef<Motor | null>(null)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      motor.current?.tamanho(el.clientWidth, el.clientHeight)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      motor.current?.destruir()
      motor.current = null
    }
  }, [])

  const tocar = (e: React.PointerEvent) => {
    const el = caixa.current
    if (!el || !canvas.current) return
    if (!motor.current) {
      motor.current = criarMotor()
      motor.current.tamanho(el.clientWidth, el.clientHeight)
      motor.current.iniciar(canvas.current, src)
    }
    const r = el.getBoundingClientRect()
    motor.current.tocar((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
  }

  // só com mouse: no celular o efeito não liga e o three.js (~190 KB) nem é baixado,
  // evitando o engasgo no primeiro toque numa foto
  return (
    <div
      ref={caixa}
      className={cn('tecido', className)}
      onPointerEnter={(e) => e.pointerType === 'mouse' && tocar(e)}
      onPointerMove={(e) => e.pointerType === 'mouse' && tocar(e)}
      onPointerLeave={() => motor.current?.sair()}
    >
      <img src={src} alt={alt} draggable={false} loading={carregamento} style={imgStyle} />
      <canvas ref={canvas} className="tecido-canvas" aria-hidden="true" />
    </div>
  )
}
