/*
  Todas as peças, de todas as coleções, filtradas pelo tipo (/pecas/saias) e,
  se a cliente quiser, pelo tamanho que ainda tem (?tamanho=M). O tipo vem do
  nome da peça (dados/tipos). Tocar numa peça abre o catálogo por cima desta
  página, que continua aqui embaixo no mesmo lugar: as setas da peça passam
  pelas peças do filtro e o voltar devolve a cliente à grade.
*/
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { colecoes, pecaEsgotada, precoBR } from '../dados/colecoes'
import {
  acharTipo,
  enderecoPecas,
  nomeDoFiltro,
  pecasDoFiltro,
  rotuloCurto,
  tamanhosDe,
  tipos,
  todas,
  type Filtro,
  type ItemPeca,
} from '../dados/tipos'
import { linkWhatsApp } from '../dados/site'
import { mostrarCatalogo, mostrarPecaDaLista } from '../lib/catalogo'
import { navegar } from '../lib/rota'
import { rolarPara } from '../lib/scroll'
import { comBase, fotoPequena, semBase } from '../lib/base'
import { cn } from '../lib/cn'
import { Espaco } from '../components/Espaco'
import { BotaoDesejo } from '../components/Desejos'
import { WhatsApp } from '../components/icones'

const ease = [0.22, 1, 0.36, 1] as const
const TITULO_SITE = 'Livi by LM | Moda feminina autoral'
const quantas = (n: number) => `${n} ${n === 1 ? 'peça' : 'peças'}`

