/*
  Contas das clientes do site (/api/conta/...; o site do GitHub Pages também chama):
    POST /criar               cria a conta (nome, WhatsApp, e-mail e senha) e já entra
    POST /entrar              entra com o WhatsApp e a senha
    POST /sair                fecha a sessão deste aparelho
    GET  /                    os dados da conta e os da última entrega (a compra já vem preenchida)
    POST /pedidos             os pedidos da conta e os que o aparelho guardou
    GET  /nova-senha/:token   o link de senha nova ainda vale? (e o primeiro nome, para a página)
    POST /nova-senha/:token   troca a senha e entra
  A conta nasce na compra: a sacola pede para entrar ou criar a conta antes do
  pagamento, e a compra fica na conta (pedidos.cliente_id). A sessão vai no
  cabeçalho Authorization (worker/seguranca.ts).
  O número não é confirmado por SMS, então um pedido só entra numa conta com
  prova de que é dela: feito com a conta aberta, ou um código que o aparelho
  já guardava, de um pedido com o mesmo WhatsApp da conta. Quem cria uma conta
  com o WhatsApp de outra pessoa não vê os pedidos dela.
  Esqueceu a senha: a loja manda um link de senha nova pelo WhatsApp da conta
  (painel, na página do pedido), que vale por 24 horas e uma vez só.
*/
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Ambiente, LinhaItemPedido, LinhaPedido } from './tipos'
import { falha, lerCorpo, texto } from './validar'
import { numeroWhatsApp } from './ajustes'
import {
  abrirSessaoCliente,
  agora,
  conferirSenha,
  exigirCliente,
  fecharSessaoCliente,
  gerarHashSenha,
  hashToken,
  novoToken,
  validarSenha,
} from './seguranca'
import { CODIGO, CONSULTAS_POR_IP, contar, lerContato, MAX_CONSULTA, pedidoPublico, usou } from './pedidos'

/** contas novas por IP em 1 hora */
export const CONTAS_POR_IP = 20
/** senhas erradas em 15 minutos: por WhatsApp e por IP */
export const ERROS_POR_CONTA = 5
export const ERROS_POR_IP = 20
const JANELA = 15 * 60
/** a senha das clientes tem pelo menos 8 caracteres */
export const SENHA_MINIMA = 8
/** pedidos que a aba mostra de uma vez */
export const PEDIDOS_DA_CONTA = 50
/** quanto tempo vale o link de senha nova */
const LINK_HORAS = 24

const JA_TEM_CONTA = 'Esse WhatsApp já tem conta na Livi. Entre com a sua senha.'
const LINK_VENCIDO = 'Este link de senha nova venceu ou já foi usado. Peça outro pelo WhatsApp.'

/** pedido que ninguém pagou e cuja reserva venceu: não aparece na conta */
const VIVO = `NOT (p.situacao = 'aguardando' AND p.reserva_ate <= ?2)`

/** o que o site recebe da conta: os dados dela, os da última entrega (para preencher a compra) e quantos pedidos ela tem */
async function dadosDaConta(db: D1Database, id: number) {
  const [conta, entrega, cpf, total] = await db.batch([
    db.prepare('SELECT nome, whatsapp, email FROM clientes WHERE id = ?1').bind(id),
    db
      .prepare(
        `SELECT cep, rua, numero, complemento, bairro, cidade FROM pedidos
         WHERE cliente_id = ?1 AND entrega IN ('maceio', 'pac', 'sedex') ORDER BY id DESC LIMIT 1`,
      )
      .bind(id),
    db.prepare(`SELECT cpf FROM pedidos WHERE cliente_id = ?1 AND cpf != '' ORDER BY id DESC LIMIT 1`).bind(id),
    db.prepare(`SELECT COUNT(*) AS n FROM pedidos p WHERE p.cliente_id = ?1 AND ${VIVO}`).bind(id, agora()),
  ])
  const ultima = (entrega.results[0] ?? null) as Record<string, string> | null
  return {
    conta: conta.results[0] as { nome: string; whatsapp: string; email: string },
    entrega: ultima && { ...ultima, cpf: (cpf.results[0] as { cpf: string } | undefined)?.cpf ?? '' },
    pedidos: (total.results[0] as { n: number }).n,
  }
}

export const contas = new Hono<Ambiente>()

