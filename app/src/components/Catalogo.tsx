/*
  Catálogo rápido: ao tocar num look, a coleção abre por cima da página numa
  vitrine que desliza para o lado. Cada peça abre com fotos, preço, cor,
  tamanhos e descrição, e segue para a sacola ou direto para o WhatsApp.
  O coração das peças só salva na lista de desejos (não leva à compra).
  O que aparece aqui vem do endereço (/colecao/velvet/vestido-velvet): o link
  da peça pode ser compartilhado e abre direto nela.
  Peça aberta da página de peças (/pecas/saias): as setas passam pelas peças
  do filtro, de qualquer coleção, e o voltar leva de volta à grade.
*/
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  acharColecao,
  colecoes,
  corEsgotada,
  disponivel,
  pecaEsgotada,
  precoBR,
  rotuloTamanho,
  textoEncomenda,
  textoParcelas,
  type Colecao,
  type Peca,
} from '../dados/colecoes'
import { linkWhatsApp, mensagemEsgotada, mensagemPeca } from '../dados/site'
import {
  corrigirEndereco,
  fecharCatalogo,
  fundoDoCatalogo,
  pecaDaLista,
  trocarColecao,
  useCatalogo,
  verDaLista,
  verPeca,
  voltarDaPeca,
} from '../lib/catalogo'
import { nomeDoFiltro, pecasDoFiltro, type ItemPeca } from '../dados/tipos'
import { abrirSacola, adicionarNaSacola, idDoItem, useSacola } from '../lib/sacola'
import { fotoPequena } from '../lib/base'
import { interpretar, suportaTransicao } from '../lib/rota'
import { pausarRolagem } from '../lib/scroll'
import { cn } from '../lib/cn'
import { Espaco, Ph } from './Espaco'
import { BotaoDesejos, BotaoSacola } from './Gaveta'
import { BotaoDesejo } from './Desejos'
import { Fechar, SetaDireita, SetaEsquerda, WhatsApp } from './icones'

const ease = [0.22, 1, 0.36, 1] as const
const doisDigitos = (n: number) => String(n).padStart(2, '0')

/** as peças do filtro da página de peças que está por baixo (aberta da grade), ou null */
function listaDoFundo(): { nome: string; itens: ItemPeca[] } | null {
  const fundo = pecaDaLista() ? fundoDoCatalogo() : null
  const rota = fundo ? interpretar(fundo) : null
  if (rota?.nome !== 'pecas') return null
  const filtro = { tipo: rota.tipo, tamanho: rota.tamanho }
  return { nome: nomeDoFiltro(filtro), itens: pecasDoFiltro(filtro) }
}

