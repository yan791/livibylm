/*
  Sacola de desejos: botão com contador, coração em cada peça e a gaveta
  lateral que monta a mensagem do WhatsApp com todas as peças.
*/
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { precoBR } from '../dados/colecoes'
import {
  abrirSacola,
  alternarNaSacola,
  detalhar,
  linkSacola,
  removerDaSacola,
  tamanhoNaSacola,
  useSacola,
  type ItemSacola,
} from '../lib/sacola'
import { navegar } from '../lib/rota'
import { pausarRolagem } from '../lib/scroll'
import { cn } from '../lib/cn'
import { Fechar, IconeCabide, SetaDiagonal, WhatsApp } from './icones'

const ease = [0.22, 1, 0.36, 1] as const

export function IconeSacola(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5 8.5h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3Z" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
      <path d="M12 17.6s-2.6-1.5-2.6-3.2c0-.9.7-1.5 1.4-1.5.5 0 .9.3 1.2.7.3-.4.7-.7 1.2-.7.7 0 1.4.6 1.4 1.5 0 1.7-2.6 3.2-2.6 3.2Z" />
    </svg>
  )
}

function Coracao({ cheio }: { cheio: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z"
        fill={cheio ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** botão de coração: guarda ou tira a peça da sacola */
export function BotaoDesejo({ item, className, comTexto = false }: { item: ItemSacola; className?: string; comTexto?: boolean }) {
  const lista = useSacola()
  const ativo = lista.some((i) => i.peca === item.peca)
  return (
    <button
      type="button"
      className={cn('desejo', ativo && 'ativo', comTexto && 'com-texto', className)}
      aria-pressed={ativo}
      aria-label={ativo ? 'Tirar da sacola' : 'Guardar na sacola'}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        alternarNaSacola(item)
      }}
    >
      <motion.span className="desejo-icone" key={String(ativo)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
        <Coracao cheio={ativo} />
      </motion.span>
      {comTexto && <span>{ativo ? 'Na sacola' : 'Guardar na sacola'}</span>}
    </button>
  )
}

/** botão da sacola com o número de peças */
export function BotaoSacola({ className }: { className?: string }) {
  const lista = useSacola()
  const [pulo, setPulo] = useState(0)
  useEffect(() => {
    const f = () => setPulo((n) => n + 1)
    window.addEventListener('livi:sacola-adicionou', f)
    return () => window.removeEventListener('livi:sacola-adicionou', f)
  }, [])
  return (
    <button type="button" className={cn('sacola-botao', className)} onClick={abrirSacola} aria-label={`Sacola de desejos, ${lista.length} peças`}>
      <motion.span key={pulo} className="sacola-botao-icone" initial={{ scale: pulo ? 1.35 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }}>
        <IconeSacola />
      </motion.span>
      {lista.length > 0 && <span className="sacola-contador">{lista.length}</span>}
    </button>
  )
}

/** gaveta lateral com as peças guardadas */
export function GavetaSacola() {
  const [aberta, setAberta] = useState(false)
  const lista = useSacola()
  const itens = detalhar(lista)
  const total = itens.reduce((s, i) => s + i.peca.preco, 0)

  useEffect(() => {
    const abrir = () => setAberta(true)
    window.addEventListener('livi:sacola', abrir)
    return () => window.removeEventListener('livi:sacola', abrir)
  }, [])

  useEffect(() => {
    pausarRolagem(aberta)
    if (!aberta) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberta(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberta])

  return (
    <AnimatePresence>
      {aberta && (
        <>
          <motion.div
            className="gaveta-fundo"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAberta(false)}
          />
          <motion.aside
            className="gaveta"
            role="dialog"
            aria-modal="true"
            aria-label="Sacola de desejos"
            initial={{ x: '104%' }}
            animate={{ x: 0 }}
            exit={{ x: '104%' }}
            transition={{ duration: 0.6, ease }}
          >
            <div className="gaveta-topo">
              <div>
                <p className="sobretitulo">Sacola de desejos</p>
                <h2>{itens.length ? `${itens.length} ${itens.length > 1 ? 'peças' : 'peça'}` : 'Ainda vazia'}</h2>
              </div>
              <button type="button" className="gaveta-fechar" onClick={() => setAberta(false)} aria-label="Fechar sacola" autoFocus>
                <Fechar />
              </button>
            </div>

            {itens.length === 0 ? (
              <div className="gaveta-vazia">
                <IconeCabide className="gaveta-vazia-icone" />
                <p>Toque no coração das peças que você gostar. Elas ficam guardadas aqui e seguem juntas numa mensagem pelo WhatsApp.</p>
                <button
                  type="button"
                  className="pilula"
                  onClick={() => {
                    setAberta(false)
                    navegar('/#colecoes')
                  }}
                >
                  Ver coleções <SetaDiagonal className="seta" />
                </button>
              </div>
            ) : (
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
                            setAberta(false)
                            navegar(`/colecao/${i.colecao}/${i.peca.slug}`)
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
                        </div>
                        <button type="button" className="gaveta-tirar" onClick={() => removerDaSacola(i.peca.slug)} aria-label={`Tirar ${i.peca.nome}`}>
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
                  <p className="gaveta-nota">As peças seguem na mensagem. Disponibilidade e medidas são confirmadas na conversa.</p>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
