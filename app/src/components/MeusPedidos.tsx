/*
  Aba "Pedidos" da gaveta. Com a conta aberta (lib/conta): os pedidos da conta,
  de qualquer aparelho, e os que este aparelho guardou. Sem a conta: o
  formulário para entrar e, se o aparelho guardou algum pedido (lib/meus-pedidos),
  a lista dele. "Acompanhar" (a setinha) abre as etapas do pedido, com a data
  de cada uma; tocar no pedido abre a página dele, com todos os detalhes.
  O código de rastreio não aparece aqui: a loja manda pelo WhatsApp, e a
  cliente pode pedir por lá.
*/
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  consultarPedidos,
  dataDoPedido,
  esquecerPedidos,
  etapasDo,
  mensagemRastreio,
  PAGOS,
  pelosCorreios,
  quandoEtapa,
  situacaoTexto,
  useMeusPedidos,
  type PedidoPublico,
} from '../lib/meus-pedidos'
import { pedidosDaConta, sairDaConta, useConta } from '../lib/conta'
import { navegar } from '../lib/rota'
import { comBase, enderecoFoto, fotoPequena } from '../lib/base'
import { cn } from '../lib/cn'
import { precoBR } from '../dados/colecoes'
import { linkWhatsApp } from '../dados/site'
import { Fechar, IconeCabide, IconePedido, WhatsApp } from './icones'
import { Entrar } from './Entrar'

const ease = [0.22, 1, 0.36, 1] as const

/** a setinha do "Acompanhar" (vira para cima quando as etapas estão abertas) */
function Seta() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="pedidos-seta-ico">
      <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PainelPedidos({ fechar }: { fechar: () => void }) {
  const sessao = useConta()
  const dentro = sessao.situacao === 'dentro'
  const codigos = useMeusPedidos()
  // sem conta, com pedidos no aparelho: a lista primeiro, e "Entrar na minha conta" troca para o formulário
  const [entrando, setEntrando] = useState(false)

  if (sessao.situacao === 'carregando')
    return (
      <div className="gaveta-vazia">
        <p className="pedidos-carregando" role="status">
          <span className="pedido-giro" aria-hidden="true" /> Abrindo a sua conta…
        </p>
      </div>
    )

  if (!dentro && (entrando || !codigos.length))
    return (
      <div className="compra">
        <div className="compra-corpo">
          {codigos.length > 0 && (
            <button type="button" className="compra-voltar" onClick={() => setEntrando(false)}>
              Ver os pedidos deste aparelho
            </button>
          )}
          <Entrar
            titulo="Entre na sua conta"
            texto="Seus pedidos ficam na sua conta. Entre com o WhatsApp e a senha para acompanhar de qualquer aparelho."
          />
          <p className="conta-texto conta-rodape">
            Ainda não tem conta? Ela é criada na sua primeira compra pelo site, na hora de fechar a sacola.
          </p>
        </div>
      </div>
    )

  return <ListaPedidos fechar={fechar} entrar={() => setEntrando(true)} />
}