// o site do GitHub Pages mora em outro endereço; a sessão vem no cabeçalho Authorization
contas.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST'], allowHeaders: ['Content-Type', 'Authorization'], maxAge: 86400 }))

contas.post('/criar', async (c) => {
  const db = c.env.DB
  const chave = `conta-nova:${c.req.header('CF-Connecting-IP') ?? 'local'}`
  if ((await usou(db, chave, 3600)) >= CONTAS_POR_IP) throw falha(429, 'Muitas contas criadas seguidas. Espere um pouco e tente de novo.')
  const corpo = await lerCorpo(c)
  const { nome, whatsapp, email } = lerContato(corpo)
  const senha = validarSenha(corpo.senha, SENHA_MINIMA)
  if (await db.prepare('SELECT 1 FROM clientes WHERE whatsapp = ?1').bind(whatsapp).first()) throw falha(409, JA_TEM_CONTA)

  const hash = await gerarHashSenha(senha, c.env.SENHA_PEPPER)
  let id: number | null
  try {
    id = await db
      .prepare('INSERT INTO clientes (whatsapp, nome, email, senha) VALUES (?1, ?2, ?3, ?4) RETURNING id')
      .bind(whatsapp, nome, email, hash)
      .first<number>('id')
  } catch (e) {
    // duas contas com o mesmo WhatsApp ao mesmo tempo: a segunda cai aqui
    if (/UNIQUE constraint failed: clientes\.whatsapp/i.test(String(e instanceof Error ? e.message : e))) throw falha(409, JA_TEM_CONTA)
    throw e
  }
  await contar(db, chave, 3600)
  const token = await abrirSessaoCliente(db, id!)
  return c.json({ token, ...(await dadosDaConta(db, id!)) }, 201)
})

