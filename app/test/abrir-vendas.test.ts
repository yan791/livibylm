import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aviso, entrar, loja, painel } from './ajuda'

const DADOS_LOJA = { nome: 'Livia Moraes Loureiro', documento: '529.982.247-25', endereco: 'Rua do Teste, 10, Ponta Verde, Maceió, AL', email: 'contato@exemplo.com' }

/** grava os ajustes pelo painel, como a tela de Ajustes faz */
function salvarAjustes(token: string, mudar: Record<string, unknown> = {}) {
  return painel(token, 'PUT', '/ajustes', {
    vendasOnline: false,
    taxaMaceioCentavos: 1500,
    parcelasSemJuros: 3,
    whatsapp: '5582998115324',
    freteCorreios: {},
    loja: DADOS_LOJA,
    trocaDias: 15,
    freteTroca: 'loja',
    ...mudar,
  })
}

/** a InfinitePay de mentira: /links devolve a página de pagamento, /payment_check responde `pago` */
function infinitePayFalsa(o: { links?: number; pago?: Record<string, unknown> } = {}) {
  const links: Record<string, unknown>[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const corpo = JSON.parse(String(init?.body ?? '{}'))
    if (String(url).endsWith('/links')) {
      links.push(corpo)
      return o.links ? new Response('fora do ar', { status: o.links }) : Response.json({ url: 'https://checkout.infinitepay.io/teste', slug: 'fatura-teste' })
    }
    return Response.json(o.pago ?? { success: true, paid: false })
  })
  return links
}

type Teste = { id: number; situacao: string; totalCentavos: number; pagar: string; pago: boolean; aviso: boolean } | null

const estadoTeste = async (token: string) => ((await (await painel(token, 'GET', '/compra-teste')).json()) as { teste: Teste }).teste

const erroDe = async (r: Response) => ((await r.json()) as { erro: string }).erro

afterEach(() => vi.restoreAllMocks())

describe('dados da loja e trocas', () => {
  it('o painel guarda e o site recebe, com o CPF formatado', async () => {
    const token = await entrar()
    expect((await salvarAjustes(token)).status).toBe(200)
    const { ajustes } = (await (await loja()).json()) as { ajustes: Record<string, unknown> }
    expect(ajustes).toMatchObject({
      loja: { ...DADOS_LOJA, documento: '529.982.247-25' },
      trocaDias: 15,
      freteTroca: 'loja',
      taxaMaceioCentavos: 1500,
      correios: false,
      vendasOnline: false,
    })
  })

  it('aceita CNPJ e recusa documento que não confere', async () => {
    const token = await entrar()
    expect((await salvarAjustes(token, { loja: { ...DADOS_LOJA, documento: '11.222.333/0001-81' } })).status).toBe(200)
    expect((await salvarAjustes(token, { loja: { ...DADOS_LOJA, documento: '529.982.247-26' } })).status).toBe(400)
    expect((await salvarAjustes(token, { loja: { ...DADOS_LOJA, documento: '11.222.333/0001-82' } })).status).toBe(400)
    expect((await salvarAjustes(token, { loja: { ...DADOS_LOJA, email: 'sem-arroba' } })).status).toBe(400)
    expect((await salvarAjustes(token, { trocaDias: 3 })).status).toBe(400)
    expect((await salvarAjustes(token, { freteTroca: 'outro' })).status).toBe(400)
  })

  it('com os dados incompletos, o site não recebe nada deles', async () => {
    const token = await entrar()
    await salvarAjustes(token, { loja: { ...DADOS_LOJA, endereco: '' } })
    const { ajustes } = (await (await loja()).json()) as { ajustes: Record<string, unknown> }
    expect(ajustes.loja).toBeNull()
  })
})

