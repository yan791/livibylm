/*
  Ajustes da loja, que valem para o site inteiro: vendas pelo site, entrega
  (taxa em Maceió e os Correios por região), parcelamento e o WhatsApp que
  recebe as mensagens.
*/
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ESTADOS_DA_REGIAO, REGIOES, type Regiao, type Servico, type TabelaFrete } from '../../../worker/frete'
import { api, centavosDe, mensagemDe, telefone, textoDe, type Ajustes as DadosAjustes } from '../api'
import { segurarSaida } from '../rota'
import { avisar, Campo, Carregando, FalhaCarga, Interruptor, useCarregar } from '../ui'

/** os preços da tabela como a pessoa digita ("25" ou "25,90"); vazio = não envia */
type FreteTexto = Record<Regiao, Record<Servico, string>>
type Rascunho = { vendasOnline: boolean; taxa: string; parcelas: number; whatsapp: string; frete: FreteTexto }

const SERVICOS = [
  { id: 'pac', nome: 'PAC' },
  { id: 'sedex', nome: 'SEDEX' },
] as const

const freteTexto = (t: TabelaFrete) =>
  Object.fromEntries(
    REGIOES.map(({ id }) => [id, { pac: t[id].pac === null ? '' : textoDe(t[id].pac), sedex: t[id].sedex === null ? '' : textoDe(t[id].sedex) }]),
  ) as FreteTexto

/** "(82) 99811-5324" ou "82998115324" vira 5582998115324; null se não parecer um número do Brasil com DDD (mesma regra do servidor, worker/ajustes.ts) */
function numeroWhatsApp(texto: string) {
  if (/^\s*(\+|00)(?!\s*55)/.test(texto)) return null
  let n = texto.replace(/\D/g, '').replace(/^0+/, '')
  if (n.length === 10 || n.length === 11) n = '55' + n
  return /^55[1-9]{2}(9\d{8}|[2-8]\d{7})$/.test(n) ? n : null
}

const rascunhoDe = (a: DadosAjustes): Rascunho => ({
  vendasOnline: a.vendasOnline,
  taxa: textoDe(a.taxaMaceioCentavos),
  parcelas: a.parcelasSemJuros,
  whatsapp: telefone(a.whatsapp),
  frete: freteTexto(a.freteCorreios),
})

export function Ajustes() {
  const carga = useCarregar(() => api<DadosAjustes>('GET', '/ajustes'))
  if (carga.erro) return <FalhaCarga erro={carga.erro} tentar={carga.recarregar} />
  if (!carga.dados) return <Carregando />
  return <Formulario dados={carga.dados} aoSalvar={carga.recarregar} />
}

