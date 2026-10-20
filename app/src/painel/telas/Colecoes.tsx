/*
  Coleções: a ordem aqui é a ordem do carrossel do site.
*/
import { useState } from 'react'
import { api, mensagemDe, type Colecao } from '../api'
import { aoClicar } from '../rota'
import { pequena } from '../imagem'
import { avisar, Carregando, FalhaCarga, Icone, useCarregar } from '../ui'

export function Colecoes() {
  const carga = useCarregar(() => api<Colecao[]>('GET', '/colecoes'))
  const [lista, setLista] = useState<Colecao[] | null>(null)
  const colecoes = lista ?? carga.dados

  if (carga.erro) return <FalhaCarga erro={carga.erro} tentar={carga.recarregar} />
  if (!colecoes) return <Carregando />

  const mover = async (i: number, passo: -1 | 1) => {
    const nova = [...colecoes]
    ;[nova[i], nova[i + passo]] = [nova[i + passo], nova[i]]
    setLista(nova)
    try {
      await api('POST', '/colecoes/ordem', { ids: nova.map((c) => c.id) })
    } catch (e) {
      avisar(mensagemDe(e), 'erro')
      setLista(null)
      carga.recarregar()
    }
  }

  return (
    <div className="tela">
      <div className="tela-topo">
        <div>
          <h1>Coleções</h1>
          <p className="tela-resumo">A primeira da lista abre o site, e a ordem é a mesma do carrossel.</p>
        </div>
        <a className="botao" href="/painel/colecao/nova" onClick={aoClicar('/painel/colecao/nova')}>
          {Icone.mais} Nova coleção
        </a>
      </div>

      {colecoes.length === 0 && <p className="vazio">Nenhuma coleção ainda.</p>}

      <ul className="colecoes">
        {colecoes.map((c, i) => (
          <li key={c.id} className="colecao">
            <a className="colecao-link" href={`/painel/colecao/${c.id}`} onClick={aoClicar(`/painel/colecao/${c.id}`)}>
              <span className="colecao-capa" style={{ background: c.fundo }}>
                {c.capa ? <img src={pequena(c.capa)} alt="" loading="lazy" /> : Icone.foto}
              </span>
              <span className="linha-texto">
                <small>{c.numero ? `Nº ${c.numero}` : 'Coleção'}</small>
                <strong>{c.nome}</strong>
                <span className="selos">
                  <span className="selo selo-claro">
                    {c.pecas} {c.pecas === 1 ? 'peça' : 'peças'}
                  </span>
                  {!c.visivel && <span className="selo selo-cinza">Oculta</span>}
                  {c.visivel && c.pecas === 0 && <span className="selo selo-alerta">Sem peças, não aparece</span>}
                </span>
              </span>
            </a>
            <span className="ordem">
              <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${c.nome}`}>
                {Icone.cima}
              </button>
              <button type="button" onClick={() => mover(i, 1)} disabled={i === colecoes.length - 1} aria-label={`Descer ${c.nome}`}>
                {Icone.baixo}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
