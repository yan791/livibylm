/*
  Registrar uma venda feita fora do site (Instagram, WhatsApp, em mãos):
  escolhe as peças, cor, tamanho, quantidade e o preço cobrado. Ao salvar, o
  estoque baixa na hora e o site para de oferecer o que foi vendido.
*/
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, centavosDe, mensagemDe, reais, textoDe, type OpcaoVenda } from '../api'
import { aoClicar, ir, segurarSaida } from '../rota'
import { pequena } from '../imagem'
import { avisar, Campo, Carregando, FalhaCarga, Icone, Interruptor, useCarregar } from '../ui'
import { EVENTO_PEDIDOS } from './PedidoDetalhe'

type Linha = { chave: string; peca: OpcaoVenda; cor: string; tamanho: string; quantidade: number; preco: string }

const FORMAS = [
  { id: 'pix', rotulo: 'Pix' },
  { id: 'dinheiro', rotulo: 'Dinheiro' },
  { id: 'cartao', rotulo: 'Cartão' },
  { id: 'outro', rotulo: 'Outro' },
]

/** mesma regra do servidor (worker/ajustes.ts): DDD + número do Brasil */
function numeroWhatsApp(texto: string) {
  if (/^\s*(\+|00)(?!\s*55)/.test(texto)) return null
  let n = texto.replace(/\D/g, '').replace(/^0+/, '')
  if (n.length === 10 || n.length === 11) n = '55' + n
  return /^55[1-9]{2}(9\d{8}|[2-8]\d{7})$/.test(n) ? n : null
}

export function NovaVenda() {
  const opcoes = useCarregar(() => api<OpcaoVenda[]>('GET', '/pedidos/opcoes'))
  if (opcoes.erro) return <FalhaCarga erro={opcoes.erro} tentar={opcoes.recarregar} />
  if (!opcoes.dados) return <Carregando />
  return <Formulario pecas={opcoes.dados} />
}

