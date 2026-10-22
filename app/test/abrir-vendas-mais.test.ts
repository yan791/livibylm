/*
  Mais casos da abertura das vendas: a compra pelo endereço de verdade (fora do
  PC, onde TESTE_VENDAS não vale), o CORS do site do GitHub, o CNPJ com letras,
  a compra de teste confirmada pela volta ao site e o que ela não pode mexer.
*/
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import app from '../worker/index'
import { cnpjValido, cpfValido } from '../worker/validar'
import { criarLink } from '../worker/infinitepay'
import { documentoTexto, deLinha } from '../worker/ajustes'
import { aviso, criarPeca, entrar, estoqueDe, loja, painel, reservar, site } from './ajuda'

const DADOS_LOJA = { nome: 'Livia Moraes Loureiro', documento: '52998224725', endereco: 'Rua do Teste, 10, Ponta Verde, Maceió, AL', email: 'contato@exemplo.com' }

const salvarAjustes = (token: string, mudar: Record<string, unknown> = {}) =>
  painel(token, 'PUT', '/ajustes', {
    vendasOnline: false,
    taxaMaceioCentavos: 1500,
    parcelasSemJuros: 3,
    whatsapp: '5582998115324',
    freteCorreios: {},
    loja: DADOS_LOJA,
    ...mudar,
  })

/** a InfinitePay de mentira; `pago` = resposta do payment_check */
function infinitePayFalsa(pago: Record<string, unknown> = { success: true, paid: false }) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
    String(url).endsWith('/links') ? Response.json({ url: 'https://checkout.infinitepay.io/teste', slug: 'fatura-teste' }) : Response.json(pago),
  )
}

/** o site publicado chamando o Worker publicado: outro endereço, sem o atalho de teste do PC */
async function doSitePublicado(metodo: string, caminho: string, corpo?: unknown, cabecalhos: Record<string, string> = {}) {
  const ctx = createExecutionContext()
  const r = await app.fetch(
    new Request(`https://livi.yanyago2529.workers.dev${caminho}`, {
      method: metodo,
      headers: { Origin: 'https://yan791.github.io', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...cabecalhos },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    }),
    env,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return r
}

const compraDoSite = {
  itens: [{ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 1 }],
  cliente: { nome: 'Maria Teste', whatsapp: '(82) 99999-1234', email: 'maria@exemplo.com', cpf: '' },
  entrega: { tipo: 'maceio', cep: '57020-000', rua: 'Rua do Sol', numero: '5', complemento: '', bairro: 'Centro' },
}

/** cria a compra de teste e devolve o código (pedidos.codigo) e o id */
async function criarTeste(token: string, valorCentavos = 100) {
  const r = await painel(token, 'POST', '/compra-teste', { valorCentavos })
  expect(r.status).toBe(201)
  const { teste } = (await r.json()) as { teste: { id: number } }
  const codigo = (await env.DB.prepare('SELECT codigo FROM pedidos WHERE id = ?1').bind(teste.id).first<string>('codigo'))!
  return { id: teste.id, codigo }
}

const estado = async (token: string) => ((await (await painel(token, 'GET', '/compra-teste')).json()) as { teste: Record<string, unknown> }).teste

afterEach(() => vi.restoreAllMocks())

describe('CPF e CNPJ', () => {
  it('confere os dígitos do CPF', () => {
    expect(cpfValido('529.982.247-25')).toBe('52998224725')
    expect(cpfValido('529.982.247-24')).toBeNull()
    expect(cpfValido('111.111.111-11')).toBeNull()
    expect(cpfValido('5299822472')).toBeNull()
  })

  it('confere o CNPJ de números e o novo, com letras (exemplo oficial do Serpro)', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe('11222333000181')
    expect(cnpjValido('11.222.333/0001-80')).toBeNull()
    expect(cnpjValido('12.ABC.345/01DE-35')).toBe('12ABC34501DE35')
    expect(cnpjValido('12.abc.345/01de-35')).toBe('12ABC34501DE35')
    expect(cnpjValido('12.ABC.345/01DE-36')).toBeNull()
    // os dois últimos são sempre números
    expect(cnpjValido('12.ABC.345/01DE-3A')).toBeNull()
    expect(cnpjValido('00.000.000/0000-00')).toBeNull()
  })

  it('formata para o rodapé', () => {
    expect(documentoTexto('52998224725')).toBe('529.982.247-25')
    expect(documentoTexto('11222333000181')).toBe('11.222.333/0001-81')
    expect(documentoTexto('12ABC34501DE35')).toBe('12.ABC.345/01DE-35')
  })

  it('o painel guarda o CNPJ com letras e o site mostra formatado', async () => {
    const token = await entrar()
    expect((await salvarAjustes(token, { loja: { ...DADOS_LOJA, documento: '12.abc.345/01de-35' } })).status).toBe(200)
    expect(((await (await painel(token, 'GET', '/ajustes')).json()) as { loja: { documento: string } }).loja.documento).toBe('12ABC34501DE35')
    const { ajustes } = (await (await loja()).json()) as { ajustes: { loja: { documento: string } } }
    expect(ajustes.loja.documento).toBe('12.ABC.345/01DE-35')
  })
})

