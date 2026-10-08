/*
  Lista de desejos: o coração das peças salva para ver depois, sem levar a
  cliente para a compra. Ao salvar, um coraçãozinho voa até o botão de
  desejos do topo e um aviso discreto confirma, com "Ver lista".
  Aqui também mora a aba "Desejos" da gaveta, de onde a peça pode seguir
  para a sacola quando ela decidir comprar.
*/
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { precoBR } from '../dados/colecoes'
import { site } from '../dados/site'
import {
  EVENTO_DESEJO_SALVO,
  abrirDesejos,
  alternarDesejo,
  desejoParaSacola,
  detalhar,
  removerDesejo,
  useDesejos,
  type ItemDesejo,
} from '../lib/desejos'
import { useSacola } from '../lib/sacola'
import { EVENTO_GAVETA } from '../lib/lista'
import { abrirCatalogo, mostrarCatalogo } from '../lib/catalogo'
import { cn } from '../lib/cn'
import { Coracao, IconeCabide, IconeSacola, SetaDiagonal } from './icones'
import type { PropsPainel } from './Sacola'

const ease = [0.22, 1, 0.36, 1] as const

/** disparado quando o coração que voa chega ao botão do topo (o contador pula nessa hora) */
export const EVENTO_DESEJO_CHEGOU = 'livi:desejo-chegou'

const visivel = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  const aparece = el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true
  return aparece && r.width > 0 && r.bottom > 0 && r.top < innerHeight
}

/** um coraçãozinho sai do botão tocado e voa em curva até o botão de desejos que estiver à vista */
function voarCoracao(origem: HTMLElement) {
  const chegou = () => window.dispatchEvent(new CustomEvent(EVENTO_DESEJO_CHEGOU))
  const alvo =
    document.querySelector<HTMLElement>('.cat .botao-desejos') ??
    [...document.querySelectorAll<HTMLElement>('.botao-desejos')].find(visivel)
  if (!alvo || !visivel(alvo)) return chegou()

  const a = origem.getBoundingClientRect()
  const b = alvo.getBoundingClientRect()
  const x0 = a.left + a.width / 2
  const y0 = a.top + a.height / 2
  const x1 = b.left + b.width / 2
  const y1 = b.top + b.height / 2

  // o eixo x e o y andam com curvas diferentes: o coração sobe primeiro e depois desliza (um arco)
  const fora = document.createElement('span')
  fora.className = 'voo-coracao'
  fora.innerHTML =
    '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" /></svg></span>'
  document.body.appendChild(fora)
  const dentro = fora.firstElementChild as HTMLElement
  const duracao = 780
  fora.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }], {
    duration: duracao,
    easing: 'cubic-bezier(0.55, 0, 0.35, 1)',
    fill: 'forwards',
  })
  dentro
    .animate(
      [
        { transform: `translateY(${y0}px) scale(0.6)`, opacity: 0 },
        { transform: `translateY(${y0 - 18}px) scale(1.25)`, opacity: 1, offset: 0.14 },
        { transform: `translateY(${y1}px) scale(0.5)`, opacity: 0.9 },
      ],
      { duration: duracao, easing: 'cubic-bezier(0.2, 0.75, 0.3, 1)', fill: 'forwards' },
    )
    .finished.then(() => {
      fora.remove()
      chegou()
    })
}

/** coração das peças: salva ou tira da lista de desejos */
export function BotaoDesejo({ item, className }: { item: ItemDesejo; className?: string }) {
  const salvo = useDesejos().some((i) => i.peca === item.peca)
  // conta só os toques desta visita, para a onda não aparecer ao abrir uma peça já salva
  const [onda, setOnda] = useState(0)
  return (
    <button
      type="button"
      className={cn('desejo', salvo && 'ativo', className)}
      aria-pressed={salvo}
      aria-label={salvo ? 'Tirar da lista de desejos' : 'Salvar na lista de desejos'}
      data-dica={salvo ? 'Salvo nos desejos' : 'Salvar nos desejos'}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        if (alternarDesejo(item)) {
          setOnda((n) => n + 1)
          voarCoracao(e.currentTarget)
        }
      }}
    >
      <motion.span
        className="desejo-icone"
        key={String(salvo)}
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 14 }}
      >
        <Coracao cheio={salvo} />
      </motion.span>
      {onda > 0 && salvo && (
        <motion.span
          key={onda}
          className="desejo-onda"
          aria-hidden="true"
          initial={{ scale: 0.7, opacity: 0.55 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      )}
    </button>
  )
}

