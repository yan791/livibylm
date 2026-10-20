/*
  Peças de interface do painel: campos, interruptor, avisos rápidos (toast),
  confirmação e carregamento.
*/
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { mensagemDe } from './api'

/* ---------- campo com rótulo ---------- */

type PropsCampo = {
  rotulo: string
  dica?: ReactNode
  children: (id: string) => ReactNode
  className?: string
}

export function Campo({ rotulo, dica, children, className }: PropsCampo) {
  const id = useId()
  return (
    <div className={`campo ${className ?? ''}`}>
      <label htmlFor={id}>{rotulo}</label>
      {children(id)}
      {dica && <p className="campo-dica">{dica}</p>}
    </div>
  )
}

/* ---------- interruptor ---------- */

export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
  dica,
}: {
  ligado: boolean
  aoMudar: (v: boolean) => void
  rotulo: string
  dica?: string
}) {
  return (
    <label className="interruptor">
      <span className="interruptor-texto">
        <span>{rotulo}</span>
        {dica && <small>{dica}</small>}
      </span>
      <input type="checkbox" role="switch" checked={ligado} onChange={(e) => aoMudar(e.target.checked)} />
      <span className="interruptor-trilho" aria-hidden="true" />
    </label>
  )
}

/* ---------- avisos rápidos ---------- */

type Aviso = { id: number; texto: string; tipo: 'ok' | 'erro' }
let avisos: Aviso[] = []
const ouvintesAviso = new Set<() => void>()
let proximo = 1

export function avisar(texto: string, tipo: Aviso['tipo'] = 'ok') {
  const aviso = { id: proximo++, texto, tipo }
  avisos = [...avisos, aviso]
  ouvintesAviso.forEach((f) => f())
  setTimeout(() => {
    avisos = avisos.filter((a) => a.id !== aviso.id)
    ouvintesAviso.forEach((f) => f())
  }, tipo === 'erro' ? 6000 : 3200)
}

export function Avisos() {
  const lista = useSyncExternalStore(
    (cb) => {
      ouvintesAviso.add(cb)
      return () => ouvintesAviso.delete(cb)
    },
    () => avisos,
  )
  return (
    <div className="avisos" role="status" aria-live="polite">
      {lista.map((a) => (
        <p key={a.id} className={`aviso aviso-${a.tipo}`}>
          {a.texto}
        </p>
      ))}
    </div>
  )
}

/* ---------- confirmação ---------- */

type Pergunta = { titulo: string; texto?: string; botao: string; perigo?: boolean; responder: (v: boolean) => void }
let pergunta: Pergunta | null = null
const ouvintesPergunta = new Set<() => void>()

export function confirmar(o: Omit<Pergunta, 'responder'>) {
  return new Promise<boolean>((responder) => {
    pergunta = { ...o, responder }
    ouvintesPergunta.forEach((f) => f())
  })
}

export function Confirmacao() {
  const atual = useSyncExternalStore(
    (cb) => {
      ouvintesPergunta.add(cb)
      return () => ouvintesPergunta.delete(cb)
    },
    () => pergunta,
  )
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (atual && !d.open) d.showModal()
    if (!atual && d.open) d.close()
  }, [atual])

  const responder = (v: boolean) => {
    atual?.responder(v)
    pergunta = null
    ouvintesPergunta.forEach((f) => f())
  }

  return (
    <dialog ref={ref} className="confirmacao" onCancel={(e) => (e.preventDefault(), responder(false))}>
      {atual && (
        <>
          <h2>{atual.titulo}</h2>
          {atual.texto && <p>{atual.texto}</p>}
          <div className="confirmacao-botoes">
            <button type="button" className="botao botao-claro" onClick={() => responder(false)}>
              Cancelar
            </button>
            <button type="button" className={`botao ${atual.perigo ? 'botao-perigo' : ''}`} onClick={() => responder(true)} autoFocus>
              {atual.botao}
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}

/* ---------- carregar dados ---------- */

export function useCarregar<T>(buscar: () => Promise<T>, chave: unknown[] = []) {
  const [estado, setEstado] = useState<{ dados?: T; erro?: string; carregando: boolean }>({ carregando: true })
  const versao = useRef(0)
  const recarregar = useCallback(() => {
    const v = ++versao.current
    setEstado((e) => ({ ...e, carregando: true, erro: undefined }))
    buscar().then(
      (dados) => v === versao.current && setEstado({ dados, carregando: false }),
      (e) => v === versao.current && setEstado({ erro: mensagemDe(e), carregando: false }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, chave)
  useEffect(recarregar, [recarregar])
  return { ...estado, recarregar }
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="carregando" role="status">
      <span className="giro" aria-hidden="true" />
      {texto}
    </div>
  )
}

export function FalhaCarga({ erro, tentar }: { erro: string; tentar: () => void }) {
  return (
    <div className="falha">
      <p>{erro}</p>
      <button type="button" className="botao botao-claro" onClick={tentar}>
        Tentar de novo
      </button>
    </div>
  )
}

/* ---------- ícones ---------- */

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
)

export const Icone = {
  pecas: svg(<path d="M12 6v-.8c0-1 1.6-1.2 1.6-2.5 0-1-.7-1.7-1.6-1.7s-1.5.6-1.6 1.4M12 6 3.4 13.4c-.6.5-.3 1.6.5 1.6h16.2c.8 0 1.1-1.1.5-1.6Z" transform="translate(0 3)" />),
  colecoes: svg(
    <>
      <rect x="3" y="4" width="7" height="16" rx="1.5" />
      <rect x="14" y="4" width="7" height="10" rx="1.5" />
      <path d="M14 18h7" />
    </>,
  ),
  pessoas: svg(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.9c1.6.8 2.7 2.6 3 5.1" />
    </>,
  ),
  mais: svg(<path d="M12 5v14M5 12h14" />),
  voltar: svg(<path d="M15 5l-7 7 7 7" />),
  esquerda: svg(<path d="M14 6l-6 6 6 6" />),
  direita: svg(<path d="M10 6l6 6-6 6" />),
  cima: svg(<path d="M6 14l6-6 6 6" />),
  baixo: svg(<path d="M6 10l6 6 6-6" />),
  fechar: svg(<path d="M6 6l12 12M18 6 6 18" />),
  lixo: svg(<path d="M4 7h16M9 7V4.8c0-.4.4-.8.8-.8h4.4c.4 0 .8.4.8.8V7m-9 0 1 12.2c0 .5.5.8 1 .8h6.6c.5 0 1-.3 1-.8L18 7" />),
  olho: svg(
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>,
  ),
  olhoFechado: svg(<path d="M3 3l18 18M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.7 3.4M6.6 7.3A16.6 16.6 0 0 0 2.5 12S6 18.4 12 18.4c1.6 0 3-.4 4.2-1M9.9 9.9a2.9 2.9 0 0 0 4.2 4.2" />),
  foto: svg(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m21 16-5-5-8 8" />
    </>,
  ),
  link: svg(<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />),
  sair: svg(<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />),
  externo: svg(<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />),
  busca: svg(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>,
  ),
}