describe('ligar as vendas pelo site', () => {
  it('não liga sem os dados da loja nem sem a compra de teste paga', async () => {
    const token = await entrar()
    const semDados = await salvarAjustes(token, { vendasOnline: true, loja: {} })
    expect(semDados.status).toBe(409)
    expect(await erroDe(semDados)).toMatch(/dados da loja/)

    const semTeste = await salvarAjustes(token, { vendasOnline: true })
    expect(semTeste.status).toBe(409)
    expect(await erroDe(semTeste)).toMatch(/compra de teste/)

    // desligadas, salva normalmente
    expect((await salvarAjustes(token)).status).toBe(200)
  })

  it('a compra de teste paga libera as vendas, e o aviso da InfinitePay fica registrado', async () => {
    const token = await entrar()
    expect(await estadoTeste(token)).toBeNull()
    const links = infinitePayFalsa({ pago: { success: true, paid: true, amount: 150, capture_method: 'pix' } })

    const criada = await painel(token, 'POST', '/compra-teste', { valorCentavos: 150 })
    expect(criada.status).toBe(201)
    const { teste } = (await criada.json()) as { teste: Teste }
    expect(teste).toMatchObject({ situacao: 'aguardando', totalCentavos: 150, pagar: 'https://checkout.infinitepay.io/teste', pago: false, aviso: false })

    const p = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?1').bind(teste!.id).first<Record<string, unknown>>()
    expect(p).toMatchObject({ origem: 'site', entrega: 'combinar', total_centavos: 150, frete_centavos: 0, whatsapp: '5582998115324' })
    expect(links[0]).toMatchObject({ order_nsu: p!.codigo, items: [{ description: 'Compra de teste', price: 150, quantity: 1 }] })
    expect(String(links[0].redirect_url)).toMatch(new RegExp(`/pedido/${p!.codigo}$`))

    // a InfinitePay avisa que foi pago: o pedido vira pago e as vendas liberam
    const r = await aviso({ order_nsu: p!.codigo, transaction_nsu: 'tx-teste', invoice_slug: 'fatura-teste', amount: 150 })
    expect(await r.json()).toMatchObject({ resultado: 'pago' })
    expect(await estadoTeste(token)).toMatchObject({ situacao: 'pago', pago: true, aviso: true, pagar: '' })

    expect((await salvarAjustes(token, { vendasOnline: true })).status).toBe(200)
    const { ajustes } = (await (await loja()).json()) as { ajustes: Record<string, unknown> }
    expect(ajustes.vendasOnline).toBe(true)

    // cancelar o pedido de teste depois não trava as vendas de novo
    expect((await painel(token, 'POST', `/pedidos/${teste!.id}/cancelar`, {})).status).toBe(200)
    expect((await salvarAjustes(token, { vendasOnline: true })).status).toBe(200)
  })

  it('compra de teste sem pagamento não libera, e a que vence pode ser refeita', async () => {
    const token = await entrar()
    infinitePayFalsa()
    const { teste } = (await (await painel(token, 'POST', '/compra-teste', { valorCentavos: 100 })).json()) as { teste: Teste }
    expect((await salvarAjustes(token, { vendasOnline: true })).status).toBe(409)

    await env.DB.prepare('UPDATE pedidos SET reserva_ate = 0 WHERE id = ?1').bind(teste!.id).run()
    expect(await estadoTeste(token)).toMatchObject({ situacao: 'expirado', pagar: '' })
    const outra = await painel(token, 'POST', '/compra-teste', { valorCentavos: 100 })
    expect(outra.status).toBe(201)
    expect(((await outra.json()) as { teste: Teste })!.teste!.id).not.toBe(teste!.id)
  })

  it('se a InfinitePay não abre o pagamento, o painel mostra o motivo e o pedido some', async () => {
    const token = await entrar()
    infinitePayFalsa({ links: 500 })
    const r = await painel(token, 'POST', '/compra-teste', { valorCentavos: 100 })
    expect(r.status).toBe(502)
    expect(await erroDe(r)).toMatch(/InfinitePay.*HTTP 500/)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM pedidos').first<number>('n')).toBe(0)
    expect(await estadoTeste(token)).toBeNull()
  })

  it('recusa valor fora de R$ 1 a R$ 100, e só abre com sessão do painel', async () => {
    const token = await entrar()
    infinitePayFalsa()
    expect((await painel(token, 'POST', '/compra-teste', { valorCentavos: 50 })).status).toBe(400)
    expect((await painel(token, 'POST', '/compra-teste', { valorCentavos: 10_001 })).status).toBe(400)
    expect((await painel('sessao-falsa', 'POST', '/compra-teste', { valorCentavos: 100 })).status).toBe(401)
  })
})
