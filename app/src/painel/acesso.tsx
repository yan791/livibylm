/*
  Entrar no painel e criar a senha pelo link de acesso (convite). Quem ligou a
  verificação em duas etapas (tela "Acesso") digita também o código do app.
*/
import { useEffect, useState, type FormEvent } from 'react'
import { api, mensagemDe, type Admin } from './api'
import { avisar, Campo, Carregando, Icone } from './ui'

function Marca() {
  return (
    <header className="acesso-marca">
      <p className="acesso-logo">Liví</p>
      <p className="acesso-sub">Painel da loja</p>
    </header>
  )
}

export function CampoSenha({ id, valor, aoMudar, autoComplete }: { id: string; valor: string; aoMudar: (v: string) => void; autoComplete: string }) {
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

/** o código de 6 números do app autenticador ou, sem o celular, um código de recuperação */
export function CampoCodigo({
  valor,
  aoMudar,
  recuperacao = true,
  focar = false,
}: {
  valor: string
  aoMudar: (v: string) => void
  /** oferece trocar para um código de recuperação */
  recuperacao?: boolean
  focar?: boolean
}) {
  const [deRecuperacao, setDeRecuperacao] = useState(false)
  const trocar = () => {
    setDeRecuperacao(!deRecuperacao)
    aoMudar('')
  }
  return (
    <Campo
      rotulo={deRecuperacao ? 'Código de recuperação' : 'Código do app'}
      dica={
        recuperacao && (
          <button type="button" className="botao-texto" onClick={trocar}>
            {deRecuperacao ? 'Usar o código do app' : 'Sem o celular? Use um código de recuperação'}
          </button>
        )
      }
    >
      {(id) => (
        <input
          id={id}
          className="codigo"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          inputMode={deRecuperacao ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={deRecuperacao ? 'xxxx-xxxx' : '000000'}
          maxLength={deRecuperacao ? 12 : 7}
          autoFocus={focar}
          required
        />
      )}
    </Campo>
  )
}

export function Entrar({ aoEntrar }: { aoEntrar: (a: Admin) => void }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  // a senha está certa e a pessoa ligou a verificação em duas etapas: falta o código do app
  const [pedeCodigo, setPedeCodigo] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const r = await api<{ precisaCodigo?: boolean; recuperacaoRestantes?: number }>('POST', '/entrar', {
        email,
        senha,
        ...(pedeCodigo ? { codigo } : {}),
      })
      if (r.precisaCodigo) {
        setPedeCodigo(true)
        setEnviando(false)
        return
      }
      if (r.recuperacaoRestantes !== undefined)
        avisar(
          r.recuperacaoRestantes
            ? `Você entrou com um código de recuperação. Sobram ${r.recuperacaoRestantes}. Em Acesso dá para gerar códigos novos.`
            : 'Você usou o último código de recuperação. Gere códigos novos em Acesso.',
        )
      aoEntrar(await api<Admin>('GET', '/eu'))
    } catch (x) {
      setErro(mensagemDe(x))
      setEnviando(false)
    }
  }

  const voltar = () => {
    setPedeCodigo(false)
    setCodigo('')
    setErro('')
  }

  return (
    <main className="acesso">
      <form className="acesso-cartao" onSubmit={enviar}>
        <Marca />
        {pedeCodigo ? (
          <>
            <div className="acesso-intro">
              <h1>Verificação em duas etapas</h1>
              <p>
                Abra o app autenticador no celular e digite o código de 6 números de <strong>Livi painel</strong>.
              </p>
            </div>
            <CampoCodigo valor={codigo} aoMudar={setCodigo} focar />
          </>
        ) : (
          <>
            <Campo rotulo="E-mail">
              {(id) => <input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />}
            </Campo>
            <Campo rotulo="Senha">{(id) => <CampoSenha id={id} valor={senha} aoMudar={setSenha} autoComplete="current-password" />}</Campo>
          </>
        )}
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <button className="botao botao-largo" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        {pedeCodigo ? (
          <>
            <p className="acesso-nota">
              Perdeu o celular e os códigos de recuperação? Peça para outra pessoa do painel desligar a sua verificação em Acesso.
            </p>
            <button type="button" className="botao botao-claro botao-largo" onClick={voltar}>
              Voltar
            </button>
          </>
        ) : (
          <p className="acesso-nota">Esqueceu a senha? Peça um novo link de acesso para quem cuida do site.</p>
        )}
      </form>
    </main>
  )
}

export function Convite({ token, aoEntrar }: { token: string; aoEntrar: (a: Admin) => void }) {
  const [info, setInfo] = useState<{ email: string; nome: string; primeiroAcesso: boolean; doisFatores: boolean } | null>(null)
  const [falhou, setFalhou] = useState('')
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api<{ email: string; nome: string; primeiroAcesso: boolean; doisFatores: boolean }>('GET', `/convite/${token}`).then(
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
      await api('POST', `/convite/${token}`, { nome, senha, ...(info?.doisFatores ? { codigo } : {}) })
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
            {info.doisFatores && ' Como a verificação em duas etapas está ligada, digite também o código do app.'}
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
        {info.doisFatores && <CampoCodigo valor={codigo} aoMudar={setCodigo} />}
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
