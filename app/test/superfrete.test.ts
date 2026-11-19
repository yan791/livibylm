import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { limparCacheCatalogo } from '../worker/catalogo'
import { TABELA_VAZIA } from '../worker/frete'
import { esquecerCotacoes } from '../worker/superfrete'
import { criarConta, criarPeca, entrar, loja, painel, site } from './ajuda'

const ambiente = env as unknown as Record<string, unknown>
const cliente = { cpf: '529.982.247-25' }
const endereco = { rua: 'Rua do Teste', numero: '10', complemento: '', bairro: 'Boa Viagem', cidade: 'Recife' }

/** a resposta da SuperFrete para PAC e SEDEX, como na documentação */
const COTACAO = [
  { id: 1, name: 'PAC', price: 23.4, delivery_time: 6, has_error: false },
  { id: 2, name: 'SEDEX', price: 41.1, delivery_time: 2, has_error: false },
]

type Chamada = { url: string; corpo: Record<string, unknown>; cabecalhos: Record<string, string> }

/** a SuperFrete e a InfinitePay de mentira: guardam o que o Worker mandou */
function servicosFalsos(cotacao: unknown = COTACAO, status = 200) {
  const chamadas: Chamada[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const corpo = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    chamadas.push({ url: String(url), corpo, cabecalhos: (init?.headers ?? {}) as Record<string, string> })
    if (String(url).includes('/api/v0/calculator')) return Response.json(cotacao, { status })
    return Response.json({ url: 'https://checkout.infinitepay.io/teste', slug: 'fatura-teste' })
  })
  return chamadas
}

const consultar = (cep: string, pecas = 1, ip = '198.51.100.60') =>
  site('GET', `/frete?cep=${cep}&pecas=${pecas}`, undefined, ip).then((r) => r.json() as Promise<{ opcoes: Record<string, unknown>[] }>)

async function salvarTabela(tabela: unknown) {
  const token = await entrar()
  return painel(token, 'PUT', '/ajustes', { vendasOnline: false, taxaMaceioCentavos: 1500, parcelasSemJuros: 3, whatsapp: '5582998115324', freteCorreios: tabela })
}

afterEach(() => {
  delete ambiente.SUPERFRETE_TOKEN
  esquecerCotacoes()
  limparCacheCatalogo()
  vi.restoreAllMocks()
})

describe('frete pela SuperFrete', () => {
  it('sem o token, não pergunta à SuperFrete: vale a tabela (vazia = sem Correios)', async () => {
    const chamadas = servicosFalsos()
    expect((await consultar('50030000')).opcoes).toEqual([])
    expect(chamadas).toHaveLength(0)
    expect(((await (await loja()).json()) as { ajustes: { correios: boolean } }).ajustes.correios).toBe(false)
  })

  it('com o token: PAC e SEDEX com o preço e o prazo do CEP, e o site passa a oferecer os Correios', async () => {
    ambiente.SUPERFRETE_TOKEN = 'token-teste'
    const chamadas = servicosFalsos()
    expect((await consultar('50030-000', 3)).opcoes).toEqual([
      { tipo: 'pac', nome: 'Correios PAC', centavos: 2340, dias: 6 },
      { tipo: 'sedex', nome: 'Correios SEDEX', centavos: 4110, dias: 2 },
    ])
    expect(chamadas[0].url).toBe('https://api.superfrete.com/api/v0/calculator')
    expect(chamadas[0].cabecalhos.Authorization).toBe('Bearer token-teste')
    expect(chamadas[0].corpo).toMatchObject({ from: { postal_code: '57020000' }, to: { postal_code: '50030000' }, services: '1,2', products: [{ quantity: 3 }] })
    expect(((await (await loja()).json()) as { ajustes: { correios: boolean } }).ajustes.correios).toBe(true)
  })

  it('Maceió continua com a taxa única, sem perguntar à SuperFrete', async () => {
    ambiente.SUPERFRETE_TOKEN = 'token-teste'
    const chamadas = servicosFalsos()
    expect((await consultar('57020000')).opcoes).toEqual([{ tipo: 'maceio', nome: 'Entrega em Maceió', centavos: 1500 }])
    expect(chamadas).toHaveLength(0)
  })

  it('serviço com erro fica de fora; SuperFrete fora do ar cai na tabela dos Ajustes', async () => {
    ambiente.SUPERFRETE_TOKEN = 'token-teste'
    servicosFalsos([COTACAO[0], { ...COTACAO[1], has_error: true }])
    expect((await consultar('50030000')).opcoes.map((o) => o.tipo)).toEqual(['pac'])
    esquecerCotacoes()
    vi.restoreAllMocks()
    await salvarTabela({ ...TABELA_VAZIA, nordeste: { pac: 2500, sedex: 4000 } })
    servicosFalsos({}, 500)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await consultar('50030000')).opcoes).toEqual([
      { tipo: 'pac', nome: 'Correios PAC', centavos: 2500 },
      { tipo: 'sedex', nome: 'Correios SEDEX', centavos: 4000 },
    ])
  })

  it('a compra cobra o frete cotado para as peças da sacola, nunca o que o navegador mandou', async () => {
    ambiente.SUPERFRETE_TOKEN = 'token-teste'
    await criarPeca({ M: 5 })
    const token = await criarConta()
    const chamadas = servicosFalsos()
    const r = await site(
      'POST',
      '',
      {
        itens: [{ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 2 }],
        cliente,
        entrega: { tipo: 'sedex', cep: '50030-000', ...endereco, freteCentavos: 1 },
      },
      undefined,
      token,
    )
    expect(r.status).toBe(201)
    const { codigo } = (await r.json()) as { codigo: string }
    const pedido = await env.DB.prepare('SELECT entrega, frete_centavos, total_centavos FROM pedidos WHERE codigo = ?1').bind(codigo).first()
    expect(pedido).toEqual({ entrega: 'sedex', frete_centavos: 4110, total_centavos: 24_110 })
    expect(chamadas.find((c) => c.url.includes('/calculator'))!.corpo).toMatchObject({ products: [{ quantity: 2 }] })
    const link = chamadas.find((c) => c.url.endsWith('/links'))!.corpo as { items: { description: string; price: number }[] }
    expect(link.items).toContainEqual({ description: 'Correios SEDEX', price: 4110, quantity: 1 })
  })
})
