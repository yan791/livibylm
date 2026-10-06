/*
  Peças 3D desenhadas em código (three.js).
  Cada peça é uma superfície paramétrica: um "tubo" de tecido descrito pelo
  perfil do corpo (largura e profundidade em cada altura), pela borda de cima
  (decote, cava, costas), pela barra e por deslocamentos (dobras, drapeado,
  franzido, recortes). Unidades em metros, eixo Y para cima, frente em +Z.
*/
import * as THREE from 'three'

export type ModeloPeca =
  | 'halter-longo'
  | 'drapeado'
  | 'conjunto'
  | 'top-drapeado'
  | 'saia'
  | 'saia-lapis'
  | 'tomara-que-caia'

export type OpcoesPeca = {
  modelo: ModeloPeca
  cor: string
  comprimento?: number
  /** qualidade da malha (1 = alta, 0.6 = celular) */
  qualidade?: number
  /** mostra gancho e cabide */
  cabide?: boolean
}

export type PecaMontada = {
  grupo: THREE.Group
  /** materiais de tecido (para escurecer e clarear no hover) */
  tecidos: THREE.MeshPhysicalMaterial[]
  coresBase: THREE.Color[]
  /** caixa da peça, em coordenadas locais do grupo (origem = ponto da arara) */
  caixa: THREE.Box3
  destruir: () => void
}

/* ---------- utilitários ---------- */

const PI = Math.PI
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const sm = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const gauss = (x: number, s: number) => Math.exp(-(x * x) / (2 * s * s))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const envolver = (a: number) => {
  let x = (a + PI) % (2 * PI)
  if (x < 0) x += 2 * PI
  return x - PI
}

/** interpolação cúbica monótona (Fritsch-Carlson): sem ondulações falsas no perfil */
function monotona(xs: number[], ys: number[]) {
  const n = xs.length
  const dx: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i]
    m[i] = (ys[i + 1] - ys[i]) / dx[i]
  }
  const t: number[] = new Array(n)
  t[0] = m[0]
  t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / m[i]
    const b = t[i + 1] / m[i]
    const s = a * a + b * b
    if (s > 9) {
      const tau = 3 / Math.sqrt(s)
      t[i] = tau * a * m[i]
      t[i + 1] = tau * b * m[i]
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (i < n - 2 && x > xs[i + 1]) i++
    const h = dx[i]
    const s = (x - xs[i]) / h
    const s2 = s * s
    const s3 = s2 * s
    return (
      (2 * s3 - 3 * s2 + 1) * ys[i] +
      (s3 - 2 * s2 + s) * h * t[i] +
      (-2 * s3 + 3 * s2) * ys[i + 1] +
      (s3 - s2) * h * t[i + 1]
    )
  }
}

type Chave = [y: number, largura: number, profundidade: number]

function perfil(chaves: Chave[]) {
  const ord = [...chaves].sort((a, b) => a[0] - b[0])
  const ys = ord.map((c) => c[0])
  const w = monotona(ys, ord.map((c) => c[1]))
  const d = monotona(ys, ord.map((c) => c[2]))
  return (y: number): [number, number] => [w(y), d(y)]
}

/* ---------- textura de trama (normal map gerado uma vez) ---------- */

let tramaCache: THREE.DataTexture | null = null
function trama() {
  if (tramaCache) return tramaCache
  const N = 256
  const h = new Float32Array(N * N)
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const ruido = new Float32Array(N * N).map(() => rnd())
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const fio = Math.sin((x / N) * PI * 2 * 64) * 0.5 + Math.sin((y / N) * PI * 2 * 64) * 0.5
      const r = ruido[y * N + x] * 0.6 + ruido[((y + 1) % N) * N + x] * 0.4
      h[y * N + x] = fio * 0.35 + r * 0.65
    }
  const data = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const hx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)]
      const hy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x]
      const v = new THREE.Vector3(-hx * 1.2, -hy * 1.2, 1).normalize()
      const i = (y * N + x) * 4
      data[i] = (v.x * 0.5 + 0.5) * 255
      data[i + 1] = (v.y * 0.5 + 0.5) * 255
      data[i + 2] = (v.z * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  tramaCache = tex
  return tex
}

