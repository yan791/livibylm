/*
  Gaveta lateral com as duas listas da cliente, cada uma numa aba:
  Sacola (o que ela quer comprar) e Desejos (o que salvou para ver depois).
  A terceira aba, Pedidos, só aparece depois que o aparelho fez (ou abriu) um
  pedido pelo site.
  Os dois botões do topo (sacola e coração) abrem a gaveta já na aba certa,
  cada um com o seu contador.
*/
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { EVENTO_GAVETA, abrirGaveta, type Aba } from '../lib/lista'
import { EVENTO_SACOLA_ADICIONOU, unidades, useSacola } from '../lib/sacola'
import { useDesejos } from '../lib/desejos'
import { pausarRolagem } from '../lib/scroll'
import { cn } from '../lib/cn'
import { useMeusPedidos } from '../lib/meus-pedidos'
import { Coracao, Fechar, IconePedido, IconeSacola } from './icones'
import { PainelSacola } from './Sacola'
import { EVENTO_DESEJO_CHEGOU, PainelDesejos } from './Desejos'
import { PainelPedidos } from './MeusPedidos'

const ease = [0.22, 1, 0.36, 1] as const

const ABAS: { id: Aba; rotulo: string; nome: string }[] = [
  { id: 'sacola', rotulo: 'Sacola', nome: 'Sacola' },
  { id: 'desejos', rotulo: 'Desejos', nome: 'Lista de desejos' },
  { id: 'pedidos', rotulo: 'Pedidos', nome: 'Meus pedidos' },
]

const ICONES = { sacola: IconeSacola, desejos: Coracao, pedidos: IconePedido }

// ao trocar de aba, o conteúdo desliza para o lado da aba escolhida
const painel: Variants = {
  entra: (s: number) => ({ opacity: 0, x: 28 * s }),
  fica: { opacity: 1, x: 0, transition: { duration: 0.4, ease } },
  sai: (s: number) => ({ opacity: 0, x: -28 * s, transition: { duration: 0.18 } }),
}

export function Gaveta() {
  // null = fechada
  const [aba, setAba] = useState<Aba | null>(null)
  const [sentido, setSentido] = useState(1)
  const sacola = useSacola()
  const desejos = useDesejos()
  const pedidos = useMeusPedidos()
  const aberta = aba !== null
  // a aba de pedidos só aparece quando o aparelho tem algum
  const abas = ABAS.filter((a) => a.id !== 'pedidos' || pedidos.length > 0 || aba === 'pedidos')

  // a aba de agora, para o sentido do deslize (irPara também é chamado por eventos de fora)
  const abaAtual = useRef(aba)
  abaAtual.current = aba
  const irPara = (nova: Aba) => {
    const ordem = (x: Aba | null) => ABAS.findIndex((a) => a.id === x)
    setSentido(ordem(nova) >= ordem(abaAtual.current) ? 1 : -1)
    setAba(nova)
  }
  const fechar = () => setAba(null)

  useEffect(() => {
    const abrir = (e: Event) => irPara((e as CustomEvent<Aba>).detail)
    window.addEventListener(EVENTO_GAVETA, abrir)
    return () => window.removeEventListener(EVENTO_GAVETA, abrir)
  }, [])

  useEffect(() => {
    pausarRolagem(aberta, 'gaveta')
    if (!aberta) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAba(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberta])

  const atual = ABAS.find((a) => a.id === aba)

  return (
    <AnimatePresence>
      {aba && (
        <>
          <motion.div className="gaveta-fundo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fechar} />
          <motion.aside
            className="gaveta"
            data-lenis-prevent
            role="dialog"
            aria-modal="true"
            aria-label={atual?.nome}
            initial={{ x: '104%' }}
            animate={{ x: 0 }}
            exit={{ x: '104%' }}
            transition={{ duration: 0.6, ease }}
          >
            <div className="gaveta-topo">
              <div className="gaveta-abas" role="tablist" aria-label="Suas listas" data-abas={abas.length}>
                {abas.map((a) => {
                  const n = a.id === 'sacola' ? unidades(sacola) : a.id === 'desejos' ? desejos.length : pedidos.length
                  const Icone = ICONES[a.id]
                  const ativa = a.id === aba
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="tab"
                      id={`gaveta-aba-${a.id}`}
                      aria-selected={ativa}
                      aria-controls="gaveta-painel"
                      className={cn('gaveta-aba', ativa && 'ativa')}
                      onClick={() => irPara(a.id)}
                    >
                      <Icone className="ico" />
                      {a.rotulo}
                      <span className="gaveta-aba-n" aria-label={a.id === 'pedidos' ? `${n} ${n === 1 ? 'pedido' : 'pedidos'}` : `${n} ${n === 1 ? 'peça' : 'peças'}`}>
                        {n}
                      </span>
                      {ativa && <motion.span layoutId="gaveta-aba-marca" className="gaveta-aba-marca" transition={{ duration: 0.5, ease }} />}
                    </button>
                  )
                })}
              </div>
              <button type="button" className="gaveta-fechar" onClick={fechar} aria-label="Fechar" autoFocus>
                <Fechar />
              </button>
            </div>

            <AnimatePresence mode="wait" initial={false} custom={sentido}>
              <motion.div
                key={aba}
                id="gaveta-painel"
                role="tabpanel"
                aria-labelledby={`gaveta-aba-${aba}`}
                className="gaveta-painel"
                custom={sentido}
                variants={painel}
                initial="entra"
                animate="fica"
                exit="sai"
              >
                {aba === 'sacola' ? (
                  <PainelSacola fechar={fechar} irPara={irPara} />
                ) : aba === 'desejos' ? (
                  <PainelDesejos fechar={fechar} irPara={irPara} />
                ) : (
                  <PainelPedidos fechar={fechar} />
                )}
              </motion.div>
            </AnimatePresence>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

/** botão do topo: ícone, contador e um pulinho quando chega uma peça nova */
function BotaoLista({
  aba,
  n,
  evento,
  rotulo,
  className,
  children,
}: {
  aba: Aba
  n: number
  evento: string
  rotulo: string
  className?: string
  children: React.ReactNode
}) {
  const [pulo, setPulo] = useState(0)
  useEffect(() => {
    const f = () => setPulo((x) => x + 1)
    window.addEventListener(evento, f)
    return () => window.removeEventListener(evento, f)
  }, [evento])
  return (
    <button type="button" className={cn('sacola-botao', className)} onClick={() => abrirGaveta(aba)} aria-label={rotulo}>
      <motion.span
        key={pulo}
        className="sacola-botao-icone"
        initial={{ scale: pulo ? 1.35 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
      >
        {children}
      </motion.span>
      {n > 0 && <span className="sacola-contador">{n}</span>}
    </button>
  )
}

const pecas = (n: number) => `${n} ${n === 1 ? 'peça' : 'peças'}`

export function BotaoSacola({ className }: { className?: string }) {
  const n = unidades(useSacola())
  return (
    <BotaoLista aba="sacola" n={n} evento={EVENTO_SACOLA_ADICIONOU} rotulo={`Sacola, ${pecas(n)}`} className={className}>
      <IconeSacola />
    </BotaoLista>
  )
}

export function BotaoDesejos({ className }: { className?: string }) {
  const n = useDesejos().length
  return (
    <BotaoLista
      aba="desejos"
      n={n}
      evento={EVENTO_DESEJO_CHEGOU}
      rotulo={`Lista de desejos, ${pecas(n)}`}
      className={cn('botao-desejos', className)}
    >
      <Coracao />
    </BotaoLista>
  )
}
