/*
  Um pedido: situação e o que fazer agora (marcar como pago, enviado,
  entregue, cancelar), dados da cliente com as mensagens prontas do
  WhatsApp (e o link de senha nova, se ela tem conta no site e esqueceu),
  endereço para copiar, peças, pagamento, anotação interna e a folha para
  imprimir e separar as peças.
*/
import { useEffect, useState, type ReactNode } from 'react'
import { api, mensagemDe, reais, telefone, type Ajustes, type Pedido } from '../api'
import { aoClicar, segurarSaida } from '../rota'
import { pequena } from '../imagem'
import {
  cpfTexto,
  dataCompleta,
  ENTREGAS,
  enderecoLinhas,
  hora,
  linkConversa,
  mensagemConfirmacao,
  mensagemEnvio,
  mensagemSenhaNova,
  pagamentoTexto,
  PAGAMENTOS,
  pelosCorreios,
  quando,
  SITUACOES,
} from '../pedidos'
import { avisar, Carregando, confirmar, FalhaCarga, Icone, perguntar, useCarregar } from '../ui'

/** a aba "Pedidos" atualiza o número de pedidos pra enviar */
export const EVENTO_PEDIDOS = 'painel:pedidos-mudaram'

export function PedidoDetalhe({ id }: { id: number }) {
  const carga = useCarregar(() => api<Pedido>('GET', `/pedidos/${id}`), [id])
  const ajustes = useCarregar(() => api<Ajustes>('GET', '/ajustes'))
  if (carga.erro) return <FalhaCarga erro={carga.erro} tentar={carga.recarregar} />
  if (!carga.dados) return <Carregando />
  return <Tela inicial={carga.dados} whatsappLoja={ajustes.dados?.whatsapp ?? ''} />
}