type TipoTecido = 'cetim' | 'crepe' | 'alfaiataria'

function tecido(tipo: TipoTecido, hex: string) {
  const cor = new THREE.Color(hex)
  const lum = cor.r * 0.2126 + cor.g * 0.7152 + cor.b * 0.0722
  const escuro = lum < 0.05
  const brilho = cor.clone().lerp(new THREE.Color('#ffffff'), escuro ? 0.18 : 0.35)
  const base = {
    color: cor,
    metalness: 0,
    side: THREE.DoubleSide,
    normalMap: trama(),
  }
  if (tipo === 'cetim')
    return new THREE.MeshPhysicalMaterial({
      ...base,
      roughness: escuro ? 0.42 : 0.3,
      sheen: escuro ? 0.45 : 0.55,
      sheenRoughness: 0.35,
      sheenColor: brilho,
      specularIntensity: escuro ? 0.32 : 0.85,
      envMapIntensity: escuro ? 0.35 : 1,
      clearcoat: escuro ? 0 : 0.12,
      clearcoatRoughness: 0.4,
      anisotropy: 0.55,
      normalScale: new THREE.Vector2(0.05, 0.05),
    })
  if (tipo === 'crepe')
    return new THREE.MeshPhysicalMaterial({
      ...base,
      roughness: 0.78,
      sheen: 0.9,
      sheenRoughness: 0.55,
      sheenColor: brilho,
      specularIntensity: 0.4,
      normalScale: new THREE.Vector2(0.22, 0.22),
    })
  return new THREE.MeshPhysicalMaterial({
    ...base,
    roughness: 0.6,
    sheen: 0.45,
    sheenRoughness: 0.5,
    sheenColor: brilho,
    specularIntensity: 0.55,
    normalScale: new THREE.Vector2(0.12, 0.12),
  })
}

/* ---------- superfície de tecido ---------- */

type Superficie = {
  perfil: (y: number) => [number, number]
  /** borda de cima por ângulo (a = 0 frente, ±PI costas) */
  topo: (a: number) => number
  barra: (a: number) => number
  desloc?: (y: number, a: number) => number
  expoente?: number
  fenda?: { a: number; ate: number; largura: number }
  segU: number
  segV: number
}

