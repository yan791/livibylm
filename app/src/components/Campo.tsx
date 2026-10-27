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
  /** o exemplo que aparece apagado no campo vazio */
  exemplo?: string
}

export function Campo({ rotulo, valor, mudar, tipo = 'text', modo, autoComplete, dica, exemplo }: PropsCampo) {
  return (
    <label className="compra-campo">
      <span>{rotulo}</span>
      <input
        type={tipo}
        inputMode={modo}
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        autoComplete={autoComplete ?? 'off'}
        placeholder={exemplo}
      />
      {dica && <small>{dica}</small>}
    </label>
  )
}

/** só os dígitos do WhatsApp: DDD e número (até 11), sem o 55 do Brasil nem zero na frente */
export function digitosWhatsApp(v: string) {
  let d = v.replace(/\D/g, '').replace(/^0+/, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  return d.slice(0, 11)
}

/** "81995029461" -> "(81) 99502-9461", montado enquanto ela digita (o último caractere é sempre um número, então apagar funciona) */
export function formatarWhatsApp(v: string) {
  const d = digitosWhatsApp(v)
  if (d.length <= 2) return d && `(${d}`
  const ddd = d.slice(0, 2)
  const numero = d.slice(2)
  // celular (9 números) com o hífen depois do 5º; fixo, ou enquanto digita, depois do 4º
  const corte = numero.length === 9 ? 5 : 4
  return numero.length <= corte ? `(${ddd}) ${numero}` : `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`
}

/** DDD e número completos, a mesma regra do servidor (numeroWhatsApp em worker/ajustes.ts) */
export const whatsappCompleto = (v: string) => /^[1-9]{2}(9\d{8}|[2-8]\d{7})$/.test(digitosWhatsApp(v))

export const WHATSAPP_INCOMPLETO = 'Confira o WhatsApp: DDD e número, ex.: (82) 99999-9999.'

/** WhatsApp com DDD: os parênteses e o hífen entram sozinhos enquanto ela digita */
export function CampoWhatsApp({ valor, mudar, dica }: { valor: string; mudar: (v: string) => void; dica?: string }) {
  return (
    <Campo
      rotulo="WhatsApp, com DDD"
      valor={formatarWhatsApp(valor)}
      mudar={(v) => mudar(formatarWhatsApp(v))}
      tipo="tel"
      modo="tel"
      autoComplete="username"
      exemplo="(82) 99999-9999"
      dica={dica}
    />
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
