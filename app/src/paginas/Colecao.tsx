/*
  Página da coleção: a foto da peça em destaque, informações e compra pelo
  WhatsApp, as outras peças da coleção (com espaço para as fotos), o
  editorial e as outras coleções. Cada peça tem seu próprio link.
*/
import { useEffect, useLayoutEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { acharColecao, acharPeca, colecoes, precoBR, type Peca } from '../dados/colecoes'
import { linkWhatsApp, mensagemPeca } from '../dados/site'
import { navegar, type Rota } from '../lib/rota'
import { rolarPara } from '../lib/scroll'
import { cn } from '../lib/cn'
import { Espaco, Ph } from '../components/Espaco'
import { Rodape } from '../components/Rodape'
import { Fechar, IconeFita, SetaDiagonal, SetaEsquerda, WhatsApp } from '../components/icones'
import { FotoTecido } from '../components/FotoTecido'
import { BotaoDesejo } from '../components/Sacola'
import { CartaoPeca } from '../components/VisualizacaoRapida'
import { FaixaColecoes, TituloVivo } from '../components/Vivos'
import { PROPORCAO } from '../lib/cartao'
import { comBase } from '../lib/base'

const ease = [0.22, 1, 0.36, 1] as const

export function PaginaColecao({ rota }: { rota: Extract<Rota, { nome: 'colecao' }> }) {
  const colecao = acharColecao(rota.colecao) ?? colecoes[0]
  const peca = acharPeca(colecao, rota.peca)
  const [nomeCor, setCor] = useState<string | null>(null)
  const cor = peca.cores.find((c) => c.nome === nomeCor) ?? peca.cores[0]
  const [tamanho, setTamanho] = useState<string | null>(null)
  const [avisoTamanho, setAvisoTamanho] = useState(false)
  const [tabela, setTabela] = useState(false)

  useLayoutEffect(() => {
    rolarPara(0, { imediato: true })
  }, [])

  useEffect(() => {
    setCor(null)
    setTamanho(null)
    document.title = `${peca.nome} | Coleção ${colecao.nome} | Livi by LM`
  }, [peca, colecao.nome])

  useEffect(() => {
    document.documentElement.style.setProperty('--fundo-pagina', colecao.fundo)
    return () => {
      document.documentElement.style.removeProperty('--fundo-pagina')
    }
  }, [colecao.fundo])

  const escolher = (p: Peca) => {
    navegar(`/colecao/${colecao.slug}/${p.slug}`, { semTransicao: true })
    rolarPara(0)
  }

  const querer = () => {
    if (!tamanho) {
      setAvisoTamanho(true)
      return
    }
    window.open(linkWhatsApp(mensagemPeca(colecao, peca, cor.nome, tamanho)), '_blank', 'noopener')
  }

  const voltar = (e: React.MouseEvent) => {
    e.preventDefault()
    navegar('/#colecoes')
  }

  return (
    <main className={cn('pc', `tema-${colecao.tema}`)} style={{ '--fundo': colecao.fundo } as React.CSSProperties}>
      <section className="pc-topo">
        <div className="palco">
          <AnimatePresence mode="wait">
            <motion.div
              key={peca.slug}
              className="palco-foto"
              initial={{ opacity: 0, scale: 0.97, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ duration: 0.7, ease }}
            >
              {peca.fotos[0] ? (
                <div className="palco-moldura" style={{ '--ar': PROPORCAO[colecao.slug] } as React.CSSProperties}>
                  <FotoTecido
                    src={peca.fotos[0]}
                    alt={`${peca.nome}, coleção ${colecao.nome}`}
                    carregamento="eager"
                    imgStyle={{ viewTransitionName: 'peca' } as React.CSSProperties}
                  />
                </div>
              ) : (
                <Espaco rotulo="Espaço para foto da peça" />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <motion.div
          className="pc-info"
          key={peca.slug}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.15 }}
        >
          <a href={comBase('/#colecoes')} className="pc-voltar" onClick={voltar}>
            <SetaEsquerda className="ico" /> Coleções
          </a>
          <p className="sobretitulo">
            Coleção {colecao.nome} <i>·</i> {colecao.numero}
          </p>
          <h1 className="pc-nome">{peca.nome}</h1>
          <p className="pc-preco">{precoBR(peca.preco)}</p>
          <p className="pc-desc">{peca.descricao}</p>

          <dl className="pc-ficha">
            <div>
              <dt>Tecido</dt>
              <dd>
                {peca.tecido.includes('[confirmar]') ? <Ph>{peca.tecido}</Ph> : peca.tecido}
              </dd>
            </div>
          </dl>

          <div className="pc-grupo">
            <p className="pc-rotulo">
              Cor <span>{cor.nome}</span>
            </p>
            <div className="pc-cores">
              {peca.cores.map((c) => (
                <button
                  key={c.nome}
                  type="button"
                  className={cn('pc-cor', c.nome === cor.nome && 'ativa')}
                  style={{ '--c': c.hex } as React.CSSProperties}
                  onClick={() => setCor(c.nome)}
                  aria-label={c.nome}
                  aria-pressed={c.nome === cor.nome}
                />
              ))}
            </div>
          </div>

          <div className={cn('pc-grupo', avisoTamanho && !tamanho && 'aviso')}>
            <p className="pc-rotulo">
              Tamanho
              <button type="button" className="pc-tabela-link" onClick={() => setTabela(true)}>
                <IconeFita className="ico" /> Tabela de medidas
              </button>
            </p>
            <div className="pc-tamanhos" role="radiogroup" aria-label="Tamanho">
              {peca.tamanhos.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tamanho === t}
                  className={cn(tamanho === t && 'ativo')}
                  onClick={() => {
                    setTamanho(t)
                    setAvisoTamanho(false)
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="pc-modelo">
              A modelo tem <Ph>{peca.modelo.altura}</Ph> e veste <Ph>{peca.modelo.veste}</Ph>.
            </p>
            {avisoTamanho && !tamanho && <p className="pc-aviso">Escolha um tamanho para continuar.</p>}
          </div>

          <div className="pc-botoes">
            <button type="button" className="pilula cheia pc-quero" onClick={querer}>
              <WhatsApp className="ico" /> Quero essa peça <SetaDiagonal className="seta" />
            </button>
            <BotaoDesejo className="pc-desejo" item={{ colecao: colecao.slug, peca: peca.slug, cor: cor.nome, tamanho }} />
          </div>
          <p className="pc-quero-nota">Abre o WhatsApp com a peça, a cor e o tamanho escolhidos.</p>
        </motion.div>
      </section>

      <section className="pc-pecas" aria-labelledby="pc-pecas-titulo">
        <div className="pc-secao-topo">
          <p className="sobretitulo">Coleção {colecao.nome}</p>
          <TituloVivo id="pc-pecas-titulo" className="titulo-secao" partes={['As peças', { em: 'da coleção' }]} />
        </div>
        <div className="pc-grade">
          {colecao.pecas.map((p, i) => (
            <motion.div
              key={p.slug}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.8, ease, delay: i * 0.07 }}
            >
              <CartaoPeca colecao={colecao} peca={p} atual={p.slug === peca.slug} aoDestacar={() => escolher(p)} />
            </motion.div>
          ))}
        </div>
      </section>

      <section className="pc-editorial" aria-labelledby="pc-editorial-titulo">
        <div className="pc-secao-topo">
          <p className="sobretitulo">Editorial</p>
          <TituloVivo id="pc-editorial-titulo" className="titulo-secao" partes={['A coleção', { em: 'vestida' }]} />
          <p className="pc-clima">{colecao.descricao}</p>
        </div>
        <div className="pc-editorial-grade">
          {peca.fotos[0] !== colecao.capa ? (
            <motion.figure
              className="pc-editorial-principal"
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 1.1, ease }}
            >
              <img src={colecao.capa} alt={`Editorial da coleção ${colecao.nome}`} loading="lazy" />
            </motion.figure>
          ) : (
            <div className="pc-editorial-principal">
              <Espaco rotulo="Foto do ensaio da coleção" proporcao="4 / 5" />
            </div>
          )}
          <Espaco rotulo="Mais uma foto do ensaio" proporcao="4 / 5" />
          <Espaco rotulo="Detalhe da peça vestida" proporcao="4 / 5" />
        </div>
      </section>

      <section className="pc-outras" aria-labelledby="pc-outras-titulo">
        <div className="pc-secao-topo">
          <p className="sobretitulo">Continue</p>
          <TituloVivo id="pc-outras-titulo" className="titulo-secao" partes={['Outras', { em: 'coleções' }]} />
        </div>
        <div className="pc-outras-grade">
          {colecoes
            .filter((c) => c.slug !== colecao.slug)
            .map((c) => (
              <a
                key={c.slug}
                href={comBase(`/colecao/${c.slug}`)}
                className="pc-outra"
                style={{ '--c': c.fundo } as React.CSSProperties}
                onClick={(e) => {
                  e.preventDefault()
                  navegar(`/colecao/${c.slug}`)
                }}
              >
                <FotoTecido src={c.capa} alt="" />
                <span>
                  <strong>{c.nome}</strong>
                  <em>{c.clima}</em>
                </span>
              </a>
            ))}
        </div>
      </section>

      <FaixaColecoes escura reverso />
      <Rodape rota={rota} />

      <AnimatePresence>
        {tabela && (
          <motion.div
            className="dialogo-fundo"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setTabela(false)}
          >
            <motion.div
              className="dialogo"
              role="dialog"
              aria-modal="true"
              aria-labelledby="tabela-titulo"
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5, ease }}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" className="dialogo-fechar" onClick={() => setTabela(false)} aria-label="Fechar" autoFocus>
                <Fechar />
              </button>
              <p className="sobretitulo">{peca.nome}</p>
              <h3 id="tabela-titulo">Tabela de medidas</h3>
              <table>
                <thead>
                  <tr>
                    <th>Tamanho</th>
                    <th>Busto</th>
                    <th>Cintura</th>
                    <th>Quadril</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['PP', '80', '62', '88'],
                    ['P', '84', '66', '92'],
                    ['M', '88', '70', '96'],
                    ['G', '94', '76', '102'],
                    ['GG', '100', '82', '108'],
                  ].map((l) => (
                    <tr key={l[0]}>
                      {l.map((c, i) => (
                        <td key={i}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="dialogo-nota">
                Medidas em centímetros. <Ph>[Valores ilustrativos: confirmar a tabela real com a cliente.]</Ph>
              </p>
              <p className="dialogo-nota">
                A modelo tem <Ph>{peca.modelo.altura}</Ph> e veste <Ph>{peca.modelo.veste}</Ph>.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