function superficie(s: Superficie, mat: THREE.Material) {
  const U = s.segU
  const V = s.segV
  const n = s.expoente ?? 2.2
  const aberta = !!s.fenda
  const a0 = aberta ? s.fenda!.a : PI
  const pos = new Float32Array((U + 1) * (V + 1) * 3)
  const uv = new Float32Array((U + 1) * (V + 1) * 2)
  const e = 2 / n

  const ponto = (a: number, y: number, i: number) => {
    const [w, d] = s.perfil(y)
    const sa = Math.sin(a)
    const ca = Math.cos(a)
    const x = w * Math.sign(sa) * Math.pow(Math.abs(sa), e)
    const z = d * Math.sign(ca) * Math.pow(Math.abs(ca), e)
    let nx = x / (w * w)
    let nz = z / (d * d)
    const l = Math.hypot(nx, nz) || 1
    nx /= l
    nz /= l
    const r = s.desloc ? s.desloc(y, envolver(a)) : 0
    pos[i] = x + nx * r
    pos[i + 1] = y
    pos[i + 2] = z + nz * r
  }

  for (let j = 0; j <= U; j++) {
    const phi = (j / U) * 2 * PI
    const aNom = a0 + phi
    const yb = s.barra(envolver(aNom))
    const yt = s.topo(envolver(aNom))
    for (let i = 0; i <= V; i++) {
      // mais linhas perto da borda de cima, onde mora o detalhe
      const t = i / V
      const tt = 1 - Math.pow(1 - t, 1.25)
      const y = lerp(yb, yt, tt)
      let a = aNom
      if (aberta) {
        const f = s.fenda!
        const g = f.largura * (1 - sm(yb, f.ate, y))
        a = a0 + g / 2 + phi * ((2 * PI - g) / (2 * PI))
      }
      const k = j * (V + 1) + i
      ponto(a, y, k * 3)
      uv[k * 2] = (j / U) * 6
      uv[k * 2 + 1] = y * 5
    }
  }

  // normais por diferenças centrais na grade (sem costura visível)
  const nor = new Float32Array(pos.length)
  const idx = (j: number, i: number) => (j * (V + 1) + i) * 3
  const du = new THREE.Vector3()
  const dv = new THREE.Vector3()
  const nn = new THREE.Vector3()
  for (let j = 0; j <= U; j++) {
    let jA = j - 1
    let jB = j + 1
    if (!aberta) {
      if (jA < 0) jA = U - 1
      if (jB > U) jB = 1
    } else {
      jA = Math.max(0, jA)
      jB = Math.min(U, jB)
    }
    for (let i = 0; i <= V; i++) {
      const iA = Math.max(0, i - 1)
      const iB = Math.min(V, i + 1)
      const pA = idx(jA, i)
      const pB = idx(jB, i)
      du.set(pos[pB] - pos[pA], pos[pB + 1] - pos[pA + 1], pos[pB + 2] - pos[pA + 2])
      const qA = idx(j, iA)
      const qB = idx(j, iB)
      dv.set(pos[qB] - pos[qA], pos[qB + 1] - pos[qA + 1], pos[qB + 2] - pos[qA + 2])
      nn.crossVectors(du, dv).normalize()
      const k = idx(j, i)
      nor[k] = nn.x
      nor[k + 1] = nn.y
      nor[k + 2] = nn.z
    }
  }
  const ind: number[] = []
  for (let j = 0; j < U; j++)
    for (let i = 0; i < V; i++) {
      const a = j * (V + 1) + i
      const b = (j + 1) * (V + 1) + i
      ind.push(a, b, b + 1, a, b + 1, a + 1)
    }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setIndex(ind)
  geo.computeTangents()
  const malha = new THREE.Mesh(geo, mat)
  malha.castShadow = true
  malha.receiveShadow = true

  // acabamento: um rolinho fino nas bordas de cima e de baixo dá espessura ao tecido
  const borda = (linha: number, raio: number) => {
    const pts: THREE.Vector3[] = []
    for (let j = 0; j <= U; j += 2) {
      const k = idx(j, linha)
      pts.push(new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2]))
    }
    if (!aberta) pts.pop()
    const curva = new THREE.CatmullRomCurve3(pts, !aberta, 'centripetal')
    const tubo = new THREE.Mesh(new THREE.TubeGeometry(curva, pts.length * 2, raio, 6, !aberta), mat)
    tubo.castShadow = true
    return tubo
  }
  return { malha, bordas: [borda(0, 0.0028), borda(V, 0.0032)] }
}

/* ---------- moldes ---------- */

function topoHalter(o: { pescoco: number; cava: number; costas: number; frente?: number; fimCava?: number }) {
  const frente = o.frente ?? 0.42
  const fimCava = o.fimCava ?? 1.06
  return (a: number) => {
    const x = Math.abs(a)
    if (x <= frente) return o.pescoco
    if (x <= fimCava) {
      const t = (x - frente) / (fimCava - frente)
      return o.cava + (o.pescoco - o.cava) * Math.pow(1 - t, 1.35)
    }
    const debaixo = o.cava - 0.012 * sm(fimCava, 1.8, x)
    return lerp(debaixo, o.costas, sm(1.8, 2.25, x))
  }
}

function golaHalter(mat: THREE.Material, y: number, w: number, d: number, segU: number) {
  const g = new THREE.Group()
  const altura = 0.034
  const faixa = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.04, altura, segU, 1, true), mat)
  faixa.scale.set(w, 1, d)
  faixa.position.y = y + altura / 2
  faixa.castShadow = true
  g.add(faixa)
  for (const [yy, s] of [
    [y + altura, 1.0],
    [y, 1.04],
  ] as const) {
    const anel = new THREE.Mesh(new THREE.TorusGeometry(1, 0.003 / w, 6, segU), mat)
    anel.rotation.x = PI / 2
    anel.scale.set(w * s, d * s, w)
    anel.position.y = yy
    g.add(anel)
  }
  return g
}