export function Catalogo() {
  const estado = useCatalogo()
  const colecao = estado ? acharColecao(estado.colecao) : undefined
  const peca = colecao && estado?.peca ? colecao.pecas.find((p) => p.slug === estado.peca) : undefined
  const enderecoErrado = Boolean(estado && (!colecao || (estado.peca && !peca)))
  const lista = peca ? listaDoFundo() : null
  // o título da aba antes de abrir (o da página inicial ou o da página de peças), para devolver ao fechar
  const tituloAntes = useRef<string | null>(null)

  // link antigo: a peça pode ter mudado de coleção; se saiu do site, fica a vitrine (ou a página, se a coleção saiu)
  useLayoutEffect(() => {
    if (!estado || !enderecoErrado) return
    const onde = estado.peca ? colecoes.find((c) => c.pecas.some((p) => p.slug === estado.peca)) : undefined
    corrigirEndereco(onde ? { colecao: onde.slug, peca: estado.peca } : colecao ? { colecao: colecao.slug, peca: null } : null)
  }, [estado, enderecoErrado, colecao])

  // trava a rolagem da página por baixo e põe no título da aba a coleção ou a peça aberta
  useLayoutEffect(() => {
    const raiz = document.documentElement
    if (colecao) {
      raiz.dataset.catalogo = colecao.slug
      raiz.style.setProperty('--fundo-catalogo', colecao.fundo)
    } else {
      delete raiz.dataset.catalogo
      raiz.style.removeProperty('--fundo-catalogo')
    }
    pausarRolagem(Boolean(colecao), 'catalogo')
    if (!colecao) {
      if (tituloAntes.current !== null) document.title = tituloAntes.current
      tituloAntes.current = null
      return
    }
    tituloAntes.current ??= document.title
    document.title = peca ? `${peca.nome} | Coleção ${colecao.nome} | Livi by LM` : `Coleção ${colecao.nome} | Livi by LM`
  }, [colecao, peca])

  useEffect(() => {
    if (!colecao) return
    const esc = (e: KeyboardEvent) => {
      // a sacola e as janelas por cima fecham primeiro
      if (e.key !== 'Escape' || document.querySelector('.gaveta')) return
      if (peca) voltarDaPeca()
      else fecharCatalogo()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [colecao, peca])

  return (
    <AnimatePresence>
      {colecao && (
        <motion.div
          key="catalogo"
          className={cn('cat', `tema-${colecao.tema}`)}
          style={{ '--fundo': colecao.fundo } as React.CSSProperties}
          role="dialog"
          aria-modal="true"
          aria-label={`Catálogo da coleção ${colecao.nome}`}
          data-lenis-prevent
          // com View Transitions a foto tocada já faz a entrada; sem elas, o catálogo sobe
          initial={suportaTransicao() ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 28 }}
          transition={{ duration: 0.55, ease }}
        >
          <header className="cat-topo">
            {peca ? (
              <button type="button" className="cat-voltar" onClick={voltarDaPeca}>
                <SetaEsquerda className="ico" /> {lista?.nome ?? colecao.nome}
              </button>
            ) : (
              <p className="sobretitulo">Catálogo</p>
            )}
            <div className="cat-topo-acoes">
              <BotaoDesejos className="cat-desejos" />
              <BotaoSacola className="cat-sacola" />
              <button type="button" className="cat-fechar" onClick={fecharCatalogo} aria-label="Fechar catálogo" autoFocus>
                <Fechar />
              </button>
            </div>
          </header>

          <div className="cat-corpo">
            <Vitrine colecao={colecao} oculta={Boolean(peca)} />
            <AnimatePresence>{peca && <Detalhe key={peca.slug} colecao={colecao} peca={peca} lista={lista} />}</AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Vitrine({ colecao, oculta }: { colecao: Colecao; oculta: boolean }) {
  return (
    <div className="cat-vitrine" aria-hidden={oculta} inert={oculta}>
      <nav className="cat-colecoes" aria-label="Coleções">
        {colecoes.map((c) => (
          <button
            key={c.slug}
            type="button"
            className={cn(c.slug === colecao.slug && 'ativa')}
            aria-current={c.slug === colecao.slug}
            onClick={() => trocarColecao(c.slug)}
          >
            {c.nome}
          </button>
        ))}
      </nav>
      <AnimatePresence mode="wait" initial={false}>
        <Trilho key={colecao.slug} colecao={colecao} />
      </AnimatePresence>
    </div>
  )
}

/** a fileira de peças que desliza para o lado */
function Trilho({ colecao }: { colecao: Colecao }) {
  const trilho = useRef<HTMLUListElement>(null)
  const [barra, setBarra] = useState({ largura: 1, inicio: 0 })
  const total = colecao.pecas.length
  const noInicio = barra.inicio <= 0.001
  const noFim = barra.inicio + barra.largura >= 0.999

  const medir = () => {
    const el = trilho.current
    if (!el) return
    setBarra({ largura: el.clientWidth / el.scrollWidth, inicio: el.scrollLeft / el.scrollWidth })
  }

  // distância de um cartão para o próximo
  const passo = () => {
    const el = trilho.current
    const cartao = el?.firstElementChild
    if (!el || !cartao) return 0
    return cartao.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || '0')
  }

  const mover = (direcao: 1 | -1) => trilho.current?.scrollBy({ left: direcao * passo(), behavior: 'smooth' })

  useLayoutEffect(() => {
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  // no computador, a rodinha do mouse também passa as peças
  useEffect(() => {
    const el = trilho.current
    if (!el) return
    let travado = false
    const roda = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      const direcao = e.deltaY > 0 ? 1 : -1
      const max = el.scrollWidth - el.clientWidth
      if ((direcao > 0 && el.scrollLeft >= max - 1) || (direcao < 0 && el.scrollLeft <= 1)) return
      e.preventDefault()
      if (travado) return
      travado = true
      mover(direcao)
      setTimeout(() => (travado = false), 450)
    }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  }, [])

  return (
    <motion.div
      className="cat-bloco"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease }}
    >
      <div className="cat-cabeca">
        <div>
          <p className="sobretitulo">
            Coleção {colecao.numero} <i>·</i> {total} peças
          </p>
          <h2 className="cat-titulo">{colecao.nome}</h2>
          <p className="cat-clima">{colecao.clima}</p>
        </div>
        {!(noInicio && noFim) && (
          <div className="cat-setas">
            <button type="button" onClick={() => mover(-1)} disabled={noInicio} aria-label="Peças anteriores">
              <SetaEsquerda />
            </button>
            <button type="button" onClick={() => mover(1)} disabled={noFim} aria-label="Próximas peças">
              <SetaDireita />
            </button>
          </div>
        )}
      </div>

      <ul className="cat-trilho" ref={trilho} onScroll={medir}>
        {colecao.pecas.map((p, i) => (
          <motion.li
            key={p.slug}
            initial={i ? { opacity: 0, x: 40 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.07 * i }}
          >
            <article className="cat-card">
              <button type="button" className="cat-card-gatilho" onClick={() => verPeca(p.slug)} aria-label={`Ver ${p.nome}`}>
                <span className="cat-card-foto">
                  {p.fotos[0] ? (
                    <img src={fotoPequena(p.fotos[0])} alt="" loading={i < 2 ? 'eager' : 'lazy'} draggable={false} />
                  ) : (
                    <Espaco rotulo="Espaço para foto da peça" />
                  )}
                  {pecaEsgotada(p) ? (
                    <span className="cat-card-selo">Esgotado</span>
                  ) : (
                    p.sobEncomenda && <span className="cat-card-selo claro">Sob encomenda</span>
                  )}
                </span>
                <span className="cat-card-nome">{p.nome}</span>
                <span className="cat-card-preco">{precoBR(p.preco)}</span>
              </button>
              <BotaoDesejo className="cat-card-desejo" item={{ colecao: colecao.slug, peca: p.slug }} />
            </article>
          </motion.li>
        ))}
      </ul>

      {!(noInicio && noFim) && (
        <div className="cat-progresso" aria-hidden="true">
          <span style={{ width: `${barra.largura * 100}%`, transform: `translateX(${(barra.inicio / barra.largura) * 100}%)` }} />
        </div>
      )}
      <p className="cat-dica">Deslize para o lado e toque numa peça</p>
    </motion.div>
  )
}

/** a peça aberta: fotos, informações e compra */
function Detalhe({ colecao, peca, lista }: { colecao: Colecao; peca: Peca; lista: { nome: string; itens: ItemPeca[] } | null }) {
  const sacola = useSacola()
  const esgotada = pecaEsgotada(peca)
  const unico = peca.tamanhos.length === 1
  // abre na primeira cor que ainda tem estoque
  const primeiraCor = peca.cores.find((c) => !corEsgotada(peca, c.nome)) ?? peca.cores[0]
  const [nomeCor, setCor] = useState(primeiraCor.nome)
  const cor = peca.cores.find((c) => c.nome === nomeCor) ?? primeiraCor
  const tem = (t: string) => disponivel(peca, cor.nome, t) > 0
  const [escolhido, setTamanho] = useState<string | null>(null)
  // peça de tamanho único já vem escolhida; trocando de cor, um tamanho que esgotou nela sai da escolha
  const tamanho = escolhido && tem(escolhido) ? escolhido : unico && tem(peca.tamanhos[0]) ? peca.tamanhos[0] : null
  const restam = tamanho ? disponivel(peca, cor.nome, tamanho) : 0
  const naSacola = tamanho ? sacola.find((i) => idDoItem(i) === idDoItem({ peca: peca.slug, cor: cor.nome, tamanho })) : undefined
  const [aviso, setAviso] = useState(false)
  const [adicionou, setAdicionou] = useState(false)
  // as setas andam pela coleção ou, aberta da grade, pelas peças do filtro
  const itens = lista?.itens ?? colecao.pecas.map((p) => ({ colecao, peca: p }))
  const posicao = itens.findIndex((i) => i.peca.slug === peca.slug)
  const anterior = posicao > 0 ? itens[posicao - 1] : undefined
  const proxima = posicao >= 0 ? itens[posicao + 1] : undefined
  const ver = (i: ItemPeca) => (lista ? verDaLista(i.colecao.slug, i.peca.slug) : verPeca(i.peca.slug))

  const adicionar = () => {
    if (esgotada) return
    if (!tamanho) return setAviso(true)
    if (naSacola) return abrirSacola()
    adicionarNaSacola({ colecao: colecao.slug, peca: peca.slug, cor: cor.nome, tamanho })
    setAdicionou(true)
  }

  const querer = () => {
    if (esgotada) return window.open(linkWhatsApp(mensagemEsgotada(colecao, peca)), '_blank', 'noopener')
    if (!tamanho) return setAviso(true)
    window.open(linkWhatsApp(mensagemPeca(colecao, peca, cor.nome, tamanho)), '_blank', 'noopener')
  }

  return (
    <motion.article
      className="cat-peca"
      aria-label={peca.nome}
      // vinda da grade com passagem suave, a foto tocada já faz a entrada
      initial={document.documentElement.dataset.transicao === 'lista' ? false : { opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease }}
    >
      <Galeria peca={peca} />

      <div className="cat-info">
        <div className="cat-navega">
          <p className="sobretitulo">
            {lista ? lista.nome : `Coleção ${colecao.nome}`}
            {posicao >= 0 && (
              <>
                {' '}
                <i>·</i>{' '}
                <span className="cat-contagem">
                  {doisDigitos(posicao + 1)} / {doisDigitos(itens.length)}
                </span>
              </>
            )}
          </p>
          <div className="cat-setas">
            <button type="button" onClick={() => anterior && ver(anterior)} disabled={!anterior} aria-label="Peça anterior">
              <SetaEsquerda />
            </button>
            <button type="button" onClick={() => proxima && ver(proxima)} disabled={!proxima} aria-label="Próxima peça">
              <SetaDireita />
            </button>
          </div>
        </div>

        <div className="cat-nome-linha">
          <h2 className="cat-nome">{peca.nome}</h2>
          <BotaoDesejo className="cat-nome-desejo" item={{ colecao: colecao.slug, peca: peca.slug }} />
        </div>
        <p className="cat-preco">
          {precoBR(peca.preco)}
          {esgotada && <span className="cat-selo">Esgotado</span>}
        </p>
        {!esgotada && textoParcelas() && <p className="cat-parcelas">{textoParcelas()}</p>}
        {peca.sobEncomenda && <p className="cat-encomenda">{textoEncomenda(peca)}</p>}
        <p className="cat-desc">{peca.descricao}</p>

        {peca.tecido && (
          <dl className="cat-ficha">
            <div>
              <dt>Tecido</dt>
              <dd>{peca.tecido.includes('[confirmar]') ? <Ph>{peca.tecido}</Ph> : peca.tecido}</dd>
            </div>
          </dl>
        )}

        <div className="cat-grupo">
          <p className="cat-rotulo">
            Cor <span>{cor.nome}</span>
            {!esgotada && corEsgotada(peca, cor.nome) && <em className="cat-rotulo-aviso">Esgotada nessa cor</em>}
          </p>
          <div className="cat-cores">
            {peca.cores.map((c) => {
              const sem = corEsgotada(peca, c.nome)
              return (
                <button
                  key={c.nome}
                  type="button"
                  className={cn('cat-cor', c.nome === cor.nome && 'ativa', sem && 'esgotada')}
                  style={{ '--c': c.hex } as React.CSSProperties}
                  onClick={() => setCor(c.nome)}
                  aria-label={sem ? `${c.nome}, esgotada` : c.nome}
                  aria-pressed={c.nome === cor.nome}
                  title={sem ? `${c.nome}: esgotada` : c.nome}
                />
              )
            })}
          </div>
        </div>

        <div className={cn('cat-grupo', aviso && !tamanho && 'aviso')}>
          <p className="cat-rotulo">{unico ? 'Tamanho' : 'Escolha o tamanho'}</p>
          <div className="cat-tamanhos" role="radiogroup" aria-label="Tamanho">
            {peca.tamanhos.map((t) => {
              const sem = !tem(t)
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tamanho === t}
                  aria-disabled={sem}
                  className={cn(tamanho === t && 'ativo', sem && 'esgotado')}
                  title={sem ? 'Esgotado' : undefined}
                  aria-label={sem ? `${rotuloTamanho(t)}, esgotado` : rotuloTamanho(t)}
                  onClick={() => {
                    if (sem) return
                    setTamanho(t)
                    setAviso(false)
                  }}
                >
                  {rotuloTamanho(t)}
                </button>
              )
            })}
          </div>
          {!peca.sobEncomenda && restam === 1 && <p className="cat-ultima">Última unidade nesse tamanho</p>}
          {peca.modelo.altura && peca.modelo.veste && (
            <p className="cat-modelo">
              A modelo tem <Ph>{peca.modelo.altura}</Ph> e veste <Ph>{peca.modelo.veste}</Ph>.
            </p>
          )}
          {aviso && !tamanho && <p className="cat-aviso">Escolha um tamanho para continuar.</p>}
        </div>

        <div className="cat-acoes">
          <button type="button" className="pilula cheia" onClick={adicionar} disabled={esgotada}>
            {esgotada ? 'Esgotado' : naSacola ? 'Na sacola ✓' : 'Adicionar à sacola'}
          </button>
          <button type="button" className="pilula" onClick={querer}>
            <WhatsApp className="ico" />
            <span>
              {esgotada ? (
                'Perguntar se volta'
              ) : (
                <>
                  <span className="cat-acoes-extra">Pedir pelo </span>WhatsApp
                </>
              )}
            </span>
          </button>
        </div>
        <AnimatePresence>
          {adicionou && naSacola && (
            <motion.p
              className="cat-guardou"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease }}
            >
              Peça adicionada à sacola.{' '}
              <button type="button" onClick={abrirSacola}>
                Ver sacola
              </button>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  )
}

/** fotos da peça (até 3): a principal desliza para o lado e as miniaturas trocam a foto */
function Galeria({ peca }: { peca: Peca }) {
  const fotos = useRef<HTMLUListElement>(null)
  const [atual, setAtual] = useState(0)

  if (!peca.fotos.length) {
    return (
      <div className="cat-galeria">
        <div className="cat-foto-principal">
          <Espaco rotulo="Espaço para foto da peça" proporcao="2 / 3" />
        </div>
      </div>
    )
  }

  const mostrar = (i: number) => {
    const el = fotos.current
    el?.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="cat-galeria">
      {peca.fotos.length > 1 && (
        <div className="cat-miniaturas">
          {peca.fotos.map((f, i) => (
            <button
              key={`${i}-${f}`}
              type="button"
              className={cn(i === atual && 'ativa')}
              onClick={() => mostrar(i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-pressed={i === atual}
            >
              <img src={fotoPequena(f)} alt="" draggable={false} />
            </button>
          ))}
        </div>
      )}
      <ul
        className="cat-foto-principal cat-fotos"
        ref={fotos}
        onScroll={(e) => {
          const el = e.currentTarget
          setAtual(Math.round(el.scrollLeft / el.clientWidth))
        }}
      >
        {peca.fotos.map((f, i) => (
          <li key={`${i}-${f}`}>
            <img src={f} alt={`${peca.nome}, foto ${i + 1}`} draggable={false} />
          </li>
        ))}
      </ul>
    </div>
  )
}
