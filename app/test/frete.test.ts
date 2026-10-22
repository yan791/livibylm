import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { opcoesDeEntrega, regiaoDoCep, TABELA_VAZIA, ufDoCep, type TabelaFrete } from '../worker/frete'
import { criarConta, criarPeca, entrar, painel, site } from './ajuda'

const TABELA: TabelaFrete = {
  ...TABELA_VAZIA,
  al: { pac: 1800, sedex: 2500 },
  nordeste: { pac: 2500, sedex: 4000 },
  sudeste: { pac: 3500, sedex: null },
}

/** grava os ajustes pelo painel, como a tela de Ajustes faz */
async function salvarFrete(tabela: unknown) {
  const token = await entrar()
  return painel(token, 'PUT', '/ajustes', {
    vendasOnline: false,
    taxaMaceioCentavos: 1500,
    parcelasSemJuros: 3,
    whatsapp: '5582998115324',
    freteCorreios: tabela,
  })
}

const cliente = { nome: 'Maria Teste', whatsapp: '(82) 99999-1234', email: 'maria@exemplo.com', cpf: '529.982.247-25' }
const endereco = { rua: 'Rua do Teste', numero: '10', complemento: '', bairro: 'Boa Viagem', cidade: 'Recife' }

/** a InfinitePay de mentira: guarda o que o Worker mandou e devolve um link */
function infinitePayFalsa() {
  const enviados: { itens: { description: string; price: number; quantity: number }[] }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const corpo = JSON.parse(String(init?.body ?? '{}'))
    enviados.push({ itens: corpo.items })
    return Response.json({ url: 'https://checkout.infinitepay.io/teste', slug: 'fatura-teste' })
  })
  return enviados
}

afterEach(() => vi.restoreAllMocks())

describe('CEP e região', () => {
  it('acha o estado e a região pelo CEP', () => {
    expect(ufDoCep('57020000')).toBe('AL')
    expect(regiaoDoCep('57020000')).toBeNull() // Maceió tem taxa própria
    expect(regiaoDoCep('57300000')).toBe('al') // Arapiraca
    expect(regiaoDoCep('50030000')).toBe('nordeste') // Recife
    expect(regiaoDoCep('01310100')).toBe('sudeste') // São Paulo
    expect(regiaoDoCep('69005000')).toBe('norte') // Manaus
    expect(regiaoDoCep('70040000')).toBe('centro-oeste') // Brasília
    expect(regiaoDoCep('90010000')).toBe('sul') // Porto Alegre
    expect(ufDoCep('00000000')).toBeNull()
    expect(ufDoCep('5702000')).toBeNull()
  })

  it('oferece Maceió só para Maceió, e os Correios pela tabela', () => {
    expect(opcoesDeEntrega('57020000', 1500, TABELA)).toEqual([{ tipo: 'maceio', nome: 'Entrega em Maceió', centavos: 1500 }])
    expect(opcoesDeEntrega('50030000', 1500, TABELA).map((o) => [o.tipo, o.centavos])).toEqual([
      ['pac', 2500],
      ['sedex', 4000],
    ])
    // região sem preço de SEDEX: só PAC
    expect(opcoesDeEntrega('01310100', 1500, TABELA).map((o) => o.tipo)).toEqual(['pac'])
    // região sem nada cadastrado: nenhuma opção
    expect(opcoesDeEntrega('90010000', 1500, TABELA)).toEqual([])
  })
})

describe('frete na API', () => {
  it('a tabela salva no painel vale para a consulta do site', async () => {
    expect((await salvarFrete(TABELA)).status).toBe(200)
    const r = await site('GET', '/frete?cep=50030-000')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      uf: 'PE',
      opcoes: [
        { tipo: 'pac', nome: 'Correios PAC', centavos: 2500 },
        { tipo: 'sedex', nome: 'Correios SEDEX', centavos: 4000 },
      ],
    })
  })

  it('sem tabela, fora de Maceió não há opção pelo site', async () => {
    expect(await (await site('GET', '/frete?cep=50030000')).json()).toEqual({ uf: 'PE', opcoes: [] })
    expect((await site('GET', '/frete?cep=123')).status).toBe(400)
  })

  it('o painel recusa preço inválido na tabela', async () => {
    expect((await salvarFrete({ nordeste: { pac: -5 } })).status).toBe(400)
    expect((await salvarFrete({ nordeste: { pac: 25.5 } })).status).toBe(400)
  })
})

