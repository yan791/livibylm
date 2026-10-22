/*
  Ajustes da loja, que valem para o site inteiro: vendas pelo site (com a
  compra de teste que libera o interruptor), dados de quem vende, trocas,
  entrega (taxa em Maceió e os Correios por região), parcelamento e o WhatsApp
  que recebe as mensagens.
*/
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ESTADOS_DA_REGIAO, REGIOES, type Regiao, type Servico, type TabelaFrete } from '../../../worker/frete'
import {
  api,
  centavosDe,
  enderecoSite,
  mensagemDe,
  reais,
  telefone,
  textoDe,
  type Ajustes as DadosAjustes,
  type CompraTeste as DadosTeste,
} from '../api'
import { segurarSaida } from '../rota'
import { avisar, Campo, Carregando, FalhaCarga, Interruptor, useCarregar } from '../ui'

/** os preços da tabela como a pessoa digita ("25" ou "25,90"); vazio = não envia */
type FreteTexto = Record<Regiao, Record<Servico, string>>
type Rascunho = {
  vendasOnline: boolean
  taxa: string
  parcelas: number
  whatsapp: string
  frete: FreteTexto
  loja: DadosAjustes['loja']
  trocaDias: number
  freteTroca: DadosAjustes['freteTroca']
}

const PRAZOS_TROCA = [7, 10, 15, 30, 60, 90]

const FRETES_TROCA: { id: DadosAjustes['freteTroca']; nome: string }[] = [
  { id: 'dividido', nome: 'A cliente envia a peça, a loja paga o envio da nova' },
  { id: 'loja', nome: 'A loja paga a ida e a volta' },
  { id: 'cliente', nome: 'A cliente paga a ida e a volta' },
]

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** só os números e letras do CPF ou CNPJ (o CNPJ novo pode ter letras), em maiúsculas */
const semPontuacao = (t: string) => t.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14)

/** "000.000.000-00" ou "00.000.000/0000-00" enquanto a pessoa digita */
function documentoTexto(t: string) {
  const d = semPontuacao(t)
  const partes =
    d.length <= 11 && /^\d*$/.test(d)
      ? [d.slice(0, 3), d.slice(3, 6) && '.' + d.slice(3, 6), d.slice(6, 9) && '.' + d.slice(6, 9), d.slice(9) && '-' + d.slice(9)]
      : [d.slice(0, 2), '.' + d.slice(2, 5), '.' + d.slice(5, 8), '/' + d.slice(8, 12), d.slice(12) && '-' + d.slice(12)]
  return partes.join('')
}