function alca(mat: THREE.Material, y: number, w: number, d: number, segU: number) {
  const anel = new THREE.Mesh(new THREE.TorusGeometry(1, 0.004 / w, 8, segU), mat)
  anel.rotation.x = PI / 2
  anel.scale.set(w, d, w)
  anel.position.y = y
  anel.castShadow = true
  return anel
}

const quedaFrente = (a: number, larg: number) => Math.pow(Math.cos(Math.min(Math.abs(a) / larg, 1) * (PI / 2)), 1.5)

function halterLongo(mat: THREE.Material, q: number, comprimento?: number) {
  const barraY = comprimento ?? 0.08
  const p = perfil([
    [1.46, 0.06, 0.056],
    [1.42, 0.062, 0.058],
    [1.36, 0.086, 0.076],
    [1.3, 0.12, 0.101],
    [1.24, 0.152, 0.123],
    [1.2, 0.161, 0.128],
    [1.12, 0.153, 0.119],
    [1.03, 0.149, 0.113],
    [0.95, 0.161, 0.119],
    [0.88, 0.183, 0.125],
    [0.7, 0.193, 0.131],
    [0.45, 0.201, 0.139],
    [0.2, 0.213, 0.147],
    [0.0, 0.222, 0.153],
  ])
  const comFenda = barraY < 0.4
  const s = superficie(
    {
      perfil: p,
      topo: topoHalter({ pescoco: 1.425, cava: 1.235, costas: barraY > 0.85 ? 1.06 : 1.0 }),
      barra: (a) => barraY + 0.006 * Math.sin(3 * a),
      expoente: 2.2,
      fenda: comFenda ? { a: 0.95, ate: 0.52, largura: 0.16 } : undefined,
      desloc: (y, a) => {
        const desce = sm(0.95, 0.2, y)
        const dobras =
          Math.sin(6 * a + 0.6) * 0.55 + Math.sin(9 * a + 1.7 + 4 * y) * 0.3 + Math.sin(13 * a + 0.4 - 3 * y) * 0.15
        const cowl = 0.005 * gauss(y - (1.37 - 0.03 * Math.cos(a * 1.6)), 0.012) * quedaFrente(a, 0.9)
        const busto = 0.006 * gauss(y - 1.215, 0.035) * gauss(Math.abs(a) - 0.45, 0.3)
        return 0.012 * desce * dobras + cowl + busto
      },
      segU: Math.round(180 * q),
      segV: Math.round((comFenda ? 170 : 110) * q),
    },
    mat,
  )
  const g = new THREE.Group()
  g.add(s.malha, ...s.bordas, golaHalter(mat, 1.42, 0.064, 0.06, Math.round(64 * q)))
  return { grupo: g, topoPendurar: 1.455, tipo: 'halter' as const }
}