function Formulario({ dados, aoSalvar }: { dados: DadosAjustes; aoSalvar: () => void }) {
  const inicial = useMemo(() => rascunhoDe(dados), [dados])
  const [r, setR] = useState<Rascunho>(inicial)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const campo = <K extends keyof Rascunho>(k: K) => (v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }))

  useEffect(() => setR(inicial), [inicial])
  const alterado = JSON.stringify(inicial) !== JSON.stringify(r)
  const precoFrete = (regiao: Regiao, servico: Servico) => (v: string) =>
    setR((x) => ({ ...x, frete: { ...x.frete, [regiao]: { ...x.frete[regiao], [servico]: v } } }))
  useEffect(() => {
    segurarSaida(alterado ? () => window.confirm('Sair sem salvar os ajustes?') : null)
    return () => segurarSaida(null)
  }, [alterado])

  const numero = numeroWhatsApp(r.whatsapp)

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    const taxa = centavosDe(r.taxa)
    if (taxa === null) return setErro('Preencha a taxa de entrega em Maceió (ex.: 15).')
    if (!numero) return setErro('Confira o WhatsApp: DDD e número, ex.: (82) 99811-5324.')
    const freteCorreios = {} as TabelaFrete
    for (const { id, nome } of REGIOES) {
      const linha = { pac: null, sedex: null } as Record<Servico, number | null>
      for (const s of SERVICOS) {
        const t = r.frete[id][s.id].trim()
        if (!t) continue
        const c = centavosDe(t)
        if (!c) return setErro(`Confira o preço do ${s.nome} para ${nome} (ex.: 25 ou 25,90), ou deixe em branco.`)
        linha[s.id] = c
      }
      freteCorreios[id] = linha
    }
    setSalvando(true)
    try {
      await api('PUT', '/ajustes', { vendasOnline: r.vendasOnline, taxaMaceioCentavos: taxa, parcelasSemJuros: r.parcelas, whatsapp: numero, freteCorreios })
      avisar('Ajustes salvos. O site já usa os novos.')
      aoSalvar()
    } catch (x) {
      setErro(mensagemDe(x))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="tela tela-form" onSubmit={salvar} noValidate>
      <div className="tela-topo">
        <h1>Ajustes da loja</h1>
        <p className="tela-resumo">Valem para o site inteiro.</p>
      </div>

      <section className="cartao">
        <h2>Vendas pelo site</h2>
        <Interruptor
          ligado={r.vendasOnline}
          aoMudar={campo('vendasOnline')}
          rotulo="Vender pelo site"
          bloqueado={!dados.pagamentoPronto}
          dica={
            dados.pagamentoPronto
              ? 'Ligado, a cliente paga direto no site. Desligado, a sacola envia o pedido pelo WhatsApp.'
              : 'Ainda não dá para ligar: o pagamento pela InfinitePay está sendo preparado. Até lá, a sacola do site envia o pedido pelo WhatsApp.'
          }
        />
      </section>

      <section className="cartao">
        <h2>Entrega</h2>
        <Campo rotulo="Taxa de entrega em Maceió" dica="Um valor só, para qualquer bairro de Maceió. Entra no total quando a compra for feita pelo site.">
          {(i) => (
            <span className="preco">
              <span aria-hidden="true">R$</span>
              <input
                id={i}
                inputMode="decimal"
                value={r.taxa}
                onChange={(e) => campo('taxa')(e.target.value)}
                onBlur={() => {
                  const c = centavosDe(r.taxa)
                  if (c !== null) campo('taxa')(textoDe(c))
                }}
                placeholder="0,00"
              />
            </span>
          )}
        </Campo>
      </section>

      <section className="cartao">
        <h2>Correios, fora de Maceió</h2>
        <p className="campo-dica">
          Um preço de PAC e um de SEDEX para cada região. A cliente digita o CEP e vê o valor na hora, e ele entra no total da
          compra. Deixe em branco o que você não quer oferecer naquela região. O pedido pago aparece em Pedidos com o endereço
          para você postar.
        </p>
        <div className="frete-tabela" role="table" aria-label="Preços dos Correios por região">
          <div className="frete-linha frete-cabeca" role="row">
            <span role="columnheader">Região</span>
            {SERVICOS.map((s) => (
              <span key={s.id} role="columnheader">
                {s.nome}
              </span>
            ))}
          </div>
          {REGIOES.map(({ id, nome }) => (
            <div key={id} className="frete-linha" role="row">
              <span className="frete-regiao" role="rowheader">
                {nome}
                <small>{ESTADOS_DA_REGIAO[id]}</small>
              </span>
              {SERVICOS.map((s) => (
                <span key={s.id} className="preco" role="cell">
                  <span aria-hidden="true">R$</span>
                  <input
                    inputMode="decimal"
                    aria-label={`${s.nome} para ${nome}`}
                    value={r.frete[id][s.id]}
                    onChange={(e) => precoFrete(id, s.id)(e.target.value)}
                    onBlur={() => {
                      const c = centavosDe(r.frete[id][s.id])
                      if (c) precoFrete(id, s.id)(textoDe(c))
                    }}
                    placeholder="—"
                  />
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="cartao">
        <h2>Parcelamento</h2>
        <Campo
          rotulo="Parcelas sem juros"
          dica={
            r.parcelas > 1
              ? `Aparece embaixo do preço de cada peça: "em até ${r.parcelas}x sem juros". Use o mesmo número configurado na InfinitePay.`
              : 'Sem parcelamento, nada aparece embaixo do preço.'
          }
        >
          {(i) => (
            <select id={i} value={r.parcelas} onChange={(e) => campo('parcelas')(Number(e.target.value))}>
              <option value={1}>Sem parcelamento</option>
              {Array.from({ length: 11 }, (_, n) => n + 2).map((n) => (
                <option key={n} value={n}>
                  Até {n}x sem juros
                </option>
              ))}
            </select>
          )}
        </Campo>
      </section>

      <section className="cartao">
        <h2>WhatsApp da loja</h2>
        <Campo
          rotulo="Número"
          dica={
            <>
              Todos os botões de WhatsApp do site abrem conversa com este número.
              {numero && (
                <>
                  {' '}
                  <a href={`https://wa.me/${numero}`} target="_blank" rel="noreferrer">
                    Testar este número
                  </a>
                </>
              )}
            </>
          }
        >
          {(i) => (
            <input
              id={i}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={r.whatsapp}
              onChange={(e) => campo('whatsapp')(e.target.value)}
              onBlur={() => numero && campo('whatsapp')(telefone(numero))}
              maxLength={30}
              placeholder="(82) 99811-5324"
            />
          )}
        </Campo>
      </section>

      <div className="barra-salvar">
        <p className={erro ? 'erro' : 'barra-estado'} role={erro ? 'alert' : undefined}>
          {erro || (alterado ? 'Alterações não salvas' : 'Tudo salvo')}
        </p>
        <button className="botao" disabled={salvando || !alterado}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