/** os dados da loja parecem completos (o servidor confere os dígitos do CPF ou CNPJ) */
const lojaPreenchida = (l: Rascunho['loja']) =>
  l.nome.trim().length >= 3 &&
  [11, 14].includes(semPontuacao(l.documento).length) &&
  l.endereco.trim().length >= 5 &&
  EMAIL.test(l.email.trim())

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
  loja: { ...a.loja, documento: documentoTexto(a.loja.documento) },
  trocaDias: a.trocaDias,
  freteTroca: a.freteTroca,
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
  const campoLoja = (k: keyof Rascunho['loja']) => (v: string) => setR((x) => ({ ...x, loja: { ...x.loja, [k]: v } }))
  const [testePago, setTestePago] = useState(false)
  const lojaOk = lojaPreenchida(r.loja)

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
    const documento = semPontuacao(r.loja.documento)
    if (documento && ![11, 14].includes(documento.length)) return setErro('Confira o CPF (11 números) ou o CNPJ (14 caracteres) da loja.')
    if (r.loja.email.trim() && !EMAIL.test(r.loja.email.trim())) return setErro('Confira o e-mail da loja.')
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
      await api('PUT', '/ajustes', {
        vendasOnline: r.vendasOnline,
        taxaMaceioCentavos: taxa,
        parcelasSemJuros: r.parcelas,
        whatsapp: numero,
        freteCorreios,
        loja: { ...r.loja, documento },
        trocaDias: r.trocaDias,
        freteTroca: r.freteTroca,
      })
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
        {!dados.vendasOnline && (
          <ol className="passos-vendas">
            <li className={lojaOk ? 'feito' : undefined}>
              <strong>Preencher os dados da loja</strong>
              <small>Logo abaixo. Eles aparecem no rodapé do site.</small>
            </li>
            <li className={testePago ? 'feito' : undefined}>
              <strong>Fazer uma compra de teste</strong>
              <CompraTeste aoMudar={setTestePago} />
            </li>
            <li className={r.vendasOnline ? 'feito' : undefined}>
              <strong>Ligar as vendas e salvar</strong>
            </li>
          </ol>
        )}
        <Interruptor
          ligado={r.vendasOnline}
          aoMudar={campo('vendasOnline')}
          rotulo="Vender pelo site"
          bloqueado={!r.vendasOnline && !(lojaOk && testePago)}
          dica={
            r.vendasOnline || (lojaOk && testePago)
              ? 'Ligado, a cliente paga direto no site. Desligado, a sacola envia o pedido pelo WhatsApp.'
              : 'Libera depois dos dois primeiros passos. Até lá, a sacola do site envia o pedido pelo WhatsApp.'
          }
        />
      </section>

      <section className="cartao">
        <h2>Dados da loja</h2>
        <p className="campo-dica">
          Aparecem no rodapé do site e nas páginas de trocas e de privacidade. A lei do comércio eletrônico pede o nome, o CPF ou
          CNPJ e um endereço de quem vende pelo site.
        </p>
        <Campo rotulo="Nome completo ou da empresa">
          {(i) => <input id={i} value={r.loja.nome} onChange={(e) => campoLoja('nome')(e.target.value)} maxLength={120} autoComplete="off" />}
        </Campo>
        <Campo rotulo="CPF ou CNPJ" dica="Com um MEI, use o CNPJ: assim o seu CPF não aparece no site.">
          {(i) => (
            <input
              id={i}
              value={r.loja.documento}
              onChange={(e) => campoLoja('documento')(documentoTexto(e.target.value))}
              autoComplete="off"
              placeholder="000.000.000-00"
            />
          )}
        </Campo>
        <Campo rotulo="Endereço" dica="Rua, número, bairro, cidade e estado. Pode ser de onde você despacha os pedidos.">
          {(i) => <input id={i} value={r.loja.endereco} onChange={(e) => campoLoja('endereco')(e.target.value)} maxLength={200} autoComplete="off" />}
        </Campo>
        <Campo rotulo="E-mail de contato" dica="Para dúvidas, trocas e pedidos sobre dados pessoais.">
          {(i) => (
            <input id={i} type="email" value={r.loja.email} onChange={(e) => campoLoja('email')(e.target.value)} maxLength={120} autoComplete="off" />
          )}
        </Campo>
      </section>

      <section className="cartao">
        <h2>Trocas</h2>
        <Campo
          rotulo="Prazo para troca"
          dica="Contado do dia em que a cliente recebe. Para desistir da compra, a lei já garante 7 dias, com o valor e o frete devolvidos."
        >
          {(i) => (
            <select id={i} value={r.trocaDias} onChange={(e) => campo('trocaDias')(Number(e.target.value))}>
              {[...new Set([...PRAZOS_TROCA, r.trocaDias])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n} dias
                  </option>
                ))}
            </select>
          )}
        </Campo>
        <Campo
          rotulo="Frete da troca"
          dica={
            <>
              Vale para troca de tamanho, cor ou peça. Em peça com defeito, o frete é sempre da loja.
              {enderecoSite && (
                <>
                  {' '}
                  <a href={`${enderecoSite}/trocas`} target="_blank" rel="noreferrer">
                    Ver a página de trocas no site
                  </a>
                </>
              )}
            </>
          }
        >
          {(i) => (
            <select id={i} value={r.freteTroca} onChange={(e) => campo('freteTroca')(e.target.value as Rascunho['freteTroca'])}>
              {FRETES_TROCA.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          )}
        </Campo>
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

/**
  Compra de teste: um pedido de verdade, de valor baixo, pago na InfinitePay.
  Confere se o pagamento chega e se o pedido vira pago; paga, ela libera o
  interruptor das vendas. Enquanto espera o pagamento (ou o aviso automático),
  a tela confere sozinha.
*/
function CompraTeste({ aoMudar }: { aoMudar: (pago: boolean) => void }) {
  const carga = useCarregar(() => api<{ teste: DadosTeste | null }>('GET', '/compra-teste'))
  const [valor, setValor] = useState('1,00')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const teste = carga.dados?.teste ?? null
  const esperando = !!teste && (teste.situacao === 'aguardando' || (teste.pago && !teste.aviso))
  const { recarregar } = carga

  useEffect(() => aoMudar(!!teste?.pago), [teste?.pago, aoMudar])

  // pagou em outra aba: confere a cada 5 segundos e quando a pessoa volta para esta aba
  useEffect(() => {
    if (!esperando) return
    const conferir = () => document.visibilityState === 'visible' && recarregar()
    const relogio = setInterval(conferir, 5000)
    document.addEventListener('visibilitychange', conferir)
    return () => {
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', conferir)
    }
  }, [esperando, recarregar])

  const criar = async () => {
    const c = centavosDe(valor)
    if (!c || c < 100 || c > 10_000) return setErro('Use um valor de R$ 1 a R$ 100.')
    setErro('')
    setCriando(true)
    try {
      await api('POST', '/compra-teste', { valorCentavos: c })
      recarregar()
    } catch (x) {
      setErro(mensagemDe(x))
    } finally {
      setCriando(false)
    }
  }

  if (carga.erro && !carga.dados)
    return (
      <p className="erro">
        {carga.erro}{' '}
        <button type="button" className="botao-texto" onClick={recarregar}>
          Tentar de novo
        </button>
      </p>
    )
  if (!carga.dados) return <small>Carregando…</small>

  if (teste?.pago)
    return (
      <div className="teste">
        <p className="teste-ok">
          Paga: pedido nº {teste.id}, de {reais(teste.totalCentavos)}.
        </p>
        <small>
          {teste.aviso
            ? 'O aviso automático da InfinitePay também chegou. Está tudo funcionando.'
            : 'O aviso automático da InfinitePay ainda não chegou. Pode levar alguns minutos; se não chegar, avise quem cuida do site.'}{' '}
          Depois, se quiser, cancele o pedido nº {teste.id} em Pedidos e devolva o valor pelo app da InfinitePay.
        </small>
      </div>
    )

  if (teste?.situacao === 'aguardando' && teste.pagar)
    return (
      <div className="teste">
        <small>
          Pedido nº {teste.id}, de {reais(teste.totalCentavos)}, esperando o pagamento. Pague com Pix ou cartão; ao terminar, a
          InfinitePay leva você para o site, e esta tela atualiza sozinha.
        </small>
        <a className="botao" href={teste.pagar} target="_blank" rel="noreferrer">
          Abrir a página de pagamento
        </a>
      </div>
    )

  return (
    <div className="teste">
      <small>
        Uma compra de verdade, de valor baixo, para conferir se o pagamento chega e se o pedido aparece como pago. O valor cai
        na sua conta da InfinitePay.
      </small>
      <div className="teste-criar">
        <span className="preco">
          <span aria-hidden="true">R$</span>
          <input
            inputMode="decimal"
            aria-label="Valor da compra de teste"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              // o Enter aqui cria o teste, e não salva os ajustes
              if (e.key === 'Enter') {
                e.preventDefault()
                void criar()
              }
            }}
          />
        </span>
        <button type="button" className="botao botao-claro" onClick={criar} disabled={criando}>
          {criando ? 'Criando…' : 'Criar compra de teste'}
        </button>
      </div>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}
