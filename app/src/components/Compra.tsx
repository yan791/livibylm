/*
  Compra pelo site, dentro da sacola (só com as vendas ligadas no painel):
  dados da cliente, CEP e a entrega, Maceió ou Correios, com o preço na hora.
  Depois ela vai para a página de pagamento da InfinitePay e volta para
  /pedido/<código>. O servidor refaz todas as contas (preços, frete e estoque);
  aqui é só para ela ver antes.
  O endereço vem do ViaCEP quando der; se ele não responder, ela digita.
*/
import { useEffect, useState, type FormEvent } from 'react'
import { ajustes, precoBR, rotuloTamanho } from '../dados/colecoes'
import { linkWhatsApp } from '../dados/site'
import { API } from '../lib/base'
import type { detalhar } from '../lib/sacola'
import { cn } from '../lib/cn'
import { SetaEsquerda, WhatsApp } from './icones'

type Item = ReturnType<typeof detalhar>[number]
type TipoEntrega = 'maceio' | 'pac' | 'sedex'
type Opcao = { tipo: TipoEntrega; nome: string; centavos: number }
type Frete = { estado: 'consultando' } | { estado: 'pronto'; opcoes: Opcao[] } | { estado: 'erro'; mensagem: string }

const correios = (t: TipoEntrega | null) => t === 'pac' || t === 'sedex'

