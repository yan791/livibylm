/*
  Cena da arara (Ato 4): barra dourada com uma peça 3D por coleção.
  Cada peça balança como um cabide de verdade (pêndulo amortecido).
  Computador: hover destaca a peça. Celular: carrossel por arraste.
*/
import * as THREE from 'three'
import { criarRenderer, iluminar } from './base'
import { montarPeca, materialOuro, type ModeloPeca, type PecaMontada } from './pecas'

export type ItemArara = { slug: string; modelo: ModeloPeca; cor: string; comprimento?: number }
type Eventos = {
  aoPassar: (i: number | null) => void
  aoClicar: (i: number) => void
  aoAtivo: (i: number) => void
}

type Pendurada = {
  m: PecaMontada
  pivo: THREE.Group
  giro: THREE.Group
  caixa: THREE.Mesh
  ang: number
  vel: number
  angX: number
  velX: number
  escala: number
  dim: number
  rotY: number
  chegada: number
  pousou: boolean
}

const Y_ARARA = 1.62
const ESPACO = 0.72
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export class CenaArara {
  private r: THREE.WebGLRenderer
  private cena = new THREE.Scene()
  private cam = new THREE.PerspectiveCamera(24, 1, 0.1, 60)
  private itens: Pendurada[] = []
  private arara: THREE.Mesh
  private ray = new THREE.Raycaster()
  private mouse = new THREE.Vector2(9, 9)
  private moveu = false
  private hover = -1
  private ativo = 0
  private deslocamento = 0
  private alvoDesl = 0
  private fundo = new THREE.Color('#ece5de')
  private relogio = new THREE.Clock()
  private raf = 0
  private rodando = false
  private iniciou = -1
  private larg = 1
  private alt = 1
  private arraste: { x0: number; d0: number; mexeu: boolean; id: number } | null = null
  private ultimoX = 0

  constructor(
    private canvas: HTMLCanvasElement,
    itens: ItemArara[],
    private ev: Eventos,
    private o: { celular: boolean; reduzido: boolean },
  ) {
    this.r = criarRenderer(canvas, { sombras: !o.celular, pixelMax: o.celular ? 1.5 : 1.75 })
    iluminar(this.cena, this.r, { sombras: !o.celular })

    this.arara = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 12, 20), materialOuro())
    this.arara.rotation.z = Math.PI / 2
    this.arara.position.y = Y_ARARA
    this.arara.scale.y = o.reduzido ? 1 : 0.0001
    this.cena.add(this.arara)

    if (!o.celular) {
      const parede = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.ShadowMaterial({ opacity: 0.1 }))
      parede.position.set(0, 1, -0.26)
      parede.receiveShadow = true
      this.cena.add(parede)
    }

    const invisivel = new THREE.MeshBasicMaterial({ visible: false })
    itens.forEach((it, i) => {
      const m = montarPeca({ modelo: it.modelo, cor: it.cor, comprimento: it.comprimento, qualidade: o.celular ? 0.6 : 1 })
      const pivo = new THREE.Group()
      const giro = new THREE.Group()
      pivo.position.set((i - (itens.length - 1) / 2) * ESPACO, Y_ARARA, 0)
      giro.add(m.grupo)
      pivo.add(giro)
      const tam = m.caixa.getSize(new THREE.Vector3())
      const centro = m.caixa.getCenter(new THREE.Vector3())
      const caixa = new THREE.Mesh(new THREE.BoxGeometry(Math.max(tam.x, 0.36), tam.y, Math.max(tam.z, 0.3)), invisivel)
      caixa.position.copy(centro)
      caixa.userData.indice = i
      giro.add(caixa)
      this.cena.add(pivo)
      this.itens.push({
        m,
        pivo,
        giro,
        caixa,
        ang: 0,
        vel: 0,
        angX: 0,
        velX: 0,
        escala: 1,
        dim: 0,
        rotY: 0,
        chegada: o.reduzido ? 1 : 0,
        pousou: o.reduzido,
      })
      if (!o.reduzido) pivo.visible = false
    })

    canvas.addEventListener('pointermove', this.aoMover)
    canvas.addEventListener('pointerleave', this.aoSair)
    canvas.addEventListener('pointerdown', this.aoApertar)
    window.addEventListener('pointerup', this.aoSoltar)
  }

  /* ---------- interface pública ---------- */

  tamanho(w: number, h: number) {
    this.larg = w
    this.alt = h
    this.r.setSize(w, h, false)
    this.cam.aspect = w / h
    const fov = THREE.MathUtils.degToRad(this.cam.fov)
    const topo = Y_ARARA + 0.08
    let base = Y_ARARA
    this.itens.forEach((it) => (base = Math.min(base, Y_ARARA + it.m.caixa.min.y)))
    base -= 0.06
    const altura = topo - base
    const largura = this.o.celular ? 0.62 : (this.itens.length - 1) * ESPACO + 0.62
    const dAlt = altura / 2 / Math.tan(fov / 2)
    const dLarg = largura / 2 / (Math.tan(fov / 2) * this.cam.aspect)
    const d = Math.max(dAlt, dLarg)
    this.cam.position.set(0, (topo + base) / 2, d)
    this.cam.lookAt(0, (topo + base) / 2, 0)
    this.cam.updateProjectionMatrix()
    this.render()
  }

  /** começa a chegada: a barra se desenha e as peças descem até a arara */
  chegar() {
    if (this.iniciou < 0) this.iniciou = this.relogio.getElapsedTime()
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

  setFundo(hex: string) {
    this.fundo.set(hex)
  }

  irPara(i: number) {
    this.ativo = Math.max(0, Math.min(this.itens.length - 1, i))
    this.alvoDesl = this.ativo
    this.ev.aoAtivo(this.ativo)
    this.empurrar(this.ativo, 0.35)
  }

  /** posições na tela (px) da base de cada peça, para os rótulos */
  rotulos() {
    return this.itens.map((it) => {
      const v = new THREE.Vector3(it.pivo.position.x, Y_ARARA + it.m.caixa.min.y, 0).project(this.cam)
      return { x: (v.x * 0.5 + 0.5) * this.larg, y: (-v.y * 0.5 + 0.5) * this.alt }
    })
  }

  /** foto da peça como está na tela, para a transição até a página da coleção */
  capturar(i: number) {
    this.render()
    const it = this.itens[i]
    const caixa = new THREE.Box3().setFromObject(it.giro)
    const pts = [0, 1].flatMap((a) =>
      [0, 1].flatMap((b) =>
        [0, 1].map((c) =>
          new THREE.Vector3(a ? caixa.max.x : caixa.min.x, b ? caixa.max.y : caixa.min.y, c ? caixa.max.z : caixa.min.z).project(
            this.cam,
          ),
        ),
      ),
    )
    const xs = pts.map((p) => (p.x * 0.5 + 0.5) * this.larg)
    const ys = pts.map((p) => (-p.y * 0.5 + 0.5) * this.alt)
    const rect = {
      x: Math.max(0, Math.min(...xs) - 6),
      y: Math.max(0, Math.min(...ys) - 6),
      w: 0,
      h: 0,
    }
    rect.w = Math.min(this.larg, Math.max(...xs) + 6) - rect.x
    rect.h = Math.min(this.alt, Math.max(...ys) + 6) - rect.y
    const k = this.canvas.width / this.larg
    const c = document.createElement('canvas')
    c.width = Math.round(rect.w * k)
    c.height = Math.round(rect.h * k)
    c.getContext('2d')!.drawImage(this.canvas, rect.x * k, rect.y * k, rect.w * k, rect.h * k, 0, 0, c.width, c.height)
    return { url: c.toDataURL('image/webp', 0.92), rect }
  }

  destruir() {
    this.ligar(false)
    this.canvas.removeEventListener('pointermove', this.aoMover)
    this.canvas.removeEventListener('pointerleave', this.aoSair)
    this.canvas.removeEventListener('pointerdown', this.aoApertar)
    window.removeEventListener('pointerup', this.aoSoltar)
    this.itens.forEach((it) => it.m.destruir())
    this.r.dispose()
  }

  /* ---------- interação ---------- */

  private aoMover = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect()
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.moveu = true
    if (this.arraste && e.pointerId === this.arraste.id) {
      const dx = e.clientX - this.arraste.x0
      if (Math.abs(dx) > 6) this.arraste.mexeu = true
      const pxPorPeca = (ESPACO / this.larguraVisivel()) * this.larg
      this.alvoDesl = Math.max(-0.35, Math.min(this.itens.length - 0.65, this.arraste.d0 - dx / pxPorPeca))
    }
    this.ultimoX = e.clientX
  }

  private aoSair = () => {
    this.mouse.set(9, 9)
    this.moveu = true
  }

  private aoApertar = (e: PointerEvent) => {
    if (this.o.celular) this.arraste = { x0: e.clientX, d0: this.alvoDesl, mexeu: false, id: e.pointerId }
    else this.arraste = { x0: e.clientX, d0: 0, mexeu: false, id: e.pointerId }
  }

  private aoSoltar = (e: PointerEvent) => {
    const a = this.arraste
    this.arraste = null
    if (!a || e.pointerId !== a.id) return
    if (this.o.celular) {
      if (a.mexeu) {
        this.irPara(Math.round(this.alvoDesl))
        return
      }
      const i = this.pegar()
      if (i === null) return
      if (i === this.ativo) this.ev.aoClicar(i)
      else this.irPara(i)
      return
    }
    if (a.mexeu) return
    const i = this.pegar()
    if (i !== null) this.ev.aoClicar(i)
  }

  private pegar() {
    this.ray.setFromCamera(this.mouse, this.cam)
    const hit = this.ray.intersectObjects(
      this.itens.map((it) => it.caixa),
      false,
    )[0]
    return hit ? (hit.object.userData.indice as number) : null
  }

  private empurrar(i: number, forca: number) {
    const it = this.itens[i]
    if (!it || this.o.reduzido) return
    it.vel += forca
    it.velX += forca * 0.35
  }

  private larguraVisivel() {
    const fov = THREE.MathUtils.degToRad(this.cam.fov)
    return 2 * this.cam.position.z * Math.tan(fov / 2) * this.cam.aspect
  }

  /* ---------- quadro a quadro ---------- */

  private loop = () => {
    if (!this.rodando) return
    this.raf = requestAnimationFrame(this.loop)
    this.passo()
  }

  private passo() {
    const dt = Math.min(this.relogio.getDelta(), 1 / 30)
    const t = this.relogio.getElapsedTime()

    // chegada: barra e peças
    if (this.iniciou >= 0 && !this.o.reduzido) {
      const tt = t - this.iniciou
      this.arara.scale.y = Math.max(0.0001, easeOut(Math.min(1, tt / 1.1)))
      this.itens.forEach((it, i) => {
        const c = Math.min(1, Math.max(0, (tt - 0.45 - i * 0.14) / 0.85))
        it.chegada = c
        it.pivo.visible = c > 0
        if (c >= 1 && !it.pousou) {
          it.pousou = true
          it.vel += (i % 2 ? 1 : -1) * 0.55
          it.velX += 0.2
        }
      })
    }

    // hover (computador)
    if (!this.o.celular && this.moveu) {
      this.moveu = false
      const i = this.pegar()
      const novo = i ?? -1
      if (novo !== this.hover) {
        if (novo >= 0) this.empurrar(novo, (this.ultimoX % 2 ? 1 : -1) * 0.32 + 0.12)
        this.hover = novo
        this.canvas.style.cursor = novo >= 0 ? 'pointer' : ''
        this.ev.aoPassar(novo >= 0 ? novo : null)
      }
    }

    // carrossel (celular)
    if (this.o.celular) {
      this.deslocamento += (this.alvoDesl - this.deslocamento) * Math.min(1, dt * 7)
      const x = (this.deslocamento - (this.itens.length - 1) / 2) * ESPACO
      this.cam.position.x = x
      this.cam.lookAt(x, this.cam.position.y, 0)
    }

    const destaque = this.o.celular ? this.ativo : this.hover
    this.itens.forEach((it, i) => {
      // pêndulo amortecido
      const k = 10.9
      it.vel += (-k * it.ang - 1.25 * it.vel) * dt
      it.ang += it.vel * dt
      it.velX += (-k * it.angX - 1.6 * it.velX) * dt
      it.angX += it.velX * dt
      const brisa = this.o.reduzido ? 0 : Math.sin(t * 0.7 + i * 2.1) * 0.006
      it.pivo.rotation.z = it.ang + brisa
      it.pivo.rotation.x = it.angX

      // queda até a arara
      it.pivo.position.y = Y_ARARA + (1 - easeOut(it.chegada)) * 1.1

      // giro lento para mostrar o volume; de frente quando em destaque
      const giroAlvo = this.o.reduzido || destaque === i ? 0 : 0.34 * Math.sin(t * 0.42 + i * 1.4)
      it.rotY += (giroAlvo - it.rotY) * Math.min(1, dt * 2.2)
      it.giro.rotation.y = it.rotY

      const escAlvo = destaque === i && !this.o.celular ? 1.06 : 1
      it.escala += (escAlvo - it.escala) * Math.min(1, dt * 6)
      it.pivo.scale.setScalar(it.escala)

      const dimAlvo = destaque >= 0 && destaque !== i ? 1 : 0
      it.dim += (dimAlvo - it.dim) * Math.min(1, dt * 5)
      it.m.tecidos.forEach((mat, j) => mat.color.copy(it.m.coresBase[j]).lerp(this.fundo, it.dim * 0.5))
    })

    this.render()
  }

  private render() {
    this.r.render(this.cena, this.cam)
  }
}
