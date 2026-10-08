import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const linha = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function SetaDiagonal(props: P) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" {...props}>
      <path d="M2 10 L10 2 M3.6 2 H10 V8.4" {...linha} strokeWidth="1.4" />
    </svg>
  )
}

export function SetaEsquerda(props: P) {
  return (
    <svg viewBox="0 0 16 12" aria-hidden="true" {...props}>
      <path d="M15 6 H1.5 M6 1.5 L1.5 6 L6 10.5" {...linha} strokeWidth="1.3" />
    </svg>
  )
}

export function SetaDireita(props: P) {
  return (
    <svg viewBox="0 0 16 12" aria-hidden="true" {...props}>
      <path d="M1 6 H14.5 M10 1.5 L14.5 6 L10 10.5" {...linha} strokeWidth="1.3" />
    </svg>
  )
}

export function Instagram(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" {...linha} strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4.1" {...linha} strokeWidth="1.5" />
      <circle cx="17.2" cy="6.8" r="1.05" fill="currentColor" />
    </svg>
  )
}

export function WhatsApp(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 3.4a8.6 8.6 0 0 0-7.4 13l-1.2 4.2 4.3-1.1A8.6 8.6 0 1 0 12 3.4Z"
        {...linha}
        strokeWidth="1.4"
      />
      <path
        d="M8.9 8.3c.2-.4.5-.4.8-.4h.5c.2 0 .4.1.5.4l.7 1.7c.1.2 0 .5-.1.7l-.5.6c-.1.2-.1.4 0 .6.6 1 1.4 1.8 2.4 2.4.2.1.4.1.6 0l.6-.5c.2-.2.5-.2.7-.1l1.7.7c.3.1.4.3.4.5v.5c0 .3 0 .6-.4.8-.6.4-1.4.6-2.2.4-2.6-.6-4.6-2.6-5.2-5.2-.2-.8 0-1.6.5-2.1Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function Menu(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M4 8.5 H20 M4 15.5 H20" {...linha} strokeWidth="1.3" />
    </svg>
  )
}

export function Fechar(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M6 6 L18 18 M18 6 L6 18" {...linha} strokeWidth="1.3" />
    </svg>
  )
}

export function Girar(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <ellipse cx="12" cy="12" rx="9" ry="3.6" {...linha} strokeWidth="1.2" />
      <path d="M17.6 7.6 L19.8 9.2 L17.4 10.6" {...linha} strokeWidth="1.2" />
      <path d="M12 4 V20" {...linha} strokeWidth="1.2" strokeDasharray="1.5 2.5" />
    </svg>
  )
}

/* Ícones de linha fina para os diferenciais e a abertura */

export function IconeAgulha(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <g {...linha} strokeWidth="1.1">
        <path d="M18.5 3.5 L6 16" />
        <ellipse cx="17.6" cy="4.4" rx="0.9" ry="0.45" transform="rotate(-45 17.6 4.4)" />
        <path d="M6 16 L4.6 19.4 L8 18" />
        <path d="M17 6 C 22 10, 14 15, 9 13 S 3 9, 6.5 6.5" />
      </g>
    </svg>
  )
}

export function IconeVestido(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <g {...linha} strokeWidth="1.1">
        <path d="M9.4 3 V6.4 M14.6 3 V6.4" />
        <path d="M9.4 6.4 C 10.6 7.6, 13.4 7.6, 14.6 6.4 L15.4 10.4 C 17.6 14, 18.6 17.4, 19 21 H5 C 5.4 17.4, 6.4 14, 8.6 10.4 Z" />
        <path d="M8.6 10.4 C 10.8 11.3, 13.2 11.3, 15.4 10.4" />
      </g>
    </svg>
  )
}

export function IconeTecido(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <g {...linha} strokeWidth="1.1">
        <path d="M3.5 7.5 C 6.5 4.5, 9.5 10.5, 12.5 7.5 S 18 4.5, 20.5 7.5" />
        <path d="M3.5 12 C 6.5 9, 9.5 15, 12.5 12 S 18 9, 20.5 12" />
        <path d="M3.5 16.5 C 6.5 13.5, 9.5 19.5, 12.5 16.5 S 18 13.5, 20.5 16.5" />
      </g>
    </svg>
  )
}

export function IconeCabide(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <g {...linha} strokeWidth="1.1">
        <path d="M12 9.5 V8.6 C12 7.6 13.6 7.4 13.6 6.1 C13.6 5 12.8 4.3 12 4.3 C11.2 4.3 10.5 4.9 10.4 5.7" />
        <path d="M12 9.5 L3 16.5 C2.4 17 2.7 18 3.5 18 H20.5 C21.3 18 21.6 17 21 16.5 Z" />
      </g>
    </svg>
  )
}

export function IconeConversa(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <g {...linha} strokeWidth="1.1">
        <path d="M12 4 C 16.9 4, 20.5 7.3, 20.5 11.4 S 16.9 18.8, 12 18.8 C 10.9 18.8, 9.9 18.6, 9 18.3 L4.5 20 L5.8 16.2 C 4.3 14.9, 3.5 13.2, 3.5 11.4 C 3.5 7.3, 7.1 4, 12 4 Z" />
        <path d="M8.6 11.4 H8.7 M12 11.4 H12.1 M15.4 11.4 H15.5" strokeWidth="1.8" />
      </g>
    </svg>
  )
}

export function IconeFita(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <g {...linha} strokeWidth="1.1">
        <circle cx="9" cy="10" r="5.5" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M14.5 10 V15.5 H21" />
        <path d="M17 15.5 V14 M19 15.5 V13.5" />
      </g>
    </svg>
  )
}
