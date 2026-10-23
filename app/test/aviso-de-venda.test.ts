import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PADRAO, salvarAjustes } from '../worker/ajustes'
import { aviso, criarPeca, entrar, painel, pedido, reservar, site } from './ajuda'

const EMAIL_DA_LOJA = 'livia@exemplo.com'
const ambiente = env as unknown as Record<string, unknown>

type Email = { from: string; to: string[]; subject: string; text: string }

/**
  A InfinitePay e o Resend de mentira: o payment_check diz que está pago no
  valor do pedido, e cada e-mail fica guardado. resend = status das respostas do Resend, na ordem.
*/
function servicos(total: number, resend: number[] = []) {
  const emails: (Email & { chave: string })[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).includes('resend.com')) {
      emails.push({ ...JSON.parse(String(init?.body)), chave: new Headers(init?.headers).get('Authorization') ?? '' })
      const status = resend.shift() ?? 200
      return Response.json(status === 200 ? { id: 'email-1' } : { message: 'fora do ar' }, { status })
    }
    return Response.json({ success: true, paid: true, amount: total, capture_method: 'pix' })
  })
  return emails
}

const totalDe = async (codigo: string) =>
  (await env.DB.prepare('SELECT total_centavos FROM pedidos WHERE codigo = ?1').bind(codigo).first<number>('total_centavos'))!

const avisada = async (codigo: string) =>
  env.DB.prepare('SELECT venda_avisada_em FROM pedidos WHERE codigo = ?1').bind(codigo).first<string | null>('venda_avisada_em')

beforeEach(async () => {
  ambiente.RESEND_CHAVE = 'chave-de-teste'
  await salvarAjustes(env.DB, { ...PADRAO, loja: { ...PADRAO.loja, email: EMAIL_DA_LOJA } })
})

afterEach(() => {
  delete ambiente.RESEND_CHAVE
  vi.restoreAllMocks()
})

describe('aviso de venda por e-mail', () => {
  it('pago pelo aviso da InfinitePay: um e-mail para a loja, com o pedido, e nada de novo depois', async () => {
    const peca = await criarPeca({ M: 2 })
    const codigo = await reservar(peca, 'M', 1)
    const emails = servicos(await totalDe(codigo))

    expect(await (await aviso({ order_nsu: codigo, transaction_nsu: 'tx-1' })).json()).toMatchObject({ resultado: 'pago' })
    expect(emails).toHaveLength(1)
    const { id } = (await pedido(codigo))!
    expect(emails[0]).toMatchObject({ to: [EMAIL_DA_LOJA], chave: 'Bearer chave-de-teste', from: 'Livi <onboarding@resend.dev>' })
    expect(emails[0].subject).toBe(`Venda no site: pedido nº ${id}, R$ 115,00`)
    expect(emails[0].text).toContain('1x Vestido Teste · Preto · M: R$ 100,00')
    expect(emails[0].text).toContain('Entrega: Entrega em Maceió · Maceió/AL: R$ 15,00')
    expect(emails[0].text).toContain('Total: R$ 115,00 (Pix)')
    expect(emails[0].text).toContain('Cliente: Cliente Teste · WhatsApp (82) 99999-9999')
    expect(emails[0].text).toContain(`Abrir no painel: http://localhost/painel/pedido/${id}`)

    // o mesmo aviso de novo e a volta da cliente: o pedido já foi avisado
    await aviso({ order_nsu: codigo, transaction_nsu: 'tx-1' })
    await site('POST', `/${codigo}/conferir`, { transacao: 'tx-1' })
    expect(emails).toHaveLength(1)
  })

  it('pago na volta da cliente: o e-mail sai por ali, e o aviso que chega depois não repete', async () => {
    const peca = await criarPeca({ M: 2 })
    const codigo = await reservar(peca, 'M', 1)
    const emails = servicos(await totalDe(codigo))

    expect(await (await site('POST', `/${codigo}/conferir`, { transacao: 'tx-1' })).json()).toMatchObject({ situacao: 'pago' })
    expect(emails).toHaveLength(1)
    await aviso({ order_nsu: codigo, transaction_nsu: 'tx-1' })
    expect(emails).toHaveLength(1)
  })

  it('sem a chave do Resend, ou sem o e-mail da loja, não manda nada', async () => {
    const peca = await criarPeca({ M: 2 })
    delete ambiente.RESEND_CHAVE
    const primeiro = await reservar(peca, 'M', 1)
    const emails = servicos(await totalDe(primeiro))
    expect(await (await aviso({ order_nsu: primeiro, transaction_nsu: 'tx-1' })).json()).toMatchObject({ resultado: 'pago' })

    ambiente.RESEND_CHAVE = 'chave-de-teste'
    await salvarAjustes(env.DB, PADRAO)
    const segundo = await reservar(peca, 'M', 1)
    expect(await (await aviso({ order_nsu: segundo, transaction_nsu: 'tx-2' })).json()).toMatchObject({ resultado: 'pago' })

    expect(emails).toHaveLength(0)
    expect(await avisada(primeiro)).toBeNull()
  })

  it('Resend fora do ar: o pagamento aprova igual, e o próximo aviso manda o e-mail', async () => {
    const peca = await criarPeca({ M: 2 })
    const codigo = await reservar(peca, 'M', 1)
    const emails = servicos(await totalDe(codigo), [500])

    const r = await aviso({ order_nsu: codigo, transaction_nsu: 'tx-1' })
    expect(r.status).toBe(200)
    expect((await pedido(codigo))?.situacao).toBe('pago')
    expect(await avisada(codigo)).toBeNull()

    await aviso({ order_nsu: codigo, transaction_nsu: 'tx-1' })
    expect(emails).toHaveLength(2)
    expect(await avisada(codigo)).not.toBeNull()
  })

  it('pago depois de a peça ir para outra cliente: o e-mail avisa para falar com ela', async () => {
    const peca = await criarPeca({ M: 1 })
    const codigo = await reservar(peca, 'M', 1, -1)
    // a reserva venceu e a última peça saiu em outra venda
    await env.DB.prepare(`UPDATE estoque SET quantidade = 0 WHERE peca_id = ?1`).bind(peca).run()
    const emails = servicos(await totalDe(codigo))

    expect(await (await aviso({ order_nsu: codigo, transaction_nsu: 'tx-1' })).json()).toMatchObject({ resultado: 'sem_estoque' })
    expect(emails).toHaveLength(1)
    expect(emails[0].subject).toMatch(/^Pagamento sem estoque: pedido nº \d+, fale com a cliente$/)
    expect(emails[0].text).toContain('Fale com a cliente')
  })

  it('marcado como pago à mão no painel: a loja já sabe, nada de e-mail', async () => {
    const peca = await criarPeca({ M: 2 })
    const codigo = await reservar(peca, 'M', 1)
    const emails = servicos(await totalDe(codigo))
    const token = await entrar()
    const { id } = (await pedido(codigo))!
    expect((await painel(token, 'POST', `/pedidos/${id}/pago`, {})).status).toBe(200)

    // um aviso atrasado da InfinitePay depois disso também não manda
    await aviso({ order_nsu: codigo, transaction_nsu: 'tx-1' })
    expect(emails).toHaveLength(0)
  })
})
