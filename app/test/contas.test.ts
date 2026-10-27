/*
  Conta da cliente no site (worker/contas.ts): criar, entrar, sair, a compra
  que fica na conta, os pedidos que ela vê em qualquer aparelho e a senha nova
  pelo link que a loja manda, ou no próprio site (WhatsApp e e-mail da conta).
*/
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONTAS_POR_IP,
  EMAILS_ERRADOS_POR_CONTA,
  EMAILS_ERRADOS_POR_IP,
  ERROS_POR_CONTA,
  ERROS_POR_IP,
  ESQUECI_POR_IP,
} from '../worker/contas'
import { CONSULTAS_POR_IP, gravarPedido, MAX_CONSULTA, novoCodigo } from '../worker/pedidos'
import { agora } from '../worker/seguranca'
import { conta, criarConta, criarPeca, entrar, novoZap, painel, reservar, site } from './ajuda'

type Dados = {
  token: string
  conta: { nome: string; whatsapp: string; email: string }
  entrega: Record<string, string> | null
  pedidos: number
  erro?: string
}
type PedidoDaConta = { codigo: string; numero: number; situacao: string; daConta: boolean }

const SENHA = 'senha-da-maria'

/** a InfinitePay de mentira: guarda o que o Worker mandou e devolve um link */
function infinitePayFalsa() {
  const enviados: Record<string, unknown>[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    enviados.push(JSON.parse(String(init?.body ?? '{}')))
    return Response.json({ url: 'https://checkout.infinitepay.io/teste', slug: 'fatura-teste' })
  })
  return enviados
}

afterEach(() => vi.restoreAllMocks())

const criar = async (dados: Record<string, unknown> = {}, ip?: string) => {
  const r = await conta('POST', '/criar', { nome: 'Maria Teste', whatsapp: novoZap(), email: 'Maria@Exemplo.com', senha: SENHA, ...dados }, undefined, ip)
  return { status: r.status, dados: (await r.json()) as Dados }
}
const entrarNaConta = async (whatsapp: string, senha: string, ip?: string) => {
  const r = await conta('POST', '/entrar', { whatsapp, senha }, undefined, ip)
  return { status: r.status, dados: (await r.json()) as Dados }
}
const dadosDa = async (token?: string) => {
  const r = await conta('GET', '', undefined, token)
  return { status: r.status, dados: (await r.json()) as Dados }
}
const pedidosDa = async (token: string, codigos: unknown = [], ip?: string) => {
  const r = await conta('POST', '/pedidos', { codigos }, token, ip)
  return { status: r.status, dados: (await r.json()) as { pedidos: PedidoDaConta[] } }
}

const maceio = { tipo: 'maceio', cep: '57020-000', rua: 'Rua do Sol', numero: '5', complemento: 'Casa 2', bairro: 'Centro' }
/** uma compra pelo site com a conta aberta; devolve o código */
async function comprar(token: string, cliente: Record<string, unknown> = {}) {
  const r = await site('POST', '', { itens: [{ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 1 }], cliente: { cpf: '', ...cliente }, entrega: maceio }, undefined, token)
  const d = (await r.json()) as { codigo: string; erro?: string }
  if (r.status !== 201) throw new Error(`compra recusada: ${r.status} ${d.erro}`)
  return d.codigo
}

const linhaDoPedido = (codigo: string) =>
  env.DB.prepare('SELECT * FROM pedidos WHERE codigo = ?1').bind(codigo).first<{ id: number; cliente_id: number | null; nome: string; whatsapp: string; email: string }>()
const idDaConta = (whatsapp: string) => env.DB.prepare('SELECT id FROM clientes WHERE whatsapp = ?1').bind(whatsapp).first<number>('id')

