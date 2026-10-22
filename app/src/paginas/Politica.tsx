/*
  Páginas das políticas da loja: /trocas e /privacidade. Os prazos, o frete
  da troca e os dados de quem vende vêm dos Ajustes do painel; o resto segue o
  Código de Defesa do Consumidor (7 dias para desistir, 90 para defeito), o
  Decreto 7.962/2013 (comércio eletrônico) e a LGPD.
*/
import { useLayoutEffect } from 'react'
import { ajustes } from '../dados/colecoes'
import { linkWhatsApp, site } from '../dados/site'
import { navegar } from '../lib/rota'
import { rolarPara } from '../lib/scroll'
import { comBase } from '../lib/base'
import { SetaDiagonal, WhatsApp } from '../components/icones'

export type NomePolitica = 'trocas' | 'privacidade'

export const TITULOS: Record<NomePolitica, string> = { trocas: 'Trocas e devoluções', privacidade: 'Privacidade' }

/** abre a página da política sem recarregar o site (links do rodapé) */
export function abrirPolitica(nome: NomePolitica) {
  navegar('/' + nome, { semTransicao: true })
}

/** link para a página da política: mesmo endereço com ou sem JavaScript; novaAba para quem está no meio da compra */
export function LinkPolitica({ nome, novaAba, children }: { nome: NomePolitica; novaAba?: boolean; children?: React.ReactNode }) {
  return (
    <a
      href={comBase('/' + nome)}
      {...(novaAba
        ? { target: '_blank', rel: 'noreferrer' }
        : {
            onClick: (e: React.MouseEvent) => {
              e.preventDefault()
              abrirPolitica(nome)
            },
          })}
    >
      {children ?? TITULOS[nome]}
    </a>
  )
}

/** 5582998115324 -> (82) 99811-5324 */
const telefone = (n: string) => n.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')

const ATUALIZADA = 'outubro de 2026'

export function Politica({ nome }: { nome: NomePolitica }) {
  useLayoutEffect(() => {
    document.title = `${TITULOS[nome]} | Livi by LM`
    rolarPara(0, { imediato: true })
    return () => {
      document.title = 'Livi by LM | Moda feminina autoral'
    }
  }, [nome])

  return (
    <main className="politica">
      <article className="politica-caixa">
        <p className="sobretitulo">Políticas da loja</p>
        <h1 className="politica-titulo">{TITULOS[nome]}</h1>
        {nome === 'trocas' ? <Trocas /> : <Privacidade />}
        <p className="politica-data">Atualizada em {ATUALIZADA}.</p>
      </article>
    </main>
  )
}

function Contato() {
  const loja = ajustes.loja
  return (
    <>
      no WhatsApp {telefone(site.whatsapp)}
      {loja?.email && (
        <>
          {' '}
          ou pelo e-mail <a href={`mailto:${loja.email}`}>{loja.email}</a>
        </>
      )}
    </>
  )
}

const FRETE_TROCA = {
  loja: 'O frete da troca, de ida e de volta, é por nossa conta.',
  dividido: 'O envio da peça para a loja fica por sua conta, e o envio da peça nova é por nossa conta.',
  cliente: 'O frete da troca, de ida e de volta, fica por sua conta.',
}

function Trocas() {
  return (
    <>
      <p className="politica-intro">Se algo não sair como você esperava, a gente resolve. Veja como funciona.</p>

      <section>
        <h2>Desistiu da compra</h2>
        <p>
          Nas compras feitas a distância (pelo site, pelo WhatsApp ou pelo Instagram), você pode desistir em até 7 dias corridos,
          contados do dia em que recebeu o pedido, sem precisar dizer o motivo. É um direito do Código de Defesa do Consumidor.
        </p>
        <p>Devolvemos o valor total, com o frete, e o envio da peça de volta é por nossa conta.</p>
      </section>

      <section>
        <h2>Troca de tamanho, cor ou peça</h2>
        <p>
          Você tem até {ajustes.trocaDias} dias, contados do recebimento, para pedir a troca por outro tamanho, outra cor ou outra
          peça, conforme o que tivermos disponível.
        </p>
        <p>
          A peça precisa voltar sem uso, sem lavagem e com a etiqueta. Se a peça nova tiver outro valor, a gente acerta a
          diferença com você. {FRETE_TROCA[ajustes.freteTroca]}
        </p>
      </section>

      <section>
        <h2>Peça com defeito</h2>
        <p>
          Se a peça chegar com algum defeito, fale com a gente em até 90 dias do recebimento. Trocamos por uma peça igual ou, se
          não houver, devolvemos o valor. Nesse caso, todo o frete é por nossa conta.
        </p>
      </section>

      <section>
        <h2>Como pedir</h2>
        <p>
          Fale com a gente <Contato />, com o número do pedido. Respondemos com o endereço para o envio e os próximos passos.
        </p>
        <p>
          O valor volta pelo mesmo meio do pagamento: no Pix, por Pix; no cartão de crédito, pedimos o estorno à operadora, e ele
          aparece na fatura conforme o prazo do seu banco.
        </p>
        <a className="pilula cheia" href={linkWhatsApp('Olá! Vim pelo site da Livi e quero falar sobre uma troca ou devolução.')} target="_blank" rel="noreferrer">
          <WhatsApp className="ico" /> Falar no WhatsApp <SetaDiagonal className="seta" />
        </a>
      </section>
    </>
  )
}

