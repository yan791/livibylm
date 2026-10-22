/*
  Página de uma compra (/pedido/<código>). A InfinitePay devolve a cliente
  para cá depois do pagamento, com os dados da transação no endereço: a
  página pede ao servidor para conferir esse pagamento e mostra a situação.
  Quem aprova é sempre o servidor (que pergunta à InfinitePay); os dados do
  endereço só servem para pedir a conferência. Enquanto a confirmação não
  chega, a página pergunta de novo de tempos em tempos.
  Pedido pago: as peças compradas saem da sacola.
*/
import { useEffect, useState } from 'react'
import { API, comBase, enderecoFoto, fotoPequena } from '../lib/base'
import { navegar } from '../lib/rota'
import { tirarCompradas } from '../lib/sacola'
import { mostrarCatalogo } from '../lib/catalogo'
import { ajustes, precoBR, rotuloTamanho } from '../dados/colecoes'
import { linkWhatsApp, site } from '../dados/site'
import { IconeCabide, SetaDiagonal, WhatsApp } from '../components/icones'
import { LinkPolitica } from './Politica'

type Situacao = 'aguardando' | 'expirado' | 'pago' | 'sem_estoque' | 'enviado' | 'entregue' | 'cancelado'

type PedidoPublico = {
  numero: number
  situacao: Situacao
  nome: string
  entrega: string
  itens: { peca: string; nome: string; cor: string; tamanho: string; quantidade: number; precoCentavos: number; foto: string }[]
  itensCentavos: number
  freteCentavos: number
  totalCentavos: number
  pagamento: string
  parcelas: number
  recibo: string
  rastreio: string
  pagar: string
  reservaAte: number
}

const reais = (centavos: number) => precoBR(centavos / 100)
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const PAGOS: Situacao[] = ['pago', 'enviado', 'entregue']

/** quanto tempo a página continua perguntando depois que a cliente volta da InfinitePay */
const ESPERA_MS = 2 * 60_000

