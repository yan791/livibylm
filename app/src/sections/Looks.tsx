/*
  ATO 2: as coleções num carrossel 3D (galeria circular). Começa exatamente
  onde a abertura parou (o look da Lúmina no centro): com um pouco de
  rolagem o cartão recua e o anel com as outras coleções aparece em volta.
  Dali em diante a cliente troca de coleção arrastando, pelas setas ou
  esperando o giro sozinho, sem precisar rolar a página; tocar na foto da
  frente abre o catálogo da coleção.
*/
import { useLayoutEffect, useRef, useState } from 'react'
import { colecoes } from '../dados/colecoes'
import { gsap, rolarPara, ScrollTrigger } from '../lib/scroll'
import { mostrarCatalogo, useCatalogo } from '../lib/catalogo'
import { movimentoReduzido, useCelular } from '../lib/midia'
import { PROPORCAO } from '../lib/cartao'
import { SetaDireita, SetaEsquerda } from '../components/icones'
import { GuiaRolar, Ima } from '../components/Vivos'
import { Letreiro, type Sentido } from '../components/Letreiro'
import { CircularGallery, type CircularGalleryHandle, type GalleryItem } from '../components/ui/circular-gallery'
import { comBase } from '../lib/base'

const itens: GalleryItem[] = colecoes.map((c) => ({
  id: c.slug,
  src: c.capa,
  alt: `Coleção ${c.nome}`,
  aspect: PROPORCAO[c.slug],
  href: comBase(`/colecao/${c.slug}`),
}))

/** rola até as coleções já com o anel aberto (o fim da entrada), e não até o começo dela */
export function irParaColecoes() {
  const st = ScrollTrigger.getById('colecoes')
  rolarPara(st ? st.start + (st.end - st.start) * 0.8 : '#colecoes')
}

export function Looks() {
  const palco = useRef<HTMLDivElement>(null)
  const galeria = useRef<CircularGalleryHandle>(null)
  const letreiro = useRef<HTMLDivElement>(null)
  const tempo = useRef(0)
  // coleção da frente e o sentido do último giro (o nome se escreve vindo desse lado)
  const [frente, setFrente] = useState<{ i: number; dir: Sentido }>({ i: 0, dir: 1 })
  const [revelado, setRevelado] = useState(true)
  const catalogoAberto = Boolean(useCatalogo())
  const celular = useCelular()
  const atual = colecoes[frente.i]
  const n = colecoes.length

  const aoTrocar = (i: number) =>
    setFrente((f) => (i === f.i ? f : { i, dir: (i - f.i + n) % n === n - 1 ? -1 : 1 }))

  // o traço da coleção da frente enche no ritmo do giro automático (direto no DOM, sem re-render)
  const aoPassarTempo = (t: number) => {
    const el = letreiro.current
    if (!el) return
    if (t < tempo.current) el.dataset.zerou = ''
    else delete el.dataset.zerou
    tempo.current = t
    el.style.setProperty('--tempo', t.toFixed(3))
  }

  useLayoutEffect(() => {
    const el = palco.current
    if (!el) return
    const mm = gsap.matchMedia()
    mm.add(
      { desk: '(min-width: 861px) and (min-aspect-ratio: 11/10)', cel: '(max-width: 860px), (max-aspect-ratio: 11/10)' },
      (ctx) => {
        const { desk } = ctx.conditions as { desk: boolean }
        if (movimentoReduzido()) return
        const estado = { revelar: 0 }
        let aberto: boolean | null = null

        // 0: só o look da abertura, no mesmo tamanho e lugar; 1: o anel inteiro com as informações
        const aplicar = () => {
          el.style.setProperty('--revelar', estado.revelar.toFixed(3))
          const agora = estado.revelar > 0.6
          el.dataset.revelado = agora ? 'sim' : 'nao'
          galeria.current?.reveal(estado.revelar)
          // o nome da coleção se escreve quando o letreiro aparece (e sai quando volta para a abertura)
          if (agora !== aberto) {
            aberto = agora
            setRevelado(agora)
          }
        }

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          onUpdate: aplicar,
          scrollTrigger: {
            id: 'colecoes',
            trigger: el,
            start: 'top top',
            end: () => '+=' + el.clientHeight * (desk ? 0.9 : 0.7),
            pin: true,
            scrub: 0.5,
            invalidateOnRefresh: true,
            onRefresh: aplicar,
            onToggle: (st) => (el.style.visibility = st.isActive || st.progress > 0 ? 'visible' : 'hidden'),
            onLeaveBack: () => {
              el.style.visibility = 'hidden'
              // de volta à abertura: a Lúmina precisa estar de frente para a passagem continuar sem corte
              galeria.current?.goTo(0, { instant: true })
            },
          },
        })
        el.style.visibility = 'hidden'
        tl.to(estado, { revelar: 1, duration: 0.75, ease: 'power2.inOut' }).to({}, { duration: 0.25 })
        aplicar()
        return () => {
          el.style.visibility = ''
          el.style.removeProperty('--revelar')
          delete el.dataset.revelado
          galeria.current?.reveal(1)
          setRevelado(true)
        }
      },
    )
    return () => mm.revert()
  }, [])

  const abrirBloco = (slug: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    mostrarCatalogo(slug, e.currentTarget.querySelector('img'))
  }

  return (
    <section className="lk" id="colecoes" aria-label="As coleções">
      <div
        className="lk-palco"
        ref={palco}
        data-tema={atual.tema}
        style={{ '--fundo': atual.fundo } as React.CSSProperties}
      >
        <div className="lk-anel">
          <CircularGallery
            ref={galeria}
            items={itens}
            label="Coleções Livi"
            gap={celular ? 16 : 40}
            paused={catalogoAberto}
            onActiveChange={aoTrocar}
            onAutoplayProgress={aoPassarTempo}
            onItemClick={(i, img) => mostrarCatalogo(colecoes[i].slug, img)}
          />
        </div>

        {/* continua o convite que surge no fim da abertura e some quando o anel abre */}
        <GuiaRolar ar={PROPORCAO[colecoes[0].slug]} />

        <div className="lk-barra">
          <Ima forca={0.3}>
            <button type="button" className="lk-seta esq" onClick={() => galeria.current?.prev()} aria-label="Coleção anterior">
              <span className="lk-seta-trilho">
                <SetaEsquerda />
                <SetaEsquerda />
              </span>
            </button>
          </Ima>
          <Letreiro
            ref={letreiro}
            indice={frente.i}
            dir={frente.dir}
            visivel={revelado}
            onAbrir={() => mostrarCatalogo(atual.slug, galeria.current?.frontImage())}
            onIr={(i) => galeria.current?.goTo(i)}
          />
          <Ima forca={0.3}>
            <button type="button" className="lk-seta dir" onClick={() => galeria.current?.next()} aria-label="Próxima coleção">
              <span className="lk-seta-trilho">
                <SetaDireita />
                <SetaDireita />
              </span>
            </button>
          </Ima>
        </div>

        {/* movimento reduzido: um look por bloco */}
        <div className="lk-lista">
          {colecoes.map((c) => (
            <article key={c.slug} className={`lk-bloco tema-${c.tema}`} data-slug={c.slug}>
              <p className="lk-bloco-nome">{c.nome}</p>
              <a href={comBase(`/colecao/${c.slug}`)} onClick={abrirBloco(c.slug)} className="lk-bloco-foto">
                <img src={c.capa} alt={`Look da coleção ${c.nome}`} loading="lazy" draggable={false} />
              </a>
              <div className="lk-bloco-info">
                <span className="lk-clima">{c.nome}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
