/*
  Entrar na conta, com o WhatsApp e a senha. Aparece na sacola, antes do
  pagamento, e na aba "Pedidos" quando a cliente não está com a conta aberta.
  "Esqueci minha senha" abre o WhatsApp da loja, e a loja manda um link de
  senha nova para o WhatsApp da conta (painel, na página do pedido).
*/
import { useState, type FormEvent } from 'react'
import { linkWhatsApp } from '../dados/site'
import { entrarNaConta } from '../lib/conta'
import { Campo, CampoSenha } from './Campo'

export function Entrar({ titulo, texto }: { titulo: string; texto: string }) {
  const [whatsapp, setWhatsapp] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    if (!whatsapp.trim() || !senha) return setErro('Preencha o seu WhatsApp e a senha.')
    setEnviando(true)
    setErro(await entrarNaConta(whatsapp, senha))
    setEnviando(false)
  }

  const esqueci = `Olá! Esqueci a senha da minha conta no site da Livi.${whatsapp.trim() ? ` O WhatsApp da conta é ${whatsapp.trim()}.` : ''}`

  return (
    <form className="compra-bloco conta-entrar" onSubmit={entrar} noValidate>
      <h3 className="conta-titulo">{titulo}</h3>
      <p className="conta-texto">{texto}</p>
      <Campo rotulo="WhatsApp, com DDD" valor={whatsapp} mudar={setWhatsapp} tipo="tel" autoComplete="username" />
      <CampoSenha rotulo="Senha" valor={senha} mudar={setSenha} />
      {erro && (
        <p className="compra-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className="pilula cheia" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
      <a className="conta-link" href={linkWhatsApp(esqueci)} target="_blank" rel="noreferrer">
        Esqueci minha senha
      </a>
    </form>
  )
}