function Privacidade() {
  const loja = ajustes.loja
  return (
    <>
      <p className="politica-intro">
        Aqui está quais dados a Livi recebe, para que usa e com quem divide. Seguimos a Lei Geral de Proteção de Dados (LGPD).
      </p>

      <section>
        <h2>Quem cuida dos seus dados</h2>
        <p>
          {loja ? (
            <>
              {loja.nome}, {loja.documento.length > 14 ? 'CNPJ' : 'CPF'} {loja.documento}, responsável pela Livi by LM.
            </>
          ) : (
            'A Livi by LM.'
          )}{' '}
          Para qualquer pedido sobre os seus dados, fale com a gente <Contato />.
        </p>
      </section>

      <section>
        <h2>O que recebemos e para quê</h2>
        <ul>
          <li>
            <strong>Na compra pelo site:</strong> nome, WhatsApp, e-mail e endereço de entrega, para preparar e entregar o pedido e
            falar com você sobre ele. Nos envios pelos Correios, também o CPF, que vai na declaração de conteúdo do pacote.
          </li>
          <li>
            <strong>Na sua conta no site:</strong> nome, WhatsApp, e-mail e uma senha, para você entrar e acompanhar os seus
            pedidos de qualquer aparelho. A senha fica guardada embaralhada: nem a loja consegue ler. Enquanto a conta estiver
            aberta, o navegador guarda um código de acesso, que sai quando você toca em “Sair”.
          </li>
          <li>
            <strong>No pagamento:</strong> ele é feito na página da InfinitePay. Os dados do seu cartão não passam pelo site da
            Livi: recebemos só a confirmação, a forma de pagamento e o comprovante.
          </li>
          <li>
            <strong>Sacola e desejos:</strong> ficam guardados só no seu navegador, e não vão para a loja até você fechar uma
            compra.
          </li>
          <li>
            <strong>No WhatsApp:</strong> usamos o que você manda só para te atender.
          </li>
        </ul>
        <p>Não usamos cookies de propaganda nem ferramentas que acompanham a sua navegação.</p>
      </section>

      <section>
        <h2>Com quem dividimos</h2>
        <ul>
          <li>
            <strong>InfinitePay</strong>, que faz o pagamento: o valor, o seu nome, e-mail, WhatsApp e endereço.
          </li>
          <li>
            <strong>Correios</strong>, nos envios por eles: nome, endereço e CPF.
          </li>
          <li>
            <strong>Cloudflare</strong>, onde ficam os pedidos, e <strong>GitHub</strong>, onde ficam as páginas do site. Eles
            recebem dados técnicos de acesso, como o endereço IP.
          </li>
          <li>
            <strong>ViaCEP</strong>: o CEP que você digita, para preencher o endereço.
          </li>
        </ul>
        <p>Não vendemos nem passamos os seus dados para mais ninguém.</p>
      </section>

      <section>
        <h2>Por quanto tempo</h2>
        <p>
          Guardamos os dados dos pedidos pelo tempo necessário para a entrega, as trocas e as obrigações legais, como as fiscais.
          A conta fica guardada até você pedir para apagar.
        </p>
      </section>

      <section>
        <h2>Seus direitos</h2>
        <p>
          Você pode pedir para ver, corrigir ou apagar os seus dados (inclusive a sua conta no site), e saber com quem eles
          foram divididos. É só pedir pelo WhatsApp ou pelo e-mail, e respondemos em até 15 dias.
        </p>
      </section>
    </>
  )
}
