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
import { fundoDoCatalogo } from './lib/catalogo'
import { Cortina } from './components/Cortina'
import { movimentoReduzido } from './lib/midia'
import { Pedido } from './paginas/Pedido'
import { Politica } from './paginas/Politica'
import { NovaSenha } from './paginas/NovaSenha'
import { Pecas } from './paginas/Pecas'
import { PorPeca } from './sections/PorPeca'

export default function App() {
  const caminho = useCaminho()
  const rota = interpretar(caminho)
  // aberto da página de peças, o catálogo fica por cima dela (e ela continua montada, no mesmo lugar)
  const fundo = rota.nome === 'colecao' ? fundoDoCatalogo() : null
  const pagina = fundo ? interpretar(fundo) : rota

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
      {rota.nome === 'pedido' ? (
        // a página de uma compra e as das políticas ficam sozinhas, sem a página inicial por baixo
        <>
          <Pedido key={rota.codigo} codigo={rota.codigo} />
          <Rodape rota={rota} />
        </>
      ) : rota.nome === 'trocas' || rota.nome === 'privacidade' ? (
        <>
          <Politica key={rota.nome} nome={rota.nome} />
          <Rodape rota={rota} />
        </>
      ) : rota.nome === 'nova-senha' ? (
        <>
          <NovaSenha key={rota.link} link={rota.link} />
          <Rodape rota={rota} />
        </>
      ) : pagina.nome === 'pecas' ? (
        <>
          <Pecas tipo={pagina.tipo} tamanho={pagina.tamanho} />
          <Rodape rota={pagina} />
        </>
      ) : (
        <>
          <Cortina />
          <Home rota={rota} />
        </>
      )}
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
      <PorPeca />
      <Diferenciais />
      <Sobre />
      <ComoComprar />
      <FaixaColecoes escura reverso />
      <Rodape rota={rota} />
    </main>
  )
}
