/*
  Logo depois das coleções: as peças por tipo (vestidos, blusas, saias...).
  Quem já sabe o que procura vai direto para a página de peças daquele tipo,
  com as peças de todas as coleções. Cada cartão troca devagar entre fotos de
  peças diferentes do tipo, só enquanto aparece na tela.
*/
import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'motion/react'
import { pecaEsgotada } from '../dados/colecoes'
import { enderecoPecas, tipos, todas, type Tipo } from '../dados/tipos'
import { navegar } from '../lib/rota'
import { comBase, fotoPequena } from '../lib/base'
import { cn } from '../lib/cn'
import { Espaco } from '../components/Espaco'
import { Ima, TituloVivo } from '../components/Vivos'
import { SetaDireita } from '../components/icones'

const ease = [0.22, 1, 0.36, 1] as const

/** até 3 fotos de peças com estoque, de coleções diferentes primeiro */
function fotosDo(t: Tipo) {
  const comFoto = t.itens.filter((i) => i.peca.fotos[0] && !pecaEsgotada(i.peca))
  const escolhidas = new Set<(typeof comFoto)[number]>()
  const colecoesVistas = new Set<string>()
  for (const i of comFoto) {
    if (escolhidas.size === 3) break
    if (colecoesVistas.has(i.colecao.slug)) continue
    colecoesVistas.add(i.colecao.slug)
    escolhidas.add(i)
  }
  for (const i of comFoto) {
    if (escolhidas.size === 3) break
    escolhidas.add(i)
  }
  return [...escolhidas].map((i) => i.peca.fotos[0])
}

const abrir = (endereco: string) => (e: React.MouseEvent) => {
  e.preventDefault()
  navegar(endereco, { semTransicao: true })
}

export function PorPeca() {
  if (!tipos.length) return null
  return (
    <section className="porpeca" aria-labelledby="porpeca-titulo">
      <div className="porpeca-cabeca">
        <div>
          <p className="sobretitulo">
            Por peça <i>·</i> todas as coleções
          </p>
          <TituloVivo id="porpeca-titulo" className="titulo-secao" partes={['Já sabe o que', { em: 'procura?' }]} />
        </div>
        <Ima>
          <a className="pilula" href={comBase('/pecas')} onClick={abrir('/pecas')}>
            Ver as {todas.length} peças <SetaDireita className="seta" />
          </a>
        </Ima>
      </div>

      <ul className="porpeca-lista" style={{ '--n': tipos.length } as React.CSSProperties}>
        {tipos.map((t, i) => (
          <motion.li
            key={t.slug}
            initial={{ opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.9, ease, delay: i * 0.08 }}
          >
            <Cartao tipo={t} ordem={i} />
          </motion.li>
        ))}
      </ul>
    </section>
  )
}

function Cartao({ tipo, ordem }: { tipo: Tipo; ordem: number }) {
  const ref = useRef<HTMLAnchorElement>(null)
  const visivel = useInView(ref, { amount: 0.4 })
  const [fotos] = useState(() => fotosDo(tipo))
  const [atual, setAtual] = useState(0)

  // troca de foto a cada ~4 s, com os cartões fora de compasso para não mudarem todos juntos
  useEffect(() => {
    if (!visivel || fotos.length < 2) return
    let tempo = window.setTimeout(function passar() {
      setAtual((a) => (a + 1) % fotos.length)
      tempo = window.setTimeout(passar, 4200)
    }, 2600 + ordem * 900)
    return () => window.clearTimeout(tempo)
  }, [visivel, fotos.length, ordem])

  const endereco = enderecoPecas({ tipo: tipo.slug })
  return (
    <a ref={ref} className="porpeca-cartao" href={comBase(endereco)} onClick={abrir(endereco)} aria-label={`Ver ${tipo.nome.toLowerCase()}: ${tipo.itens.length} peças`}>
      <span className="porpeca-fotos">
        {fotos.length ? (
          fotos.map((f, k) => <img key={f} src={fotoPequena(f)} alt="" loading="lazy" draggable={false} className={cn(k === atual && 'ativa')} />)
        ) : (
          <Espaco rotulo="Fotos em breve" />
        )}
      </span>
      <span className="porpeca-texto">
        <span className="porpeca-nome">{tipo.nome}</span>
        <span className="porpeca-qtd">{tipo.itens.length === 1 ? '1 peça' : `${tipo.itens.length} peças`}</span>
      </span>
      <span className="porpeca-seta" aria-hidden="true">
        <SetaDireita />
      </span>
    </a>
  )
}
