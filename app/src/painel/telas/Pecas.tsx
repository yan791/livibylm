/*
  Lista de peças, separadas por coleção, com busca, filtro e ordem.
*/
import { useMemo, useState } from 'react'
import { api, mensagemDe, reais, type Colecao, type ResumoPeca } from '../api'
import { aoClicar } from '../rota'
import { pequena } from '../imagem'
import { avisar, Carregando, FalhaCarga, Icone, useCarregar } from '../ui'

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function Situacao({ p }: { p: ResumoPeca }) {
  const marcas = []
  if (!p.visivel) marcas.push(<span key="o" className="selo selo-cinza">Oculta</span>)
  if (p.sobEncomenda) marcas.push(<span key="e" className="selo">Sob encomenda</span>)
  else if (p.combinacoes > 0 && p.zeradas === p.combinacoes) marcas.push(<span key="z" className="selo selo-alerta">Esgotada</span>)
  else
    marcas.push(
      <span key="t" className="selo selo-claro">
        {p.total} {p.total === 1 ? 'unidade' : 'unidades'}
        {p.zeradas > 0 && ` · ${p.zeradas} ${p.zeradas === 1 ? 'opção esgotada' : 'opções esgotadas'}`}
      </span>,
    )
  return <span className="selos">{marcas}</span>
}

export function Pecas() {
  const colecoes = useCarregar(() => api<Colecao[]>('GET', '/colecoes'))
  const pecas = useCarregar(() => api<ResumoPeca[]>('GET', '/pecas'))
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<number | null>(null)
  const [ordenando, setOrdenando] = useState(false)
  const [lista, setLista] = useState<ResumoPeca[] | null>(null)

  const todas = lista ?? pecas.dados ?? []
  const grupos = useMemo(() => {
    const termo = semAcento(busca.trim())
    return (colecoes.dados ?? [])
      .filter((c) => filtro === null || c.id === filtro)
      .map((c) => ({
        colecao: c,
        pecas: todas.filter((p) => p.colecaoId === c.id && (!termo || semAcento(p.nome).includes(termo))),
      }))
      .filter((g) => g.pecas.length > 0 || (!termo && filtro !== null))
  }, [colecoes.dados, todas, busca, filtro])

  if (colecoes.erro || pecas.erro)
    return (
      <FalhaCarga
        erro={(colecoes.erro || pecas.erro)!}
        tentar={() => {
          colecoes.recarregar()
          pecas.recarregar()
        }}
      />
    )
  if (!colecoes.dados || !pecas.dados) return <Carregando />

  const mover = async (colecaoId: number, i: number, passo: -1 | 1) => {
    const daColecao = todas.filter((p) => p.colecaoId === colecaoId)
    const j = i + passo
    if (j < 0 || j >= daColecao.length) return
    ;[daColecao[i], daColecao[j]] = [daColecao[j], daColecao[i]]
    const nova = todas.map((p) => (p.colecaoId === colecaoId ? daColecao.shift()! : p))
    setLista(nova)
    try {
      await api('POST', '/pecas/ordem', { ids: nova.filter((p) => p.colecaoId === colecaoId).map((p) => p.id) })
    } catch (e) {
      avisar(mensagemDe(e), 'erro')
      setLista(null)
      pecas.recarregar()
    }
  }

  const novaPeca = filtro ? `/painel/peca/nova?colecao=${filtro}` : '/painel/peca/nova'

  return (
    <div className="tela">
      <div className="tela-topo">
        <div>
          <h1>Peças</h1>
          <p className="tela-resumo">
            {pecas.dados.length} {pecas.dados.length === 1 ? 'peça' : 'peças'} em {colecoes.dados.length}{' '}
            {colecoes.dados.length === 1 ? 'coleção' : 'coleções'}
          </p>
        </div>
        <a className="botao" href={novaPeca} onClick={aoClicar(novaPeca)}>
          {Icone.mais} Nova peça
        </a>
      </div>

      <div className="filtros">
        <label className="busca">
          {Icone.busca}
          <input type="search" placeholder="Buscar peça pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar peça" />
        </label>
        <div className="chips" role="group" aria-label="Filtrar por coleção">
          <button type="button" className="chip" aria-pressed={filtro === null} onClick={() => setFiltro(null)}>
            Todas
          </button>
          {colecoes.dados.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={filtro === c.id} onClick={() => setFiltro(c.id)}>
              {c.nome}
            </button>
          ))}
        </div>
        {!busca && (
          <button type="button" className="link-acao" onClick={() => setOrdenando(!ordenando)}>
            {ordenando ? 'Pronto' : 'Mudar a ordem das peças'}
          </button>
        )}
      </div>

      {colecoes.dados.length === 0 && (
        <div className="vazio">
          <p>Para cadastrar peças, crie a primeira coleção.</p>
          <a className="botao" href="/painel/colecao/nova" onClick={aoClicar('/painel/colecao/nova')}>
            Criar coleção
          </a>
        </div>
      )}
      {colecoes.dados.length > 0 && grupos.length === 0 && <p className="vazio">Nenhuma peça com esse nome.</p>}

      {grupos.map(({ colecao, pecas: lista }) => (
        <section key={colecao.id} className="grupo">
          <h2 className="grupo-titulo">
            <span className="grupo-cor" style={{ background: colecao.fundo }} aria-hidden="true" />
            {colecao.nome}
            {!colecao.visivel && <span className="selo selo-cinza">Coleção oculta</span>}
          </h2>
          {lista.length === 0 ? (
            <p className="vazio vazio-pequeno">Nenhuma peça nesta coleção ainda.</p>
          ) : (
            <ul className="linhas">
              {lista.map((p, i) => (
                <li key={p.id} className="linha">
                  <a className="linha-link" href={`/painel/peca/${p.id}`} onClick={aoClicar(`/painel/peca/${p.id}`)}>
                    <span className="miniatura">{p.foto ? <img src={pequena(p.foto)} alt="" loading="lazy" /> : Icone.foto}</span>
                    <span className="linha-texto">
                      <strong>{p.nome}</strong>
                      <span>{reais(p.precoCentavos)}</span>
                      <Situacao p={p} />
                    </span>
                  </a>
                  {ordenando && !busca && (
                    <span className="ordem">
                      <button type="button" onClick={() => mover(colecao.id, i, -1)} disabled={i === 0} aria-label={`Subir ${p.nome}`}>
                        {Icone.cima}
                      </button>
                      <button type="button" onClick={() => mover(colecao.id, i, 1)} disabled={i === lista.length - 1} aria-label={`Descer ${p.nome}`}>
                        {Icone.baixo}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
