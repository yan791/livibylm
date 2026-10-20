/*
  Ajustes da loja, que valem para o site inteiro: vendas pelo site, taxa de
  entrega em Maceió, parcelamento e o WhatsApp que recebe as mensagens.
*/
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, centavosDe, mensagemDe, textoDe, type Ajustes as DadosAjustes } from '../api'
import { segurarSaida } from '../rota'
import { avisar, Campo, Carregando, FalhaCarga, Interruptor, useCarregar } from '../ui'

type Rascunho = { vendasOnline: boolean; taxa: string; parcelas: number; whatsapp: string }

/** "(82) 99811-5324" ou "82998115324" vira 5582998115324; null se não parecer um celular com DDD (o servidor confere de novo) */
function numeroWhatsApp(texto: string) {
  let n = texto.replace(/\D/g, '')
  if (n.length === 10 || n.length === 11) n = '55' + n
  return /^55[1-9]\d{9,10}$/.test(n) ? n : null
}

/** 5582998115324 vira "(82) 99811-5324" */
function telefone(n: string) {
  const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n
}

const rascunhoDe = (a: DadosAjustes): Rascunho => ({
  vendasOnline: a.vendasOnline,
  taxa: textoDe(a.taxaMaceioCentavos),
  parcelas: a.parcelasSemJuros,
  whatsapp: telefone(a.whatsapp),
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
  const alterado = (Object.keys(inicial) as (keyof Rascunho)[]).some((k) => inicial[k] !== r[k])
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
    setSalvando(true)
    try {
      await api('PUT', '/ajustes', { vendasOnline: r.vendasOnline, taxaMaceioCentavos: taxa, parcelasSemJuros: r.parcelas, whatsapp: numero })
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