function drapeado(mat: THREE.Material, q: number, comprimento?: number) {
  const barraY = comprimento ?? 0.6
  const p = perfil([
    [1.46, 0.062, 0.058],
    [1.42, 0.064, 0.06],
    [1.36, 0.092, 0.08],
    [1.3, 0.125, 0.104],
    [1.24, 0.16, 0.128],
    [1.18, 0.172, 0.134],
    [1.1, 0.176, 0.134],
    [1.05, 0.17, 0.128],
    [1.01, 0.134, 0.097],
    [0.98, 0.141, 0.1],
    [0.92, 0.17, 0.114],
    [0.85, 0.184, 0.122],
    [0.72, 0.19, 0.126],
    [0.6, 0.194, 0.128],
    [0.35, 0.2, 0.134],
    [0.1, 0.21, 0.141],
  ])
  const cs = [1.38, 1.335, 1.29, 1.25]
  const fundo = [0, 0.02, 0.035, 0.045]
  const amp = [0.008, 0.012, 0.013, 0.01]
  const s = superficie(
    {
      perfil: p,
      topo: topoHalter({ pescoco: 1.425, cava: 1.24, costas: 1.12 }),
      barra: (a) => barraY + 0.005 * Math.cos(2 * a),
      expoente: 2.3,
      desloc: (y, a) => {
        let r = 0
        const queda = quedaFrente(a, 1.0)
        if (queda > 0.001) {
          const u = Math.cos(Math.min(Math.abs(a), 1) * (PI / 2)) ** 2
          for (let k = 0; k < 4; k++) {
            const c = cs[k] - fundo[k] * u
            r += amp[k] * queda * (gauss(y - c, 0.011) - 0.45 * gauss(y - c + 0.022, 0.009))
          }
        }
        r += 0.011 * gauss(y - 1.055, 0.03)
        r += 0.0026 * gauss(y - 1.005, 0.016) * Math.sin(46 * a)
        r += 0.003 * gauss(y - 1.09, 0.05) * Math.sin(17 * a)
        r += 0.005 * sm(0.95, 0.55, y) * (Math.sin(7 * a + 0.3) + 0.5 * Math.sin(11 * a + 1.1))
        r += 0.008 * sm(0.5, 0.1, y) * Math.sin(5 * a + 2.0)
        return r
      },
      segU: Math.round(200 * q),
      segV: Math.round(150 * q),
    },
    mat,
  )
  const g = new THREE.Group()
  g.add(s.malha, ...s.bordas, golaHalter(mat, 1.42, 0.066, 0.062, Math.round(64 * q)))
  return { grupo: g, topoPendurar: 1.455, tipo: 'halter' as const }
}

function topDrapeado(mat: THREE.Material, q: number, barraY = 0.8) {
  const p = perfil([
    [1.46, 0.06, 0.056],
    [1.42, 0.062, 0.058],
    [1.36, 0.09, 0.078],
    [1.3, 0.124, 0.102],
    [1.24, 0.16, 0.128],
    [1.18, 0.172, 0.132],
    [1.08, 0.178, 0.132],
    [0.98, 0.184, 0.132],
    [0.86, 0.196, 0.138],
    [0.78, 0.199, 0.141],
  ])
  const pescoco = 1.425
  const cava = 1.235
  const topo = (a: number) => {
    const x = Math.abs(a)
    if (x < 0.62) return 1.272 + (pescoco - 1.272) * Math.pow(x / 0.62, 1.8)
    if (x < 1.08) return cava + (pescoco - cava) * Math.pow(1 - (x - 0.62) / 0.46, 1.35)
    return lerp(cava - 0.012 * sm(1.08, 1.8, x), 1.0, sm(1.8, 2.25, x))
  }
  const s = superficie(
    {
      perfil: p,
      topo,
      barra: (a) => barraY + 0.008 * Math.cos(2 * a),
      expoente: 2.3,
      desloc: (y, a) => {
        const queda = quedaFrente(a, 1.1)
        let r = 0.017 * gauss(y - 1.275, 0.026) * queda
        const base = [1.245, 1.205, 1.165]
        const am = [0.01, 0.009, 0.006]
        for (let k = 0; k < 3; k++) {
          const c = base[k] + 0.05 * (Math.min(Math.abs(a), 0.9) / 0.9) ** 2
          r += am[k] * queda * (gauss(y - c, 0.012) - 0.4 * gauss(y - c + 0.024, 0.01))
        }
        r += 0.0045 * sm(1.15, 0.85, y) * Math.sin(8 * a + 0.5)
        return r
      },
      segU: Math.round(190 * q),
      segV: Math.round(110 * q),
    },
    mat,
  )
  const g = new THREE.Group()
  g.add(s.malha, ...s.bordas, alca(mat, 1.431, 0.063, 0.059, Math.round(64 * q)))
  return { grupo: g, topoPendurar: 1.445, tipo: 'halter' as const }
}

