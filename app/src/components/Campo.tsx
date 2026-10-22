/*
  Campos dos formulários do site (compra, entrar na conta, senha nova), com o
  mesmo visual: rótulo em cima, campo e uma dica opcional embaixo.
*/
import { useState } from 'react'

type PropsCampo = {
  rotulo: string
  valor: string
  mudar: (v: string) => void
  tipo?: 'text' | 'tel' | 'email'
  modo?: 'text' | 'numeric' | 'tel'
  autoComplete?: string
  dica?: string
}

export function Campo({ rotulo, valor, mudar, tipo = 'text', modo, autoComplete, dica }: PropsCampo) {
  return (
    <label className="compra-campo">
      <span>{rotulo}</span>
      <input type={tipo} inputMode={modo} value={valor} onChange={(e) => mudar(e.target.value)} autoComplete={autoComplete ?? 'off'} />
      {dica && <small>{dica}</small>}
    </label>
  )
}

/** senha com o botão "Mostrar" (no celular, ver o que digitou evita errar) */
export function CampoSenha({
  rotulo,
  valor,
  mudar,
  nova = false,
  dica,
}: {
  rotulo: string
  valor: string
  mudar: (v: string) => void
  /** senha nova (criar a conta, trocar a senha): o navegador oferece uma senha forte */
  nova?: boolean
  dica?: string
}) {
  const [ver, setVer] = useState(false)
  return (
    <label className="compra-campo">
      <span>{rotulo}</span>
      <span className="campo-senha">
        <input
          type={ver ? 'text' : 'password'}
          value={valor}
          onChange={(e) => mudar(e.target.value)}
          autoComplete={nova ? 'new-password' : 'current-password'}
          autoCapitalize="none"
          spellCheck={false}
        />
        <button type="button" onClick={() => setVer((v) => !v)} aria-pressed={ver}>
          {ver ? 'Ocultar' : 'Mostrar'}
        </button>
      </span>
      {dica && <small>{dica}</small>}
    </label>
  )
}