function ListaPedidos({ fechar, entrar }: { fechar: () => void; entrar: () => void }) {
  const sessao = useConta()
  const conta = sessao.situacao === 'dentro' ? sessao.conta : null
  const codigos = useMeusPedidos()
  const [pedidos, setPedidos] = useState<(PedidoPublico & { daConta?: boolean })[] | null>(null)
  const [erro, setErro] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  // pedidos com as etapas abertas (a setinha)
  const [abertos, setAbertos] = useState<string[]>([])
  const chave = codigos.join(',')
  const quem = conta?.whatsapp ?? ''

  useEffect(() => {
    const lista = chave ? chave.split(',') : []
    if (!quem && !lista.length) return
    let vivo = true
    setErro(false)
    const consulta = quem ? pedidosDaConta(lista) : consultarPedidos(lista)
    consulta.then(
      (achados) => {
        // null: a sessão venceu, e a aba volta para o formulário de entrar
        if (!vivo || !achados) return
        setPedidos(achados)
        // o servidor não conhece mais esses códigos (ou o pedido venceu sem pagar, na conta): saem do aparelho
        const sumiram = lista.filter((c) => !achados.some((p) => p.codigo === c))
        if (sumiram.length) esquecerPedidos(sumiram)
      },
      () => vivo && setErro(true),
    )
    return () => {
      vivo = false
    }
  }, [chave, tentativa, quem])

  const abrir = (p: PedidoPublico) => (e?: React.MouseEvent) => {
    e?.preventDefault()
    fechar()
    navegar(`/pedido/${p.codigo}`, { semTransicao: true })
  }

  const ola = conta && (
    <div className="pedidos-conta">
      <p>
        Olá, <strong>{conta.nome.split(/\s+/)[0]}</strong>
      </p>
      <button type="button" className="conta-link" onClick={sairDaConta}>
        Sair
      </button>
    </div>
  )

  if (!pedidos)
    return (
      <>
        {ola}
        <div className="gaveta-vazia">
          {erro ? (
            <>
              <p>Não conseguimos carregar os seus pedidos agora.</p>
              <button type="button" className="pilula" onClick={() => setTentativa((n) => n + 1)}>
                Tentar de novo
              </button>
            </>
          ) : (
            <p className="pedidos-carregando" role="status">
              <span className="pedido-giro" aria-hidden="true" /> Carregando os seus pedidos…
            </p>
          )}
        </div>
      </>
    )

  // sem conta, só os códigos que continuam no aparelho (o X tira na hora)
  const visiveis = conta ? pedidos : pedidos.filter((p) => codigos.includes(p.codigo))

  if (!visiveis.length)
    return (
      <>
        {ola}
        <div className="gaveta-vazia">
          <IconePedido className="gaveta-vazia-icone" />
          <p className="gaveta-vazia-titulo">Nenhum pedido por aqui</p>
          <p>As compras que você fizer pelo site com a sua conta aparecem aqui, com o andamento de cada uma.</p>
        </div>
      </>
    )

  return (
    <>
      {ola}
      <ul className="gaveta-lista pedidos-lista">
        <AnimatePresence initial={false}>
          {visiveis.map((p) => {
            const pecas = p.itens.reduce((s, i) => s + i.quantidade, 0)
            const foto = p.itens.find((i) => i.foto)?.foto
            const pago = PAGOS.includes(p.situacao) || p.situacao === 'sem_estoque'
            const encerrado = p.situacao === 'expirado' || p.situacao === 'cancelado'
            // pelos Correios, pago e ainda não entregue: o código de rastreio a cliente pede pelo WhatsApp
            const pedirRastreio = pelosCorreios(p.entrega) && pago && p.situacao !== 'entregue'
            const aberto = abertos.includes(p.codigo)
            // o X só tira do aparelho; o que está na conta fica como histórico
            const tirar = encerrado && !p.daConta
            return (
              <motion.li
                key={p.codigo}
                layout
                className={cn(encerrado && 'encerrado')}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.45, ease }}
              >
                <a className="gaveta-foto" href={comBase(`/pedido/${p.codigo}`)} onClick={abrir(p)} aria-label={`Ver o pedido nº ${p.numero}`}>
                  {foto ? <img src={enderecoFoto(fotoPequena(foto))} alt="" /> : <IconeCabide />}
                </a>
                <div className="gaveta-info">
                  <p className="gaveta-nome">
                    <a href={comBase(`/pedido/${p.codigo}`)} onClick={abrir(p)}>
                      Pedido nº {p.numero}
                    </a>
                  </p>
                  <p className="gaveta-detalhe">
                    {dataDoPedido(p.criadoEm)} · {pecas} {pecas === 1 ? 'peça' : 'peças'} · {precoBR(p.totalCentavos / 100)}
                  </p>
                  <p className={cn('pedidos-situacao', pago && 'pago', encerrado && 'encerrado')}>{situacaoTexto(p)}</p>
                  <div className="pedidos-acoes">
                    <button
                      type="button"
                      className={cn('pedidos-seta', aberto && 'aberta')}
                      aria-expanded={aberto}
                      aria-controls={`etapas-${p.codigo}`}
                      onClick={() => setAbertos((a) => (aberto ? a.filter((c) => c !== p.codigo) : [...a, p.codigo]))}
                    >
                      Acompanhar <Seta />
                    </button>
                    {p.situacao === 'aguardando' && p.pagar && <a href={p.pagar}>Pagar agora</a>}
                    {pedirRastreio && (
                      <a href={linkWhatsApp(mensagemRastreio(p.numero))} target="_blank" rel="noreferrer">
                        <WhatsApp className="ico" /> Pedir o código de rastreio
                      </a>
                    )}
                    <a href={comBase(`/pedido/${p.codigo}`)} onClick={abrir(p)}>
                      Ver detalhes
                    </a>
                  </div>
                </div>
                {tirar && (
                  <button type="button" className="gaveta-tirar" onClick={() => esquecerPedidos([p.codigo])} aria-label={`Tirar o pedido nº ${p.numero} da lista`}>
                    <Fechar />
                  </button>
                )}
                {/* depois do X, para ele ficar na primeira linha, ao lado do pedido */}
                <AnimatePresence initial={false}>
                  {aberto && (
                    <motion.ol
                      id={`etapas-${p.codigo}`}
                      className="pedidos-etapas"
                      aria-label={`Etapas do pedido nº ${p.numero}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease }}
                    >
                      {etapasDo(p).map((e) => (
                        <li key={e.titulo} className={cn(e.feita && 'feita')}>
                          <span className="pedidos-etapa-ponto" aria-hidden="true" />
                          <span className="pedidos-etapa-texto">
                            <strong>{e.titulo}</strong>
                            {e.feita ? (e.em ? <time dateTime={new Date(e.em).toISOString()}>{quandoEtapa(e.em)}</time> : null) : <small>Ainda não</small>}
                            {e.texto && <small>{e.texto}</small>}
                          </span>
                        </li>
                      ))}
                    </motion.ol>
                  )}
                </AnimatePresence>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      <div className="gaveta-rodape">
        {conta ? (
          <p className="gaveta-nota">O código de rastreio a gente manda pelo WhatsApp assim que o pedido é postado nos Correios.</p>
        ) : (
          <>
            <p className="gaveta-nota">Aqui aparecem os pedidos feitos neste aparelho. Entre na sua conta para ver todos, de qualquer aparelho.</p>
            <button type="button" className="pilula cheia" onClick={entrar}>
              Entrar na minha conta
            </button>
          </>
        )}
        <a className="pilula" href={linkWhatsApp('Olá! Fiz um pedido no site da Livi e queria saber dele.')} target="_blank" rel="noreferrer">
          <WhatsApp className="ico" /> Falar no WhatsApp
        </a>
      </div>
    </>
  )
}