/** "57020000" -> "57020-000" enquanto ela digita */
const comHifen = (digitos: string) => (digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5, 8)}` : digitos)

async function consultarFrete(cep: string): Promise<Frete> {
  try {
    const r = await fetch(`${API}/api/pedidos/frete?cep=${cep}`)
    const dados = (await r.json()) as { opcoes?: Opcao[]; erro?: string }
    return r.ok ? { estado: 'pronto', opcoes: dados.opcoes ?? [] } : { estado: 'erro', mensagem: dados.erro ?? 'Confira o CEP.' }
  } catch {
    return { estado: 'erro', mensagem: 'Não conseguimos consultar a entrega agora. Tente de novo em instantes.' }
  }
}

type Endereco = { rua: string; bairro: string; cidade: string }

/** rua, bairro e cidade pelo ViaCEP; null se ele não souber ou não responder (ela digita) */
async function buscarEndereco(cep: string): Promise<Endereco | null> {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5000) })
    const d = (await r.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string }
    return d.erro ? null : { rua: d.logradouro ?? '', bairro: d.bairro ?? '', cidade: d.localidade ?? '' }
  } catch {
    return null
  }
}

export function Compra({ itens, voltar }: { itens: Item[]; voltar: () => void }) {
  const [dados, setDados] = useState({ nome: '', whatsapp: '', email: '', cpf: '' })
  const [cep, setCep] = useState('')
  const [endereco, setEndereco] = useState({ rua: '', numero: '', complemento: '', bairro: '', cidade: '' })
  const [frete, setFrete] = useState<Frete | null>(null)
  const [tipo, setTipo] = useState<TipoEntrega | null>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const digitos = cep.replace(/\D/g, '').slice(0, 8)
  const opcoes = frete?.estado === 'pronto' ? frete.opcoes : []
  const escolhida = opcoes.find((o) => o.tipo === tipo)
  const pecas = itens.reduce((s, i) => s + i.peca.preco * i.qtd, 0)
  const total = pecas + (escolhida ? escolhida.centavos / 100 : 0)

  // CEP completo: pergunta a entrega à loja e o endereço ao ViaCEP, ao mesmo tempo
  useEffect(() => {
    if (digitos.length !== 8) {
      setFrete(null)
      return
    }
    let valendo = true
    setFrete({ estado: 'consultando' })
    void Promise.all([consultarFrete(digitos), buscarEndereco(digitos)]).then(([f, e]) => {
      if (!valendo) return
      setFrete(f)
      const lista = f.estado === 'pronto' ? f.opcoes : []
      setTipo((t) => (lista.some((o) => o.tipo === t) ? t : (lista[0]?.tipo ?? null)))
      if (e) setEndereco((x) => ({ ...x, rua: e.rua || x.rua, bairro: e.bairro || x.bairro, cidade: e.cidade || x.cidade }))
    })
    return () => {
      valendo = false
    }
  }, [digitos])

  const campo = (k: keyof typeof dados) => (v: string) => setDados((x) => ({ ...x, [k]: v }))
  const campoEndereco = (k: keyof typeof endereco) => (v: string) => setEndereco((x) => ({ ...x, [k]: v }))

  const faltando = () => {
    if (dados.nome.trim().length < 3) return 'Preencha seu nome completo.'
    if (!dados.whatsapp.trim()) return 'Preencha seu WhatsApp, com DDD.'
    if (!dados.email.trim()) return 'Preencha seu e-mail.'
    if (digitos.length !== 8) return 'Preencha o CEP.'
    if (!escolhida) return 'Escolha a entrega.'
    if (!endereco.rua.trim() || !endereco.numero.trim() || !endereco.bairro.trim()) return 'Preencha a rua, o número e o bairro.'
    if (correios(tipo) && !endereco.cidade.trim()) return 'Preencha a cidade.'
    if (correios(tipo) && !dados.cpf.trim()) return 'Para os Correios, preencha o CPF.'
    return ''
  }

  const pagar = async (e: FormEvent) => {
    e.preventDefault()
    const falta = faltando()
    setErro(falta)
    if (falta || !tipo) return
    setEnviando(true)
    try {
      const r = await fetch(`${API}/api/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: itens.map((i) => ({ peca: i.peca.slug, cor: i.cor, tamanho: i.tamanho, qtd: i.qtd })),
          cliente: { ...dados, cpf: correios(tipo) ? dados.cpf : '' },
          entrega: { tipo, cep: digitos, ...endereco },
        }),
      })
      const resposta = (await r.json()) as { pagar?: string; erro?: string }
      if (r.ok && resposta.pagar) {
        // a página de pagamento da InfinitePay; ela volta para /pedido/<código>
        location.assign(resposta.pagar)
        return
      }
      setErro(resposta.erro ?? 'Não conseguimos fechar a compra agora. Tente de novo em instantes.')
    } catch {
      setErro('Não conseguimos falar com a loja agora. Confira a internet e tente de novo.')
    }
    setEnviando(false)
  }

  return (
    <form className="compra" onSubmit={pagar} noValidate>
      <div className="compra-corpo">
        <button type="button" className="compra-voltar" onClick={voltar}>
          <SetaEsquerda className="ico" /> Voltar para a sacola
        </button>

        <fieldset className="compra-bloco">
          <legend>Seus dados</legend>
          <Campo rotulo="Nome completo" valor={dados.nome} mudar={campo('nome')} autoComplete="name" />
          <Campo rotulo="WhatsApp, com DDD" valor={dados.whatsapp} mudar={campo('whatsapp')} tipo="tel" autoComplete="tel" dica="É por ele que a gente fala sobre o pedido." />
          <Campo rotulo="E-mail" valor={dados.email} mudar={campo('email')} tipo="email" autoComplete="email" />
        </fieldset>

        <fieldset className="compra-bloco">
          <legend>Entrega</legend>
          <Campo
            rotulo="CEP"
            valor={comHifen(digitos)}
            mudar={(v) => setCep(v.replace(/\D/g, '').slice(0, 8))}
            modo="numeric"
            autoComplete="postal-code"
            dica={frete?.estado === 'consultando' ? 'Consultando a entrega…' : undefined}
          />

          {frete?.estado === 'erro' && <p className="compra-aviso">{frete.mensagem}</p>}
          {frete?.estado === 'pronto' && !opcoes.length && (
            <p className="compra-aviso">
              Ainda não entregamos nesse CEP pelo site.{' '}
              <a href={linkWhatsApp('Olá! Vim pelo site da Livi e queria saber da entrega para o meu CEP: ' + comHifen(digitos))} target="_blank" rel="noreferrer">
                Fale com a gente pelo WhatsApp
              </a>
              .
            </p>
          )}

          {opcoes.length > 0 && (
            <div className="compra-opcoes" role="radiogroup" aria-label="Forma de entrega">
              {opcoes.map((o) => (
                <label key={o.tipo} className={cn('compra-opcao', tipo === o.tipo && 'ativa')}>
                  <input type="radio" name="entrega" checked={tipo === o.tipo} onChange={() => setTipo(o.tipo)} />
                  <span>{o.nome}</span>
                  <strong>{precoBR(o.centavos / 100)}</strong>
                </label>
              ))}
            </div>
          )}

          {opcoes.length > 0 && (
            <>
              <Campo rotulo="Rua" valor={endereco.rua} mudar={campoEndereco('rua')} autoComplete="address-line1" />
              <div className="compra-lado">
                <Campo rotulo="Número" valor={endereco.numero} mudar={campoEndereco('numero')} modo="numeric" />
                <Campo rotulo="Complemento (opcional)" valor={endereco.complemento} mudar={campoEndereco('complemento')} autoComplete="address-line2" />
              </div>
              <Campo rotulo="Bairro" valor={endereco.bairro} mudar={campoEndereco('bairro')} />
              {correios(tipo) && (
                <>
                  <Campo rotulo="Cidade" valor={endereco.cidade} mudar={campoEndereco('cidade')} autoComplete="address-level2" />
                  <Campo
                    rotulo="CPF"
                    valor={dados.cpf}
                    mudar={campo('cpf')}
                    modo="numeric"
                    dica="Os Correios pedem o CPF na declaração de conteúdo do pacote."
                  />
                </>
              )}
            </>
          )}
        </fieldset>

        <section className="compra-bloco compra-resumo" aria-label="Resumo da compra">
          <h3>Resumo</h3>
          <ul>
            {itens.map((i) => (
              <li key={i.id}>
                <span>
                  {i.qtd > 1 && `${i.qtd}x `}
                  {i.peca.nome} · {i.cor} · {rotuloTamanho(i.tamanho!)}
                </span>
                <span>{precoBR(i.peca.preco * i.qtd)}</span>
              </li>
            ))}
            {escolhida && (
              <li>
                <span>{escolhida.nome}</span>
                <span>{precoBR(escolhida.centavos / 100)}</span>
              </li>
            )}
          </ul>
        </section>

        <a className="compra-duvida" href={linkWhatsApp()} target="_blank" rel="noreferrer">
          <WhatsApp className="ico" /> Dúvidas? Fale com a gente
        </a>
      </div>

      <div className="gaveta-rodape">
        <p className="gaveta-total">
          <span>Total{escolhida ? '' : ' sem a entrega'}</span>
          <strong>{precoBR(total)}</strong>
        </p>
        {erro && (
          <p className="compra-erro" role="alert">
            {erro}
          </p>
        )}
        <button type="submit" className="pilula cheia" disabled={enviando}>
          {enviando ? 'Abrindo o pagamento…' : 'Ir para o pagamento'}
        </button>
        <p className="gaveta-nota">
          Pix ou cartão{ajustes.parcelas > 1 ? ` em até ${ajustes.parcelas}x sem juros` : ''}, na página da InfinitePay. Ao seguir, as peças
          ficam separadas para você por 30 minutos.
        </p>
      </div>
    </form>
  )
}

type PropsCampo = {
  rotulo: string
  valor: string
  mudar: (v: string) => void
  tipo?: 'text' | 'tel' | 'email'
  modo?: 'text' | 'numeric'
  autoComplete?: string
  dica?: string
}

function Campo({ rotulo, valor, mudar, tipo = 'text', modo, autoComplete, dica }: PropsCampo) {
  return (
    <label className="compra-campo">
      <span>{rotulo}</span>
      <input type={tipo} inputMode={modo} value={valor} onChange={(e) => mudar(e.target.value)} autoComplete={autoComplete ?? 'off'} />
      {dica && <small>{dica}</small>}
    </label>
  )
}
