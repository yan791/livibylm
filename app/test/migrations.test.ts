import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('migrations', () => {
  it('criam as tabelas e as peças iniciais', async () => {
    const { results } = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all<{ name: string }>()
    const tabelas = results.map((r) => r.name)
    for (const t of ['colecoes', 'pecas', 'estoque', 'pedidos', 'pedido_itens', 'pagamentos', 'admins', 'sessoes'])
      expect(tabelas).toContain(t)
    const pecas = await env.DB.prepare('SELECT count(*) AS n FROM pecas').first<number>('n')
    expect(pecas).toBeGreaterThan(0)
  })
})
