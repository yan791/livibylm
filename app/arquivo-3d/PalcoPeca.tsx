/*
  Palco da peça. Usa a melhor mídia disponível, nesta ordem:
  1) modelo 3D .glb  2) fotos 360° com giro por arraste
  3) peça 3D desenhada em código  4) foto recortada com leve parallax.
  Mostra uma prévia enquanto o 3D carrega.
*/
import { useEffect, useRef, useState } from 'react'
import type { Colecao, Peca } from '../dados/colecoes'
import { ponte } from '../lib/transicao'
import { useCelular, useReduzido, temWebGL } from '../lib/midia'
import { cn } from '../lib/cn'
import type { CenaPalco, Vista } from '../tres/palco'
import { Espaco } from './Espaco'
import { Girar } from './icones'

export function PalcoPeca({ colecao, peca, cor }: { colecao: Colecao; peca: Peca; cor: string }) {
  const m = peca.midia
  const usa3D = (m.glb || m.procedural) && temWebGL()
  const previa = ponte.colecao === colecao.slug && ponte.imagem && peca.slug === colecao.pecas[0].slug ? ponte.imagem : `/img/pecas/${peca.slug}.webp`

  return (
    <div className="palco" style={{ viewTransitionName: 'peca' } as React.CSSProperties}>
      {usa3D ? (
        <Palco3D peca={peca} cor={cor} previa={previa} />
      ) : m.giro360?.length ? (
        <Giro360 quadros={m.giro360} />
      ) : m.recorte ? (
        <Parallax src={m.recorte} />
      ) : (
        <Espaco rotulo="Foto da peça" />
      )}
    </div>
  )
}

function Palco3D({ peca, cor, previa }: { peca: Peca; cor: string; previa: string }) {
  const caixa = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const cena = useRef<CenaPalco | null>(null)
  const celular = useCelular()
  const reduzido = useReduzido()
  const [pronta, setPronta] = useState(false)
  const [mexeu, setMexeu] = useState(false)

  useEffect(() => {
    let viva = true
    let ro: ResizeObserver | null = null
    let io: IntersectionObserver | null = null
    import('../tres/palco').then(({ CenaPalco }) => {
      if (!viva || !canvas.current || !caixa.current) return
      const c = new CenaPalco(canvas.current, { celular, reduzido })
      cena.current = c
      c.aoPronto = () => setPronta(true)
      const medir = () => {
        const r = caixa.current!.getBoundingClientRect()
        c.tamanho(r.width, r.height)
      }
      medir()
      ro = new ResizeObserver(medir)
      ro.observe(caixa.current)
      io = new IntersectionObserver(([e]) => c.ligar(e.isIntersecting))
      io.observe(caixa.current)
      window.dispatchEvent(new CustomEvent('livi:palco'))
    })
    return () => {
      viva = false
      ro?.disconnect()
      io?.disconnect()
      cena.current?.destruir()
      cena.current = null
    }
  }, [celular, reduzido])

  // troca de peça ou de cor
  useEffect(() => {
    const mostrar = () => {
      const c = cena.current
      if (!c) return
      if (peca.midia.glb) c.mostrar({ tipo: 'glb', src: peca.midia.glb })
      else if (peca.midia.procedural)
        c.mostrar({ tipo: 'procedural', modelo: peca.midia.procedural.modelo, cor, comprimento: peca.midia.procedural.comprimento })
    }
    if (cena.current) mostrar()
    window.addEventListener('livi:palco', mostrar)
    return () => window.removeEventListener('livi:palco', mostrar)
  }, [peca, cor])

  const vista = (v: Vista) => {
    setMexeu(true)
    cena.current?.vista(v)
  }

  return (
    <div className="palco3d" ref={caixa}>
      <img src={previa} alt="" className={cn('palco-previa', pronta && 'some')} draggable={false} />
      <canvas
        ref={canvas}
        className={cn('palco-canvas', pronta && 'pronta')}
        aria-label={`Peça ${peca.nome} em 3D. Arraste para girar.`}
        role="img"
        onPointerDown={() => setMexeu(true)}
      />
      <div className="palco-vistas" role="group" aria-label="Ver a peça de">
        {(['frente', 'lado', 'costas'] as Vista[]).map((v) => (
          <button key={v} type="button" onClick={() => vista(v)}>
            {v === 'frente' ? 'Frente' : v === 'lado' ? 'Lado' : 'Costas'}
          </button>
        ))}
      </div>
      <p className={cn('palco-dica', mexeu && 'some')}>
        <Girar className="ico" />
        {celular ? 'Arraste para girar. Pinça para aproximar.' : 'Arraste para girar. Role para aproximar.'}
      </p>
      <span className="palco-selo">3D</span>
    </div>
  )
}

/** sequência de fotos 360°: arraste para girar */
function Giro360({ quadros }: { quadros: string[] }) {
  const [i, setI] = useState(0)
  const ini = useRef<{ x: number; i: number } | null>(null)
  useEffect(() => {
    quadros.forEach((q) => {
      const im = new Image()
      im.src = q
    })
  }, [quadros])
  return (
    <div
      className="palco360"
      onPointerDown={(e) => {
        ini.current = { x: e.clientX, i }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!ini.current) return
        const passo = Math.round((e.clientX - ini.current.x) / 12)
        setI((((ini.current.i - passo) % quadros.length) + quadros.length) % quadros.length)
      }}
      onPointerUp={() => (ini.current = null)}
    >
      <img src={quadros[i]} alt="" draggable={false} />
      <p className="palco-dica">
        <Girar className="ico" /> Arraste para girar
      </p>
    </div>
  )
}

/** último recurso: foto recortada com leve parallax ao mover o mouse */
function Parallax({ src }: { src: string }) {
  const [p, setP] = useState({ x: 0, y: 0 })
  return (
    <div
      className="palco-parallax"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setP({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 })
      }}
      onPointerLeave={() => setP({ x: 0, y: 0 })}
    >
      <img
        src={src}
        alt=""
        style={{ transform: `perspective(900px) rotateY(${p.x * 10}deg) rotateX(${-p.y * 6}deg) translate3d(${p.x * 14}px, ${p.y * 10}px, 0)` }}
        draggable={false}
      />
    </div>
  )
}
