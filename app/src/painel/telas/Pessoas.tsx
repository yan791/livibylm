/*
  Quem tem acesso ao painel. Para dar acesso, gera um link (vale 7 dias, uma
  vez só) que a pessoa abre para criar a própria senha. O mesmo serve para
  quem esqueceu a senha.
  Cada pessoa liga aqui a própria verificação em duas etapas (o código de um
  app autenticador depois da senha). Quem perdeu o celular pede para outra
  pessoa do painel desligar a dela.
*/
import { useState, type FormEvent } from 'react'
import { renderSVG } from 'uqr'
import { api, mensagemDe, type Pessoa } from '../api'
import { avisar, Campo, Carregando, confirmar, FalhaCarga, Icone, useCarregar } from '../ui'
import { CampoCodigo, CampoSenha } from '../acesso'

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

/** a mensagem de erro de um formulário */
function Erro({ texto }: { texto: string }) {
  return texto ? (
    <p className="erro" role="alert">
      {texto}
    </p>
  ) : null
}

type Etapa = 'parado' | 'senha' | 'qr' | 'codigos' | 'trocar' | 'desligar'

/** a verificação em duas etapas de quem está no painel: ligar (senha, QR code, código), códigos de recuperação e desligar */
function DuasEtapas({ ligada, aoMudar }: { ligada: boolean; aoMudar: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>('parado')
  const [senha, setSenha] = useState('')
  const [codigo, setCodigo] = useState('')
  const [qr, setQr] = useState<{ segredo: string; uri: string; imagem: string } | null>(null)
  const [codigos, setCodigos] = useState<string[]>([])
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const irPara = (e: Etapa) => {
    setEtapa(e)
    setSenha('')
    setCodigo('')
    setErro('')
  }

  const enviar = (acao: () => Promise<void>) => async (ev: FormEvent) => {
    ev.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await acao()
    } catch (x) {
      setErro(mensagemDe(x))
    } finally {
      setEnviando(false)
    }
  }

  const comecar = enviar(async () => {
    const r = await api<{ segredo: string; uri: string }>('POST', '/dois-fatores/comecar', { senha })
    setQr({ ...r, imagem: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(r.uri, { ecc: 'M' }))}` })
    irPara('qr')
  })
  const ligar = enviar(async () => {
    const r = await api<{ codigos: string[] }>('POST', '/dois-fatores/ligar', { codigo })
    setCodigos(r.codigos)
    setQr(null)
    irPara('codigos')
    aoMudar()
  })
  const trocar = enviar(async () => {
    const r = await api<{ codigos: string[] }>('POST', '/dois-fatores/codigos', { senha })
    setCodigos(r.codigos)
    irPara('codigos')
  })
  const desligar = enviar(async () => {
    await api('POST', '/dois-fatores/desligar', { senha, codigo })
    irPara('parado')
    avisar('Verificação em duas etapas desligada.')
    aoMudar()
  })

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`Códigos de recuperação do painel da Livi (cada um vale uma vez):\n${codigos.join('\n')}`)
      avisar('Códigos copiados.')
    } catch {
      avisar('Não deu para copiar. Anote os códigos no papel.', 'erro')
    }
  }

  const cancelar = (
    <button type="button" className="botao-texto" onClick={() => irPara('parado')}>
      Cancelar
    </button>
  )
  const senhaDeNovo = (
    <Campo rotulo="Sua senha" dica="Pedimos de novo para ninguém mexer nisso com o painel aberto no seu aparelho.">
      {(id) => <CampoSenha id={id} valor={senha} aoMudar={setSenha} autoComplete="current-password" />}
    </Campo>
  )

  return (
    <section className="cartao duas-etapas" aria-live="polite">
      <h2>Verificação em duas etapas</h2>

      {etapa === 'codigos' ? (
        <>
          <p>
            <strong>Guarde estes códigos de recuperação</strong> num lugar seguro: anote no papel ou salve no gerenciador de senhas. Se o celular sumir,
            cada um entra no painel uma vez. Eles não aparecem de novo.
          </p>
          <ol className="codigos-recuperacao">
            {codigos.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <div className="botoes">
            <button type="button" className="botao botao-claro" onClick={copiar}>
              Copiar os códigos
            </button>
            <button type="button" className="botao" onClick={() => (setCodigos([]), irPara('parado'))}>
              Já guardei
            </button>
          </div>
        </>
      ) : etapa === 'qr' && qr ? (
        <form className="duas-etapas-form" onSubmit={ligar}>
          <ol className="duas-etapas-passos">
            <li>Instale um app autenticador no celular, como o Google Authenticator ou o Microsoft Authenticator.</li>
            <li>No app, toque em "+" e leia este QR code.</li>
            <li>Digite o código de 6 números que aparecer para "Livi painel".</li>
          </ol>
          <img className="duas-etapas-qr" src={qr.imagem} alt="QR code para o app autenticador" width={200} height={200} />
          <p className="campo-dica">
            O app está neste celular? <a href={qr.uri}>Toque aqui para abrir no app</a>. Ou digite esta chave no app:
          </p>
          <code className="link-gerado duas-etapas-chave">{qr.segredo.match(/.{1,4}/g)?.join(' ')}</code>
          <CampoCodigo valor={codigo} aoMudar={setCodigo} recuperacao={false} />
          <Erro texto={erro} />
          <div className="botoes">
            <button className="botao" disabled={enviando}>
              {enviando ? 'Conferindo…' : 'Confirmar e ligar'}
            </button>
            {cancelar}
          </div>
        </form>
      ) : etapa === 'senha' || etapa === 'trocar' ? (
        <form className="duas-etapas-form" onSubmit={etapa === 'senha' ? comecar : trocar}>
          {etapa === 'trocar' && <p className="campo-dica">Os códigos de recuperação de antes deixam de valer.</p>}
          {senhaDeNovo}
          <Erro texto={erro} />
          <div className="botoes">
            <button className="botao" disabled={enviando}>
              {enviando ? 'Conferindo…' : etapa === 'senha' ? 'Continuar' : 'Gerar códigos novos'}
            </button>
            {cancelar}
          </div>
        </form>
      ) : etapa === 'desligar' ? (
        <form className="duas-etapas-form" onSubmit={desligar}>
          <p className="campo-dica">Sem a verificação, quem descobrir a sua senha entra no painel.</p>
          {senhaDeNovo}
          <CampoCodigo valor={codigo} aoMudar={setCodigo} />
          <Erro texto={erro} />
          <div className="botoes">
            <button className="botao botao-perigo" disabled={enviando}>
              {enviando ? 'Desligando…' : 'Desligar'}
            </button>
            {cancelar}
          </div>
        </form>
      ) : ligada ? (
        <>
          <p>
            <span className="selo selo-ok">Ligada</span> Para entrar, o painel pede a sua senha e o código do app autenticador.
          </p>
          <div className="botoes">
            <button type="button" className="botao botao-claro" onClick={() => irPara('trocar')}>
              Códigos de recuperação novos
            </button>
            <button type="button" className="botao-texto perigo" onClick={() => irPara('desligar')}>
              Desligar
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            <span className="selo selo-alerta">Desligada</span> Com ela ligada, além da senha o painel pede um código que só o seu celular mostra.
            Quem descobrir a sua senha não entra sem ele.
          </p>
          <div className="botoes">
            <button type="button" className="botao" onClick={() => irPara('senha')}>
              Ligar
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/** o celular de outra pessoa sumiu: desliga a verificação dela, com a sua senha */
function DesligarDeOutra({ p, fechar, aoMudar }: { p: Pessoa; fechar: () => void; aoMudar: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const nome = p.nome || p.email

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await api('POST', `/pessoas/${p.id}/dois-fatores/desligar`, { senha })
      avisar(`Verificação de ${nome} desligada. Ela entra só com a senha e pode ligar de novo.`)
      aoMudar()
      fechar()
    } catch (x) {
      setErro(mensagemDe(x))
      setEnviando(false)
    }
  }

  return (
    <form className="cartao cartao-link" onSubmit={enviar}>
      <h2>Desligar a verificação de {nome}</h2>
      <p className="campo-dica">
        Faça isso só se {nome} perdeu o celular e os códigos de recuperação. Depois ela entra só com a senha e liga de novo em Acesso.
      </p>
      <Campo rotulo="Sua senha">{(id) => <CampoSenha id={id} valor={senha} aoMudar={setSenha} autoComplete="current-password" />}</Campo>
      <Erro texto={erro} />
      <div className="botoes">
        <button className="botao botao-perigo" disabled={enviando}>
          {enviando ? 'Desligando…' : 'Desligar'}
        </button>
        <button type="button" className="botao-texto" onClick={fechar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function Pessoas() {
  const carga = useCarregar(() => api<Pessoa[]>('GET', '/pessoas'))
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [link, setLink] = useState<Link | null>(null)
  const [desligando, setDesligando] = useState<Pessoa | null>(null)

  if (carga.erro) return <FalhaCarga erro={carga.erro} tentar={carga.recarregar} />
  if (!carga.dados) return <Carregando />
  const eu = carga.dados.find((p) => p.voce)

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
      {desligando && <DesligarDeOutra p={desligando} fechar={() => setDesligando(null)} aoMudar={carga.recarregar} />}
      {eu && <DuasEtapas ligada={eu.doisFatores} aoMudar={carga.recarregar} />}

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
              {p.doisFatores && (
                <span className="selos">
                  <span className="selo selo-ok">Duas etapas</span>
                </span>
              )}
            </span>
            <span className="pessoa-acoes">
              <button type="button" className="botao-texto" onClick={() => novoLink(p)}>
                {p.ativo ? 'Link para nova senha' : 'Gerar outro link'}
              </button>
              {!p.voce && p.doisFatores && (
                <button
                  type="button"
                  className="botao-texto"
                  onClick={() => {
                    setDesligando(p)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  Desligar duas etapas
                </button>
              )}
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
        <Erro texto={erro} />
        <button className="botao" disabled={enviando}>
          {enviando ? 'Gerando…' : 'Gerar link de acesso'}
        </button>
      </form>
    </div>
  )
}