export function Pecas({ tipo, tamanho }: { tipo?: string; tamanho?: string }) {
  const atual = acharTipo(tipo)
  const doTipo = atual?.itens ?? todas
  const tamanhos = tamanhosDe(doTipo)
  const filtro: Filtro = { tipo: atual?.slug, tamanho: tamanho && tamanhos.includes(tamanho) ? tamanho : undefined }
  const itens = pecasDoFiltro(filtro)
  const nome = nomeDoFiltro(filtro)
  const certo = enderecoPecas(filtro)
  const grade = useRef<HTMLDivElement>(null)
  const barra = useRef<HTMLDivElement>(null)
  const marco = useRef<HTMLDivElement>(null)
  const [presa, setPresa] = useState(false)

  // chega sempre pelo topo; fechar uma peça aberta por cima não remonta a página, então a rolagem fica onde estava
  useLayoutEffect(() => {
    rolarPara(0, { imediato: true })
    return () => {
      document.title = TITULO_SITE
    }
  }, [])

  // o catálogo aberto por cima cuida do título da aba enquanto estiver aberto
  useLayoutEffect(() => {
    if (!document.documentElement.dataset.catalogo) document.title = `${nome} | Livi by LM`
  }, [nome])

  // tipo ou tamanho que não existe mais (link antigo, peça que saiu do site): fica o endereço certo
  useLayoutEffect(() => {
    if (!semBase(location.pathname).startsWith('/pecas')) return
    if ((tipo ?? '') !== (filtro.tipo ?? '') || (tamanho ?? '') !== (filtro.tamanho ?? '')) navegar(certo, { substituir: true, semTransicao: true })
  }, [certo, tipo, tamanho, filtro.tipo, filtro.tamanho])

  // a barra dos tipos, presa no topo, ganha um fundo
  useEffect(() => {
    const el = marco.current
    if (!el) return
    const o = new IntersectionObserver(([e]) => setPresa(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-90px 0px 0px 0px' })
    o.observe(el)
    return () => o.disconnect()
  }, [])

  // no celular a fileira de tipos passa da tela: o tipo escolhido desliza para a vista
  useEffect(() => {
    const nav = barra.current?.querySelector('nav')
    const ativo = nav?.querySelector<HTMLElement>('a.ativo')
    if (!nav || !ativo) return
    const sobra = ativo.offsetLeft - (nav.clientWidth - ativo.offsetWidth) / 2
    nav.scrollTo({ left: Math.max(0, sobra), behavior: 'smooth' })
  }, [filtro.tipo])

  const filtrar = (f: Filtro) => {
    navegar(enderecoPecas(f), { substituir: true, semTransicao: true })
    // trocou o filtro com a grade já rolada: volta para o começo dela, logo abaixo da barra
    const el = grade.current
    const alto = (barra.current?.offsetHeight ?? 0) + 96
    if (el && el.getBoundingClientRect().top < alto) rolarPara(el, { deslocamento: -alto })
  }

  const opcoes = [{ slug: undefined, nome: 'Todas', n: todas.length }, ...tipos.map((t) => ({ slug: t.slug, nome: t.nome, n: t.itens.length }))]

  return (
    <main className="pecas">
      <header className="pecas-topo">
        <p className="sobretitulo">
          Peças <i>·</i> todas as coleções
        </p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={nome}
            className="pecas-titulo"
            initial={{ opacity: 0, y: '0.25em', filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: '0em', filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: '-0.15em', filter: 'blur(6px)' }}
            transition={{ duration: 0.4, ease }}
          >
            {nome}
          </motion.h1>
        </AnimatePresence>
      </header>

      <div ref={marco} aria-hidden="true" />
      <div ref={barra} className={cn('pecas-barra', presa && 'presa')}>
        <LayoutGroup id="pecas-tipos">
          <nav className="pecas-tipos" aria-label="Tipo de peça">
            {opcoes.map((o) => {
              const ativo = o.slug === filtro.tipo
              return (
                <a
                  key={o.nome}
                  href={comBase(enderecoPecas({ tipo: o.slug, tamanho: filtro.tamanho }))}
                  className={cn(ativo && 'ativo')}
                  aria-current={ativo ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    if (!ativo) filtrar({ tipo: o.slug, tamanho: filtro.tamanho })
                  }}
                >
                  {ativo && <motion.span layoutId="pecas-tipo-ativo" className="pecas-tipo-fundo" transition={{ duration: 0.5, ease }} />}
                  <span className="pecas-tipo-nome">{o.nome}</span>
                  <sup>{o.n}</sup>
                </a>
              )
            })}
          </nav>
        </LayoutGroup>
      </div>

      <div className="pecas-corpo" ref={grade}>
        <div className="pecas-resumo">
          <p aria-live="polite">
            {quantas(itens.length)}
            {filtro.tamanho && ` no tamanho ${rotuloCurto(filtro.tamanho)}`}
          </p>
          {tamanhos.length > 1 && (
            <div className="pecas-tamanhos" role="group" aria-label="Só peças com este tamanho">
              <span className="pecas-rotulo">Tamanho</span>
              {tamanhos.map((t) => {
                const ativo = filtro.tamanho === t
                return (
                  <button
                    key={t}
                    type="button"
                    className={cn(ativo && 'ativo')}
                    aria-pressed={ativo}
                    onClick={() => filtrar({ tipo: filtro.tipo, tamanho: ativo ? undefined : t })}
                  >
                    {rotuloCurto(t)}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {itens.length > 0 ? (
          <ul className="pecas-grade">
            <AnimatePresence mode="popLayout">
              {itens.map((i, n) => (
                <motion.li
                  key={i.peca.slug}
                  layout
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.25 } }}
                  transition={{ duration: 0.7, ease, delay: (n % 4) * 0.06, layout: { duration: 0.55, ease } }}
                >
                  <Cartao item={i} primeiro={n < 4} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="pecas-vazio">
            <p className="pecas-vazio-titulo">Nenhuma peça nesse tamanho agora.</p>
            <p>Algumas peças voltam. Pergunte pelo WhatsApp se a sua vai ter de novo.</p>
            <div className="pecas-vazio-acoes">
              <button type="button" className="pilula cheia" onClick={() => filtrar({ tipo: filtro.tipo })}>
                Ver todos os tamanhos
              </button>
              <a
                className="pilula"
                href={linkWhatsApp(`Olá! Vim pelo site da Livi e procuro ${nome.toLowerCase()} no tamanho ${rotuloCurto(filtro.tamanho ?? '')}.`)}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsApp className="ico" /> Perguntar
              </a>
            </div>
          </div>
        )}
      </div>

      <aside className="pecas-colecoes" aria-label="Ver por coleção">
        <p className="sobretitulo">Prefere ver por coleção?</p>
        <ul>
          {colecoes.map((c) => (
            <li key={c.slug}>
              <a
                href={comBase(`/colecao/${c.slug}`)}
                onClick={(e) => {
                  e.preventDefault()
                  mostrarCatalogo(c.slug)
                }}
              >
                {c.nome}
              </a>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  )
}

/** o cartão da peça na grade; no computador, a segunda foto aparece com o mouse em cima */
function Cartao({ item, primeiro }: { item: ItemPeca; primeiro: boolean }) {
  const { colecao, peca } = item
  const foto = useRef<HTMLImageElement>(null)
  // a segunda foto só é baixada quando o mouse passa pelo cartão
  const [outra, setOutra] = useState<'nao' | 'baixando' | 'pronta'>('nao')
  const segunda = peca.fotos[1]
  const esgotada = pecaEsgotada(peca)

  return (
    <article className="cat-card pecas-card">
      <a
        href={comBase(`/colecao/${colecao.slug}/${peca.slug}`)}
        className="cat-card-gatilho"
        aria-label={`Ver ${peca.nome}`}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse' && segunda && outra === 'nao') setOutra('baixando')
        }}
        onClick={(e) => {
          // abrir em outra aba continua funcionando
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
          e.preventDefault()
          mostrarPecaDaLista(colecao.slug, peca.slug, foto.current)
        }}
      >
        <span className="cat-card-foto">
          {peca.fotos[0] ? (
            <img ref={foto} src={fotoPequena(peca.fotos[0])} alt="" loading={primeiro ? 'eager' : 'lazy'} draggable={false} />
          ) : (
            <Espaco rotulo="Espaço para foto da peça" />
          )}
          {segunda && outra !== 'nao' && (
            <img
              className={cn('pecas-card-outra', outra === 'pronta' && 'pronta')}
              src={fotoPequena(segunda)}
              alt=""
              draggable={false}
              onLoad={() => setOutra('pronta')}
            />
          )}
          {esgotada ? (
            <span className="cat-card-selo">Esgotado</span>
          ) : (
            peca.sobEncomenda && <span className="cat-card-selo claro">Sob encomenda</span>
          )}
        </span>
        <span className="pecas-card-colecao">{colecao.nome}</span>
        <span className="cat-card-nome">{peca.nome}</span>
        <span className="cat-card-preco">{precoBR(peca.preco)}</span>
      </a>
      <BotaoDesejo className="cat-card-desejo" item={{ colecao: colecao.slug, peca: peca.slug }} />
    </article>
  )
}
