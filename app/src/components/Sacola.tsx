/*
  Aba "Sacola" da gaveta: as peças que a cliente quer comprar, com o tamanho
  de cada uma, o total e o envio de tudo numa mensagem pelo WhatsApp. Uma
  peça pode voltar para a lista de desejos ("Salvar para depois").
*/
import { AnimatePresence, motion } from 'motion/react'
import { precoBR } from '../dados/colecoes'
import { site } from '../dados/site'
import { detalhar, linkSacola, removerDaSacola, tamanhoNaSacola, useSacola } from '../lib/sacola'
import { moverParaDesejos, useDesejos } from '../lib/desejos'
import { abrirCatalogo, mostrarCatalogo } from '../lib/catalogo'
import type { Aba } from '../lib/lista'
import { cn } from '../lib/cn'
import { Coracao, Fechar, IconeCabide, IconeSacola, SetaDiagonal, WhatsApp } from './icones'

const ease = [0.22, 1, 0.36, 1] as const

export type PropsPainel = { fechar: () => void; irPara: (aba: Aba) => void }

export function PainelSacola({ fechar, irPara }: PropsPainel) {
  const lista = useSacola()
  const desejos = useDesejos().length
  const itens = detalhar(lista)
  const total = itens.reduce((s, i) => s + i.peca.preco, 0)
  const semTamanho = itens.filter((i) => !i.tamanho).length

  if (!itens.length)
    return (
      <div className="gaveta-vazia">
        <IconeSacola className="gaveta-vazia-icone" />
        <p className="gaveta-vazia-titulo">Sua sacola está vazia</p>
        <p>Abra uma peça, escolha o tamanho e toque em “Adicionar à sacola”. Depois é só enviar tudo pelo WhatsApp.</p>
        {desejos > 0 ? (
          <button type="button" className="pilula" onClick={() => irPara('desejos')}>
            <Coracao className="ico" /> Ver meus desejos ({desejos})
          </button>
        ) : (
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
        )}
      </div>
    )

  return (
    <>
      <ul className="gaveta-lista">
        <AnimatePresence initial={false}>
          {itens.map((i) => (
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
                <p className="gaveta-nome">{i.peca.nome}</p>
                <p className="gaveta-detalhe">
                  {i.colecaoNome} · {i.cor} · {precoBR(i.peca.preco)}
                </p>
                <div className="gaveta-tamanhos" role="radiogroup" aria-label={`Tamanho de ${i.peca.nome}`}>
                  {i.peca.tamanhos.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={i.tamanho === t}
                      className={cn(i.tamanho === t && 'ativo')}
                      onClick={() => tamanhoNaSacola(i.peca.slug, t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button type="button" className="gaveta-mover" onClick={() => moverParaDesejos({ colecao: i.colecao, peca: i.peca.slug })}>
                  <Coracao className="ico" /> Salvar para depois
                </button>
              </div>
              <button type="button" className="gaveta-tirar" onClick={() => removerDaSacola(i.peca.slug)} aria-label={`Tirar ${i.peca.nome} da sacola`}>
                <Fechar />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="gaveta-rodape">
        <p className="gaveta-total">
          <span>Total estimado</span>
          <strong>{precoBR(total)}</strong>
        </p>
        <a className="pilula cheia" href={linkSacola(lista)} target="_blank" rel="noreferrer">
          <WhatsApp className="ico" /> Enviar pelo WhatsApp <SetaDiagonal className="seta" />
        </a>
        <p className="gaveta-nota">
          {semTamanho
            ? `${semTamanho === 1 ? 'Uma peça está' : `${semTamanho} peças estão`} sem tamanho: escolha acima ou combine na conversa.`
            : 'As peças seguem na mensagem. Disponibilidade e medidas são confirmadas na conversa.'}
        </p>
      </div>
    </>
  )
}
