import { useEffect, useLayoutEffect } from 'react'
import { MotionConfig } from 'motion/react'
import { useCaminho, interpretar, type Rota } from './lib/rota'
import { iniciarRolagem, rolarPara, ScrollTrigger } from './lib/scroll'
import { Cabecalho } from './components/Cabecalho'
import { Rodape } from './components/Rodape'
import { Apresentacao } from './sections/Apresentacao'
import { Looks } from './sections/Looks'
import { ComoComprar, Diferenciais, Sobre } from './sections/Depois'
import { FaixaColecoes } from './components/Vivos'
import { Gaveta } from './components/Gaveta'
import { AvisoDesejo } from './components/Desejos'
import { Catalogo } from './components/Catalogo'
import { Cortina } from './components/Cortina'
import { movimentoReduzido } from './lib/midia'

export default function App() {
  const caminho = useCaminho()
  const rota = interpretar(caminho)

  useEffect(() => {
    iniciarRolagem()
    ScrollTrigger.config({ ignoreMobileResize: true })
  }, [])

  return (
    <MotionConfig reducedMotion={movimentoReduzido() ? 'always' : 'never'}>
      <Cabecalho rota={rota} />
      <Gaveta />
      <AvisoDesejo />
      {/* /colecao/... abre o catálogo por cima da página inicial, que fica sempre montada */}
      <Catalogo />
      <Cortina />
      <Home rota={rota} />
    </MotionConfig>
  )
}

function Home({ rota }: { rota: Rota }) {
  useLayoutEffect(() => {
    // chegou por um link com âncora (ex.: /#sobre): vai direto para a seção
    const ancora = rota.nome === 'inicio' ? rota.ancora : undefined
    const id = requestAnimationFrame(() => {
      ScrollTrigger.refresh()
      if (ancora) rolarPara('#' + ancora, { imediato: true })
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="home">
      <Apresentacao />
      <Looks />
      <FaixaColecoes />
      <Diferenciais />
      <Sobre />
      <ComoComprar />
      <FaixaColecoes escura reverso />
      <Rodape rota={rota} />
    </main>
  )
}
