import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export function criarRenderer(canvas: HTMLCanvasElement, o: { sombras?: boolean; pixelMax?: number } = {}) {
  const r = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  })
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.pixelMax ?? 1.75))
  r.outputColorSpace = THREE.SRGBColorSpace
  r.toneMapping = THREE.NeutralToneMapping
  r.toneMappingExposure = 1.0
  r.setClearColor(0x000000, 0)
  if (o.sombras) {
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
  }
  return r
}

/** luz de estúdio quente e lateral, como nas fotos da marca */
export function iluminar(cena: THREE.Scene, renderer: THREE.WebGLRenderer, o: { sombras?: boolean } = {}) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const amb = new RoomEnvironment()
  cena.environment = pmrem.fromScene(amb, 0.04).texture
  cena.environmentIntensity = 0.5
  amb.dispose()
  pmrem.dispose()

  const chave = new THREE.DirectionalLight('#ffe0c2', 2.5)
  chave.position.set(-1.7, 2.7, 3.3)
  const contra = new THREE.DirectionalLight('#ffcf9e', 1.6)
  contra.position.set(2.8, 2.4, -2.2)
  const preenchimento = new THREE.DirectionalLight('#fff1e4', 0.55)
  preenchimento.position.set(2.2, 0.8, 3)
  const hemi = new THREE.HemisphereLight('#fff4e8', '#5a4033', 0.55)
  cena.add(chave, contra, preenchimento, hemi)

  if (o.sombras) {
    chave.castShadow = true
    chave.shadow.mapSize.set(2048, 2048)
    chave.shadow.bias = -0.0004
    chave.shadow.normalBias = 0.02
    chave.shadow.radius = 6
    const c = chave.shadow.camera
    c.left = -3.2
    c.right = 3.2
    c.top = 2.2
    c.bottom = -2.2
    c.near = 0.5
    c.far = 12
  }
  return { chave, contra, preenchimento, hemi }
}
