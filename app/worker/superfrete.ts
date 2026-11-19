/*
  Cotação do frete pelos Correios (PAC e SEDEX) na SuperFrete, pelo CEP da cliente:
    POST /api/v0/calculator   preço e prazo de cada serviço, de Maceió até o CEP
  O token da conta da loja vai só como segredo (npx wrangler secret put SUPERFRETE_TOKEN).
  Sem token, ou com a SuperFrete fora do ar, o site usa a tabela por região dos Ajustes
  (worker/frete.ts); sem tabela, a cliente fala com a loja pelo WhatsApp.
  Os preços são os da etiqueta comprada na SuperFrete: a loja paga a etiqueta lá e só
  entrega o pacote numa agência dos Correios.
*/
import type { CotacaoCorreios, Servico } from './frete'

const API_PADRAO = 'https://api.superfrete.com'

/** de onde sai o pacote: um CEP de Maceió (o preço dos Correios é o mesmo para a cidade toda) */
export const CEP_ORIGEM = '57020000'

/** o pacote de cada peça de roupa, dobrada: peso em kg, medidas em cm. A SuperFrete monta a caixa para várias */
export const PACOTE_POR_PECA = { weight: 0.3, height: 4, width: 20, length: 28 }

/** códigos dos serviços na SuperFrete */
const CODIGO: Record<Servico, number> = { pac: 1, sedex: 2 }

export type Cotacao = CotacaoCorreios

type Ambiente = { SUPERFRETE_TOKEN?: string; SUPERFRETE_API?: string }

/** a loja cadastrou o token da SuperFrete */
export const temCotacao = (env: object) => {
  const token = (env as Ambiente).SUPERFRETE_TOKEN
  return typeof token === 'string' && token.length > 0
}

// a mesma consulta (CEP e número de peças) vale por 30 minutos: a sacola e o pedido cobram o mesmo preço
const MEMORIA_MS = 30 * 60_000
const memoria = new Map<string, { cotacoes: Cotacao[]; ate: number }>()

/**
  PAC e SEDEX para o CEP, com o preço em centavos e o prazo em dias úteis.
  null quando não deu para cotar (sem token, SuperFrete fora do ar, resposta estranha):
  quem chama usa a tabela dos Ajustes no lugar.
*/
export async function cotarCorreios(env: object, cep: string, pecas: number): Promise<Cotacao[] | null> {
  if (!temCotacao(env)) return null
  const { SUPERFRETE_TOKEN, SUPERFRETE_API } = env as Ambiente
  const n = Math.min(Math.max(1, Math.floor(pecas) || 1), 20)
  const chave = `${cep}:${n}`
  const guardada = memoria.get(chave)
  if (guardada && guardada.ate > Date.now()) return guardada.cotacoes

  let resposta: unknown
  try {
    const r = await fetch((SUPERFRETE_API || API_PADRAO).replace(/\/$/, '') + '/api/v0/calculator', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPERFRETE_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Livi by LM loja 1.0 (livibylm@gmail.com)',
      },
      body: JSON.stringify({
        from: { postal_code: CEP_ORIGEM },
        to: { postal_code: cep },
        services: `${CODIGO.pac},${CODIGO.sedex}`,
        products: [{ quantity: n, ...PACOTE_POR_PECA }],
        options: { own_hand: false, receipt: false, insurance_value: 0, use_insurance_value: false },
      }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!r.ok) {
      console.error(`SuperFrete: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`)
      return null
    }
    resposta = await r.json()
  } catch (e) {
    console.error(`SuperFrete: sem resposta (${e instanceof Error ? e.message : e})`)
    return null
  }
  if (!Array.isArray(resposta)) return null

  const cotacoes = (['pac', 'sedex'] as const).flatMap((tipo): Cotacao[] => {
    const s = resposta.find((x) => x && typeof x === 'object' && (x as { id?: unknown }).id === CODIGO[tipo]) as Record<string, unknown> | undefined
    if (!s || s.has_error) return []
    const preco = Number(s.price)
    const dias = Number(s.delivery_time)
    if (!Number.isFinite(preco) || preco <= 0 || preco > 1000 || !Number.isInteger(dias) || dias <= 0 || dias > 60) return []
    return [{ tipo, centavos: Math.round(preco * 100), dias }]
  })
  // nenhum serviço cotado: não guarda, para tentar de novo na próxima consulta
  if (cotacoes.length) memoria.set(chave, { cotacoes, ate: Date.now() + MEMORIA_MS })
  return cotacoes.length ? cotacoes : null
}

/** só para os testes: esquece as cotações guardadas */
export const esquecerCotacoes = () => memoria.clear()