function Tela({ inicial, whatsappLoja }: { inicial: Pedido; whatsappLoja: string }) {
  const [p, setP] = useState(inicial)
  const [agindo, setAgindo] = useState(false)
  const [rastreio, setRastreio] = useState(inicial.rastreio)
  const [nota, setNota] = useState(inicial.observacao)
  const situacao = SITUACOES[p.situacao]
  const correios = pelosCorreios(p.entrega)
  const pago = ['pago', 'sem_estoque', 'enviado', 'entregue'].includes(p.situacao)

  // anotação ou código de rastreio digitados e não salvos
  const pendente = nota !== p.observacao || (p.situacao === 'enviado' && rastreio !== p.rastreio)
  useEffect(() => {
    segurarSaida(pendente ? () => window.confirm('Sair sem salvar o que você digitou?') : null)
    return () => segurarSaida(null)
  }, [pendente])

  const agir = async (caminho: string, corpo: unknown, aviso: string) => {
    setAgindo(true)
    try {
      const novo = await api<Pedido>(caminho.endsWith('observacao') ? 'PUT' : 'POST', `/pedidos/${p.id}/${caminho}`, corpo)
      setP(novo)
      setRastreio(novo.rastreio)
      setNota(novo.observacao)
      window.dispatchEvent(new Event(EVENTO_PEDIDOS))
      avisar(aviso)
    } catch (e) {
      avisar(mensagemDe(e), 'erro')
    } finally {
      setAgindo(false)
    }
  }

  const marcarPago = async () => {
    const ok = await confirmar({
      titulo: 'Marcar como pago?',
      texto:
        p.origem === 'site'
          ? 'Só marque se o dinheiro já apareceu no app da InfinitePay. As peças saem do estoque agora.'
          : 'As peças saem do estoque agora.',
      botao: 'Marcar como pago',
      desistir: 'Agora não',
    })
    if (ok) agir('pago', {}, 'Pedido marcado como pago.')
  }

  const enviar = () => agir('enviado', { rastreio }, p.situacao === 'enviado' ? 'Código de rastreio salvo.' : 'Pedido marcado como enviado.')

  const cancelar = async () => {
    // só pergunta do estoque se alguma peça já saiu dele (as sob encomenda nunca saem)
    const comEstoque = p.estoqueBaixado && p.itens.some((i) => !i.sobEncomenda)
    // já enviado, a peça está com a cliente: por padrão não volta, até ela devolver
    const despachado = p.situacao === 'enviado' || p.situacao === 'entregue'
    const { ok, marcada } = await perguntar({
      titulo: `Cancelar o pedido nº ${p.id}?`,
      texto: pago && p.origem === 'site' ? 'O dinheiro não volta sozinho: devolva pelo app da InfinitePay.' : undefined,
      opcao: comEstoque
        ? {
            rotulo: 'Devolver as peças ao estoque',
            dica: despachado
              ? 'As peças foram enviadas. Marque só se já voltaram e estão boas para vender; se não, ajuste o estoque na peça quando voltarem.'
              : 'Desmarque se alguma peça não volta para a venda, como uma que veio com defeito.',
            marcada: !despachado,
          }
        : undefined,
      botao: 'Cancelar pedido',
      desistir: 'Manter pedido',
      perigo: true,
    })
    if (!ok) return
    const devolver = !comEstoque || marcada
    agir('cancelar', { devolverEstoque: devolver }, devolver ? 'Pedido cancelado.' : 'Pedido cancelado. As peças ficaram fora do estoque.')
  }

  const endereco = enderecoLinhas(p)
  const copiarEndereco = async () => {
    const texto = [p.nome, ...endereco, p.whatsapp ? `WhatsApp ${telefone(p.whatsapp)}` : ''].filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      avisar('Endereço copiado.')
    } catch {
      avisar('Não deu para copiar. Selecione o endereço e copie à mão.', 'erro')
    }
  }

  const unidades = p.itens.reduce((s, i) => s + i.quantidade, 0)

  return (
    <div className="tela tela-pedido">
      <a className="voltar" href="/painel/pedidos" onClick={aoClicar('/painel/pedidos')}>
        {Icone.voltar} Pedidos
      </a>
      <div className="tela-topo">
        <div>
          <h1>Pedido nº {p.id}</h1>
          <p className="tela-resumo">
            {p.origem === 'site' ? 'Compra pelo site' : 'Venda registrada no painel'}, {quando(p.criadoEm)}
          </p>
        </div>
        <span className={`selo selo-grande ${situacao.selo}`}>{situacao.rotulo}</span>
      </div>

      <Alerta p={p} />

      {p.situacao !== 'cancelado' && (
        <section className="cartao acoes-pedido">
          <h2>O que fazer agora</h2>
          {(p.situacao === 'aguardando' || p.situacao === 'expirado') && (
            <button type="button" className="botao" onClick={marcarPago} disabled={agindo}>
              Marcar como pago
            </button>
          )}
          {['pago', 'sem_estoque', 'enviado'].includes(p.situacao) && (
            <div className="envio">
              {(correios || p.entrega === 'combinar') && (
                <label className="campo">
                  <span className="campo-rotulo">Código de rastreio {correios ? '' : '(se for pelos Correios)'}</span>
                  <input
                    value={rastreio}
                    onChange={(e) => setRastreio(e.target.value.toUpperCase())}
                    placeholder="Ex.: QB123456789BR"
                    maxLength={40}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              )}
              <div className="botoes">
                {p.situacao !== 'enviado' ? (
                  <button type="button" className="botao" onClick={enviar} disabled={agindo}>
                    Marcar como enviado
                  </button>
                ) : (
                  rastreio !== p.rastreio && (
                    <button type="button" className="botao botao-claro" onClick={enviar} disabled={agindo}>
                      Salvar código
                    </button>
                  )
                )}
                <button type="button" className={`botao ${p.situacao === 'enviado' ? '' : 'botao-claro'}`} onClick={() => agir('entregue', {}, 'Pedido marcado como entregue.')} disabled={agindo}>
                  Marcar como entregue
                </button>
              </div>
            </div>
          )}
          <div className="botoes">
            <button type="button" className="botao-texto" onClick={() => window.print()}>
              {Icone.imprimir} Imprimir para separar
            </button>
            <button type="button" className="botao-texto perigo" onClick={cancelar} disabled={agindo}>
              Cancelar pedido
            </button>
          </div>
        </section>
      )}

      {(p.nome || p.whatsapp) && (
        <section className="cartao">
          <h2>Cliente</h2>
          <dl className="dados">
            {p.nome && <Dado rotulo="Nome">{p.nome}</Dado>}
            {p.whatsapp && <Dado rotulo="WhatsApp">{telefone(p.whatsapp)}</Dado>}
            {p.email && (
              <Dado rotulo="E-mail">
                <a href={`mailto:${p.email}`}>{p.email}</a>
              </Dado>
            )}
            {p.cpf && <Dado rotulo="CPF">{cpfTexto(p.cpf)}</Dado>}
            {p.conta && <Dado rotulo="Conta no site">Sim, entra com o WhatsApp e a senha</Dado>}
          </dl>
          {p.whatsapp && (
            <div className="mensagens">
              <a className="botao botao-claro" href={linkConversa(p.whatsapp)} target="_blank" rel="noreferrer">
                {Icone.whatsapp} Abrir conversa
              </a>
              {p.conta && <SenhaNova pedidoId={p.id} />}
              {pago && p.nome && (
                <>
                  <a className="botao botao-claro" href={linkConversa(p.whatsapp, mensagemConfirmacao(p))} target="_blank" rel="noreferrer">
                    Mensagem: pedido confirmado
                  </a>
                  {(p.situacao === 'enviado' || p.situacao === 'entregue') && (
                    <a className="botao botao-claro" href={linkConversa(p.whatsapp, mensagemEnvio(p))} target="_blank" rel="noreferrer">
                      Mensagem: {pelosCorreios(p.entrega) && p.rastreio ? 'código de rastreio' : 'saiu para entrega'}
                    </a>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}

      <section className="cartao">
        <h2>Entrega</h2>
        <p className="entrega-tipo">{ENTREGAS[p.entrega] ?? p.entrega}</p>
        {endereco.length > 0 && (
          <>
            <address className="endereco">
              {endereco.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </address>
            <button type="button" className="botao botao-claro" onClick={copiarEndereco}>
              {Icone.copiar} Copiar endereço
            </button>
          </>
        )}
        {p.rastreio && (p.situacao === 'enviado' || p.situacao === 'entregue') && (
          <p className="campo-dica">
            Rastreio: <strong>{p.rastreio}</strong>
          </p>
        )}
      </section>

      <section className="cartao">
        <h2>
          {unidades} {unidades === 1 ? 'peça' : 'peças'}
        </h2>
        <ul className="itens-pedido">
          {p.itens.map((i) => (
            <li key={i.id}>
              <span className="miniatura">{i.foto ? <img src={pequena(i.foto)} alt="" loading="lazy" /> : Icone.foto}</span>
              <span className="linha-texto">
                <strong>{i.nome}</strong>
                <span>
                  {i.cor} · {i.tamanho}
                  {i.sobEncomenda && ' · sob encomenda'}
                </span>
                {i.quantidade > 1 && (
                  <span>
                    {i.quantidade} × {reais(i.precoCentavos)}
                  </span>
                )}
              </span>
              <span className="item-total">{reais(i.precoCentavos * i.quantidade)}</span>
            </li>
          ))}
        </ul>
        <dl className="totais">
          {p.freteCentavos > 0 && (
            <>
              <Dado rotulo="Peças">{reais(p.itensCentavos)}</Dado>
              <Dado rotulo="Entrega">{reais(p.freteCentavos)}</Dado>
            </>
          )}
          <Dado rotulo="Total" forte>
            {reais(p.totalCentavos)}
          </Dado>
        </dl>
      </section>

      {(pago || p.pagamento) && (
        <section className="cartao">
          <h2>Pagamento</h2>
          <dl className="dados">
            {p.pagamento && <Dado rotulo="Forma">{pagamentoTexto(p) || PAGAMENTOS[p.pagamento]}</Dado>}
            {p.pagoEm && <Dado rotulo="Pago">{quando(p.pagoEm)}</Dado>}
            {p.pagoCentavos > p.totalCentavos && (
              <Dado rotulo="A cliente pagou">
                {reais(p.pagoCentavos)} <small>(com os juros do parcelamento)</small>
              </Dado>
            )}
          </dl>
          {p.recibo && (
            <a className="link-acao" href={p.recibo} target="_blank" rel="noreferrer">
              {Icone.externo} Ver recibo da InfinitePay
            </a>
          )}
        </section>
      )}

      <section className="cartao">
        <h2>Histórico</h2>
        <ol className="historico">
          <li>
            <span>{p.origem === 'site' ? 'Pedido feito no site' : 'Venda registrada'}</span> {quando(p.criadoEm)}
          </li>
          {p.pagoEm && (
            <li>
              <span>{p.situacao === 'sem_estoque' ? 'Pago (sem estoque)' : 'Pago'}</span> {quando(p.pagoEm)}
            </li>
          )}
          {p.enviadoEm && (
            <li>
              <span>Enviado</span> {quando(p.enviadoEm)}
            </li>
          )}
          {p.entregueEm && (
            <li>
              <span>Entregue</span> {quando(p.entregueEm)}
            </li>
          )}
          {p.canceladoEm && (
            <li>
              <span>Cancelado</span> {quando(p.canceladoEm)}
              {p.estoqueBaixado && p.itens.some((i) => !i.sobEncomenda) && ', sem devolver as peças ao estoque'}
            </li>
          )}
        </ol>
      </section>

      <section className="cartao">
        <h2>Anotação da loja</h2>
        <textarea
          rows={3}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          maxLength={1000}
          placeholder="Só a equipe vê. Ex.: cliente pediu embrulho para presente."
          aria-label="Anotação da loja"
        />
        {nota !== p.observacao && (
          <button type="button" className="botao botao-claro" onClick={() => agir('observacao', { observacao: nota }, 'Anotação salva.')} disabled={agindo}>
            Salvar anotação
          </button>
        )}
      </section>

      <FolhaImpressa p={p} endereco={endereco} whatsappLoja={whatsappLoja} />
    </div>
  )
}

function Dado({ rotulo, children, forte }: { rotulo: string; children: ReactNode; forte?: boolean }) {
  return (
    <div className={forte ? 'dado dado-forte' : 'dado'}>
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** o que a situação pede de atenção */
function Alerta({ p }: { p: Pedido }) {
  let texto: string | null = null
  if (p.situacao === 'sem_estoque')
    texto =
      'O pagamento chegou depois que a reserva venceu e uma das peças já tinha sido vendida. Fale com a cliente: dá para esperar a peça voltar, trocar por outra ou devolver o dinheiro pelo app da InfinitePay.'
  else if (p.situacao === 'aguardando') texto = `A cliente ainda não pagou. As peças ficam seguras até ${hora(p.reservaAte)}; depois disso, voltam para o site.`
  else if (p.situacao === 'expirado')
    texto = 'A cliente não pagou a tempo e as peças voltaram para o site. Se o dinheiro aparecer no app da InfinitePay, marque como pago.'
  else if (p.observacao.includes('Pagamento repetido')) texto = 'Este pedido foi pago duas vezes. Veja a anotação abaixo e confira no app da InfinitePay.'
  if (!texto) return null
  return (
    <p className={`alerta ${p.situacao === 'aguardando' || p.situacao === 'expirado' ? 'alerta-calmo' : ''}`} role="status">
      {Icone.aviso}
      <span>{texto}</span>
    </p>
  )
}

/** folha para separar as peças (só aparece na impressão) */
function FolhaImpressa({ p, endereco, whatsappLoja }: { p: Pedido; endereco: string[]; whatsappLoja: string }) {
  return (
    <section className="folha" aria-hidden="true">
      <header>
        <p className="folha-marca">Livi</p>
        <div>
          <p className="folha-numero">Pedido nº {p.id}</p>
          <p>{dataCompleta(p.criadoEm)}</p>
        </div>
      </header>
      <div className="folha-cliente">
        <p>
          <strong>{p.nome || 'Cliente'}</strong>
          {p.whatsapp && ` · ${telefone(p.whatsapp)}`}
        </p>
        <p>{ENTREGAS[p.entrega] ?? p.entrega}</p>
        {endereco.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th aria-label="Separado" />
            <th>Peça</th>
            <th>Cor</th>
            <th>Tamanho</th>
            <th>Qtd.</th>
          </tr>
        </thead>
        <tbody>
          {p.itens.map((i) => (
            <tr key={i.id}>
              <td>
                <span className="folha-caixa" />
              </td>
              <td>{i.nome}</td>
              <td>{i.cor}</td>
              <td>{i.tamanho}</td>
              <td>{i.quantidade}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.observacao && <p className="folha-nota">Anotação: {p.observacao}</p>}
      <footer>
        <p>Obrigada pela compra!</p>
        {whatsappLoja && <p>Qualquer dúvida, fale com a gente no WhatsApp {telefone(whatsappLoja)}.</p>}
      </footer>
    </section>
  )
}

/**
  A cliente esqueceu a senha da conta do site: gera um link de senha nova
  (vale por 24 horas e uma vez só) e abre a conversa com o WhatsApp da conta.
  São dois toques porque o navegador bloqueia abrir o WhatsApp depois de esperar o servidor.
*/
function SenhaNova({ pedidoId }: { pedidoId: number }) {
  const [link, setLink] = useState<{ link: string; whatsapp: string; nome: string } | null>(null)
  const [gerando, setGerando] = useState(false)
  const gerar = async () => {
    const ok = await confirmar({
      titulo: 'Gerar um link de senha nova?',
      texto: 'Use quando a cliente disser que esqueceu a senha da conta do site. O link vale por 24 horas, uma vez só, e vai para o WhatsApp da conta.',
      botao: 'Gerar link',
    })
    if (!ok) return
    setGerando(true)
    try {
      setLink(await api<{ link: string; whatsapp: string; nome: string }>('POST', `/pedidos/${pedidoId}/nova-senha`))
    } catch (e) {
      avisar(mensagemDe(e), 'erro')
    }
    setGerando(false)
  }
  if (link)
    return (
      <a className="botao" href={linkConversa(link.whatsapp, mensagemSenhaNova(link.nome, link.link))} target="_blank" rel="noreferrer">
        {Icone.whatsapp} Mandar o link de senha nova
      </a>
    )
  return (
    <button type="button" className="botao botao-claro" onClick={gerar} disabled={gerando}>
      {gerando ? 'Gerando…' : 'Esqueceu a senha? Gerar link'}
    </button>
  )
}