describe('criar a conta', () => {
  it('cria, já entra e não guarda a senha como foi digitada', async () => {
    const { status, dados } = await criar({ whatsapp: '(82) 98877-6655' })
    expect(status).toBe(201)
    expect(dados.token).toMatch(/^[\w-]{40,}$/)
    expect(dados).toMatchObject({ conta: { nome: 'Maria Teste', whatsapp: '5582988776655', email: 'maria@exemplo.com' }, entrega: null, pedidos: 0 })
    const linha = await env.DB.prepare('SELECT senha FROM clientes WHERE whatsapp = ?1').bind('5582988776655').first<string>('senha')
    expect(linha).toMatch(/^hmac-pbkdf2-sha256\$/)
    expect(linha).not.toContain(SENHA)
    expect((await dadosDa(dados.token)).status).toBe(200)
  })

  it('um WhatsApp, uma conta (mesmo digitado de outro jeito)', async () => {
    expect((await criar({ whatsapp: '(82) 98000-1111' })).status).toBe(201)
    const outra = await criar({ whatsapp: '+55 82 980001111', nome: 'Outra Pessoa' })
    expect(outra.status).toBe(409)
    expect(outra.dados.erro).toMatch(/já tem conta/)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM clientes').first<number>('n')).toBe(1)
  })

  it('confere nome, WhatsApp, e-mail e senha', async () => {
    expect((await criar({ nome: 'Al' })).status).toBe(400)
    expect((await criar({ whatsapp: '123' })).status).toBe(400)
    expect((await criar({ whatsapp: '+1 202 555 0100' })).status).toBe(400)
    expect((await criar({ email: 'maria' })).status).toBe(400)
    const curta = await criar({ senha: '1234567' })
    expect(curta.status).toBe(400)
    expect(curta.dados.erro).toMatch(/8 caracteres/)
    expect((await criar({ senha: undefined })).status).toBe(400)
    expect((await criar({ senha: 'x'.repeat(201) })).status).toBe(400)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM clientes').first<number>('n')).toBe(0)
  })

  it(`contas novas demais do mesmo IP esperam (${CONTAS_POR_IP} por hora)`, async () => {
    await env.DB.prepare('INSERT INTO tentativas (chave, falhas, desde) VALUES (?1, ?2, ?3)').bind('conta-nova:7.7.7.7', CONTAS_POR_IP, agora()).run()
    expect((await criar({}, '7.7.7.7')).status).toBe(429)
    expect((await criar({}, '8.8.8.8')).status).toBe(201)
  })
})

describe('entrar', () => {
  it('entra com o WhatsApp escrito de qualquer jeito e a senha certa, num segundo aparelho', async () => {
    const primeiro = (await criar({ whatsapp: '(82) 98123-4567' })).dados.token
    const r = await entrarNaConta('+55 (82) 9 8123-4567', SENHA)
    expect(r.status).toBe(200)
    expect(r.dados.token).not.toBe(primeiro)
    expect(r.dados.conta.whatsapp).toBe('5582981234567')
    // os dois aparelhos ficam com a conta aberta
    expect((await dadosDa(primeiro)).status).toBe(200)
    expect((await dadosDa(r.dados.token)).status).toBe(200)
  })

  it('senha errada e número sem conta dão a mesma resposta', async () => {
    await criar({ whatsapp: '(82) 98123-4567' })
    const errada = await entrarNaConta('(82) 98123-4567', 'outra-senha')
    const semConta = await entrarNaConta('(82) 98765-4321', SENHA)
    expect(errada.status).toBe(401)
    expect(semConta.status).toBe(401)
    expect(errada.dados.erro).toBe(semConta.dados.erro)
    expect(errada.dados.token).toBeUndefined()
  })

  it('pede o WhatsApp e a senha', async () => {
    expect((await entrarNaConta('', SENHA)).status).toBe(400)
    expect((await entrarNaConta('123', SENHA)).status).toBe(400)
    expect((await entrarNaConta('(82) 98123-4567', '')).status).toBe(400)
  })

  it(`${ERROS_POR_CONTA} senhas erradas seguidas travam o número por 15 minutos, mesmo com a senha certa`, async () => {
    await criar({ whatsapp: '(82) 98123-4567' })
    for (let i = 0; i < ERROS_POR_CONTA; i++) expect((await entrarNaConta('(82) 98123-4567', 'errada-' + i)).status).toBe(401)
    const travada = await entrarNaConta('(82) 98123-4567', SENHA)
    expect(travada.status).toBe(429)
    expect(travada.dados.erro).toMatch(/15 minutos/)
    // outro número segue entrando
    await criar({ whatsapp: '(82) 98123-0000' })
    expect((await entrarNaConta('(82) 98123-0000', SENHA)).status).toBe(200)
  })

  it('acertar a senha zera os erros do número', async () => {
    await criar({ whatsapp: '(82) 98123-4567' })
    for (let i = 0; i < ERROS_POR_CONTA - 1; i++) await entrarNaConta('(82) 98123-4567', 'errada')
    expect((await entrarNaConta('(82) 98123-4567', SENHA)).status).toBe(200)
    for (let i = 0; i < ERROS_POR_CONTA - 1; i++) expect((await entrarNaConta('(82) 98123-4567', 'errada')).status).toBe(401)
    expect((await entrarNaConta('(82) 98123-4567', SENHA)).status).toBe(200)
  })

  it('6 clientes, cada uma num lugar, criam a conta e entram ao mesmo tempo, cada uma na sua', async () => {
    const zaps = Array.from({ length: 6 }, () => novoZap())
    const criadas = await Promise.all(zaps.map((whatsapp, i) => criar({ whatsapp, nome: `Cliente ${i + 1}` }, `10.0.0.${i + 1}`)))
    expect(criadas.map((r) => r.status)).toEqual(Array(6).fill(201))
    const entradas = await Promise.all(zaps.map((z, i) => entrarNaConta(z, SENHA, `10.0.1.${i + 1}`)))
    expect(entradas.map((r) => r.status)).toEqual(Array(6).fill(200))
    const abertas = await Promise.all(entradas.map((r) => dadosDa(r.dados.token)))
    abertas.forEach((r, i) => expect(r.dados.conta).toMatchObject({ nome: `Cliente ${i + 1}`, whatsapp: '55' + zaps[i].replace(/\D/g, '') }))
  })

  it('a mesma cliente entra em 6 aparelhos ao mesmo tempo, e todos ficam com a conta aberta', async () => {
    const z = novoZap()
    await criar({ whatsapp: z })
    const entradas = await Promise.all(Array.from({ length: 6 }, (_, i) => entrarNaConta(z, SENHA, `10.0.2.${i + 1}`)))
    expect(entradas.map((r) => r.status)).toEqual(Array(6).fill(200))
    expect(new Set(entradas.map((r) => r.dados.token)).size).toBe(6)
    for (const r of entradas) expect((await dadosDa(r.dados.token)).status).toBe(200)
  })

  it(`erros demais do mesmo IP (${ERROS_POR_IP}) travam aquele IP`, async () => {
    await criar({ whatsapp: '(82) 98123-4567' })
    await env.DB.prepare('INSERT INTO tentativas (chave, falhas, desde) VALUES (?1, ?2, ?3)').bind('entrar-conta-ip:6.6.6.6', ERROS_POR_IP, agora()).run()
    expect((await entrarNaConta('(82) 98123-4567', SENHA, '6.6.6.6')).status).toBe(429)
    expect((await entrarNaConta('(82) 98123-4567', SENHA, '5.5.5.5')).status).toBe(200)
  })
})

