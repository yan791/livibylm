/*
  Aba "Pedidos" da gaveta: o site manda os códigos guardados no aparelho e
  recebe a situação de cada pedido (POST /api/pedidos/consulta).
*/
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { gravarPedido, MAX_CONSULTA, novoCodigo } from '../worker/pedidos'
import { agora } from '../worker/seguranca'
import { criarPeca, entrar, painel, reservar, site } from './ajuda'

type Publico = { codigo: string; numero: number; criadoEm: number; situacao: string; itens: { nome: string }[]; rastreio: string; pagar: string }

const consultar = async (codigos: unknown, ip?: string) => {
  const r = await site('POST', '/consulta', { codigos }, ip)
  return { status: r.status, dados: (await r.json()) as { pedidos: Publico[]; erro?: string } }
}

/** uma venda registrada no painel (não aparece no site) */
async function vendaDoPainel(pecaId: number) {
  const codigo = novoCodigo()
  await gravarPedido(
    env.DB,
    {
      codigo,
      origem: 'fora',
      reservaAte: 0,
      nome: 'Ana',
      whatsapp: '5582999990000',
      email: '',
      cpf: '',
      entrega: 'maos',
      cep: '',
      rua: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
      freteCentavos: 0,
      pagamento: 'pix',
      observacao: '',
    },
    [{ pecaId, cor: 'c1', tamanho: 'M', quantidade: 1, precoCentavos: 10000, sobEncomenda: false, nome: 'Vestido Teste', corNome: 'Preto', colecaoNome: 'Teste', foto: '' }],
  )
  return codigo
}

describe('consulta dos pedidos do aparelho', () => {
  it('devolve os pedidos do site, do mais novo ao mais antigo, sem dados pessoais', async () => {
    const peca = await criarPeca({ M: 5 })
    const antigo = await reservar(peca, 'M', 1)
    const novo = await reservar(peca, 'M', 2)
    await env.DB.prepare(`UPDATE pedidos SET situacao = 'enviado', rastreio = 'AB123456789BR', estoque_baixado = 1 WHERE codigo = ?1`).bind(antigo).run()

    const { status, dados } = await consultar([antigo, novo])
    expect(status).toBe(200)
    expect(dados.pedidos.map((p) => p.codigo)).toEqual([novo, antigo])
    expect(dados.pedidos[1]).toMatchObject({ situacao: 'enviado', rastreio: 'AB123456789BR', pagar: '' })
    expect(dados.pedidos[0].itens).toHaveLength(1)
    expect(Math.abs(dados.pedidos[0].criadoEm - Date.now())).toBeLessThan(120_000)
    // nada de WhatsApp, e-mail, CPF ou endereço da cliente
    const texto = JSON.stringify(dados)
    expect(texto).not.toMatch(/5582999999999|cliente@exemplo|Rua Teste|57000000/)
  })

  it('ignora código inválido, desconhecido e venda registrada no painel', async () => {
    const peca = await criarPeca({ M: 5 })
    const doSite = await reservar(peca, 'M', 1)
    const doPainel = await vendaDoPainel(peca)
    const { dados } = await consultar([doSite, doPainel, novoCodigo(), 'curto', 42, null, "' OR 1=1 --"])
    expect(dados.pedidos.map((p) => p.codigo)).toEqual([doSite])
  })

  it('reserva vencida aparece como "expirado"', async () => {
    const peca = await criarPeca({ M: 5 })
    const codigo = await reservar(peca, 'M', 1, -1)
    expect((await consultar([codigo])).dados.pedidos[0].situacao).toBe('expirado')
  })

  it('códigos repetidos contam uma vez; nenhum código válido devolve a lista vazia', async () => {
    const peca = await criarPeca({ M: 5 })
    const codigo = await reservar(peca, 'M', 1)
    expect((await consultar([codigo, codigo])).dados.pedidos).toHaveLength(1)
    expect(await consultar([])).toMatchObject({ status: 200, dados: { pedidos: [] } })
    expect(await consultar(['x'])).toMatchObject({ status: 200, dados: { pedidos: [] } })
  })

  it(`recusa mais de ${MAX_CONSULTA} códigos ou corpo que não seja uma lista`, async () => {
    expect((await consultar(Array.from({ length: MAX_CONSULTA + 1 }, () => novoCodigo()))).status).toBe(400)
    expect((await consultar('abc')).status).toBe(400)
    expect((await consultar(undefined)).status).toBe(400)
  })

  it('consultas demais do mesmo IP esperam um pouco', async () => {
    const peca = await criarPeca({ M: 5 })
    const codigo = await reservar(peca, 'M', 1)
    await env.DB.prepare('INSERT INTO tentativas (chave, falhas, desde) VALUES (?1, 120, ?2)').bind('consulta:9.9.9.9', agora()).run()
    expect((await consultar([codigo], '9.9.9.9')).status).toBe(429)
    expect((await consultar([codigo], '8.8.8.8')).status).toBe(200)
  })

  it('traz a data de cada etapa, marcada pelo pagamento e pelo painel', async () => {
    const peca = await criarPeca({ M: 5 })
    const codigo = await reservar(peca, 'M', 1)
    const id = (await env.DB.prepare('SELECT id FROM pedidos WHERE codigo = ?1').bind(codigo).first<number>('id'))!
    const etapas = async () => (await consultar([codigo])).dados.pedidos[0] as unknown as Record<string, number | null>

    expect(await etapas()).toMatchObject({ pagoEm: null, enviadoEm: null, entregueEm: null, canceladoEm: null })
    const token = await entrar()
    expect((await painel(token, 'POST', `/pedidos/${id}/pago`, {})).status).toBe(200)
    expect((await painel(token, 'POST', `/pedidos/${id}/enviado`, { rastreio: 'AB123456789BR' })).status).toBe(200)
    let e = await etapas()
    expect(typeof e.pagoEm).toBe('number')
    expect(typeof e.enviadoEm).toBe('number')
    expect(e.entregueEm).toBeNull()
    expect((await painel(token, 'POST', `/pedidos/${id}/entregue`, {})).status).toBe(200)
    e = await etapas()
    expect(e.situacao).toBe('entregue')
    expect(e.entregueEm! >= e.enviadoEm! && e.enviadoEm! >= e.pagoEm! && e.pagoEm! >= e.criadoEm!).toBe(true)
  })

  it('a página de um pedido também traz o código e a data', async () => {
    const peca = await criarPeca({ M: 5 })
    const codigo = await reservar(peca, 'M', 1)
    const p = (await (await site('GET', `/${codigo}`)).json()) as Publico
    expect(p.codigo).toBe(codigo)
    expect(typeof p.criadoEm).toBe('number')
  })
})