/** aba "Desejos" da gaveta */
export function PainelDesejos({ fechar, irPara }: PropsPainel) {
  const lista = useDesejos()
  const sacola = useSacola()
  const itens = detalhar(lista)

  if (!itens.length)
    return (
      <div className="gaveta-vazia">
        <Coracao className="gaveta-vazia-icone" />
        <p className="gaveta-vazia-titulo">Nenhuma peça salva ainda</p>
        <p>Toque no coração das peças que você gostar. Elas ficam guardadas aqui para você ver com calma, sem compromisso.</p>
        <button
          type="button"
          className="pilula"
          onClick={() => {
            fechar()
            mostrarCatalogo(site.abertura.colecao)
          }}
        >
          Ver coleções <SetaDiagonal className="seta" />
        </button>
      </div>
    )

  return (
    <>
      <ul className="gaveta-lista gaveta-desejos">
        <AnimatePresence initial={false}>
          {itens.map((i) => {
            const naSacola = sacola.some((s) => s.peca === i.peca.slug)
            return (
              <motion.li
                key={i.peca.slug}
                layout
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.45, ease }}
              >
                <button
                  type="button"
                  className="gaveta-foto"
                  style={{ background: i.fundo }}
                  onClick={() => {
                    fechar()
                    abrirCatalogo(i.colecao, i.peca.slug)
                  }}
                  aria-label={`Ver ${i.peca.nome}`}
                >
                  {i.peca.fotos[0] ? <img src={i.peca.fotos[0]} alt="" /> : <IconeCabide />}
                </button>
                <div className="gaveta-info">
                  <p className="gaveta-colecao">Coleção {i.colecaoNome}</p>
                  <p className="gaveta-nome">{i.peca.nome}</p>
                  <p className="gaveta-detalhe">{precoBR(i.peca.preco)}</p>
                  {naSacola ? (
                    <button type="button" className="gaveta-acao feito" onClick={() => irPara('sacola')}>
                      Na sacola ✓
                    </button>
                  ) : (
                    <button type="button" className="gaveta-acao" onClick={() => desejoParaSacola({ colecao: i.colecao, peca: i.peca.slug })}>
                      <IconeSacola className="ico" /> Adicionar à sacola
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="gaveta-tirar gaveta-tirar-desejo"
                  onClick={() => removerDesejo(i.peca.slug)}
                  aria-label={`Tirar ${i.peca.nome} da lista de desejos`}
                >
                  <Coracao cheio />
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      <div className="gaveta-rodape gaveta-rodape-desejos">
        <p className="gaveta-nota">
          Sua lista fica salva neste aparelho. Quando decidir, leve a peça para a sacola e escolha o tamanho por lá.
        </p>
      </div>
    </>
  )
}

/** aviso discreto ao salvar uma peça (some sozinho; não aparece com a gaveta aberta) */
export function AvisoDesejo() {
  const [aviso, setAviso] = useState<{ id: number; item: ItemDesejo } | null>(null)

  useEffect(() => {
    let tempo = 0
    const salvo = (e: Event) => {
      if (document.querySelector('.gaveta')) return
      setAviso({ id: performance.now(), item: (e as CustomEvent<ItemDesejo>).detail })
      clearTimeout(tempo)
      tempo = window.setTimeout(() => setAviso(null), 3800)
    }
    const sumir = () => setAviso(null)
    window.addEventListener(EVENTO_DESEJO_SALVO, salvo)
    window.addEventListener(EVENTO_GAVETA, sumir)
    return () => {
      clearTimeout(tempo)
      window.removeEventListener(EVENTO_DESEJO_SALVO, salvo)
      window.removeEventListener(EVENTO_GAVETA, sumir)
    }
  }, [])

  const d = aviso ? detalhar([aviso.item])[0] : undefined

  return (
    <div className="aviso-area" role="status" aria-live="polite">
      <AnimatePresence>
        {aviso && d && (
          <motion.div
            key={aviso.id}
            className="aviso"
            initial={{ opacity: 0, y: 26, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.5, ease }}
          >
            <span className="aviso-foto" style={{ background: d.fundo }}>
              {d.peca.fotos[0] ? <img src={d.peca.fotos[0]} alt="" /> : <IconeCabide />}
            </span>
            <span className="aviso-texto">
              <strong>
                <Coracao cheio className="ico" /> Salva nos desejos
              </strong>
              <span>{d.peca.nome}</span>
            </span>
            <button type="button" className="aviso-ver" onClick={abrirDesejos}>
              Ver lista
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