function saia(mat: THREE.Material, q: number, barraY = 0.58, lapis = false) {
  const p = lapis
    ? perfil([
        [1.03, 0.124, 0.09],
        [0.95, 0.15, 0.105],
        [0.88, 0.172, 0.112],
        [0.75, 0.17, 0.11],
        [0.6, 0.161, 0.104],
        [0.45, 0.156, 0.1],
      ])
    : perfil([
        [1.03, 0.13, 0.094],
        [0.98, 0.14, 0.1],
        [0.92, 0.165, 0.112],
        [0.86, 0.18, 0.12],
        [0.7, 0.188, 0.126],
        [0.5, 0.196, 0.131],
        [0.3, 0.205, 0.138],
        [0.1, 0.218, 0.148],
      ])
  const longa = barraY < 0.3
  const s = superficie(
    {
      perfil: p,
      topo: () => 1.03,
      barra: (a) => barraY + 0.004 * Math.sin(2 * a),
      expoente: lapis ? 2.4 : 2.25,
      desloc: (y, a) => {
        let r = 0.0022 * sm(0.99, 1.0, y)
        if (lapis) return r - 0.0012 * gauss(Math.abs(a) - 0.45, 0.012) - 0.0012 * gauss(Math.abs(a) - 2.6, 0.012)
        const k = longa ? 0.014 : 0.006
        r += k * sm(0.92, 0.2, y) * (Math.sin(7 * a + 0.4) + 0.6 * Math.sin(12 * a + 1.3 + 3 * y))
        return r
      },
      segU: Math.round(170 * q),
      segV: Math.round((longa ? 120 : 70) * q),
    },
    mat,
  )
  const g = new THREE.Group()
  g.add(s.malha, ...s.bordas)
  return { grupo: g, topoPendurar: 1.03, tipo: 'saia' as const }
}

function tomaraQueCaia(mat: THREE.Material, q: number, comprimento?: number) {
  const barraY = comprimento ?? 0.62
  const p = perfil([
    [1.27, 0.149, 0.118],
    [1.22, 0.158, 0.13],
    [1.17, 0.142, 0.112],
    [1.12, 0.132, 0.098],
    [1.03, 0.122, 0.088],
    [0.95, 0.148, 0.104],
    [0.88, 0.172, 0.112],
    [0.75, 0.17, 0.11],
    [0.62, 0.16, 0.104],
    [0.4, 0.153, 0.1],
  ])
  const s = superficie(
    {
      perfil: p,
      topo: (a) => {
        const x = Math.abs(a)
        return 1.235 + 0.023 * gauss(x - 0.38, 0.17) - 0.022 * gauss(x, 0.07)
      },
      barra: () => barraY,
      expoente: 2.4,
      desloc: (y, a) => {
        const x = Math.abs(a)
        let r = 0.01 * gauss(y - 1.215, 0.035) * gauss(x - 0.4, 0.25)
        r -= 0.0016 * gauss(x - 0.42, 0.012) + 0.0016 * gauss(x - 2.55, 0.012)
        r -= 0.0014 * gauss(y - 1.13, 0.0035)
        if (y > 1.13) r -= 0.0012 * gauss(a, 0.01)
        return r
      },
      segU: Math.round(200 * q),
      segV: Math.round(110 * q),
    },
    mat,
  )
  const g = new THREE.Group()
  g.add(s.malha, ...s.bordas)
  return { grupo: g, topoPendurar: 1.26, tipo: 'clip' as const }
}

/* ---------- cabide ---------- */

let ouroCache: THREE.MeshStandardMaterial | null = null
export function materialOuro() {
  if (!ouroCache)
    ouroCache = new THREE.MeshStandardMaterial({ color: '#c9a160', metalness: 1, roughness: 0.28, envMapIntensity: 1.1 })
  return ouroCache
}

function gancho(yArara: number, yFim: number) {
  const pts = [
    new THREE.Vector3(0, yArara - 0.024, 0.026),
    new THREE.Vector3(0, yArara + 0.006, 0.031),
    new THREE.Vector3(0, yArara + 0.03, 0.015),
    new THREE.Vector3(0, yArara + 0.032, -0.008),
    new THREE.Vector3(0, yArara + 0.014, -0.028),
    new THREE.Vector3(0, yArara - 0.018, -0.024),
    new THREE.Vector3(0, yArara - 0.046, -0.006),
    new THREE.Vector3(0, yArara - 0.075, 0),
    new THREE.Vector3(0, yFim, 0),
  ]
  const tubo = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 64, 0.0024, 8, false),
    materialOuro(),
  )
  tubo.castShadow = true
  return tubo
}

