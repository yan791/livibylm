import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AVISOS_POR_PEDIDO, FRETES_POR_IP } from '../worker/pedidos'
import { aviso, criarPeca, reservar, site } from './ajuda'

const contagem = (chave: string) => env.DB.prepare('SELECT falhas FROM tentativas WHERE chave = ?1').bind(chave).first<number>('falhas')

afterEach(() => vi.restoreAllMocks())

describe('limite do aviso de pagamento', () => {
  it('passou do limite, o pedido não pergunta mais à InfinitePay nem grava no banco', async () => {
    const peca = await criarPeca({ M: 3 })
    const codigo = await reservar(peca, 'M', 1)
    const outro = await reservar(peca, 'M', 1)
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ success: true, paid: false }))
    const corpo = { order_nsu: codigo, transaction_nsu: 'tx-1' }

    for (let i = 0; i < AVISOS_POR_PEDIDO; i++) expect((await aviso(corpo)).status).toBe(400)
    expect((await aviso(corpo)).status).toBe(429)
    expect(fetch).toHaveBeenCalledTimes(AVISOS_POR_PEDIDO)
    expect(await contagem(`aviso:${codigo}`)).toBe(AVISOS_POR_PEDIDO)

    // o limite é de cada pedido: o outro segue normal
    expect((await aviso({ order_nsu: outro, transaction_nsu: 'tx-2' })).status).toBe(400)
  })
})

describe('limite da consulta de frete', () => {
  it('cada IP tem o seu limite, e o CEP inválido nem conta', async () => {
    const ip = '203.0.113.7'
    for (let i = 0; i < FRETES_POR_IP; i++) expect((await site('GET', '/frete?cep=57020000', undefined, ip)).status).toBe(200)

    const barrado = await site('GET', '/frete?cep=57020000', undefined, ip)
    expect(barrado.status).toBe(429)
    expect(((await barrado.json()) as { erro: string }).erro).toMatch(/Espere/)
    expect(await contagem(`frete:${ip}`)).toBe(FRETES_POR_IP)

    expect((await site('GET', '/frete?cep=123', undefined, ip)).status).toBe(400)
    expect((await site('GET', '/frete?cep=57020000', undefined, '203.0.113.8')).status).toBe(200)
  })
})
