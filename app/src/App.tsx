import { useEffect, useLayoutEffect } from 'react'
import { MotionConfig } from 'motion/react'
import { useCaminho, interpretar, aoSairDaPagina, type Rota } from './lib/rota'
import { iniciarRolagem, rolarPara, ScrollTrigger } from './lib/scroll'
import { Cabecalho } from './components/Cabecalho'
import { Rodape } from './components/Rodape'
import { Apresentacao } from './sections/Apresentacao'
import { Looks } from './sections/Looks'
import { ComoComprar, Diferenciais, Sobre } from './sections/Depois'
import { FaixaColecoes } from './components/Vivos'
import { GavetaSacola } from './components/Sacola'
import { Catalogo } from './components/Catalogo'
import { Cortina } from './components/Cortina'
import { PaginaColecao } from './paginas/Colecao'
import { movimentoReduzido } from './lib/midia'

let rolagemHome = 0

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
      <GavetaSacola />
      <Catalogo />
      <Cortina />
      {rota.nome === 'colecao' ? <PaginaColecao key={rota.colecao} rota={rota} /> : <Home rota={rota} />}
    </MotionConfig>
  )
}

function Home({ rota }: { rota: Extract<Rota, { nome: 'inicio' }> }) {
  useLayoutEffect(() => {
    document.title = 'Livi by LM | Moda feminina autoral'
    aoSairDaPagina(() => {
      rolagemHome = window.scrollY
    })
    // volta para onde a visitante estava (ou para a âncora pedida)
    const voltar = () => {
      ScrollTrigger.refresh()
      if (rota.ancora) rolarPara('#' + rota.ancora, { imediato: true })
      else if (rolagemHome) rolarPara(rolagemHome, { imediato: true })
    }
    const id = requestAnimationFrame(voltar)
    return () => {
      cancelAnimationFrame(id)
      aoSairDaPagina(null)
    }
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
