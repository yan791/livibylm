/*
  Palco 3D da página da coleção: a peça gira e aproxima (OrbitControls).
  Aceita a peça desenhada em código ou um modelo .glb real.
*/
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { criarRenderer, iluminar } from './base'
import { montarPeca, type ModeloPeca } from './pecas'

export type MidiaPalco =
  | { tipo: 'procedural'; modelo: ModeloPeca; cor: string; comprimento?: number }
  | { tipo: 'glb'; src: string }

export type Vista = 'frente' | 'lado' | 'costas'

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export class CenaPalco {
  private r: THREE.WebGLRenderer
  private cena = new THREE.Scene()
  private cam = new THREE.PerspectiveCamera(26, 1, 0.05, 40)
  private ctl: OrbitControls
  private atual: { obj: THREE.Object3D; destruir: () => void } | null = null
  private saindo: { obj: THREE.Object3D; destruir: () => void; t: number } | null = null
  private entrada = 1
  private sombra: THREE.Mesh
  private raf = 0
  private rodando = false
  private relogio = new THREE.Clock()
  private viagem: { de: number; para: number; t: number } | null = null
  private larg = 1
  private alt = 1
  aoPronto: (() => void) | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private o: { celular: boolean; reduzido: boolean },
  ) {
    this.r = criarRenderer(canvas, { pixelMax: o.celular ? 1.6 : 2 })
    iluminar(this.cena, this.r)
    this.ctl = new OrbitControls(this.cam, canvas)
    this.ctl.enableDamping = true
    this.ctl.dampingFactor = 0.08
    this.ctl.enablePan = false
    this.ctl.minPolarAngle = Math.PI * 0.32
    this.ctl.maxPolarAngle = Math.PI * 0.62
    this.ctl.autoRotate = !o.reduzido
    this.ctl.autoRotateSpeed = 0.9
    this.ctl.rotateSpeed = 0.7
    this.ctl.zoomSpeed = 0.7
    this.ctl.addEventListener('start', () => {
      this.ctl.autoRotate = false
      this.viagem = null
    })

    // sombra macia no "chão" do palco
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
    grad.addColorStop(0, 'rgba(30,12,4,0.55)')
    grad.addColorStop(1, 'rgba(30,12,4,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    this.sombra = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
    )
    this.sombra.rotation.x = -Math.PI / 2
    this.cena.add(this.sombra)
  }

  async mostrar(m: MidiaPalco) {
    let obj: THREE.Object3D
    let destruir: () => void
    if (m.tipo === 'glb') {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const gltf = await new GLTFLoader().loadAsync(m.src)
      obj = gltf.scene
      destruir = () => obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    } else {
      const p = montarPeca({ modelo: m.modelo, cor: m.cor, comprimento: m.comprimento, cabide: false, qualidade: this.o.celular ? 0.75 : 1.15 })
      obj = p.grupo
      destruir = p.destruir
    }
    // centraliza a peça na origem
    const caixa = new THREE.Box3().setFromObject(obj)
    const centro = caixa.getCenter(new THREE.Vector3())
    const tam = caixa.getSize(new THREE.Vector3())
    const raiz = new THREE.Group()
    obj.position.sub(centro)
    raiz.add(obj)
    raiz.userData.altura = tam.y
    raiz.userData.largura = Math.max(tam.x, tam.z)

    // se ainda havia uma peça saindo, ela sai de vez
    if (this.saindo) {
      this.cena.remove(this.saindo.obj)
      this.saindo.destruir()
      this.saindo = null
    }
    if (this.atual) this.saindo = { ...this.atual, t: 0 }
    this.atual = { obj: raiz, destruir }
    this.entrada = this.o.reduzido ? 1 : 0
    this.cena.add(raiz)
    this.enquadrar()
    this.render()
    this.aoPronto?.()
  }

  vista(v: Vista) {
    this.ctl.autoRotate = false
    const alvo = v === 'frente' ? 0 : v === 'lado' ? Math.PI / 2 : Math.PI
    const de = this.ctl.getAzimuthalAngle()
    let delta = alvo - de
    while (delta > Math.PI) delta -= 2 * Math.PI
    while (delta < -Math.PI) delta += 2 * Math.PI
    this.viagem = { de, para: de + delta, t: 0 }
  }

  tamanho(w: number, h: number) {
    this.larg = w
    this.alt = h
    this.r.setSize(w, h, false)
    this.cam.aspect = w / h
    this.cam.updateProjectionMatrix()
    this.enquadrar()
    this.render()
  }

  ligar(sim: boolean) {
    if (sim && !this.rodando) {
      this.rodando = true
      this.relogio.getDelta()
      this.loop()
    } else if (!sim) {
      this.rodando = false
      cancelAnimationFrame(this.raf)
    }
  }

  destruir() {
    this.ligar(false)
    this.ctl.dispose()
    this.atual?.destruir()
    this.saindo?.destruir()
    this.r.dispose()
  }

  private enquadrar() {
    const raiz = this.atual?.obj
    if (!raiz) return
    const h = (raiz.userData.altura as number) || 1
    const w = (raiz.userData.largura as number) || 0.5
    const fov = THREE.MathUtils.degToRad(this.cam.fov)
    const dAlt = (h * 1.18) / 2 / Math.tan(fov / 2)
    const dLarg = (w * 1.9) / 2 / (Math.tan(fov / 2) * this.cam.aspect)
    const d = Math.max(dAlt, dLarg)
    const az = this.ctl.getAzimuthalAngle()
    this.cam.position.set(Math.sin(az) * d, h * 0.04, Math.cos(az) * d)
    this.ctl.target.set(0, 0, 0)
    this.ctl.minDistance = d * 0.38
    this.ctl.maxDistance = d * 1.25
    this.ctl.update()
    this.sombra.position.y = -h / 2 - 0.02
    this.sombra.scale.set(w * 2.2, w * 1.3, 1)
  }

  private loop = () => {
    if (!this.rodando) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(this.relogio.getDelta(), 1 / 30)

    if (this.viagem) {
      this.viagem.t = Math.min(1, this.viagem.t + dt / 0.9)
      const a = this.viagem.de + (this.viagem.para - this.viagem.de) * easeInOut(this.viagem.t)
      const off = this.cam.position.clone().sub(this.ctl.target)
      const s = new THREE.Spherical().setFromVector3(off)
      s.theta = a
      off.setFromSpherical(s)
      this.cam.position.copy(this.ctl.target).add(off)
      if (this.viagem.t >= 1) this.viagem = null
    }

    if (this.saindo) {
      this.saindo.t = Math.min(1, this.saindo.t + dt / 0.35)
      const k = easeInOut(this.saindo.t)
      this.saindo.obj.scale.setScalar(1 - 0.12 * k)
      this.saindo.obj.position.y = -0.15 * k
      this.saindo.obj.visible = k < 0.98
      if (this.saindo.t >= 1) {
        this.cena.remove(this.saindo.obj)
        this.saindo.destruir()
        this.saindo = null
      }
    }
    if (this.atual && this.entrada < 1) {
      const atraso = this.saindo ? 0 : 1
      this.entrada = Math.min(1, this.entrada + (dt / 0.6) * atraso)
      const k = easeInOut(this.entrada)
      this.atual.obj.scale.setScalar(0.9 + 0.1 * k)
      this.atual.obj.position.y = 0.12 * (1 - k)
      this.atual.obj.visible = this.saindo === null
    }

    this.ctl.update()
    this.render()
  }

  private render() {
    this.r.render(this.cena, this.cam)
  }
}
