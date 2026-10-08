/*
  Letreiro da coleção que está de frente no carrossel das coleções.
  Em cima, "Coleção Nº" com o número rolando como um contador e dois fios que
  se desenham a cada troca. No meio, o nome em Bodoni itálico, escrito letra a
  letra a partir do lado para onde o anel girou, com um brilho de cetim que
  atravessa o nome quando ele assenta. Embaixo, o clima da coleção, que dá
  lugar a "Ver a coleção" com o mouse em cima, e um traço por coleção: o da
  frente enche no ritmo do giro automático (--tempo, vindo de fora).
  As medidas ficam presas à maior coleção, para as setas não pularem.
*/
import { forwardRef } from 'react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { colecoes } from '../dados/colecoes'
import { SetaDiagonal } from './icones'

const ease = [0.22, 1, 0.36, 1] as const

export type Sentido = 1 | -1
type Giro = { dir: Sentido; i: number; n: number }

// cada letra chega do lado para onde o anel girou, assentando como tecido
const letra: Variants = {
  entra: ({ dir }: Giro) => ({ opacity: 0, x: `${0.45 * dir}em`, y: '0.24em', rotate: 9 * dir, filter: 'blur(10px)' }),
  fica: ({ dir, i, n }: Giro) => ({
    opacity: 1,
    x: '0em',
    y: '0em',
    rotate: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.95, ease, delay: 0.06 + (dir > 0 ? i : n - 1 - i) * 0.05 },
  }),
}

// o nome que sai vai embora inteiro, para o lado oposto
const saida: Variants = {
  sai: (dir: Sentido) => ({
    opacity: 0,
    x: `${-0.35 * dir}em`,
    filter: 'blur(8px)',
    transition: { duration: 0.4, ease: [0.55, 0, 0.75, 0.2] },
  }),
}

const entraPe = {
  initial: { opacity: 0, y: 10, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease, delay: 0.3 } },
  exit: { opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.3 } },
}

const separar = (nome: string) => [...nome]

/** número que rola como um contador mecânico */
function Rolo({ texto }: { texto: string }) {
  return (
    <span className="lt-rolo">
      {[...texto].map((d, k) => (
        <span key={k} className="lt-rolo-casa">
          <span className="lt-rolo-fita" style={{ '--n': Number(d) } as React.CSSProperties}>
            {'0123456789'.split('').map((x) => (
              <span key={x}>{x}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}

type Props = {
  indice: number
  dir: Sentido
  /** falso enquanto o anel ainda não abriu: o nome só se escreve quando o letreiro aparece */
  visivel: boolean
  onAbrir: () => void
  onIr: (indice: number) => void
}

export const Letreiro = forwardRef<HTMLDivElement, Props>(({ indice, dir, visivel, onAbrir, onIr }, ref) => {
  const c = colecoes[indice]
  const letras = separar(c.nome)

  return (
    <div className="lt" ref={ref}>
      <button type="button" className="lt-abrir" onClick={onAbrir} aria-label={`Abrir a coleção ${c.nome}`}>
        <span className="lt-sobre" aria-hidden="true">
          <i key={'e' + c.slug} className="lt-fio esq" />
          <span className="lt-sobre-texto">
            Coleção Nº
            <Rolo texto={c.numero} />
          </span>
          <i key={'d' + c.slug} className="lt-fio dir" />
        </span>

        <span className="lt-nome" aria-hidden="true">
          {/* medidas: a caixa fica do tamanho do maior nome */}
          {colecoes.map((x) => (
            <span key={x.slug} className="lt-palavra lt-medida">
              {separar(x.nome).map((l, k) => (
                <span key={k} className="lt-letra">
                  {l}
                </span>
              ))}
            </span>
          ))}
          <AnimatePresence custom={dir}>
            {visivel && (
              <motion.span key={c.slug} className="lt-palavra" custom={dir} variants={saida} exit="sai">
                {letras.map((l, k) => (
                  <motion.span
                    key={k}
                    className="lt-letra"
                    style={{ '--i': k } as React.CSSProperties}
                    custom={{ dir, i: k, n: letras.length }}
                    variants={letra}
                    initial="entra"
                    animate="fica"
                  >
                    {l}
                  </motion.span>
                ))}
                {/* brilho de cetim: uma cópia do nome, revelada por uma faixa que atravessa */}
                <span className="lt-cetim">
                  {letras.map((l, k) => (
                    <span key={k} className="lt-letra" style={{ '--i': k } as React.CSSProperties}>
                      {l}
                    </span>
                  ))}
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <span className="lt-pe" aria-hidden="true">
          {colecoes.map((x) => (
            <span key={x.slug} className="lt-pe-medida">
              {x.clima}
            </span>
          ))}
          <AnimatePresence>
            {visivel && (
              <motion.span key={c.slug} className="lt-pe-atual" {...entraPe}>
                <span className="lt-pe-trilho">
                  <span>{c.clima}</span>
                  <span className="lt-pe-ver">
                    Ver a coleção <SetaDiagonal className="seta" />
                  </span>
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </button>

      <div className="lt-tracos" role="group" aria-label="Escolher a coleção">
        {colecoes.map((x, k) => (
          <button
            key={x.slug}
            type="button"
            className="lt-traco-botao"
            data-ativo={k === indice || undefined}
            aria-label={`Coleção ${x.nome}`}
            aria-current={k === indice ? 'true' : undefined}
            onClick={() => onIr(k)}
          >
            <span className="lt-traco">
              <span className="lt-traco-cheio" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
})

Letreiro.displayName = 'Letreiro'