async function pedir(codigo: string, conferir?: Record<string, string>) {
  const r = await fetch(`${API}/api/pedidos/${codigo}${conferir ? '/conferir' : ''}`, {
    method: conferir ? 'POST' : 'GET',
    headers: conferir ? { 'Content-Type': 'application/json' } : undefined,
    body: conferir ? JSON.stringify(conferir) : undefined,
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(String(r.status))
  return (await r.json()) as PedidoPublico
}

export function Pedido({ codigo }: { codigo: string }) {
  // undefined = carregando; null = não existe
  const [pedido, setPedido] = useState<PedidoPublico | null | undefined>(undefined)
  const [falhou, setFalhou] = useState(false)
  // dados do pagamento que a InfinitePay põe no endereço, lidos uma vez ao abrir
  const [dados] = useState(() => {
    const busca = new URLSearchParams(location.search)
    const transacao = busca.get('transaction_nsu') ?? ''
    return transacao ? { transacao, fatura: busca.get('slug') ?? '', recibo: busca.get('receipt_url') ?? '' } : undefined
  })
  // voltou agora da InfinitePay: mostra "confirmando" em vez de "falta pagar"
  const voltou = Boolean(dados)
  const [esperando, setEsperando] = useState(false)

  useEffect(() => {
    document.title = 'Seu pedido · Livi'
    let vivo = true
    let relogio: ReturnType<typeof setTimeout> | undefined
    // o endereço fica limpo (sem os dados da transação) para compartilhar ou recarregar
    if (location.search) history.replaceState(history.state, '', comBase(`/pedido/${codigo}`))
    const inicio = Date.now()

    const atualizar = async (conferir?: Record<string, string>) => {
      try {
        const p = await pedir(codigo, conferir)
        if (!vivo) return
        setFalhou(false)
        setPedido(p)
        const aguardando = p?.situacao === 'aguardando'
        // voltou da InfinitePay e a confirmação ainda não chegou: pergunta de novo daqui a pouco
        if (aguardando && dados && Date.now() - inicio < ESPERA_MS) {
          setEsperando(true)
          relogio = setTimeout(() => atualizar(dados), 5000)
        } else setEsperando(false)
      } catch {
        if (!vivo) return
        setFalhou(true)
        if (Date.now() - inicio < ESPERA_MS) relogio = setTimeout(() => atualizar(dados), 5000)
      }
    }
    atualizar(dados)
    return () => {
      vivo = false
      clearTimeout(relogio)
    }
  }, [codigo, dados])

  useEffect(() => {
    if (pedido && PAGOS.concat('sem_estoque').includes(pedido.situacao))
      tirarCompradas(
        codigo,
        pedido.itens.map((i) => ({ peca: i.peca, cor: i.cor, tamanho: i.tamanho, quantidade: i.quantidade })),
      )
  }, [pedido, codigo])

  const conversa = (n?: number) => linkWhatsApp(n ? `Olá! Fiz o pedido nº ${n} no site da Livi e queria falar sobre ele.` : undefined)
  const verColecoes = () => {
    navegar('/', { semTransicao: true })
    requestAnimationFrame(() => mostrarCatalogo(site.abertura.colecao))
  }

  if (pedido === undefined)
    return (
      <main className="pedido">
        <div className="pedido-caixa">
          {falhou ? (
            <>
              <h1 className="pedido-titulo">Não conseguimos abrir o seu pedido agora.</h1>
              <p className="pedido-texto">Confira a internet e recarregue a página. Se precisar, fale com a gente.</p>
              <div className="pedido-botoes">
                <button type="button" className="pilula cheia" onClick={() => location.reload()}>
                  Tentar de novo
                </button>
                <a className="pilula" href={conversa()} target="_blank" rel="noreferrer">
                  <WhatsApp className="ico" /> WhatsApp
                </a>
              </div>
            </>
          ) : (
            <p className="pedido-carregando" role="status">
              <span className="pedido-giro" aria-hidden="true" /> Abrindo o seu pedido…
            </p>
          )}
        </div>
      </main>
    )

  if (pedido === null)
    return (
      <main className="pedido">
        <div className="pedido-caixa">
          <h1 className="pedido-titulo">Pedido não encontrado.</h1>
          <p className="pedido-texto">Confira o link. Se você fez uma compra e não acha o pedido, fale com a gente pelo WhatsApp.</p>
          <div className="pedido-botoes">
            <a className="pilula cheia" href={conversa()} target="_blank" rel="noreferrer">
              <WhatsApp className="ico" /> Falar no WhatsApp
            </a>
            <button type="button" className="pilula" onClick={verColecoes}>
              Ver coleções
            </button>
          </div>
        </div>
      </main>
    )

  const p = pedido
  const pago = PAGOS.includes(p.situacao)
  const correios = p.entrega === 'pac' || p.entrega === 'sedex'
  const unidades = p.itens.reduce((s, i) => s + i.quantidade, 0)

  let titulo: string
  let texto: string
  if (pago) {
    titulo = p.nome ? `Obrigada, ${p.nome}.` : 'Obrigada pela compra.'
    texto =
      p.situacao === 'entregue'
        ? 'Seu pedido foi entregue. Esperamos que você goste de cada peça.'
        : p.situacao === 'enviado'
          ? correios
            ? 'Seu pedido foi postado nos Correios.'
            : 'Seu pedido saiu para entrega.'
          : correios
            ? 'Seu pagamento foi confirmado. Assim que o pedido for postado, mandamos o código de rastreio pelo WhatsApp.'
            : 'Seu pagamento foi confirmado. Vamos te chamar no WhatsApp para combinar a entrega.'
  } else if (p.situacao === 'sem_estoque') {
    titulo = 'Recebemos o seu pagamento.'
    texto =
      'Uma das peças acabou enquanto o pagamento era concluído. Vamos te chamar no WhatsApp para resolver: esperar a peça voltar, trocar por outra ou devolver o valor.'
  } else if (p.situacao === 'aguardando') {
    titulo = voltou ? 'Confirmando o seu pagamento…' : 'Falta pouco.'
    texto = voltou
      ? esperando
        ? 'Isso leva só alguns segundos. Esta página atualiza sozinha.'
        : 'Ainda não recebemos a confirmação. Se você pagou, ela chega em instantes: recarregue a página daqui a pouco.'
      : `As suas peças estão separadas até ${hora(p.reservaAte)}. Conclua o pagamento para garantir.`
  } else if (p.situacao === 'expirado') {
    titulo = 'O tempo para pagar acabou.'
    texto = 'As peças voltaram para a loja. Se você já pagou, fale com a gente pelo WhatsApp que a gente resolve.'
  } else {
    titulo = 'Este pedido foi cancelado.'
    texto = 'Se tiver alguma dúvida, fale com a gente pelo WhatsApp.'
  }

  const forma = p.pagamento === 'pix' ? 'Pix' : p.pagamento === 'credit_card' ? `Cartão de crédito${p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}` : ''

  return (
    <main className="pedido">
      <div className="pedido-caixa">
        <p className="sobretitulo">Pedido nº {p.numero}</p>
        <h1 className="pedido-titulo">{titulo}</h1>
        <p className="pedido-texto" aria-live="polite">
          {p.situacao === 'aguardando' && voltou && esperando && <span className="pedido-giro" aria-hidden="true" />}
          {texto}
        </p>

        {(pago || p.situacao === 'sem_estoque') && (
          <ol className="pedido-etapas" aria-label="Andamento do pedido">
            {['Pago', correios ? 'Postado' : 'Saiu para entrega', 'Entregue'].map((e, i) => {
              const feita = i === 0 || (i === 1 && ['enviado', 'entregue'].includes(p.situacao)) || (i === 2 && p.situacao === 'entregue')
              return (
                <li key={e} className={feita ? 'feita' : undefined}>
                  <span aria-hidden="true" />
                  {e}
                </li>
              )
            })}
          </ol>
        )}
        {p.rastreio && (
          <p className="pedido-rastreio">
            Código de rastreio: <strong>{p.rastreio}</strong>{' '}
            <a href="https://rastreamento.correios.com.br" target="_blank" rel="noreferrer">
              Acompanhar nos Correios
            </a>
          </p>
        )}

        <div className="pedido-botoes">
          {p.situacao === 'aguardando' && p.pagar && !(voltou && esperando) && (
            <a className="pilula cheia" href={p.pagar}>
              {voltou ? 'Voltar ao pagamento' : 'Pagar agora'} <SetaDiagonal className="seta" />
            </a>
          )}
          <a className={p.situacao === 'aguardando' ? 'pilula' : 'pilula cheia'} href={conversa(p.numero)} target="_blank" rel="noreferrer">
            <WhatsApp className="ico" /> Falar com a Livi
          </a>
          {p.situacao !== 'aguardando' && (
            <button type="button" className="pilula" onClick={verColecoes}>
              Ver coleções
            </button>
          )}
        </div>

        <section className="pedido-resumo" aria-label="Resumo do pedido">
          <h2 className="sobretitulo">
            {unidades} {unidades === 1 ? 'peça' : 'peças'}
          </h2>
          <ul>
            {p.itens.map((i, n) => (
              <li key={n}>
                <span className="pedido-foto">{i.foto ? <img src={enderecoFoto(fotoPequena(i.foto))} alt="" /> : <IconeCabide />}</span>
                <span className="pedido-item">
                  <strong>{i.nome}</strong>
                  {/* a compra de teste do painel não tem cor nem tamanho */}
                  {i.tamanho && (
                    <span>
                      {i.cor} · {rotuloTamanho(i.tamanho)}
                      {i.quantidade > 1 && ` · ${i.quantidade} unidades`}
                    </span>
                  )}
                </span>
                <span className="pedido-valor">{reais(i.precoCentavos * i.quantidade)}</span>
              </li>
            ))}
          </ul>
          <dl>
            {p.freteCentavos > 0 && (
              <>
                <div>
                  <dt>Peças</dt>
                  <dd>{reais(p.itensCentavos)}</dd>
                </div>
                <div>
                  <dt>{p.entrega === 'maceio' ? 'Entrega em Maceió' : 'Frete'}</dt>
                  <dd>{reais(p.freteCentavos)}</dd>
                </div>
              </>
            )}
            <div className="pedido-total">
              <dt>Total</dt>
              <dd>{reais(p.totalCentavos)}</dd>
            </div>
            {forma && (
              <div>
                <dt>Pagamento</dt>
                <dd>{forma}</dd>
              </div>
            )}
          </dl>
          {p.recibo && (
            <a className="pedido-recibo" href={p.recibo} target="_blank" rel="noreferrer">
              Ver comprovante do pagamento
            </a>
          )}
        </section>
        {pago && ajustes.loja && (
          <p className="pedido-politica">
            Precisa trocar ou devolver? <LinkPolitica nome="trocas">Veja como funciona</LinkPolitica>.
          </p>
        )}
      </div>
    </main>
  )
}
