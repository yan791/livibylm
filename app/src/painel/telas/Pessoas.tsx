/*
  Quem tem acesso ao painel. Para dar acesso, gera um link (vale 7 dias, uma
  vez só) que a pessoa abre para criar a própria senha. O mesmo serve para
  quem esqueceu a senha.
*/
import { useState, type FormEvent } from 'react'
import { api, mensagemDe, type Pessoa } from '../api'
import { avisar, Campo, Carregando, confirmar, FalhaCarga, Icone, useCarregar } from '../ui'

type Link = { para: string; link: string; dias: number }

function CartaoLink({ l, fechar }: { l: Link; fechar: () => void }) {
  const texto = `Oi! Este é o seu link de acesso ao painel da Livi. Abra para criar sua senha (vale ${l.dias} dias): ${l.link}`
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(l.link)
      avisar('Link copiado.')
    } catch {
      avisar('Não deu para copiar. Segure o link para copiar.', 'erro')
    }
  }
  return (
    <section className="cartao cartao-link" aria-live="polite">
      <h2>Link de acesso de {l.para}</h2>
      <p className="campo-dica">
        Mande só para essa pessoa. Ele vale {l.dias} dias e funciona uma vez.
      </p>
      <code className="link-gerado">{l.link}</code>
      <div className="botoes">
        <button type="button" className="botao" onClick={copiar}>
          {Icone.link} Copiar link
        </button>
        <a className="botao botao-claro" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
          Enviar pelo WhatsApp
        </a>
        <button type="button" className="botao-texto" onClick={fechar}>
          Fechar
        </button>
      </div>
    </section>
  )
}

export function Pessoas() {
  const carga = useCarregar(() => api<Pessoa[]>('GET', '/pessoas'))
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [link, setLink] = useState<Link | null>(null)

  if (carga.erro) return <FalhaCarga erro={carga.erro} tentar={carga.recarregar} />
  if (!carga.dados) return <Carregando />

  const convidar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const r = await api<{ link: string; dias: number }>('POST', '/pessoas', { nome, email })
      setLink({ para: nome.trim(), ...r })
      setNome('')
      setEmail('')
      carga.recarregar()
    } catch (x) {
      setErro(mensagemDe(x))
    } finally {
      setEnviando(false)
    }
  }

  const novoLink = async (p: Pessoa) => {
    try {
      const r = await api<{ link: string; dias: number }>('POST', `/pessoas/${p.id}/link`)
      setLink({ para: p.nome || p.email, ...r })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (x) {
      avisar(mensagemDe(x), 'erro')
    }
  }

  const remover = async (p: Pessoa) => {
    const ok = await confirmar({
      titulo: `Tirar o acesso de ${p.nome || p.email}?`,
      texto: 'A pessoa sai do painel na hora. Dá para convidar de novo depois.',
      botao: 'Tirar acesso',
      perigo: true,
    })
    if (!ok) return
    try {
      await api('DELETE', `/pessoas/${p.id}`)
      avisar('Acesso removido.')
      carga.recarregar()
    } catch (x) {
      avisar(mensagemDe(x), 'erro')
    }
  }

  return (
    <div className="tela">
      <div className="tela-topo">
        <div>
          <h1>Acesso ao painel</h1>
          <p className="tela-resumo">Só quem está nesta lista entra no painel.</p>
        </div>
      </div>

      {link && <CartaoLink l={link} fechar={() => setLink(null)} />}

      <ul className="pessoas">
        {carga.dados.map((p) => (
          <li key={p.id} className="pessoa">
            <span className="pessoa-inicial" aria-hidden="true">
              {(p.nome || p.email).slice(0, 1).toUpperCase()}
            </span>
            <span className="linha-texto">
              <strong>
                {p.nome || 'Sem nome'}
                {p.voce && <span className="selo selo-claro">Você</span>}
              </strong>
              <span>{p.email}</span>
              {!p.ativo && <span className="selo selo-alerta">Ainda não criou a senha</span>}
            </span>
            <span className="pessoa-acoes">
              <button type="button" className="botao-texto" onClick={() => novoLink(p)}>
                {p.ativo ? 'Link para nova senha' : 'Gerar outro link'}
              </button>
              {!p.voce && (
                <button type="button" className="botao-texto perigo" onClick={() => remover(p)}>
                  Tirar acesso
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <form className="cartao" onSubmit={convidar}>
        <h2>Dar acesso a outra pessoa</h2>
        <div className="campos-lado">
          <Campo rotulo="Nome">{(i) => <input id={i} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required />}</Campo>
          <Campo rotulo="E-mail">
            {(i) => <input id={i} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required />}
          </Campo>
        </div>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <button className="botao" disabled={enviando}>
          {enviando ? 'Gerando…' : 'Gerar link de acesso'}
        </button>
      </form>
    </div>
  )
}