contas.post('/entrar', async (c) => {
  const db = c.env.DB
  const corpo = await lerCorpo(c)
  const whatsapp = numeroWhatsApp(texto(corpo.whatsapp, 'seu WhatsApp', 30, true))
  if (!whatsapp) throw falha(400, 'Confira o WhatsApp: DDD e número, ex.: (82) 99999-9999.')
  const senha = typeof corpo.senha === 'string' ? corpo.senha.slice(0, 200) : ''
  if (!senha) throw falha(400, 'Preencha a sua senha.')

  const doNumero = `entrar-conta:${whatsapp}`
  const doIp = `entrar-conta-ip:${c.req.header('CF-Connecting-IP') ?? 'local'}`
  if ((await usou(db, doNumero, JANELA)) >= ERROS_POR_CONTA || (await usou(db, doIp, JANELA)) >= ERROS_POR_IP)
    throw falha(429, 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.')

  const conta = await db.prepare('SELECT id, senha FROM clientes WHERE whatsapp = ?1').bind(whatsapp).first<{ id: number; senha: string }>()
  // sem conta a senha é conferida do mesmo jeito: o tempo de resposta não revela se o número tem conta
  const certa = await conferirSenha(senha, conta?.senha ?? null, c.env.SENHA_PEPPER)
  if (!conta || !certa) {
    await contar(db, doNumero, JANELA)
    await contar(db, doIp, JANELA)
    throw falha(401, 'WhatsApp ou senha incorretos.')
  }
  await db.prepare('DELETE FROM tentativas WHERE chave = ?1').bind(doNumero).run()
  const token = await abrirSessaoCliente(db, conta.id)
  return c.json({ token, ...(await dadosDaConta(db, conta.id)) })
})

contas.post('/sair', async (c) => {
  await fecharSessaoCliente(c)
  return c.json({ ok: true })
})

contas.get('/', exigirCliente, async (c) => c.json(await dadosDaConta(c.env.DB, c.get('cliente').id)))

/**
  Os pedidos da conta, do mais novo para o mais antigo, junto com os que o
  aparelho guardou. Antes, os códigos do aparelho que são de pedidos com o
  mesmo WhatsApp da conta (e de nenhuma outra) entram nela.
*/
contas.post('/pedidos', exigirCliente, async (c) => {
  const db = c.env.DB
  const cliente = c.get('cliente')
  const corpo = await lerCorpo(c)
  const lista = corpo.codigos ?? []
  if (!Array.isArray(lista) || lista.length > MAX_CONSULTA) throw falha(400, 'Consulta inválida.')
  const codigos = [...new Set(lista.filter((x): x is string => typeof x === 'string' && CODIGO.test(x)))]
  const chave = `consulta:${c.req.header('CF-Connecting-IP') ?? 'local'}`
  if ((await usou(db, chave, 900)) >= CONSULTAS_POR_IP) throw falha(429, 'Muitas consultas seguidas. Espere um pouco e tente de novo.')
  await contar(db, chave, 900)

  const marcas = codigos.map((_, i) => `?${i + 3}`).join(',')
  const filtro = `p.origem = 'site' AND (p.cliente_id = ?1${codigos.length ? ` OR p.codigo IN (${marcas})` : ''}) AND ${VIVO}`
  const passos = [
    db.prepare(`SELECT p.* FROM pedidos p WHERE ${filtro} ORDER BY p.id DESC LIMIT ${PEDIDOS_DA_CONTA}`).bind(cliente.id, agora(), ...codigos),
    db
      .prepare(
        `SELECT i.*, pc.slug AS peca_slug FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
         LEFT JOIN pecas pc ON pc.id = i.peca_id WHERE ${filtro} ORDER BY i.id`,
      )
      .bind(cliente.id, agora(), ...codigos),
  ]
  if (codigos.length)
    passos.unshift(
      db
        .prepare(`UPDATE pedidos SET cliente_id = ?1 WHERE origem = 'site' AND cliente_id IS NULL AND whatsapp = ?2 AND codigo IN (${marcas})`)
        .bind(cliente.id, cliente.whatsapp, ...codigos),
    )
  const r = await db.batch(passos)
  const pedidos = r.at(-2)!.results as LinhaPedido[]
  const itens = r.at(-1)!.results as LinhaItemPedido[]
  return c.json({
    pedidos: pedidos.map((p) => ({ ...pedidoPublico(p, itens.filter((i) => i.pedido_id === p.id)), daConta: p.cliente_id === cliente.id })),
  })
})

/* ---------- senha nova ---------- */

/** cria o link de senha nova (o painel chama; a loja manda pelo WhatsApp da conta). Um link novo apaga os antigos */
export async function criarLinkSenha(db: D1Database, clienteId: number) {
  const token = novoToken()
  await db.batch([
    db.prepare('DELETE FROM senhas_novas WHERE cliente_id = ?1 OR expira_em <= ?2').bind(clienteId, agora()),
    db
      .prepare('INSERT INTO senhas_novas (token_hash, cliente_id, expira_em) VALUES (?1, ?2, ?3)')
      .bind(await hashToken(token), clienteId, agora() + LINK_HORAS * 3600),
  ])
  return token
}

async function acharLink(db: D1Database, token: string) {
  if (!/^[\w-]{20,100}$/.test(token)) return null
  return db
    .prepare('SELECT cl.id, cl.nome, cl.whatsapp FROM senhas_novas n JOIN clientes cl ON cl.id = n.cliente_id WHERE n.token_hash = ?1 AND n.expira_em > ?2')
    .bind(await hashToken(token), agora())
    .first<{ id: number; nome: string; whatsapp: string }>()
}

contas.get('/nova-senha/:token', async (c) => {
  const link = await acharLink(c.env.DB, c.req.param('token'))
  if (!link) throw falha(404, LINK_VENCIDO)
  return c.json({ nome: link.nome.split(/\s+/)[0] ?? '' })
})

contas.post('/nova-senha/:token', async (c) => {
  const db = c.env.DB
  const link = await acharLink(db, c.req.param('token'))
  if (!link) throw falha(404, LINK_VENCIDO)
  const corpo = await lerCorpo(c)
  const hash = await gerarHashSenha(validarSenha(corpo.senha, SENHA_MINIMA), c.env.SENHA_PEPPER)
  // senha nova: o link deixa de valer, os aparelhos que estavam na conta saem e as tentativas erradas zeram
  await db.batch([
    db.prepare('UPDATE clientes SET senha = ?1 WHERE id = ?2').bind(hash, link.id),
    db.prepare('DELETE FROM senhas_novas WHERE cliente_id = ?1').bind(link.id),
    db.prepare('DELETE FROM sessoes_clientes WHERE cliente_id = ?1').bind(link.id),
    db.prepare('DELETE FROM tentativas WHERE chave = ?1').bind(`entrar-conta:${link.whatsapp}`),
  ])
  const token = await abrirSessaoCliente(db, link.id)
  return c.json({ token, ...(await dadosDaConta(db, link.id)) })
})