describe('sessão', () => {
  it('sem token, com token inventado ou vencido: 401', async () => {
    const token = await criarConta()
    expect((await dadosDa()).status).toBe(401)
    expect((await dadosDa('x'.repeat(43))).status).toBe(401)
    expect((await conta('GET', '', undefined, 'curto')).status).toBe(401)
    expect((await dadosDa(token)).status).toBe(200)
    await env.DB.prepare('UPDATE sessoes_clientes SET expira_em = ?1').bind(agora() - 1).run()
    const vencida = await dadosDa(token)
    expect(vencida.status).toBe(401)
    expect(vencida.dados.erro).toMatch(/Entre de novo/)
  })

  it('sair fecha só a sessão deste aparelho', async () => {
    const primeiro = await criarConta({ whatsapp: '(82) 98123-4567' })
    const segundo = (await entrarNaConta('(82) 98123-4567', SENHA)).dados.token
    expect((await conta('POST', '/sair', {}, primeiro)).status).toBe(200)
    expect((await dadosDa(primeiro)).status).toBe(401)
    expect((await dadosDa(segundo)).status).toBe(200)
    // sair de novo (ou sem sessão) não dá erro
    expect((await conta('POST', '/sair', {}, primeiro)).status).toBe(200)
    expect((await conta('POST', '/sair', {})).status).toBe(200)
  })

  it('a sessão se renova sozinha quando passa da metade do prazo', async () => {
    const token = await criarConta()
    await env.DB.prepare('UPDATE sessoes_clientes SET expira_em = ?1').bind(agora() + 10 * 86400).run()
    expect((await dadosDa(token)).status).toBe(200)
    const expira = await env.DB.prepare('SELECT expira_em FROM sessoes_clientes').first<number>('expira_em')
    expect(expira! - agora()).toBeGreaterThan(89 * 86400)
  })

  it('a sessão do painel não abre a conta do site, nem o contrário', async () => {
    const admin = await entrar()
    expect((await dadosDa(admin)).status).toBe(401)
    const cliente = await criarConta()
    expect((await painel(cliente, 'GET', '/eu')).status).toBe(401)
  })
})

