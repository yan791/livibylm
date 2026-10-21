/*
  Lista de pedidos: compras do site e vendas registradas no painel, do mais
  novo para o mais antigo, com abas por situação e busca por nome ou número.
*/
import { useMemo, useState } from 'react'
import { api, reais, type ResumoPedido, type Situacao } from '../api'
import { aoClicar } from '../rota'
import { pequena } from '../imagem'
import { hora, quando, SITUACOES } from '../pedidos'
import { Carregando, FalhaCarga, Icone, useCarregar } from '../ui'

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const ABAS: { id: string; rotulo: string; situacoes: Situacao[] | null }[] = [
  { id: 'enviar', rotulo: 'Pra enviar', situacoes: ['pago', 'sem_estoque'] },
  { id: 'aguardando', rotulo: 'Aguardando pagamento', situacoes: ['aguardando'] },
  { id: 'enviados', rotulo: 'Enviados', situacoes: ['enviado'] },
  { id: 'entregues', rotulo: 'Entregues', situacoes: ['entregue'] },
  { id: 'todos', rotulo: 'Todos', situacoes: null },
]

export function Pedidos() {
  const pedidos = useCarregar(() => api<ResumoPedido[]>('GET', '/pedidos'))
  const [aba, setAba] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  const lista = pedidos.dados ?? []
  const contar = (s: Situacao[] | null) => (s ? lista.filter((p) => s.includes(p.situacao)).length : lista.length)
  // abre em "Pra enviar" quando tem o que enviar; senão, em "Todos"
  const atual = aba ?? (contar(ABAS[0].situacoes) > 0 ? 'enviar' : 'todos')

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim()).replace(/^n[ºo°]?\s*/, '')
    if (termo) return lista.filter((p) => String(p.id) === termo || semAcento(p.nome).includes(termo))
    const s = ABAS.find((a) => a.id === atual)?.situacoes
    return s ? lista.filter((p) => s.includes(p.situacao)) : lista
  }, [lista, atual, busca])

  if (pedidos.erro) return <FalhaCarga erro={pedidos.erro} tentar={pedidos.recarregar} />
  if (!pedidos.dados) return <Carregando />

  const paraEnviar = contar(ABAS[0].situacoes)

  return (
    <div className="tela">
      <div className="tela-topo">
        <div>
          <h1>Pedidos</h1>
          <p className="tela-resumo">
            {paraEnviar === 0
              ? 'Nenhum pedido esperando envio.'
              : paraEnviar === 1
                ? '1 pedido pago esperando envio.'
                : `${paraEnviar} pedidos pagos esperando envio.`}
          </p>
        </div>
        <a className="botao" href="/painel/pedido/novo" onClick={aoClicar('/painel/pedido/novo')}>
          {Icone.mais} Registrar venda
        </a>
      </div>

      {lista.length === 0 ? (
        <div className="vazio">
          <p>
            Nenhum pedido ainda. Quando alguém comprar pelo site, o pedido aparece aqui.
            <br />
            Vendeu pelo Instagram, pelo WhatsApp ou em mãos? Registre a venda para o estoque baixar.
          </p>
          <a className="botao botao-claro" href="/painel/pedido/novo" onClick={aoClicar('/painel/pedido/novo')}>
            Registrar venda
          </a>
        </div>
      ) : (
        <>
          <div className="filtros">
            <label className="busca">
              {Icone.busca}
              <input
                type="search"
                placeholder="Buscar pelo nome ou número"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Buscar pedido"
              />
            </label>
            {!busca && (
              <div className="chips" role="group" aria-label="Filtrar pedidos">
                {ABAS.map((a) => {
                  const n = contar(a.situacoes)
                  return (
                    <button key={a.id} type="button" className="chip" aria-pressed={atual === a.id} onClick={() => setAba(a.id)}>
                      {a.rotulo}
                      {a.id !== 'todos' && n > 0 && <span className="chip-numero">{n}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {filtrados.length === 0 ? (
            <p className="vazio">{busca ? 'Nenhum pedido com esse nome ou número.' : 'Nenhum pedido aqui.'}</p>
          ) : (
            <ul className="linhas">
              {filtrados.map((p) => (
                <li key={p.id} className="linha">
                  <a className="linha-link" href={`/painel/pedido/${p.id}`} onClick={aoClicar(`/painel/pedido/${p.id}`)}>
                    <span className="miniatura">{p.foto ? <img src={pequena(p.foto)} alt="" loading="lazy" /> : Icone.pedidos}</span>
                    <span className="linha-texto">
                      <strong>
                        {p.nome || (p.origem === 'fora' ? 'Venda sem nome' : 'Sem nome')}
                        <small>nº {p.id}</small>
                      </strong>
                      <span>
                        {p.unidades} {p.unidades === 1 ? 'peça' : 'peças'} · {reais(p.totalCentavos)} · {quando(p.criadoEm)}
                      </span>
                      <span className="selos">
                        <span className={`selo ${SITUACOES[p.situacao].selo}`}>{SITUACOES[p.situacao].rotulo}</span>
                        {p.situacao === 'aguardando' && <span className="selo selo-claro">Peças seguras até {hora(p.reservaAte)}</span>}
                        {p.origem === 'fora' && <span className="selo selo-claro">Venda fora do site</span>}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
