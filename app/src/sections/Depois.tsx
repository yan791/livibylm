/*
  Depois da apresentação: os diferenciais, a criadora e como comprar.
  Ritmo mais calmo, ainda fluido. Fotos que ainda não existem aparecem como
  espaços reservados; textos concretos ficam marcados para confirmar.
*/
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { linkWhatsApp, mensagens, site } from '../dados/site'
import { ajustes, precoBR } from '../dados/colecoes'
import { LinkPolitica } from '../paginas/Politica'
import { Espaco, Ph } from '../components/Espaco'
import { Ima, TituloVivo } from '../components/Vivos'
import {
  IconeAgulha,
  IconeConversa,
  IconeTecido,
  IconeVestido,
  Instagram,
  SetaDiagonal,
  WhatsApp,
} from '../components/icones'

const ease = [0.22, 1, 0.36, 1] as const
const aparece = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 1, ease },
}

const diferenciais = [
  { Icone: IconeAgulha, texto: ['Peças', 'autorais'] },
  { Icone: IconeVestido, texto: ['Caimento', 'fluido'] },
  { Icone: IconeTecido, texto: ['Detalhes', 'de ateliê'] },
  { Icone: IconeConversa, texto: ['Atendimento', 'pelo WhatsApp'] },
]

/** faixa dos diferenciais e o fechamento "Disponível agora" (logo depois dos looks) */
export function Diferenciais() {
  return (
    <section className="dif" aria-label="Diferenciais">
      <ul className="dif-lista">
        {diferenciais.map(({ Icone, texto }, i) => (
          <motion.li
            key={texto[0]}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.8, ease, delay: i * 0.08 }}
          >
            <span className="dif-icone">
              <Icone />
            </span>
            <span className="dif-texto">
              {texto[0]}
              <br />
              {texto[1]}
            </span>
          </motion.li>
        ))}
      </ul>
      <motion.div className="dif-fecho" {...aparece}>
        <div>
          <TituloVivo as="p" className="dif-disponivel" partes={['Disponível agora']} />
          <p className="dif-apoio">Escolha a peça e fale com a gente. A conversa é direta e sem pressa.</p>
        </div>
        <div className="dif-acoes">
          <Ima>
            <a className="pilula cheia" href={linkWhatsApp(mensagens.disponiveis)} target="_blank" rel="noreferrer">
              <WhatsApp className="ico" /> Falar no WhatsApp <SetaDiagonal className="seta" />
            </a>
          </Ima>
          <Ima>
            <a className="pilula" href={site.instagram} target="_blank" rel="noreferrer">
              <Instagram className="ico" /> {site.instagramArroba}
            </a>
          </Ima>
        </div>
      </motion.div>
    </section>
  )
}

export function Sobre() {
  return (
    <section className="sobre" id="sobre" aria-labelledby="sobre-titulo">
      <motion.div className="sobre-foto" {...aparece}>
        <Espaco rotulo="Foto da criadora" proporcao="4 / 5" />
      </motion.div>
      <motion.div className="sobre-texto" {...aparece} transition={{ ...aparece.transition, delay: 0.1 }}>
        <p className="sobretitulo">A criadora</p>
        <TituloVivo id="sobre-titulo" className="titulo-secao" partes={['Por trás de cada peça,', 'quebra', { em: 'um olhar.' }]} />
        <p>
          A Livi leva as iniciais de quem desenha cada peça: LM. <Ph>[Nome da criadora]</Ph> cria pensando no caimento, no
          tecido e em como a roupa acompanha quem veste.
        </p>
        <p>
          <Ph>[Contar aqui, em duas ou três frases, como a marca começou. Confirmar com a cliente.]</Ph>
        </p>
        <p className="sobre-assina">
          <span>LM</span> criadora da Livi
        </p>
      </motion.div>
    </section>
  )
}

