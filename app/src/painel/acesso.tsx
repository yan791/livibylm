/*
  Entrar no painel e criar a senha pelo link de acesso (convite).
*/
import { useEffect, useState, type FormEvent } from 'react'
import { api, mensagemDe, type Admin } from './api'
import { Campo, Carregando, Icone } from './ui'

function Marca() {
  return (
    <header className="acesso-marca">
      <p className="acesso-logo">Livi</p>
      <p className="acesso-sub">Painel da loja</p>
    </header>
  )
}

function CampoSenha({ id, valor, aoMudar, autoComplete }: { id: string; valor: string; aoMudar: (v: string) => void; autoComplete: string }) {
  const [ver, setVer] = useState(false)
  return (
    <div className="senha">
      <input
        id={id}
        type={ver ? 'text' : 'password'}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        autoComplete={autoComplete}
        required
      />
      <button type="button" className="senha-ver" onClick={() => setVer(!ver)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}>
        {ver ? Icone.olhoFechado : Icone.olho}
      </button>
    </div>
  )
}

export function Entrar({ aoEntrar }: { aoEntrar: (a: Admin) => void }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await api('POST', '/entrar', { email, senha })
      aoEntrar(await api<Admin>('GET', '/eu'))
    } catch (x) {
      setErro(mensagemDe(x))
      setEnviando(false)
    }
  }

  return (
    <main className="acesso">
      <form className="acesso-cartao" onSubmit={enviar}>
        <Marca />
        <Campo rotulo="E-mail">
          {(id) => <input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />}
        </Campo>
        <Campo rotulo="Senha">{(id) => <CampoSenha id={id} valor={senha} aoMudar={setSenha} autoComplete="current-password" />}</Campo>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <button className="botao botao-largo" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="acesso-nota">Esqueceu a senha? Peça um novo link de acesso para quem cuida do site.</p>
      </form>
    </main>
  )
}

export function Convite({ token, aoEntrar }: { token: string; aoEntrar: (a: Admin) => void }) {
  const [info, setInfo] = useState<{ email: string; nome: string; primeiroAcesso: boolean } | null>(null)
  const [falhou, setFalhou] = useState('')
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api<{ email: string; nome: string; primeiroAcesso: boolean }>('GET', `/convite/${token}`).then(
      (i) => {
        setInfo(i)
        setNome(i.nome)
      },
      (e) => setFalhou(mensagemDe(e)),
    )
  }, [token])

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    if (senha.length < 10) return setErro('A senha precisa ter pelo menos 10 caracteres.')
    if (senha !== repetir) return setErro('As duas senhas não estão iguais.')
    setEnviando(true)
    try {
      await api('POST', `/convite/${token}`, { nome, senha })
      aoEntrar(await api<Admin>('GET', '/eu'))
    } catch (x) {
      setErro(mensagemDe(x))
      setEnviando(false)
    }
  }

  if (falhou)
    return (
      <main className="acesso">
        <div className="acesso-cartao">
          <Marca />
          <p className="erro">{falhou}</p>
          <a className="botao botao-claro botao-largo" href="/painel/entrar">
            Ir para a tela de entrar
          </a>
        </div>
      </main>
    )
  if (!info) return <Carregando />

  return (
    <main className="acesso">
      <form className="acesso-cartao" onSubmit={enviar}>
        <Marca />
        <div className="acesso-intro">
          <h1>{info.primeiroAcesso ? 'Boas-vindas ao painel' : 'Crie uma senha nova'}</h1>
          <p>
            Acesso de <strong>{info.email}</strong>. Crie sua senha para entrar. Só você vai saber qual é.
          </p>
        </div>
        <Campo rotulo="Seu nome">
          {(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required maxLength={80} />}
        </Campo>
        <input type="email" value={info.email} autoComplete="username" readOnly hidden />
        <Campo rotulo="Senha" dica="Use pelo menos 10 caracteres. Uma frase curta é fácil de lembrar e difícil de adivinhar.">
          {(id) => <CampoSenha id={id} valor={senha} aoMudar={setSenha} autoComplete="new-password" />}
        </Campo>
        <Campo rotulo="Repita a senha">{(id) => <CampoSenha id={id} valor={repetir} aoMudar={setRepetir} autoComplete="new-password" />}</Campo>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <button className="botao botao-largo" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Criar senha e entrar'}
        </button>
      </form>
    </main>
  )
}
