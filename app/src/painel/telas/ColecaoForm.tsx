/*
  Cadastro e edição de uma coleção, com prévia do cartão como ele aparece no site.
*/
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api, mensagemDe, type Colecao } from '../api'
import { descartarFotos, enviarFoto } from '../imagem'
import { aoClicar, ir, segurarSaida } from '../rota'
import { avisar, Campo, Carregando, confirmar, FalhaCarga, Icone, Interruptor, useCarregar } from '../ui'

type Rascunho = Pick<Colecao, 'nome' | 'numero' | 'fundo' | 'tema' | 'clima' | 'descricao' | 'capa' | 'capaProporcao' | 'visivel'>

const vazia: Rascunho = {
  nome: '',
  numero: '',
  fundo: '#c8c2bb',
  tema: 'claro',
  clima: '',
  descricao: '',
  capa: null,
  capaProporcao: 0.68,
  visivel: true,
}

export function ColecaoForm({ id }: { id: number | 'nova' }) {
  const carga = useCarregar(() => api<Colecao[]>('GET', '/colecoes'))
  if (carga.erro) return <FalhaCarga erro={carga.erro} tentar={carga.recarregar} />
  if (!carga.dados) return <Carregando />
  const colecao = id === 'nova' ? null : carga.dados.find((c) => c.id === id)
  if (id !== 'nova' && !colecao) return <FalhaCarga erro="Coleção não encontrada." tentar={() => ir('/painel/colecoes')} />
  return <Formulario id={id} colecao={colecao ?? null} total={carga.dados.length} aoSalvar={carga.recarregar} />
}