describe('compra com a conta', () => {
  it('sem a conta aberta, a compra é recusada e nada fica reservado', async () => {
    await criarPeca({ M: 1 })
    infinitePayFalsa()
    const r = await site('POST', '', { itens: [{ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 1 }], cliente: { nome: 'Maria Teste', whatsapp: '(82) 98123-4567', email: 'maria@exemplo.com' }, entrega: maceio })
    expect(r.status).toBe(401)
    expect(((await r.json()) as { erro: string }).erro).toMatch(/conta/)
    const vencida = await criarConta()
    await env.DB.prepare('UPDATE sessoes_clientes SET expira_em = ?1').bind(agora() - 1).run()
    expect((await site('POST', '', {}, undefined, vencida)).status).toBe(401)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM pedidos').first<number>('n')).toBe(0)
  })

  it('a compra fica na conta, com o nome, o WhatsApp e o e-mail dela (não os do formulário)', async () => {
    await criarPeca({ M: 2 })
    const enviados = infinitePayFalsa()
    const token = await criarConta({ whatsapp: '(82) 98123-4567' })
    const codigo = await comprar(token, { nome: 'Outra Pessoa', whatsapp: '(11) 91111-1111', email: 'outra@exemplo.com' })
    const p = await linhaDoPedido(codigo)
    expect(p).toMatchObject({ nome: 'Maria Teste', whatsapp: '5582981234567', email: 'maria@exemplo.com', cliente_id: await idDaConta('5582981234567') })
    expect(enviados[0].customer).toEqual({ name: 'Maria Teste', email: 'maria@exemplo.com', phone_number: '+5582981234567' })
  })

  it('confere o CPF que vem na compra', async () => {
    await criarPeca({ M: 2 })
    infinitePayFalsa()
    const token = await criarConta()
    const r = await site('POST', '', { itens: [{ peca: 'vestido-teste', cor: 'Preto', tamanho: 'M', qtd: 1 }], cliente: { cpf: '111.111.111-11' }, entrega: maceio }, undefined, token)
    expect(r.status).toBe(400)
    expect(((await r.json()) as { erro: string }).erro).toMatch(/CPF/)
  })

  it('a próxima compra já vem com a última entrega e o CPF', async () => {
    await criarPeca({ M: 3 })
    infinitePayFalsa()
    const token = await criarConta()
    await comprar(token, { cpf: '529.982.247-25' })
    await comprar(token)
    const { dados } = await dadosDa(token)
    expect(dados.entrega).toEqual({ cep: '57020000', rua: 'Rua do Sol', numero: '5', complemento: 'Casa 2', bairro: 'Centro', cidade: 'Maceió', cpf: '52998224725' })
    expect(dados.pedidos).toBe(2)
  })
})

