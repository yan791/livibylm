/*
  Aba "Sacola" da gaveta: as peças que a cliente quer comprar, cada uma com
  cor, tamanho e quantidade, o total e o envio de tudo numa mensagem pelo
  WhatsApp. Um item pode voltar para a lista de desejos ("Salvar para depois").
  Item sem tamanho (de uma sacola antiga) pede o tamanho ali mesmo; item que
  esgotou fica marcado, fora do total, com os tamanhos que ainda têm.
*/
import { AnimatePresence, motion } from 'motion/react'
import { disponivel, pecaEsgotada, precoBR, rotuloTamanho } from '../dados/colecoes'
import { site } from '../dados/site'
import {
  detalhar,
  linkSacola,
  quantidadeNaSacola,
  removerDaSacola,
  sairamDaSacola,
  tamanhoNaSacola,
  unidades,
  useSacola,
} from '../lib/sacola'
import { moverParaDesejos, useDesejos } from '../lib/desejos'
import { abrirCatalogo, mostrarCatalogo } from '../lib/catalogo'
import { fotoPequena } from '../lib/base'
import type { Aba } from '../lib/lista'
import { cn } from '../lib/cn'
import { Coracao, Fechar, IconeCabide, IconeSacola, SetaDiagonal, WhatsApp } from './icones'

const ease = [0.22, 1, 0.36, 1] as const

export type PropsPainel = { fechar: () => void; irPara: (aba: Aba) => void }

/** aviso de peças que saíram do site desde a última visita (vale até a página recarregar) */
export function AvisoSaiu({ n, onde }: { n: number; onde: string }) {
  if (!n) return null
  return (
    <p className="gaveta-saiu">
      {n === 1 ? `Uma peça que estava ${onde} saiu do site.` : `${n} peças que estavam ${onde} saíram do site.`}
    </p>
  )
}

export function PainelSacola({ fechar, irPara }: PropsPainel) {
  const lista = useSacola()
  const desejos = useDesejos().length
  const itens = detalhar(lista)
  const validos = itens.filter((i) => i.tamanho && !i.esgotado)
  const total = validos.reduce((s, i) => s + i.peca.preco * i.qtd, 0)
  const semTamanho = itens.filter((i) => !i.tamanho).length
  const esgotados = itens.filter((i) => i.esgotado).length

  if (!itens.length)
    return (
      <div className="gaveta-vazia">
        <AvisoSaiu n={sairamDaSacola} onde="na sua sacola" />
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
      <AvisoSaiu n={sairamDaSacola} onde="na sua sacola" />
      <ul className="gaveta-lista">
        <AnimatePresence initial={false}>
          {itens.map((i) => {
            // tamanhos que ainda têm nessa cor (para escolher ou trocar)
            const opcoes = i.peca.tamanhos.filter((t) => disponivel(i.peca, i.cor, t) > 0)
            const escolher = !i.tamanho || i.esgotado
            // a loja tirou a cor ou o tamanho da peça depois que ela foi para a sacola
            const corSaiu = !i.peca.cores.some((c) => c.nome === i.cor)
            const tamanhoSaiu = Boolean(i.tamanho) && !i.peca.tamanhos.includes(i.tamanho!)
            return (
              <motion.li
                key={i.id}
                layout
                className={cn(i.esgotado && 'esgotado')}
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
                  {i.peca.fotos[0] ? <img src={fotoPequena(i.peca.fotos[0])} alt="" /> : <IconeCabide />}
                </button>
                <div className="gaveta-info">
                  <p className="gaveta-nome">{i.peca.nome}</p>
                  <p className="gaveta-detalhe">
                    {i.colecaoNome} · {i.cor}
                    {i.tamanho && ` · ${rotuloTamanho(i.tamanho)}`} · {precoBR(i.peca.preco)}
                  </p>

                  {i.esgotado && (
                    <p className="gaveta-esgotou">
                      {pecaEsgotada(i.peca)
                        ? 'Esta peça esgotou.'
                        : corSaiu
                          ? 'Essa cor não está mais no site. Veja as outras cores na peça.'
                          : opcoes.length
                            ? tamanhoSaiu
                              ? 'Esse tamanho não está mais no site. Escolha outro:'
                              : 'Esgotou nesse tamanho. Escolha outro:'
                            : 'Esgotou nessa cor. Veja as outras cores na peça.'}
                    </p>
                  )}
                  {!i.tamanho && <p className="gaveta-esgotou">Escolha o tamanho:</p>}

                  {escolher ? (
                    opcoes.length > 0 && (
                      <div className="gaveta-tamanhos" role="radiogroup" aria-label={`Tamanho de ${i.peca.nome}`}>
                        {opcoes.map((t) => (
                          <button key={t} type="button" role="radio" aria-checked={false} onClick={() => tamanhoNaSacola(i.id, t)}>
                            {rotuloTamanho(t)}
                          </button>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="gaveta-qtd" role="group" aria-label={`Quantidade de ${i.peca.nome}`}>
                      <button type="button" onClick={() => quantidadeNaSacola(i.id, i.qtd - 1)} disabled={i.qtd <= 1} aria-label="Uma a menos">
                        −
                      </button>
                      <span aria-live="polite">{i.qtd}</span>
                      <button type="button" onClick={() => quantidadeNaSacola(i.id, i.qtd + 1)} disabled={i.qtd >= i.limite} aria-label="Uma a mais">
                        +
                      </button>
                      {i.qtd >= i.limite && i.limite < 10 && (
                        <small>{i.limite === 1 ? 'Última unidade' : `Só ${i.limite} disponíveis`}</small>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    className="gaveta-mover"
                    onClick={() => moverParaDesejos({ colecao: i.colecao, peca: i.peca.slug, cor: i.cor, tamanho: i.tamanho })}
                  >
                    <Coracao className="ico" /> Salvar para depois
                  </button>
                </div>
                <button type="button" className="gaveta-tirar" onClick={() => removerDaSacola(i.id)} aria-label={`Tirar ${i.peca.nome} da sacola`}>
                  <Fechar />
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      <div className="gaveta-rodape">
        <p className="gaveta-total">
          <span>
            Total{validos.length ? ` · ${unidades(validos)} ${unidades(validos) === 1 ? 'peça' : 'peças'}` : ''}
          </span>
          <strong>{precoBR(total)}</strong>
        </p>
        {validos.length > 0 ? (
          <a className="pilula cheia" href={linkSacola(lista)} target="_blank" rel="noreferrer">
            <WhatsApp className="ico" /> Enviar pelo WhatsApp <SetaDiagonal className="seta" />
          </a>
        ) : (
          <span className="pilula cheia desligada" aria-disabled="true">
            <WhatsApp className="ico" /> Enviar pelo WhatsApp
          </span>
        )}
        <p className="gaveta-nota">
          {semTamanho
            ? `${semTamanho === 1 ? 'Uma peça está' : `${semTamanho} peças estão`} sem tamanho e não vão na mensagem: escolha acima.`
            : esgotados
              ? esgotados === 1
                ? 'Uma peça não está disponível e ficou fora do total.'
                : `${esgotados} peças não estão disponíveis e ficaram fora do total.`
              : 'As peças seguem na mensagem, e o pagamento e a entrega são combinados na conversa.'}
        </p>
      </div>
    </>
  )
}
