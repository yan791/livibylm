/*
  Entrar na conta, com o WhatsApp e a senha. Aparece na sacola, antes do
  pagamento, e na aba "Pedidos" quando a cliente não está com a conta aberta.
  "Esqueci minha senha" resolve aqui mesmo: ela digita o WhatsApp e, se o
  número tem conta, confirma o e-mail que pôs ao criar a conta e escolhe a
  senha nova (já entra). Sem conta, a sacola leva para criar uma. Quem não
  lembra o e-mail ainda pode pedir à loja um link de senha nova pelo WhatsApp.
*/
import { useState, type FormEvent } from 'react'
import { linkWhatsApp } from '../dados/site'
import { conferirNumero, entrarNaConta, SENHA_MINIMA, trocarSenhaEsquecida } from '../lib/conta'
import { abrirGaveta } from '../lib/lista'
import { Campo, CampoSenha } from './Campo'

type Props = {
  titulo: string
  texto: string
  /** criar a conta (na sacola, junto com os dados da compra), com o WhatsApp que ela digitou; sem isso, a conta nasce na primeira compra */
  criar?: (whatsapp: string) => void
}

export function Entrar({ titulo, texto, criar }: Props) {
  const [whatsapp, setWhatsapp] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [esqueceu, setEsqueceu] = useState(false)

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    if (!whatsapp.trim() || !senha) return setErro('Preencha o seu WhatsApp e a senha.')
    setEnviando(true)
    setErro(await entrarNaConta(whatsapp, senha))
    setEnviando(false)
  }

  if (esqueceu)
    return (
      <EsqueciSenha
        whatsapp={whatsapp}
        mudarWhatsapp={setWhatsapp}
        voltar={() => {
          setEsqueceu(false)
          setErro('')
        }}
        criar={criar}
      />
    )

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
      <button type="button" className="conta-link" onClick={() => setEsqueceu(true)}>
        Esqueci minha senha
      </button>
    </form>
  )
}

/** "Esqueci minha senha": o número primeiro; com conta, o e-mail dela e a senha nova */
function EsqueciSenha({
  whatsapp,
  mudarWhatsapp,
  voltar,
  criar,
}: {
  whatsapp: string
  mudarWhatsapp: (v: string) => void
  voltar: () => void
  criar?: (whatsapp: string) => void
}) {
  // o número tem conta: pede o e-mail e a senha nova
  const [achou, setAchou] = useState(false)
  const [semConta, setSemConta] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const procurar = async (e: FormEvent) => {
    e.preventDefault()
    if (!whatsapp.trim()) return setErro('Digite o WhatsApp da sua conta.')
    setEnviando(true)
    setErro('')
    const r = await conferirNumero(whatsapp)
    setEnviando(false)
    if (r === 'tem') setAchou(true)
    else if (r === 'sem-conta') setSemConta(true)
    else setErro(r.erro)
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return setErro('Digite o e-mail da sua conta.')
    if (senha.length < SENHA_MINIMA) return setErro(`A senha nova precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
    setEnviando(true)
    // deu certo: a conta abre, e a sacola (ou a aba Pedidos) segue sozinha
    setErro(await trocarSenhaEsquecida({ whatsapp, email, senha }))
    setEnviando(false)
  }

  const aviso = erro && (
    <p className="compra-erro" role="alert">
      {erro}
    </p>
  )

  if (achou)
    return (
      <form className="compra-bloco conta-entrar" onSubmit={salvar} noValidate>
        <h3 className="conta-titulo">Crie uma senha nova</h3>
        <p className="conta-texto">Para confirmar que a conta é sua, digite o e-mail que você usou quando criou a conta.</p>
        <Campo rotulo="E-mail da conta" valor={email} mudar={setEmail} tipo="email" autoComplete="email" />
        <CampoSenha rotulo="Senha nova" valor={senha} mudar={setSenha} nova dica={`Pelo menos ${SENHA_MINIMA} caracteres.`} />
        {aviso}
        <button type="submit" className="pilula cheia" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar e entrar'}
        </button>
        <a className="conta-link" href={linkWhatsApp(`Olá! Esqueci a senha e o e-mail da minha conta no site da Livi. O WhatsApp da conta é ${whatsapp.trim()}.`)} target="_blank" rel="noreferrer">
          Não lembro o e-mail
        </a>
        <button type="button" className="conta-link" onClick={voltar}>
          Lembrei a senha
        </button>
      </form>
    )

  return (
    <form className="compra-bloco conta-entrar" onSubmit={procurar} noValidate>
      <h3 className="conta-titulo">Esqueceu a senha?</h3>
      <p className="conta-texto">Digite o WhatsApp da sua conta para criar uma senha nova.</p>
      <Campo
        rotulo="WhatsApp, com DDD"
        valor={whatsapp}
        mudar={(v) => {
          mudarWhatsapp(v)
          setSemConta(false)
        }}
        tipo="tel"
        autoComplete="username"
      />
      {aviso}
      {semConta ? (
        <div className="conta-sem" role="alert">
          <p className="conta-texto">
            {criar
              ? 'Não achamos conta com esse WhatsApp. Confira o número ou crie a sua conta agora.'
              : 'Não achamos conta com esse WhatsApp. Confira o número.'}
          </p>
          {criar ? (
            <button type="button" className="pilula cheia" onClick={() => criar(whatsapp)}>
              Criar conta e continuar
            </button>
          ) : (
            <button type="button" className="pilula" onClick={() => abrirGaveta('sacola')}>
              Ir para a sacola
            </button>
          )}
        </div>
      ) : (
        <button type="submit" className="pilula cheia" disabled={enviando}>
          {enviando ? 'Procurando…' : 'Continuar'}
        </button>
      )}
      <button type="button" className="conta-link" onClick={voltar}>
        Lembrei a senha
      </button>
    </form>
  )
}