// com as vendas pelo site ligadas no painel, a compra fecha na sacola; senão, pelo WhatsApp
const passos = ajustes.vendasOnline
  ? [
      { titulo: 'Escolha a peça', texto: 'Navegue pelas coleções e escolha a peça, a cor e o tamanho.' },
      { titulo: 'Leve para a sacola', texto: 'Junte tudo o que quiser. As dúvidas, a gente tira no WhatsApp.' },
      { titulo: 'Pague no site', texto: 'Entre na sua conta (ou crie na hora) e pague por Pix ou cartão. O frete aparece pelo CEP.' },
      { titulo: 'Receba a sua Livi', texto: 'Acompanhe cada etapa do pedido na sua conta, de qualquer aparelho.' },
    ]
  : [
      { titulo: 'Escolha a peça', texto: 'Navegue pelas coleções e escolha a peça, a cor e o tamanho.' },
      { titulo: 'Chame no WhatsApp', texto: 'O botão da peça já abre a conversa com tudo preenchido.' },
      { titulo: 'Confirme os detalhes', texto: 'Tiramos dúvidas de medidas, pagamento e envio.' },
      { titulo: 'Receba a sua Livi', texto: 'Sua peça chega até você.' },
    ]

/** ph = texto que ainda espera a cliente confirmar (aparece marcado) */
const duvidas: { p: string; r: ReactNode; ph?: boolean }[] = [
  { p: 'Tamanhos', r: '[Grade do PP ao GG e tabela de medidas em cada peça. Confirmar com a cliente.]', ph: true },
  ajustes.vendasOnline
    ? {
        p: 'Pagamento',
        r: `Pix ou cartão de crédito${ajustes.parcelas > 1 ? `, em até ${ajustes.parcelas}x sem juros` : ''}, numa página segura da InfinitePay.`,
      }
    : { p: 'Pagamento', r: '[Formas de pagamento e parcelamento. Confirmar com a cliente.]', ph: true },
  ajustes.vendasOnline
    ? {
        p: 'Envio',
        r: `Em Maceió, a entrega tem uma taxa única${ajustes.taxaMaceio ? ` de ${precoBR(ajustes.taxaMaceio)}` : ''}. ${
          ajustes.correios
            ? 'Para outras cidades, enviamos pelos Correios (PAC ou SEDEX), e o frete aparece pelo CEP antes de pagar.'
            : 'Para outras cidades, fale com a gente pelo WhatsApp.'
        } O pedido sai em ${site.prazoPostagem} depois da aprovação do pagamento, e o prazo de entrega depende da forma escolhida.`,
      }
    : { p: 'Envio', r: '[Regiões atendidas, prazos e frete. Confirmar com a cliente.]', ph: true },
  ajustes.loja
    ? {
        p: 'Trocas',
        r: (
          <>
            Você tem 7 dias do recebimento para desistir da compra e {ajustes.trocaDias} dias para trocar por outro tamanho,
            cor ou peça. <LinkPolitica nome="trocas">Veja como funciona</LinkPolitica>.
          </>
        ),
      }
    : { p: 'Trocas', r: '[Política de troca. Confirmar com a cliente.]', ph: true },
]

export function ComoComprar() {
  return (
    <section className="comprar" id="contato" aria-labelledby="comprar-titulo">
      <motion.div className="comprar-topo" {...aparece}>
        <p className="sobretitulo">Como comprar</p>
        <TituloVivo id="comprar-titulo" className="titulo-secao" partes={['Simples,', { em: 'do começo ao fim.' }]} />
      </motion.div>
      <ol className="comprar-passos">
        {passos.map((p, i) => (
          <motion.li key={p.titulo} {...aparece} transition={{ ...aparece.transition, delay: i * 0.08 }}>
            <span className="num">0{i + 1}</span>
            <strong>{p.titulo}</strong>
            <p>{p.texto}</p>
          </motion.li>
        ))}
      </ol>
      <div className="comprar-baixo">
        <div className="comprar-duvidas">
          {duvidas.map((d) => (
            <details key={d.p}>
              <summary>
                {d.p}
                <span aria-hidden="true" />
              </summary>
              <p>{d.ph ? <Ph>{d.r}</Ph> : d.r}</p>
            </details>
          ))}
        </div>
        <motion.div className="comprar-chamada" {...aparece}>
          <p>Ficou com alguma dúvida? A conversa é direta, com quem conhece cada peça.</p>
          <Ima>
            <a className="pilula cheia" href={linkWhatsApp(mensagens.duvida)} target="_blank" rel="noreferrer">
              <WhatsApp className="ico" /> Falar no WhatsApp <SetaDiagonal className="seta" />
            </a>
          </Ima>
        </motion.div>
      </div>
    </section>
  )
}