function Formulario({ pecas }: { pecas: OpcaoVenda[] }) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [escolhendo, setEscolhendo] = useState(true)
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [forma, setForma] = useState('pix')
  const [entregue, setEntregue] = useState(true)
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const alterado = linhas.length > 0 || Boolean(nome || whatsapp || nota)
  useEffect(() => {
    segurarSaida(alterado ? () => window.confirm('Sair sem registrar a venda?') : null)
    return () => segurarSaida(null)
  }, [alterado])

  /** quanto ainda dá para vender dessa combinação, descontando o que já está nesta venda */
  const livre = (peca: OpcaoVenda, cor: string, tamanho: string, menos?: string) =>
    peca.sobEncomenda
      ? 99
      : (peca.livre[`${cor}|${tamanho}`] ?? 0) -
        linhas.filter((l) => l.chave !== menos && l.peca.id === peca.id && l.cor === cor && l.tamanho === tamanho).reduce((s, l) => s + l.quantidade, 0)

  const adicionar = (peca: OpcaoVenda, cor: string, tamanho: string) => {
    const ja = linhas.find((l) => l.peca.id === peca.id && l.cor === cor && l.tamanho === tamanho)
    if (ja) setLinhas(linhas.map((l) => (l === ja ? { ...l, quantidade: l.quantidade + 1 } : l)))
    else setLinhas([...linhas, { chave: `${peca.id}|${cor}|${tamanho}`, peca, cor, tamanho, quantidade: 1, preco: textoDe(peca.precoCentavos) }])
    setEscolhendo(false)
  }

  const mudar = (chave: string, m: Partial<Linha>) => setLinhas(linhas.map((l) => (l.chave === chave ? { ...l, ...m } : l)))

  const total = linhas.reduce((s, l) => s + (centavosDe(l.preco) ?? 0) * l.quantidade, 0)

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    if (!linhas.length) return setErro('Escolha pelo menos uma peça.')
    if (linhas.some((l) => centavosDe(l.preco) === null)) return setErro('Confira o preço de cada peça.')
    const zap = whatsapp.trim() ? numeroWhatsApp(whatsapp) : ''
    if (zap === null) return setErro('Confira o WhatsApp: DDD e número, ex.: (82) 99999-9999.')
    setSalvando(true)
    try {
      const r = await api<{ id: number }>('POST', '/pedidos', {
        itens: linhas.map((l) => ({ pecaId: l.peca.id, cor: l.cor, tamanho: l.tamanho, quantidade: l.quantidade, precoCentavos: centavosDe(l.preco) })),
        nome,
        whatsapp: zap,
        pagamento: forma,
        entregue,
        observacao: nota,
      })
      window.dispatchEvent(new Event(EVENTO_PEDIDOS))
      avisar('Venda registrada. O estoque já baixou.')
      ir(`/painel/pedido/${r.id}`, { substituir: true, forcar: true })
    } catch (x) {
      setErro(mensagemDe(x))
      setSalvando(false)
    }
  }

  return (
    <form className="tela tela-form" onSubmit={salvar} noValidate>
      <a className="voltar" href="/painel/pedidos" onClick={aoClicar('/painel/pedidos')}>
        {Icone.voltar} Pedidos
      </a>
      <div className="tela-topo">
        <h1>Registrar venda</h1>
        <p className="tela-resumo">Para vendas feitas pelo Instagram, pelo WhatsApp ou em mãos. O estoque baixa na hora.</p>
      </div>

      <section className="cartao">
        <h2>Peças</h2>
        {linhas.length > 0 && (
          <ul className="itens-pedido itens-venda">
            {linhas.map((l) => {
              const cor = l.peca.cores.find((c) => c.id === l.cor)
              const max = Math.max(1, livre(l.peca, l.cor, l.tamanho, l.chave))
              return (
                <li key={l.chave}>
                  <span className="miniatura">{l.peca.foto ? <img src={pequena(l.peca.foto)} alt="" /> : Icone.foto}</span>
                  <span className="linha-texto">
                    <strong>{l.peca.nome}</strong>
                    <span>
                      {cor?.nome} · {l.tamanho}
                    </span>
                    <span className="venda-campos">
                      <span className="qtd" role="group" aria-label={`Quantidade de ${l.peca.nome}`}>
                        <button type="button" onClick={() => mudar(l.chave, { quantidade: l.quantidade - 1 })} disabled={l.quantidade <= 1} aria-label="Uma a menos">
                          −
                        </button>
                        <span aria-live="polite">{l.quantidade}</span>
                        <button type="button" onClick={() => mudar(l.chave, { quantidade: l.quantidade + 1 })} disabled={l.quantidade >= max} aria-label="Uma a mais">
                          +
                        </button>
                      </span>
                      <span className="preco preco-pequeno">
                        <span aria-hidden="true">R$</span>
                        <input
                          inputMode="decimal"
                          value={l.preco}
                          onChange={(e) => mudar(l.chave, { preco: e.target.value })}
                          onBlur={() => {
                            const c = centavosDe(l.preco)
                            if (c !== null) mudar(l.chave, { preco: textoDe(c) })
                          }}
                          aria-label={`Preço cobrado por ${l.peca.nome}`}
                        />
                      </span>
                    </span>
                  </span>
                  <button type="button" className="botao-icone" onClick={() => setLinhas(linhas.filter((x) => x !== l))} aria-label={`Tirar ${l.peca.nome}`}>
                    {Icone.fechar}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {escolhendo ? (
          <Escolher pecas={pecas} livre={livre} aoEscolher={adicionar} aoCancelar={linhas.length ? () => setEscolhendo(false) : undefined} />
        ) : (
          <button type="button" className="botao botao-claro" onClick={() => setEscolhendo(true)}>
            {Icone.mais} Adicionar outra peça
          </button>
        )}
        {linhas.length > 0 && <p className="campo-dica">O preço já vem do cadastro. Se deu desconto, troque pelo valor cobrado.</p>}
      </section>

      <section className="cartao">
        <h2>Cliente (opcional)</h2>
        <div className="campos-lado">
          <Campo rotulo="Nome">{(i) => <input id={i} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="off" />}</Campo>
          <Campo rotulo="WhatsApp">
            {(i) => (
              <input id={i} type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} maxLength={30} placeholder="(82) 99999-9999" autoComplete="off" />
            )}
          </Campo>
        </div>
      </section>

      <section className="cartao">
        <h2>Pagamento e entrega</h2>
        <div className="campo">
          <span className="campo-rotulo">Como ela pagou</span>
          <div className="segmentos segmentos-4" role="radiogroup" aria-label="Como ela pagou">
            {FORMAS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={forma === f.id} onClick={() => setForma(f.id)}>
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>
        <Interruptor
          ligado={entregue}
          aoMudar={setEntregue}
          rotulo="A peça já foi entregue"
          dica={entregue ? 'A venda entra como entregue.' : 'A venda fica em "Pra enviar" até você marcar como enviada ou entregue.'}
        />
        <Campo rotulo="Anotação (opcional)">
          {(i) => <textarea id={i} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} placeholder="Ex.: vendida no story de sexta" />}
        </Campo>
      </section>

      <div className="barra-salvar">
        <p className={erro ? 'erro' : 'barra-estado'} role={erro ? 'alert' : undefined}>
          {erro || (linhas.length ? `Total: ${reais(total)}` : 'Escolha as peças vendidas')}
        </p>
        <button className="botao" disabled={salvando || !linhas.length}>
          {salvando ? 'Registrando…' : 'Registrar venda'}
        </button>
      </div>
    </form>
  )
}

/** escolher peça, depois cor e tamanho (com quantas ainda tem) */
function Escolher({
  pecas,
  livre,
  aoEscolher,
  aoCancelar,
}: {
  pecas: OpcaoVenda[]
  livre: (p: OpcaoVenda, cor: string, tamanho: string) => number
  aoEscolher: (p: OpcaoVenda, cor: string, tamanho: string) => void
  aoCancelar?: () => void
}) {
  const [pecaId, setPecaId] = useState<number | null>(null)
  const [cor, setCor] = useState('')
  const peca = pecas.find((p) => p.id === pecaId)
  const grupos = useMemo(() => {
    const m = new Map<string, OpcaoVenda[]>()
    for (const p of pecas) m.set(p.colecao, [...(m.get(p.colecao) ?? []), p])
    return [...m]
  }, [pecas])

  const escolherPeca = (id: number) => {
    const p = pecas.find((x) => x.id === id)
    setPecaId(id)
    setCor(p?.cores.length === 1 ? p.cores[0].id : '')
  }

  return (
    <div className="escolher-peca">
      <Campo rotulo="Peça">
        {(i) => (
          <select id={i} value={pecaId ?? ''} onChange={(e) => escolherPeca(Number(e.target.value))}>
            <option value="" disabled>
              Escolha a peça
            </option>
            {grupos.map(([colecao, lista]) => (
              <optgroup key={colecao} label={colecao}>
                {lista.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {!p.visivel ? ' (oculta)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </Campo>
      {peca && peca.cores.length > 1 && (
        <div className="campo">
          <span className="campo-rotulo">Cor</span>
          <div className="chips">
            {peca.cores.map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={cor === c.id} onClick={() => setCor(c.id)}>
                <span className="grade-cor" style={{ background: c.hex }} aria-hidden="true" /> {c.nome}
              </button>
            ))}
          </div>
        </div>
      )}
      {peca && cor && (
        <div className="campo">
          <span className="campo-rotulo">Tamanho</span>
          <div className="chips">
            {peca.tamanhos.map((t) => {
              const n = livre(peca, cor, t)
              return (
                <button key={t} type="button" className="chip chip-tamanho" disabled={n <= 0} onClick={() => aoEscolher(peca, cor, t)}>
                  {t}
                  <small>{peca.sobEncomenda ? 'encomenda' : n <= 0 ? 'sem estoque' : n === 1 ? '1 disponível' : `${n} disponíveis`}</small>
                </button>
              )
            })}
          </div>
          {!peca.sobEncomenda && peca.tamanhos.every((t) => livre(peca, cor, t) <= 0) && (
            <p className="campo-dica">Essa cor está sem estoque. Se a peça existe, ajuste o estoque dela antes.</p>
          )}
        </div>
      )}
      {aoCancelar && (
        <button type="button" className="botao-texto" onClick={aoCancelar}>
          Cancelar
        </button>
      )}
    </div>
  )
}