describe('pedidos da conta', () => {
  it('mostra os pedidos da conta em qualquer aparelho, do mais novo ao mais antigo', async () => {
    await criarPeca({ M: 3 })
    infinitePayFalsa()
    const token = await criarConta({ whatsapp: '(82) 98123-4567' })
    const antigo = await comprar(token)
    const novo = await comprar(token)
    const outroAparelho = (await entrarNaConta('(82) 98123-4567', SENHA)).dados.token
    const { status, dados } = await pedidosDa(outroAparelho)
    expect(status).toBe(200)
    expect(dados.pedidos.map((p) => p.codigo)).toEqual([novo, antigo])
    expect(dados.pedidos.every((p) => p.daConta)).toBe(true)
    // nada de CPF, e-mail, WhatsApp ou endereço
    expect(JSON.stringify(dados)).not.toMatch(/maria@exemplo|5582981234567|Rua do Sol|57020000/)
  })

  it('pedido sem pagar com a reserva vencida some da conta', async () => {
    await criarPeca({ M: 3 })
    infinitePayFalsa()
    const token = await criarConta()
    const vencido = await comprar(token)
    const pago = await comprar(token)
    await env.DB.prepare('UPDATE pedidos SET reserva_ate = ?1 WHERE codigo = ?2').bind(agora() - 1, vencido).run()
    await env.DB.prepare(`UPDATE pedidos SET situacao = 'pago', estoque_baixado = 1, pago_em = datetime('now') WHERE codigo = ?1`).bind(pago).run()
    expect((await pedidosDa(token)).dados.pedidos.map((p) => p.codigo)).toEqual([pago])
    expect((await dadosDa(token)).dados.pedidos).toBe(1)
  })

  it('o pedido que o aparelho guardava entra na conta quando é do mesmo WhatsApp', async () => {
    const peca = await criarPeca({ M: 3 })
    // compra de antes das contas, com o WhatsApp 5582999999999 (ajuda.ts)
    const codigo = await reservar(peca, 'M', 1)
    const token = await criarConta({ whatsapp: '(82) 99999-9999' })
    const { dados } = await pedidosDa(token, [codigo])
    expect(dados.pedidos).toMatchObject([{ codigo, daConta: true }])
    expect((await linhaDoPedido(codigo))!.cliente_id).toBe(await idDaConta('5582999999999'))
    // agora aparece em qualquer aparelho, sem o código
    const outro = (await entrarNaConta('(82) 99999-9999', SENHA)).dados.token
    expect((await pedidosDa(outro)).dados.pedidos.map((p) => p.codigo)).toEqual([codigo])
  })

  it('conta criada com o WhatsApp de outra pessoa não vê os pedidos dela', async () => {
    const peca = await criarPeca({ M: 3 })
    const daDona = await reservar(peca, 'M', 1)
    const token = await criarConta({ whatsapp: '(82) 99999-9999' })
    expect((await pedidosDa(token)).dados.pedidos).toEqual([])
    expect((await linhaDoPedido(daDona))!.cliente_id).toBeNull()
  })

  it('o código de um pedido de outro WhatsApp aparece no aparelho, mas não entra na conta', async () => {
    const peca = await criarPeca({ M: 3 })
    const deOutra = await reservar(peca, 'M', 1)
    const token = await criarConta({ whatsapp: '(82) 98123-4567' })
    expect((await pedidosDa(token, [deOutra])).dados.pedidos).toMatchObject([{ codigo: deOutra, daConta: false }])
    expect((await linhaDoPedido(deOutra))!.cliente_id).toBeNull()
    expect((await pedidosDa(token)).dados.pedidos).toEqual([])
  })

  it('pedido que já está numa conta não passa para outra', async () => {
    await criarPeca({ M: 3 })
    infinitePayFalsa()
    const dona = await criarConta({ whatsapp: '(82) 98123-4567' })
    const codigo = await comprar(dona)
    const outra = await criarConta({ whatsapp: '(82) 98123-0000' })
    // mesmo que o WhatsApp do pedido seja trocado para o da outra conta
    await env.DB.prepare(`UPDATE pedidos SET whatsapp = '5582981230000' WHERE codigo = ?1`).bind(codigo).run()
    expect((await pedidosDa(outra, [codigo])).dados.pedidos).toMatchObject([{ codigo, daConta: false }])
    expect((await linhaDoPedido(codigo))!.cliente_id).toBe(await idDaConta('5582981234567'))
    expect((await pedidosDa(dona)).dados.pedidos).toMatchObject([{ codigo, daConta: true }])
  })

  it('venda registrada no painel e compra de teste nunca aparecem', async () => {
    const peca = await criarPeca({ M: 3 })
    const token = await criarConta({ whatsapp: '(82) 98123-4567' })
    const codigo = novoCodigo()
    await gravarPedido(
      env.DB,
      { codigo, origem: 'fora', reservaAte: 0, nome: 'Maria', whatsapp: '5582981234567', email: '', cpf: '', entrega: 'maos', cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', freteCentavos: 0, pagamento: 'pix', observacao: '' },
      [{ pecaId: peca, cor: 'c1', tamanho: 'M', quantidade: 1, precoCentavos: 10000, sobEncomenda: false, nome: 'Vestido Teste', corNome: 'Preto', colecaoNome: 'Teste', foto: '' }],
    )
    expect((await pedidosDa(token, [codigo])).dados.pedidos).toEqual([])
    expect((await linhaDoPedido(codigo))!.cliente_id).toBeNull()
  })

  it('pede a conta aberta e uma lista de códigos', async () => {
    const token = await criarConta()
    expect((await conta('POST', '/pedidos', { codigos: [] })).status).toBe(401)
    expect((await pedidosDa(token, 'abc')).status).toBe(400)
    expect((await pedidosDa(token, Array.from({ length: MAX_CONSULTA + 1 }, () => novoCodigo()))).status).toBe(400)
    // código inválido é ignorado
    expect(await pedidosDa(token, ['curto', 42, null, "' OR 1=1 --"])).toMatchObject({ status: 200, dados: { pedidos: [] } })
    // sem corpo de códigos: só os da conta
    expect((await conta('POST', '/pedidos', {}, token)).status).toBe(200)
  })

  it('consultas demais do mesmo IP esperam um pouco', async () => {
    const token = await criarConta()
    await env.DB.prepare('INSERT INTO tentativas (chave, falhas, desde) VALUES (?1, ?2, ?3)').bind('consulta:9.9.9.9', CONSULTAS_POR_IP, agora()).run()
    expect((await pedidosDa(token, [], '9.9.9.9')).status).toBe(429)
    expect((await pedidosDa(token, [], '8.8.8.8')).status).toBe(200)
  })
})

describe('senha nova pelo link que a loja manda', () => {
  /** compra com a conta e o link gerado no painel, na página do pedido */
  async function prepararLink() {
    await criarPeca({ M: 3 })
    infinitePayFalsa()
    const sessao = await criarConta({ whatsapp: '(82) 98123-4567' })
    const codigo = await comprar(sessao)
    const id = (await linhaDoPedido(codigo))!.id
    const admin = await entrar()
    const gerar = async () => {
      const r = await painel(admin, 'POST', `/pedidos/${id}/nova-senha`)
      expect(r.status).toBe(200)
      return (await r.json()) as { link: string; whatsapp: string; nome: string }
    }
    return { sessao, id, admin, gerar }
  }
  const tokenDo = (link: string) => link.split('/nova-senha/')[1]

  it('a loja gera o link, a cliente cria a senha nova e já entra; a senha velha e os aparelhos antigos saem', async () => {
    const { sessao, gerar } = await prepararLink()
    const { link, whatsapp, nome } = await gerar()
    // o link abre o site (o publicado, ou o do próprio Worker quando não há SITE_PUBLICO)
    expect(link.startsWith(`${(env.SITE_PUBLICO || 'https://livi.test').replace(/\/$/, '')}/nova-senha/`)).toBe(true)
    expect(link).toMatch(/\/nova-senha\/[\w-]{40,}$/)
    expect({ whatsapp, nome }).toEqual({ whatsapp: '5582981234567', nome: 'Maria Teste' })

    const t = tokenDo(link)
    expect(await (await conta('GET', `/nova-senha/${t}`)).json()).toEqual({ nome: 'Maria' })
    const r = await conta('POST', `/nova-senha/${t}`, { senha: 'senha-nova-boa' })
    expect(r.status).toBe(200)
    const nova = (await r.json()) as Dados
    expect(nova.conta.whatsapp).toBe('5582981234567')
    expect(nova.pedidos).toBe(1)

    expect((await dadosDa(sessao)).status).toBe(401)
    expect((await dadosDa(nova.token)).status).toBe(200)
    expect((await entrarNaConta('(82) 98123-4567', SENHA)).status).toBe(401)
    expect((await entrarNaConta('(82) 98123-4567', 'senha-nova-boa')).status).toBe(200)
    // o link vale uma vez só
    expect((await conta('POST', `/nova-senha/${t}`, { senha: 'mais-uma-senha' })).status).toBe(404)
    expect((await conta('GET', `/nova-senha/${t}`)).status).toBe(404)
  })

  it('link vencido, trocado por um mais novo ou inventado não vale', async () => {
    const { gerar } = await prepararLink()
    const primeiro = tokenDo((await gerar()).link)
    const segundo = tokenDo((await gerar()).link)
    expect((await conta('GET', `/nova-senha/${primeiro}`)).status).toBe(404)
    expect((await conta('GET', `/nova-senha/${segundo}`)).status).toBe(200)
    await env.DB.prepare('UPDATE senhas_novas SET expira_em = ?1').bind(agora() - 1).run()
    const vencido = await conta('POST', `/nova-senha/${segundo}`, { senha: 'senha-nova-boa' })
    expect(vencido.status).toBe(404)
    expect(((await vencido.json()) as { erro: string }).erro).toMatch(/WhatsApp/)
    expect((await conta('GET', '/nova-senha/inventado')).status).toBe(404)
    expect((await conta('GET', `/nova-senha/${'a'.repeat(43)}`)).status).toBe(404)
  })

  it('senha curta não troca nada e o link continua valendo', async () => {
    const { gerar } = await prepararLink()
    const t = tokenDo((await gerar()).link)
    expect((await conta('POST', `/nova-senha/${t}`, { senha: 'curta' })).status).toBe(400)
    expect((await entrarNaConta('(82) 98123-4567', SENHA)).status).toBe(200)
    expect((await conta('POST', `/nova-senha/${t}`, { senha: 'senha-nova-boa' })).status).toBe(200)
  })

  it('a senha nova destrava o número travado por erros', async () => {
    const { gerar } = await prepararLink()
    for (let i = 0; i < ERROS_POR_CONTA; i++) await entrarNaConta('(82) 98123-4567', 'errada')
    expect((await entrarNaConta('(82) 98123-4567', SENHA)).status).toBe(429)
    await conta('POST', `/nova-senha/${tokenDo((await gerar()).link)}`, { senha: 'senha-nova-boa' })
    expect((await entrarNaConta('(82) 98123-4567', 'senha-nova-boa')).status).toBe(200)
  })

  it('o painel mostra se a compra está numa conta; sem conta não tem link', async () => {
    const { id, admin } = await prepararLink()
    expect(((await (await painel(admin, 'GET', `/pedidos/${id}`)).json()) as { conta: boolean }).conta).toBe(true)
    const antiga = await reservar(await criarPeca({ P: 1 }, 'saia-teste'), 'P', 1)
    const idAntiga = (await linhaDoPedido(antiga))!.id
    expect(((await (await painel(admin, 'GET', `/pedidos/${idAntiga}`)).json()) as { conta: boolean }).conta).toBe(false)
    const r = await painel(admin, 'POST', `/pedidos/${idAntiga}/nova-senha`)
    expect(r.status).toBe(404)
    expect(((await r.json()) as { erro: string }).erro).toMatch(/conta/)
    expect((await painel(admin, 'POST', '/pedidos/9999/nova-senha')).status).toBe(404)
  })

  it('só o painel com login gera o link', async () => {
    const { id, sessao } = await prepararLink()
    expect((await painel('sessao-inventada', 'POST', `/pedidos/${id}/nova-senha`)).status).toBe(401)
    expect((await painel(sessao, 'POST', `/pedidos/${id}/nova-senha`)).status).toBe(401)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM senhas_novas').first<number>('n')).toBe(0)
  })
})

describe('esqueci a senha, no próprio site', () => {
  const esqueci = async (whatsapp: unknown, ip?: string) => {
    const r = await conta('POST', '/esqueci', { whatsapp }, undefined, ip)
    return { status: r.status, dados: (await r.json()) as { conta?: boolean; erro?: string } }
  }
  const trocar = async (corpo: Record<string, unknown>, ip?: string) => {
    const r = await conta('POST', '/esqueci/senha', corpo, undefined, ip)
    return { status: r.status, dados: (await r.json()) as Dados }
  }

  it('diz se o número tem conta (sem conta, o site oferece criar)', async () => {
    const { dados } = await criar({ whatsapp: '(82) 98111-2222' })
    expect(await esqueci('82 98111 2222')).toEqual({ status: 200, dados: { conta: true } })
    expect(await esqueci('(82) 98111-3333')).toEqual({ status: 200, dados: { conta: false } })
    expect((await esqueci('123')).status).toBe(400)
    expect((await esqueci('')).status).toBe(400)
    // a consulta não muda nada na conta
    expect((await entrarNaConta('(82) 98111-2222', SENHA)).status).toBe(200)
    expect(dados.conta.whatsapp).toBe('5582981112222')
  })

  it('com o e-mail da conta (maiúsculas e espaços não importam), troca a senha e já entra; a velha e os aparelhos antigos saem', async () => {
    const { dados } = await criar({ whatsapp: '(82) 98111-2222' })
    const r = await trocar({ whatsapp: '82981112222', email: '  maria@EXEMPLO.com ', senha: 'senha-nova-boa' })
    expect(r.status).toBe(200)
    expect(r.dados.conta).toEqual({ nome: 'Maria Teste', whatsapp: '5582981112222', email: 'maria@exemplo.com' })
    expect((await dadosDa(dados.token)).status).toBe(401)
    expect((await dadosDa(r.dados.token)).status).toBe(200)
    expect((await entrarNaConta('(82) 98111-2222', SENHA)).status).toBe(401)
    expect((await entrarNaConta('(82) 98111-2222', 'senha-nova-boa')).status).toBe(200)
  })

  it('e-mail errado não troca nada; número sem conta dá 404', async () => {
    await criar({ whatsapp: '(82) 98111-2222' })
    const errado = await trocar({ whatsapp: '(82) 98111-2222', email: 'outra@exemplo.com', senha: 'senha-de-quem-invadiu' })
    expect(errado.status).toBe(403)
    expect(errado.dados.erro).toMatch(/e-mail/)
    expect((await entrarNaConta('(82) 98111-2222', SENHA)).status).toBe(200)
    expect((await entrarNaConta('(82) 98111-2222', 'senha-de-quem-invadiu')).status).toBe(401)
    expect((await trocar({ whatsapp: '(82) 98111-3333', email: 'maria@exemplo.com', senha: 'senha-nova-boa' })).status).toBe(404)
  })

  it('confere o e-mail e a senha nova antes de tudo (e isso não conta como erro)', async () => {
    await criar({ whatsapp: '(82) 98111-2222' })
    for (let i = 0; i < EMAILS_ERRADOS_POR_CONTA + 1; i++) {
      expect((await trocar({ whatsapp: '(82) 98111-2222', email: '', senha: 'senha-nova-boa' })).status).toBe(400)
      expect((await trocar({ whatsapp: '(82) 98111-2222', email: 'maria@exemplo.com', senha: 'curta' })).status).toBe(400)
    }
    expect((await trocar({ whatsapp: '(82) 98111-2222', email: 'maria@exemplo.com', senha: 'senha-nova-boa' })).status).toBe(200)
  })

  it(`${EMAILS_ERRADOS_POR_CONTA} e-mails errados travam o número por 1 hora, mesmo com o e-mail certo; a senha velha continua entrando`, async () => {
    await criar({ whatsapp: '(82) 98111-2222' })
    for (let i = 0; i < EMAILS_ERRADOS_POR_CONTA; i++)
      expect((await trocar({ whatsapp: '(82) 98111-2222', email: `chute${i}@exemplo.com`, senha: 'senha-nova-boa' })).status).toBe(403)
    const travado = await trocar({ whatsapp: '(82) 98111-2222', email: 'maria@exemplo.com', senha: 'senha-nova-boa' })
    expect(travado.status).toBe(429)
    expect(travado.dados.erro).toMatch(/1 hora/)
    expect((await entrarNaConta('(82) 98111-2222', SENHA)).status).toBe(200)
    // passada a hora, volta a valer
    await env.DB.prepare(`UPDATE tentativas SET desde = desde - 3601 WHERE chave LIKE 'esqueci-conta%'`).run()
    expect((await trocar({ whatsapp: '(82) 98111-2222', email: 'maria@exemplo.com', senha: 'senha-nova-boa' })).status).toBe(200)
  })

  it(`e-mails errados demais do mesmo IP (${EMAILS_ERRADOS_POR_IP}) travam aquele IP`, async () => {
    const zaps = Array.from({ length: Math.ceil(EMAILS_ERRADOS_POR_IP / EMAILS_ERRADOS_POR_CONTA) + 1 }, () => novoZap())
    for (const z of zaps) await criar({ whatsapp: z })
    for (let i = 0; i < EMAILS_ERRADOS_POR_IP; i++)
      await trocar({ whatsapp: zaps[Math.floor(i / EMAILS_ERRADOS_POR_CONTA)], email: 'chute@exemplo.com', senha: 'senha-nova-boa' }, '203.0.113.9')
    const ultimo = zaps.at(-1)!
    expect((await trocar({ whatsapp: ultimo, email: 'maria@exemplo.com', senha: 'senha-nova-boa' }, '203.0.113.9')).status).toBe(429)
    expect((await trocar({ whatsapp: ultimo, email: 'maria@exemplo.com', senha: 'senha-nova-boa' }, '203.0.113.10')).status).toBe(200)
  })

  it(`consultas de número demais do mesmo IP (${ESQUECI_POR_IP} em 15 minutos) esperam`, async () => {
    for (let i = 0; i < ESQUECI_POR_IP; i++) expect((await esqueci(novoZap(), '203.0.113.20')).dados).toEqual({ conta: false })
    expect((await esqueci(novoZap(), '203.0.113.20')).status).toBe(429)
    expect((await esqueci(novoZap(), '203.0.113.21')).status).toBe(200)
  })

  it('a senha nova destrava o número travado por senhas erradas', async () => {
    await criar({ whatsapp: '(82) 98111-2222' })
    for (let i = 0; i < ERROS_POR_CONTA; i++) await entrarNaConta('(82) 98111-2222', 'errada')
    expect((await entrarNaConta('(82) 98111-2222', SENHA)).status).toBe(429)
    expect((await trocar({ whatsapp: '(82) 98111-2222', email: 'maria@exemplo.com', senha: 'senha-nova-boa' })).status).toBe(200)
    expect((await entrarNaConta('(82) 98111-2222', 'senha-nova-boa')).status).toBe(200)
  })

  it('6 clientes trocam a senha ao mesmo tempo, cada uma a sua', async () => {
    const zaps = Array.from({ length: 6 }, () => novoZap())
    for (const z of zaps) await criar({ whatsapp: z })
    const r = await Promise.all(zaps.map((z, i) => trocar({ whatsapp: z, email: 'maria@exemplo.com', senha: `senha-nova-${i}-boa` }, `198.51.100.${i + 1}`)))
    expect(r.map((x) => x.status)).toEqual(Array(6).fill(200))
    for (const [i, z] of zaps.entries()) {
      expect((await entrarNaConta(z, `senha-nova-${i}-boa`)).status).toBe(200)
      expect((await entrarNaConta(z, `senha-nova-${(i + 1) % 6}-boa`)).status).toBe(401)
    }
  })
})