function Formulario({ id, colecao, total, aoSalvar }: { id: number | 'nova'; colecao: Colecao | null; total: number; aoSalvar: () => void }) {
  const inicial = useMemo<Rascunho>(
    () => (colecao ? { ...colecao } : { ...vazia, numero: String(total + 1).padStart(2, '0') }),
    [colecao, total],
  )
  const [r, setR] = useState<Rascunho>(inicial)
  const [enviando, setEnviando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const enviadas = useRef<string[]>([])
  const campo = <K extends keyof Rascunho>(k: K) => (v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }))

  useEffect(() => setR(inicial), [inicial])
  const alterado = (Object.keys(inicial) as (keyof Rascunho)[]).some((k) => inicial[k] !== r[k])
  useEffect(() => {
    segurarSaida(alterado ? () => window.confirm('Sair sem salvar as alterações desta coleção?') : null)
    return () => segurarSaida(null)
  }, [alterado])
  useEffect(() => () => descartarFotos(enviadas.current), [])

  const escolherCapa = async (arquivo?: File) => {
    if (!arquivo) return
    setEnviando(true)
    try {
      const { src, proporcao } = await enviarFoto(arquivo)
      enviadas.current.push(src)
      setR((x) => ({ ...x, capa: src, capaProporcao: Math.round(proporcao * 10000) / 10000 }))
    } catch (e) {
      avisar(mensagemDe(e), 'erro')
    } finally {
      setEnviando(false)
    }
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    if (!r.nome.trim()) return setErro('Preencha o nome da coleção.')
    if (enviando) return setErro('Espere a foto terminar de enviar.')
    setSalvando(true)
    try {
      if (id === 'nova') {
        const nova = await api<Colecao>('POST', '/colecoes', r)
        avisar('Coleção criada. Agora é só cadastrar as peças dela.')
        ir(`/painel/colecao/${nova.id}`, { substituir: true, forcar: true })
      } else {
        await api('PUT', `/colecoes/${id}`, r)
        avisar('Alterações salvas.')
        aoSalvar()
      }
    } catch (x) {
      setErro(mensagemDe(x))
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async () => {
    if (colecao && colecao.pecas > 0)
      return avisar('Essa coleção ainda tem peças. Mova as peças para outra coleção ou exclua antes.', 'erro')
    const ok = await confirmar({ titulo: 'Excluir esta coleção?', texto: 'Isso não tem volta.', botao: 'Excluir coleção', perigo: true })
    if (!ok) return
    try {
      await api('DELETE', `/colecoes/${id}`)
      avisar('Coleção excluída.')
      ir('/painel/colecoes', { forcar: true })
    } catch (x) {
      avisar(mensagemDe(x), 'erro')
    }
  }

  const escuro = r.tema === 'escuro'
  const novaPeca = `/painel/peca/nova?colecao=${id}`

  return (
    <form className="tela tela-form" onSubmit={salvar} noValidate>
      <div className="tela-topo">
        <a className="voltar" href="/painel/colecoes" onClick={aoClicar('/painel/colecoes')}>
          {Icone.voltar} Coleções
        </a>
        <h1>{id === 'nova' ? 'Nova coleção' : r.nome || 'Coleção sem nome'}</h1>
        {colecao && (
          <a className="link-acao" href={novaPeca} onClick={aoClicar(novaPeca)}>
            {Icone.mais} Cadastrar peça nesta coleção
          </a>
        )}
      </div>

      <div className="colecao-editor">
        <figure className={`previa ${escuro ? 'previa-escura' : ''}`} style={{ background: r.fundo }} aria-label="Prévia">
          <span className="previa-foto" style={{ aspectRatio: String(r.capaProporcao) }}>
            {r.capa ? <img src={r.capa} alt="" /> : <span className="previa-sem">{Icone.foto} Foto de capa</span>}
          </span>
          <figcaption>
            <small>Coleção Nº {r.numero || '00'}</small>
            <strong>{r.nome || 'Nome'}</strong>
            {r.clima && <span>{r.clima}</span>}
          </figcaption>
        </figure>

        <div>
          <section className="cartao">
            <h2>Capa</h2>
            <label className={`botao botao-claro escolher-foto ${enviando ? 'desligado' : ''}`}>
              {enviando ? <span className="giro" aria-hidden="true" /> : Icone.foto}
              {enviando ? 'Enviando…' : r.capa ? 'Trocar a foto de capa' : 'Escolher a foto de capa'}
              <input type="file" accept="image/*" disabled={enviando} onChange={(e) => (escolherCapa(e.target.files?.[0]), (e.target.value = ''))} />
            </label>
            <p className="campo-dica">É a foto do carrossel de coleções. Uma foto em pé, de corpo inteiro, funciona melhor.</p>
          </section>

          <section className="cartao">
            <h2>Informações</h2>
            <div className="campos-lado">
              <Campo rotulo="Nome" className="campo-largo">
                {(i) => <input id={i} value={r.nome} onChange={(e) => campo('nome')(e.target.value)} maxLength={60} placeholder="Ex.: Velvet" />}
              </Campo>
              <Campo rotulo="Número">
                {(i) => <input id={i} value={r.numero} onChange={(e) => campo('numero')(e.target.value)} maxLength={8} placeholder="01" />}
              </Campo>
            </div>
            <Campo rotulo="Frase curta" dica="Aparece no letreiro do carrossel.">
              {(i) => <input id={i} value={r.clima} onChange={(e) => campo('clima')(e.target.value)} maxLength={120} placeholder="Ex.: Terra, calor e drapeado." />}
            </Campo>
            <Campo rotulo="Descrição" dica="Aparece no topo do catálogo da coleção.">
              {(i) => <textarea id={i} value={r.descricao} onChange={(e) => campo('descricao')(e.target.value)} maxLength={600} rows={3} />}
            </Campo>
          </section>

          <section className="cartao">
            <h2>Cores da coleção</h2>
            <div className="campos-lado">
              <Campo rotulo="Cor de fundo" dica="Escolha um tom parecido com o fundo da foto de capa.">
                {(i) => (
                  <span className="cor-fundo">
                    <label className="cor-amostra" style={{ background: r.fundo }}>
                      <input id={i} type="color" value={r.fundo} onChange={(e) => campo('fundo')(e.target.value)} />
                    </label>
                    <code>{r.fundo}</code>
                  </span>
                )}
              </Campo>
              <div className="campo">
                <span className="campo-rotulo">Texto por cima</span>
                <div className="segmentos" role="radiogroup" aria-label="Texto por cima">
                  <button type="button" role="radio" aria-checked={!escuro} onClick={() => campo('tema')('claro')}>
                    Escuro
                  </button>
                  <button type="button" role="radio" aria-checked={escuro} onClick={() => campo('tema')('escuro')}>
                    Claro
                  </button>
                </div>
                <p className="campo-dica">Fundo claro pede texto escuro, e o contrário.</p>
              </div>
            </div>
          </section>

          <section className="cartao">
            <Interruptor
              ligado={r.visivel}
              aoMudar={campo('visivel')}
              rotulo="Mostrar no site"
              dica="Desligada, a coleção e as peças dela somem do site. Coleção sem peças também não aparece."
            />
          </section>

          {id !== 'nova' && (
            <button type="button" className="botao-texto perigo" onClick={excluir}>
              {Icone.lixo} Excluir coleção
            </button>
          )}
        </div>
      </div>

      <div className="barra-salvar">
        <p className={erro ? 'erro' : 'barra-estado'} role={erro ? 'alert' : undefined}>
          {erro || (alterado ? 'Alterações não salvas' : id === 'nova' ? '' : 'Tudo salvo')}
        </p>
        <button className="botao" disabled={salvando || (!alterado && id !== 'nova')}>
          {salvando ? 'Salvando…' : id === 'nova' ? 'Criar coleção' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