describe('compra pelos Correios', () => {
  it('cobra o frete da tabela e manda a cliente para o pagamento', async () => {
    await salvarFrete(TABELA)
    await criarPeca({ M: 2 })
    const token = await criarConta()
    const enviados = infinitePayFalsa()

    const r = await site(
      'POST',
      '',
      {
        itens: [{ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 1 }],
        cliente,
        // o frete que o navegador mandar não vale: o servidor usa a tabela
        entrega: { tipo: 'sedex', cep: '50030-000', ...endereco, uf: 'SP', freteCentavos: 1 },
      },
      undefined,
      token,
    )
    expect(r.status).toBe(201)
    const { codigo, pagar } = (await r.json()) as { codigo: string; pagar: string }
    expect(pagar).toBe('https://checkout.infinitepay.io/teste')

    const pedido = await env.DB.prepare('SELECT * FROM pedidos WHERE codigo = ?1').bind(codigo).first<Record<string, unknown>>()
    expect(pedido).toMatchObject({ entrega: 'sedex', frete_centavos: 4000, total_centavos: 14000, uf: 'PE', cidade: 'Recife', cpf: '52998224725' })
    expect(enviados[0].itens).toContainEqual({ description: 'Correios SEDEX', price: 4000, quantity: 1 })
  })

  it('exige o CPF para os Correios', async () => {
    await salvarFrete(TABELA)
    await criarPeca({ M: 2 })
    const token = await criarConta()
    infinitePayFalsa()
    const r = await site(
      'POST',
      '',
      { itens: [{ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 1 }], cliente: { ...cliente, cpf: '' }, entrega: { tipo: 'pac', cep: '50030000', ...endereco } },
      undefined,
      token,
    )
    expect(r.status).toBe(400)
    expect(((await r.json()) as { erro: string }).erro).toMatch(/CPF/)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM pedidos').first<number>('n')).toBe(0)
  })

  it('recusa Correios para Maceió, Maceió para fora e região sem preço', async () => {
    await salvarFrete(TABELA)
    await criarPeca({ M: 2 })
    const token = await criarConta()
    infinitePayFalsa()
    const comprar = (entrega: Record<string, unknown>) =>
      site('POST', '', { itens: [{ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 1 }], cliente, entrega: { ...endereco, ...entrega } }, undefined, token)

    expect((await comprar({ tipo: 'pac', cep: '57020000' })).status).toBe(400)
    expect((await comprar({ tipo: 'maceio', cep: '50030000' })).status).toBe(400)
    expect((await comprar({ tipo: 'pac', cep: '90010000' })).status).toBe(400)
    expect((await comprar({ tipo: 'sedex', cep: '01310100' })).status).toBe(400)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM pedidos').first<number>('n')).toBe(0)
  })

  it('Maceió segue com a taxa única e sem exigir CPF', async () => {
    await criarPeca({ M: 2 })
    const token = await criarConta()
    const enviados = infinitePayFalsa()
    const r = await site(
      'POST',
      '',
      {
        itens: [{ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 1 }],
        cliente: { ...cliente, cpf: '' },
        entrega: { tipo: 'maceio', cep: '57020-000', rua: 'Rua do Sol', numero: '5', bairro: 'Centro' },
      },
      undefined,
      token,
    )
    expect(r.status).toBe(201)
    expect(enviados[0].itens).toContainEqual({ description: 'Entrega em Maceió', price: 1500, quantity: 1 })
  })
})
