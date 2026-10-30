/*
  Cupons de desconto, no painel (/api/painel/cupons, só com login):
    GET    /        os cupons, com quantas compras pagas usaram cada um
    POST   /        cupom novo: código e porcentagem
    PUT    /:id     muda o código, a porcentagem ou liga e desliga
    DELETE /:id     apaga (os pedidos que usaram guardam o código e a porcentagem da hora)
  A cliente digita o código ao fechar a compra (worker/pedidos.ts), e o desconto vale sobre as peças.
*/
import { Hono } from 'hono'
import type { Ambiente, LinhaCupom } from './tipos'
import { falha, idDe, inteiro, lerCorpo, texto, type Corpo } from './validar'
import { CODIGO_CUPOM, DESCONTO_MAXIMO, normalizarCupom } from './descontos'

export const cupons = new Hono<Ambiente>()

function lerCupom(corpo: Corpo) {
  const codigo = normalizarCupom(texto(corpo.codigo, 'o código do cupom', 40, true))
  if (!CODIGO_CUPOM.test(codigo)) throw falha(400, 'O código do cupom usa só letras sem acento e números, de 3 a 20 (ex.: LIVI10).')
  return {
    codigo,
    percentual: inteiro(corpo.percentual, 'O desconto', 1, DESCONTO_MAXIMO),
    ativo: corpo.ativo !== false,
  }
}

const jaExiste = (e: unknown) => /UNIQUE constraint failed: cupons/i.test(String(e instanceof Error ? e.message : e))
const REPETIDO = 'Já existe um cupom com esse código.'

cupons.get('/', async (c) => {
  const [lista, usos] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM cupons ORDER BY ativo DESC, criado_em DESC, id DESC'),
    // compras pagas (e não canceladas) que usaram cada código
    c.env.DB.prepare(
      `SELECT cupom, COUNT(*) AS n FROM pedidos WHERE cupom != '' AND pago_em IS NOT NULL AND situacao != 'cancelado' GROUP BY cupom`,
    ),
  ])
  const quantos = new Map((usos.results as { cupom: string; n: number }[]).map((u) => [u.cupom, u.n]))
  return c.json(
    (lista.results as LinhaCupom[]).map((x) => ({
      id: x.id,
      codigo: x.codigo,
      percentual: x.percentual,
      ativo: x.ativo === 1,
      usos: quantos.get(x.codigo) ?? 0,
    })),
  )
})

cupons.post('/', async (c) => {
  const v = lerCupom(await lerCorpo(c))
  try {
    const r = await c.env.DB.prepare('INSERT INTO cupons (codigo, percentual, ativo) VALUES (?1, ?2, ?3) RETURNING id')
      .bind(v.codigo, v.percentual, v.ativo ? 1 : 0)
      .first<{ id: number }>()
    return c.json({ id: r!.id, codigo: v.codigo }, 201)
  } catch (e) {
    if (jaExiste(e)) throw falha(409, REPETIDO)
    throw e
  }
})

cupons.put('/:id', async (c) => {
  const id = idDe(c, 'Cupom')
  const v = lerCupom(await lerCorpo(c))
  try {
    const r = await c.env.DB.prepare(
      `UPDATE cupons SET codigo = ?1, percentual = ?2, ativo = ?3, atualizado_em = datetime('now') WHERE id = ?4`,
    )
      .bind(v.codigo, v.percentual, v.ativo ? 1 : 0, id)
      .run()
    if (!r.meta.changes) throw falha(404, 'Cupom não encontrado.')
  } catch (e) {
    if (jaExiste(e)) throw falha(409, REPETIDO)
    throw e
  }
  return c.json({ ok: true, codigo: v.codigo })
})

cupons.delete('/:id', async (c) => {
  const id = idDe(c, 'Cupom')
  const r = await c.env.DB.prepare('DELETE FROM cupons WHERE id = ?1').bind(id).run()
  if (!r.meta.changes) throw falha(404, 'Cupom não encontrado.')
  return c.json({ ok: true })
})