describe('ajustes guardados antes da 4.5', () => {
  it('sem os campos novos, valem os padrões', () => {
    const a = deLinha(JSON.stringify({ vendasOnline: false, taxaMaceioCentavos: 1500, parcelasSemJuros: 3, whatsapp: '5582998115324' }))
    expect(a).toMatchObject({ trocaDias: 7, freteTroca: 'dividido', loja: { nome: '', documento: '', endereco: '', email: '' } })
  })

  it('"vendas ligadas" sem os dados da loja não liga nada', async () => {
    await env.DB.prepare(`INSERT INTO configuracoes (chave, valor) VALUES ('ajustes', ?1)`).bind(JSON.stringify({ vendasOnline: true })).run()
    expect(deLinha(JSON.stringify({ vendasOnline: true })).vendasOnline).toBe(false)
    const { ajustes } = (await (await loja()).json()) as { ajustes: { vendasOnline: boolean } }
    expect(ajustes.vendasOnline).toBe(false)
  })

  it('desligar as vendas funciona mesmo com os dados incompletos', async () => {
    const token = await entrar()
    expect((await salvarAjustes(token, { loja: {} })).status).toBe(200)
  })
})

describe('compra pelo site publicado', () => {
  it('com as vendas desligadas, recusa; depois da compra de teste paga e com as vendas ligadas, abre o pagamento', async () => {
    await criarPeca({ M: 2 })
    const token = await entrar()
    await salvarAjustes(token)

    const desligado = await doSitePublicado('POST', '/api/pedidos', compraDoSite)
    expect(desligado.status).toBe(409)
    expect(((await desligado.json()) as { erro: string }).erro).toMatch(/pausadas/)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM pedidos').first<number>('n')).toBe(0)

    infinitePayFalsa({ success: true, paid: true, amount: 100, capture_method: 'pix' })
    const t = await criarTeste(token)
    await aviso({ order_nsu: t.codigo, transaction_nsu: 'tx-t', amount: 100 })
    expect((await salvarAjustes(token, { vendasOnline: true })).status).toBe(200)

    const ligado = await doSitePublicado('POST', '/api/pedidos', compraDoSite)
    expect(ligado.status).toBe(201)
    expect(ligado.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const { pagar } = (await ligado.json()) as { pagar: string }
    expect(pagar).toBe('https://checkout.infinitepay.io/teste')
  })

  it('o navegador pode chamar do GitHub Pages (CORS do POST com JSON)', async () => {
    const r = await doSitePublicado('OPTIONS', '/api/pedidos', undefined, {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    })
    expect(r.status).toBe(204)
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(r.headers.get('Access-Control-Allow-Methods')).toMatch(/POST/)
    expect(r.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toMatch(/content-type/)
  })

  it('o painel recusa a compra de teste vinda de outro site', async () => {
    const token = await entrar()
    const ctx = createExecutionContext()
    const r = await app.fetch(
      new Request('https://livi.test/api/painel/compra-teste', {
        method: 'POST',
        headers: { Host: 'livi.test', Origin: 'https://golpe.example', Cookie: `livi_sessao=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valorCentavos: 100 }),
      }),
      env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(r.status).toBe(403)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM pedidos').first<number>('n')).toBe(0)
  })
})

describe('comprovante do pagamento', () => {
  it('o aviso chegou antes e sem comprovante: a volta da cliente guarda o dela, só da mesma transação e da InfinitePay', async () => {
    const peca = await criarPeca({ M: 2 })
    const codigo = await reservar(peca, 'M', 1)
    const total = (await env.DB.prepare('SELECT total_centavos FROM pedidos WHERE codigo = ?1').bind(codigo).first<number>('total_centavos'))!
    infinitePayFalsa({ success: true, paid: true, amount: total, capture_method: 'pix' })
    expect(await (await aviso({ order_nsu: codigo, transaction_nsu: 'tx-c', amount: total })).json()).toMatchObject({ resultado: 'pago' })
    const recibo = () => env.DB.prepare('SELECT recibo FROM pedidos WHERE codigo = ?1').bind(codigo).first<string>('recibo')
    expect(await recibo()).toBe('')

    // outra transação ou outro site: não guarda
    await site('POST', `/${codigo}/conferir`, { transacao: 'tx-outra', recibo: 'https://recibo.infinitepay.io/outra' })
    await site('POST', `/${codigo}/conferir`, { transacao: 'tx-c', recibo: 'https://golpe.example/recibo' })
    expect(await recibo()).toBe('')

    const r = await site('POST', `/${codigo}/conferir`, { transacao: 'tx-c', recibo: 'https://recibo.infinitepay.io/certo' })
    expect(((await r.json()) as { recibo: string }).recibo).toBe('https://recibo.infinitepay.io/certo')
    // já guardado, não troca
    await site('POST', `/${codigo}/conferir`, { transacao: 'tx-c', recibo: 'https://recibo.infinitepay.io/outro' })
    expect(await recibo()).toBe('https://recibo.infinitepay.io/certo')
  })
})

describe('compra de teste', () => {
  it('aparece na página do pedido do site sem dados pessoais, com o link de pagamento', async () => {
    const token = await entrar()
    infinitePayFalsa()
    const t = await criarTeste(token, 250)
    const r = await site('GET', `/${t.codigo}`)
    expect(r.status).toBe(200)
    const p = (await r.json()) as Record<string, unknown>
    expect(p).toMatchObject({ numero: t.id, situacao: 'aguardando', entrega: 'combinar', totalCentavos: 250, pagar: 'https://checkout.infinitepay.io/teste' })
    expect(p.itens).toEqual([{ peca: '', nome: 'Compra de teste', cor: '', tamanho: '', quantidade: 1, precoCentavos: 250, foto: '' }])
    expect(JSON.stringify(p)).not.toMatch(/@|5582/)
  })

  it('confirmada pela volta ao site, sem o aviso: libera, e mostra que o aviso não chegou', async () => {
    const token = await entrar()
    infinitePayFalsa({ success: true, paid: true, amount: 100, paid_amount: 100, capture_method: 'pix' })
    const t = await criarTeste(token)
    const r = await site('POST', `/${t.codigo}/conferir`, { transacao: 'tx-volta', fatura: 'fatura-teste', recibo: 'https://recibo.infinitepay.io/abc' })
    expect(((await r.json()) as { situacao: string }).situacao).toBe('pago')
    expect(await estado(token)).toMatchObject({ pago: true, aviso: false })
    expect((await salvarAjustes(token, { vendasOnline: true })).status).toBe(200)
  })

  it('o aviso que chega antes do pagamento aparecer conta como aviso recebido, mas não libera', async () => {
    const token = await entrar()
    infinitePayFalsa({ success: true, paid: false })
    const t = await criarTeste(token)
    expect((await aviso({ order_nsu: t.codigo, transaction_nsu: 'tx-cedo', amount: 100 })).status).toBe(400)
    expect(await estado(token)).toMatchObject({ pago: false, aviso: true, situacao: 'aguardando' })
    expect((await salvarAjustes(token, { vendasOnline: true })).status).toBe(409)
  })

  it('pagamento de valor diferente não libera', async () => {
    const token = await entrar()
    infinitePayFalsa({ success: true, paid: true, amount: 5000, capture_method: 'pix' })
    const t = await criarTeste(token)
    expect(await (await aviso({ order_nsu: t.codigo, transaction_nsu: 'tx-x', amount: 5000 })).json()).toMatchObject({ resultado: 'valor_diferente' })
    expect(await estado(token)).toMatchObject({ pago: false })
    expect((await salvarAjustes(token, { vendasOnline: true })).status).toBe(409)
  })

  it('não mexe no estoque nem no disponível do site, nem paga nem cancelada', async () => {
    const peca = await criarPeca({ M: 2 })
    const token = await entrar()
    const disponivel = async () => {
      const { colecoes } = (await (await loja()).json()) as { colecoes: { pecas: { slug: string; disponivel: Record<string, number> }[] }[] }
      return colecoes.flatMap((c) => c.pecas).find((p) => p.slug === 'vestido-teste')?.disponivel
    }
    const antes = await disponivel()
    infinitePayFalsa({ success: true, paid: true, amount: 100, capture_method: 'pix' })
    const t = await criarTeste(token)
    expect(await disponivel()).toEqual(antes)
    await aviso({ order_nsu: t.codigo, transaction_nsu: 'tx-e', amount: 100 })
    expect(await estoqueDe(peca, 'M')).toBe(2)
    expect((await painel(token, 'POST', `/pedidos/${t.id}/cancelar`, {})).status).toBe(200)
    expect(await estoqueDe(peca, 'M')).toBe(2)
    expect(await disponivel()).toEqual(antes)
  })

  it('aparece em Pedidos com a anotação de teste', async () => {
    const token = await entrar()
    infinitePayFalsa()
    const t = await criarTeste(token)
    const p = (await (await painel(token, 'GET', `/pedidos/${t.id}`)).json()) as { observacao: string; itens: { nome: string }[] }
    expect(p.observacao).toMatch(/Compra de teste/)
    expect(p.itens[0].nome).toBe('Compra de teste')
  })
})

describe('endereço da página de pagamento', () => {
  it('no ar só aceita https; no PC, com a InfinitePay de mentira, aceita http', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ url: 'http://127.0.0.1:8799/pagar/x', slug: 's' }))
    const dados = {
      codigo: 'x',
      itens: [{ descricao: 'Teste', quantidade: 1, precoCentavos: 100 }],
      voltar: 'https://site.exemplo/pedido/x',
      aviso: 'https://worker.exemplo/api/pagamento/aviso',
      cliente: { nome: 'Ana', email: 'ana@exemplo.com', whatsapp: '5582999999999' },
    }
    const handle = env.INFINITEPAY_HANDLE
    await expect(criarLink({ INFINITEPAY_HANDLE: handle }, dados)).rejects.toThrow(/sem endereço/)
    await expect(criarLink({ INFINITEPAY_HANDLE: handle, INFINITEPAY_API: 'http://127.0.0.1:8799' }, dados)).resolves.toMatchObject({
      url: 'http://127.0.0.1:8799/pagar/x',
    })
  })
})