function cabideClip(yBarra: number, yArara: number) {
  const g = new THREE.Group()
  const ouro = materialOuro()
  const barra = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.36, 12), ouro)
  barra.rotation.z = PI / 2
  barra.position.y = yBarra
  g.add(barra, gancho(yArara, yBarra))
  const madeira = new THREE.MeshStandardMaterial({ color: '#2a1a12', roughness: 0.5, metalness: 0.1 })
  for (const sx of [-1, 1]) {
    const fio = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.03, 6), ouro)
    fio.position.set(sx * 0.15, yBarra - 0.015, 0)
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.036, 0.03), madeira)
    clip.position.set(sx * 0.152, yBarra - 0.045, 0)
    clip.castShadow = true
    g.add(fio, clip)
  }
  return g
}

/* ---------- montagem ---------- */

const TECIDO_DO_MODELO: Record<ModeloPeca, TipoTecido> = {
  'halter-longo': 'cetim',
  drapeado: 'crepe',
  conjunto: 'cetim',
  'top-drapeado': 'cetim',
  saia: 'crepe',
  'saia-lapis': 'alfaiataria',
  'tomara-que-caia': 'alfaiataria',
}

/** distância do topo da peça até a arara */
export const FOLGA_ARARA = 0.11

export function montarPeca(o: OpcoesPeca): PecaMontada {
  const q = o.qualidade ?? 1
  const mat = tecido(TECIDO_DO_MODELO[o.modelo], o.cor)
  const tecidos = [mat]
  const raiz = new THREE.Group()
  let topoPendurar = 1.455
  let tipo: 'halter' | 'clip' | 'saia' = 'halter'

  if (o.modelo === 'halter-longo') ({ topoPendurar, tipo } = add(halterLongo(mat, q, o.comprimento)))
  else if (o.modelo === 'drapeado') ({ topoPendurar, tipo } = add(drapeado(mat, q, o.comprimento)))
  else if (o.modelo === 'top-drapeado') ({ topoPendurar, tipo } = add(topDrapeado(mat, q, o.comprimento ?? 0.8)))
  else if (o.modelo === 'conjunto') {
    ;({ topoPendurar, tipo } = add(topDrapeado(mat, q, 0.82)))
    const matSaia = tecido('crepe', o.cor)
    tecidos.push(matSaia)
    add(saia(matSaia, q, o.comprimento ?? 0.58))
  } else if (o.modelo === 'saia') ({ topoPendurar, tipo } = add(saia(mat, q, o.comprimento ?? 0.58)))
  else if (o.modelo === 'saia-lapis') ({ topoPendurar, tipo } = add(saia(mat, q, o.comprimento ?? 0.5, true)))
  else ({ topoPendurar, tipo } = add(tomaraQueCaia(mat, q, o.comprimento)))

  function add(r: { grupo: THREE.Group; topoPendurar: number; tipo: 'halter' | 'clip' | 'saia' }) {
    raiz.add(r.grupo)
    return r
  }

  // a origem do grupo final fica no ponto em que o gancho encosta na arara
  const yArara = topoPendurar + FOLGA_ARARA
  if (o.cabide !== false) {
    if (tipo === 'halter') raiz.add(gancho(yArara, topoPendurar - 0.012))
    else raiz.add(cabideClip(topoPendurar + 0.05, yArara))
  }
  raiz.position.y = -yArara

  const grupo = new THREE.Group()
  grupo.add(raiz)
  const caixa = new THREE.Box3().setFromObject(raiz)

  return {
    grupo,
    tecidos,
    coresBase: tecidos.map((m) => m.color.clone()),
    caixa,
    destruir: () => {
      grupo.traverse((obj) => {
        const m = obj as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
      })
      tecidos.forEach((t) => t.dispose())
    },
  }
}
