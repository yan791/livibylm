/*
  API do painel da loja (/api/painel/...).
  Abertas: entrar e usar um link de acesso (convite). O resto exige login.
*/
import { Hono, type Context } from 'hono'
import type { Ambiente, CorPeca, LinhaColecao, LinhaEstoque, LinhaPeca } from './tipos'
import { EMAIL, falha, idDe, inteiro, lerCorpo, texto, type Corpo } from './validar'
import {
  abrirSessao,
  agora,
  bloqueado,
  conferirSenha,
  CONVITE_DIAS,
  exigirAdmin,
  fecharSessao,
  gerarHashSenha,
  hashToken,
  limparFalhas,
  mesmaOrigem,
  novoToken,
  registrarFalha,
  validarSenha,
} from './seguranca'
import { apagarFotosSemUso, guardarFoto, guardarPequena, LIMITE_FOTO } from './fotos'
import { limparCacheCatalogo } from './catalogo'
import { lerAjustes, numeroWhatsApp, PAGAMENTO_PRONTO, salvarAjustes } from './ajustes'
import { chaveVariante, consultaReservas, estoqueReservado, mapaReservas, type LinhaReserva } from './reservas'
import { painelPedidos } from './painel-pedidos'
import { REGIOES, type TabelaFrete } from './frete'
import { RESERVA_MINUTOS } from './pedidos'

export const painel = new Hono<Ambiente>()
painel.use('*', mesmaOrigem)

// qualquer alteração pelo painel aparece no site na hora (pelo menos neste servidor da Cloudflare)
painel.use('*', async (c, next) => {
  await next()
  if (c.req.method !== 'GET') limparCacheCatalogo()
})

/* ---------- validação ---------- */

const HEX = /^#[0-9a-f]{6}$/i
const FOTO = /^\/(fotos\/p\/[0-9a-f-]{36}\.(webp|jpg|png|avif)|img\/(?!.*\.\.)[\w\-/.]+\.(webp|jpg|jpeg|png|avif))$/

function cor(v: unknown, campo: string) {
  if (typeof v !== 'string' || !HEX.test(v)) throw falha(400, `${campo}: escolha uma cor válida.`)
  return v.toLowerCase()
}

function foto(v: unknown) {
  if (typeof v !== 'string' || !FOTO.test(v)) throw falha(400, 'Uma das fotos é inválida. Envie de novo.')
  return v
}

export function slugDe(nome: string) {
  const s = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return s || 'item'
}

/** endereço novo (/colecao/<slug>) sem repetir um que já existe */
async function slugLivre(db: D1Database, tabela: 'pecas' | 'colecoes', nome: string) {
  const base = slugDe(nome)
  const { results } = await db
    .prepare(`SELECT slug FROM ${tabela} WHERE slug = ?1 OR slug LIKE ?2`)
    .bind(base, `${base}-%`)
    .all<{ slug: string }>()
  const usados = new Set(results.map((r) => r.slug))
  if (!usados.has(base)) return base
  for (let n = 2; ; n++) if (!usados.has(`${base}-${n}`)) return `${base}-${n}`
}

/* ---------- entrar, sair e convite (abertos) ---------- */

painel.post('/entrar', async (c) => {
  const corpo = await lerCorpo(c)
  const email = texto(corpo.email, 'o e-mail', 200, true).toLowerCase()
  const senha = typeof corpo.senha === 'string' ? corpo.senha.slice(0, 200) : ''
  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  const db = c.env.DB

  if (await bloqueado(db, email, ip)) throw falha(429, 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.')
  const admin = await db.prepare('SELECT id, senha FROM admins WHERE email = ?1').bind(email).first<{ id: number; senha: string | null }>()
  const certa = await conferirSenha(senha, admin?.senha ?? null, c.env.SENHA_PEPPER)
  if (!admin || !certa) {
    await registrarFalha(db, email, ip)
    throw falha(401, 'E-mail ou senha incorretos.')
  }
  await limparFalhas(db, email)
  await abrirSessao(c, admin.id)
  return c.json({ ok: true })
})

painel.post('/sair', async (c) => {
  await fecharSessao(c)
  return c.json({ ok: true })
})

async function acharConvite(db: D1Database, token: string) {
  return db
    .prepare(
      'SELECT a.id, a.email, a.nome, a.senha IS NOT NULL AS ativo FROM convites v JOIN admins a ON a.id = v.admin_id WHERE v.token_hash = ?1 AND v.expira_em > ?2',
    )
    .bind(await hashToken(token), agora())
    .first<{ id: number; email: string; nome: string; ativo: number }>()
}

painel.get('/convite/:token', async (c) => {
  const convite = await acharConvite(c.env.DB, c.req.param('token'))
  if (!convite) throw falha(404, 'Este link de acesso expirou ou já foi usado. Peça um novo.')
  return c.json({ email: convite.email, nome: convite.nome, primeiroAcesso: convite.ativo === 0 })
})

painel.post('/convite/:token', async (c) => {
  const db = c.env.DB
  const convite = await acharConvite(db, c.req.param('token'))
  if (!convite) throw falha(404, 'Este link de acesso expirou ou já foi usado. Peça um novo.')
  const corpo = await lerCorpo(c)
  const nome = texto(corpo.nome, 'seu nome', 80, true)
  const hash = await gerarHashSenha(validarSenha(corpo.senha), c.env.SENHA_PEPPER)
  // senha nova: o link deixa de valer e as sessões antigas dessa pessoa saem
  await db.batch([
    db.prepare('UPDATE admins SET senha = ?1, nome = ?2 WHERE id = ?3').bind(hash, nome, convite.id),
    db.prepare('DELETE FROM convites WHERE admin_id = ?1').bind(convite.id),
    db.prepare('DELETE FROM sessoes WHERE admin_id = ?1').bind(convite.id),
  ])
  await abrirSessao(c, convite.id)
  return c.json({ ok: true })
})

/* ---------- daqui para baixo, só com login ---------- */

painel.use('*', exigirAdmin)

painel.get('/eu', (c) => c.json({ ...c.get('admin'), site: c.env.SITE_PUBLICO ?? '' }))

painel.route('/pedidos', painelPedidos)

/* ---------- coleções ---------- */

const colecaoParaPainel = (r: LinhaColecao & { pecas?: number }) => ({
  id: r.id,
  slug: r.slug,
  nome: r.nome,
  numero: r.numero,
  fundo: r.fundo,
  tema: r.tema,
  clima: r.clima,
  descricao: r.descricao,
  capa: r.capa,
  capaProporcao: r.capa_proporcao,
  ordem: r.ordem,
  visivel: r.visivel === 1,
  pecas: r.pecas ?? 0,
})

function lerColecao(corpo: Corpo) {
  const tema = corpo.tema === 'escuro' ? 'escuro' : 'claro'
  const capa = corpo.capa == null || corpo.capa === '' ? null : foto(corpo.capa)
  const proporcao = typeof corpo.capaProporcao === 'number' && corpo.capaProporcao > 0.2 && corpo.capaProporcao < 3 ? corpo.capaProporcao : 0.68
  return {
    nome: texto(corpo.nome, 'o nome da coleção', 60, true),
    numero: texto(corpo.numero, 'O número', 8),
    fundo: cor(corpo.fundo, 'Cor de fundo'),
    tema,
    clima: texto(corpo.clima, 'A frase curta', 120),
    descricao: texto(corpo.descricao, 'A descrição', 600),
    capa,
    capaProporcao: Math.round(proporcao * 10000) / 10000,
    visivel: corpo.visivel !== false,
  }
}

painel.get('/colecoes', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT c.*, (SELECT COUNT(*) FROM pecas p WHERE p.colecao_id = c.id) AS pecas FROM colecoes c ORDER BY c.ordem, c.id',
  ).all<LinhaColecao & { pecas: number }>()
  return c.json(results.map(colecaoParaPainel))
})

painel.post('/colecoes', async (c) => {
  const db = c.env.DB
  const v = lerColecao(await lerCorpo(c))
  const slug = await slugLivre(db, 'colecoes', v.nome)
  const linha = await db
    .prepare(
      `INSERT INTO colecoes (slug, nome, numero, fundo, tema, clima, descricao, capa, capa_proporcao, visivel, ordem)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM colecoes)) RETURNING *`,
    )
    .bind(slug, v.nome, v.numero, v.fundo, v.tema, v.clima, v.descricao, v.capa, v.capaProporcao, v.visivel ? 1 : 0)
    .first<LinhaColecao>()
  return c.json(colecaoParaPainel(linha!), 201)
})

painel.put('/colecoes/:id', async (c) => {
  const db = c.env.DB
  const id = idDe(c, 'Coleção')
  const antes = await db.prepare('SELECT * FROM colecoes WHERE id = ?1').bind(id).first<LinhaColecao>()
  if (!antes) throw falha(404, 'Coleção não encontrada.')
  const v = lerColecao(await lerCorpo(c))
  const linha = await db
    .prepare(
      `UPDATE colecoes SET nome = ?1, numero = ?2, fundo = ?3, tema = ?4, clima = ?5, descricao = ?6, capa = ?7,
       capa_proporcao = ?8, visivel = ?9, atualizado_em = datetime('now') WHERE id = ?10 RETURNING *`,
    )
    .bind(v.nome, v.numero, v.fundo, v.tema, v.clima, v.descricao, v.capa, v.capaProporcao, v.visivel ? 1 : 0, id)
    .first<LinhaColecao>()
  if (antes.capa && antes.capa !== v.capa) c.executionCtx.waitUntil(apagarFotosSemUso(db, c.env.FOTOS, [antes.capa]))
  return c.json(colecaoParaPainel(linha!))
})

painel.delete('/colecoes/:id', async (c) => {
  const db = c.env.DB
  const id = idDe(c, 'Coleção')
  const linha = await db
    .prepare('SELECT capa, (SELECT COUNT(*) FROM pecas WHERE colecao_id = ?1) AS pecas FROM colecoes WHERE id = ?1')
    .bind(id)
    .first<{ capa: string | null; pecas: number }>()
  if (!linha) throw falha(404, 'Coleção não encontrada.')
  if (linha.pecas > 0) throw falha(409, 'Essa coleção ainda tem peças. Mova ou apague as peças antes.')
  await db.prepare('DELETE FROM colecoes WHERE id = ?1').bind(id).run()
  if (linha.capa) c.executionCtx.waitUntil(apagarFotosSemUso(db, c.env.FOTOS, [linha.capa]))
  return c.json({ ok: true })
})

painel.post('/colecoes/ordem', async (c) => {
  const db = c.env.DB
  const ids = (await lerCorpo(c)).ids
  if (!Array.isArray(ids) || ids.length > 200) throw falha(400, 'Pedido inválido.')
  const sql = db.prepare('UPDATE colecoes SET ordem = ?1 WHERE id = ?2')
  if (ids.length) await db.batch(ids.map((id, i) => sql.bind(i + 1, inteiro(id, 'Coleção', 1, 1e9))))
  return c.json({ ok: true })
})

/* ---------- peças ---------- */

type EntradaEstoque = { cor: string; tamanho: string; quantidade: number; antes: number | null }

function lerPeca(corpo: Corpo) {
  if (!Array.isArray(corpo.cores) || corpo.cores.length < 1 || corpo.cores.length > 12) throw falha(400, 'Cadastre pelo menos uma cor.')
  const cores: CorPeca[] = corpo.cores.map((x: Corpo) => {
    const id = typeof x?.id === 'string' && /^[a-z0-9]{1,12}$/.test(x.id) ? x.id : null
    if (!id) throw falha(400, 'Cor inválida. Recarregue a página e tente de novo.')
    return { id, nome: texto(x.nome, 'o nome da cor', 40, true), hex: cor(x.hex, 'Cor') }
  })
  if (new Set(cores.map((x) => x.id)).size !== cores.length) throw falha(400, 'Cor repetida.')
  if (new Set(cores.map((x) => x.nome.toLowerCase())).size !== cores.length) throw falha(400, 'Duas cores estão com o mesmo nome.')

  if (!Array.isArray(corpo.tamanhos) || corpo.tamanhos.length < 1 || corpo.tamanhos.length > 15)
    throw falha(400, 'Escolha pelo menos um tamanho.')
  const tamanhos = corpo.tamanhos.map((t) => texto(t, 'O tamanho', 12, true))
  if (new Set(tamanhos.map((t) => t.toLowerCase())).size !== tamanhos.length) throw falha(400, 'Tamanho repetido.')

  if (!Array.isArray(corpo.fotos) || corpo.fotos.length > 10) throw falha(400, 'Use até 10 fotos por peça.')
  const fotos = corpo.fotos.map(foto)

  const entrada = Array.isArray(corpo.estoque) ? (corpo.estoque as Corpo[]) : []
  const estoque: EntradaEstoque[] = cores.flatMap((x) =>
    tamanhos.map((t) => {
      const e = entrada.find((y) => y?.cor === x.id && y?.tamanho === t)
      return {
        cor: x.id,
        tamanho: t,
        quantidade: e ? inteiro(e.quantidade, 'Quantidade', 0, 9999) : 0,
        antes: e && typeof e.antes === 'number' && Number.isInteger(e.antes) ? e.antes : null,
      }
    }),
  )
  if (corpo.precoCentavos === 0) throw falha(400, 'O preço não pode ser zero.')

  return {
    colecaoId: inteiro(corpo.colecaoId, 'Coleção', 1, 1e9),
    nome: texto(corpo.nome, 'o nome da peça', 120, true),
    precoCentavos: inteiro(corpo.precoCentavos, 'Preço', 1, 10_000_000),
    descricao: texto(corpo.descricao, 'A descrição', 1500),
    tecido: texto(corpo.tecido, 'O tecido', 120),
    cores,
    tamanhos,
    fotos,
    modeloAltura: texto(corpo.modeloAltura, 'A altura da modelo', 40),
    modeloVeste: texto(corpo.modeloVeste, 'O tamanho que a modelo veste', 40),
    sobEncomenda: corpo.sobEncomenda === true,
    prazoEncomenda: texto(corpo.prazoEncomenda, 'O prazo', 80),
    visivel: corpo.visivel !== false,
    estoque,
  }
}

/** reservado = unidades seguras agora em compras do site esperando pagamento */
const pecaParaPainel = (p: LinhaPeca, estoque: LinhaEstoque[], reservas: Map<string, number>) => ({
  id: p.id,
  colecaoId: p.colecao_id,
  slug: p.slug,
  nome: p.nome,
  precoCentavos: p.preco_centavos,
  descricao: p.descricao,
  tecido: p.tecido,
  cores: JSON.parse(p.cores) as CorPeca[],
  tamanhos: JSON.parse(p.tamanhos) as string[],
  fotos: JSON.parse(p.fotos) as string[],
  modeloAltura: p.modelo_altura,
  modeloVeste: p.modelo_veste,
  sobEncomenda: p.sob_encomenda === 1,
  prazoEncomenda: p.prazo_encomenda,
  visivel: p.visivel === 1,
  ordem: p.ordem,
  estoque: estoque
    .filter((e) => e.peca_id === p.id)
    .map(({ cor, tamanho, quantidade }) => ({ cor, tamanho, quantidade, reservado: reservas.get(chaveVariante(p.id, cor, tamanho)) ?? 0 })),
})

async function existeColecao(db: D1Database, id: number) {
  if (!(await db.prepare('SELECT 1 FROM colecoes WHERE id = ?1').bind(id).first())) throw falha(400, 'Escolha uma coleção.')
}

painel.get('/pecas', async (c) => {
  const [pecas, estoque] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT p.* FROM pecas p JOIN colecoes c ON c.id = p.colecao_id ORDER BY c.ordem, c.id, p.ordem, p.id'),
    c.env.DB.prepare('SELECT * FROM estoque'),
  ])
  const linhas = estoque.results as LinhaEstoque[]
  return c.json(
    (pecas.results as LinhaPeca[]).map((p) => {
      const cores = JSON.parse(p.cores) as CorPeca[]
      const tamanhos = JSON.parse(p.tamanhos) as string[]
      const qtd = (corId: string, t: string) => linhas.find((e) => e.peca_id === p.id && e.cor === corId && e.tamanho === t)?.quantidade ?? 0
      const combinacoes = cores.flatMap((x) => tamanhos.map((t) => qtd(x.id, t)))
      return {
        id: p.id,
        colecaoId: p.colecao_id,
        nome: p.nome,
        slug: p.slug,
        precoCentavos: p.preco_centavos,
        foto: (JSON.parse(p.fotos) as string[])[0] ?? null,
        visivel: p.visivel === 1,
        sobEncomenda: p.sob_encomenda === 1,
        total: combinacoes.reduce((s, n) => s + n, 0),
        combinacoes: combinacoes.length,
        zeradas: combinacoes.filter((n) => n <= 0).length,
      }
    }),
  )
})

painel.get('/pecas/:id', async (c) => {
  const id = idDe(c, 'Peça')
  const [peca, estoque, reservas] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM pecas WHERE id = ?1').bind(id),
    c.env.DB.prepare('SELECT * FROM estoque WHERE peca_id = ?1').bind(id),
    consultaReservas(c.env.DB),
  ])
  const p = (peca.results as LinhaPeca[])[0]
  if (!p) throw falha(404, 'Peça não encontrada.')
  return c.json(pecaParaPainel(p, estoque.results as LinhaEstoque[], mapaReservas(reservas.results as LinhaReserva[])))
})

painel.post('/pecas', async (c) => {
  const db = c.env.DB
  const v = lerPeca(await lerCorpo(c))
  await existeColecao(db, v.colecaoId)
  const slug = await slugLivre(db, 'pecas', v.nome)
  const doSlug = '(SELECT id FROM pecas WHERE slug = ?1)'
  await db.batch([
    db
      .prepare(
        `INSERT INTO pecas (colecao_id, slug, nome, preco_centavos, descricao, tecido, cores, tamanhos, fotos,
         modelo_altura, modelo_veste, sob_encomenda, prazo_encomenda, visivel, ordem)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
           (SELECT COALESCE(MAX(ordem), 0) + 1 FROM pecas WHERE colecao_id = ?1))`,
      )
      .bind(
        v.colecaoId,
        slug,
        v.nome,
        v.precoCentavos,
        v.descricao,
        v.tecido,
        JSON.stringify(v.cores),
        JSON.stringify(v.tamanhos),
        JSON.stringify(v.fotos),
        v.modeloAltura,
        v.modeloVeste,
        v.sobEncomenda ? 1 : 0,
        v.prazoEncomenda,
        v.visivel ? 1 : 0,
      ),
    ...v.estoque.map((e) =>
      db.prepare(`INSERT INTO estoque (peca_id, cor, tamanho, quantidade) VALUES (${doSlug}, ?2, ?3, ?4)`).bind(slug, e.cor, e.tamanho, e.quantidade),
    ),
  ])
  const nova = await db.prepare('SELECT id FROM pecas WHERE slug = ?1').bind(slug).first<{ id: number }>()
  return c.json({ id: nova!.id, slug }, 201)
})

painel.put('/pecas/:id', async (c) => {
  const db = c.env.DB
  const id = idDe(c, 'Peça')
  const antes = await db.prepare('SELECT * FROM pecas WHERE id = ?1').bind(id).first<LinhaPeca>()
  if (!antes) throw falha(404, 'Peça não encontrada.')
  const v = lerPeca(await lerCorpo(c))
  await existeColecao(db, v.colecaoId)

  /*
    Estoque: quando o painel manda quanto havia ao abrir a peça ("antes"),
    aplica só a diferença. Assim uma venda que aconteceu enquanto a peça
    estava aberta no painel não é apagada ao salvar.
  */
  const { results: atuais } = await db.prepare('SELECT * FROM estoque WHERE peca_id = ?1').bind(id).all<LinhaEstoque>()
  const restantes = new Map(atuais.map((e) => [`${e.cor}\u0000${e.tamanho}`, e]))
  const estoque: D1PreparedStatement[] = []
  for (const e of v.estoque) {
    const chave = `${e.cor}\u0000${e.tamanho}`
    if (restantes.has(chave)) {
      restantes.delete(chave)
      if (e.antes === null)
        estoque.push(db.prepare('UPDATE estoque SET quantidade = ?1 WHERE peca_id = ?2 AND cor = ?3 AND tamanho = ?4').bind(e.quantidade, id, e.cor, e.tamanho))
      else if (e.quantidade !== e.antes)
        estoque.push(
          db
            .prepare('UPDATE estoque SET quantidade = MAX(0, quantidade + ?1) WHERE peca_id = ?2 AND cor = ?3 AND tamanho = ?4')
            .bind(e.quantidade - e.antes, id, e.cor, e.tamanho),
        )
    } else {
      estoque.push(db.prepare('INSERT INTO estoque (peca_id, cor, tamanho, quantidade) VALUES (?1, ?2, ?3, ?4)').bind(id, e.cor, e.tamanho, e.quantidade))
    }
  }
  for (const e of restantes.values())
    estoque.push(db.prepare('DELETE FROM estoque WHERE peca_id = ?1 AND cor = ?2 AND tamanho = ?3').bind(id, e.cor, e.tamanho))

  const mudouColecao = antes.colecao_id !== v.colecaoId
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE pecas SET colecao_id = ?1, nome = ?2, preco_centavos = ?3, descricao = ?4, tecido = ?5, cores = ?6,
           tamanhos = ?7, fotos = ?8, modelo_altura = ?9, modelo_veste = ?10, sob_encomenda = ?11, prazo_encomenda = ?12,
           visivel = ?13, atualizado_em = datetime('now'),
           ordem = CASE WHEN ?14 THEN (SELECT COALESCE(MAX(ordem), 0) + 1 FROM pecas WHERE colecao_id = ?1) ELSE ordem END
           WHERE id = ?15`,
        )
        .bind(
          v.colecaoId,
          v.nome,
          v.precoCentavos,
          v.descricao,
          v.tecido,
          JSON.stringify(v.cores),
          JSON.stringify(v.tamanhos),
          JSON.stringify(v.fotos),
          v.modeloAltura,
          v.modeloVeste,
          v.sobEncomenda ? 1 : 0,
          v.prazoEncomenda,
          v.visivel ? 1 : 0,
          mudouColecao ? 1 : 0,
          id,
        ),
      ...estoque,
    ])
  } catch (e) {
    if (estoqueReservado(e))
      throw falha(
        409,
        'Há unidades desta peça reservadas para quem está pagando no site agora (o "reserv." na grade). O estoque não pode ficar abaixo disso, nem a cor ou o tamanho sair da peça, até o pagamento ser confirmado ou a reserva vencer.',
      )
    throw e
  }

  const saiu = (JSON.parse(antes.fotos) as string[]).filter((f) => !v.fotos.includes(f))
  if (saiu.length) c.executionCtx.waitUntil(apagarFotosSemUso(db, c.env.FOTOS, saiu))
  return c.json({ id, slug: antes.slug })
})

painel.delete('/pecas/:id', async (c) => {
  const db = c.env.DB
  const id = idDe(c, 'Peça')
  const p = await db.prepare('SELECT fotos FROM pecas WHERE id = ?1').bind(id).first<{ fotos: string }>()
  if (!p) throw falha(404, 'Peça não encontrada.')
  try {
    await db.prepare('DELETE FROM pecas WHERE id = ?1').bind(id).run()
  } catch (e) {
    if (estoqueReservado(e))
      throw falha(409, `Alguém está pagando esta peça no site agora. Espere o pagamento ou o fim da reserva (até ${RESERVA_MINUTOS} minutos) para apagar.`)
    throw e
  }
  c.executionCtx.waitUntil(apagarFotosSemUso(db, c.env.FOTOS, JSON.parse(p.fotos)))
  return c.json({ ok: true })
})

painel.post('/pecas/ordem', async (c) => {
  const db = c.env.DB
  const ids = (await lerCorpo(c)).ids
  if (!Array.isArray(ids) || ids.length > 500) throw falha(400, 'Pedido inválido.')
  const sql = db.prepare('UPDATE pecas SET ordem = ?1 WHERE id = ?2')
  if (ids.length) await db.batch(ids.map((id, i) => sql.bind(i + 1, inteiro(id, 'Peça', 1, 1e9))))
  return c.json({ ok: true })
})

/* ---------- fotos ---------- */

async function lerFoto(c: Context<Ambiente>) {
  if (Number(c.req.header('Content-Length') ?? 0) > LIMITE_FOTO) throw falha(413, 'Foto grande demais (até 8 MB).')
  const corpo = await c.req.arrayBuffer()
  if (!corpo.byteLength) throw falha(400, 'Nenhuma foto recebida.')
  if (corpo.byteLength > LIMITE_FOTO) throw falha(413, 'Foto grande demais (até 8 MB).')
  return corpo
}

painel.post('/fotos', async (c) => {
  const src = await guardarFoto(c.env.FOTOS, await lerFoto(c))
  if (!src) throw falha(415, 'Esse arquivo não é uma foto aceita. Use JPG, PNG ou WebP.')
  return c.json({ src }, 201)
})

/** versão pequena (vitrine e miniaturas) de uma foto grande já enviada: ?de=/fotos/p/... */
painel.post('/fotos/pequena', async (c) => {
  const ok = await guardarPequena(c.env.FOTOS, c.req.query('de') ?? '', await lerFoto(c))
  if (!ok) throw falha(400, 'Não deu para guardar a versão pequena da foto.')
  return c.json({ ok: true }, 201)
})

/** fotos enviadas numa peça que não chegou a ser salva */
painel.post('/fotos/descartar', async (c) => {
  const fotos = (await lerCorpo(c)).fotos
  if (!Array.isArray(fotos) || fotos.length > 20) throw falha(400, 'Pedido inválido.')
  await apagarFotosSemUso(c.env.DB, c.env.FOTOS, fotos.filter((f): f is string => typeof f === 'string'))
  return c.json({ ok: true })
})

/* ---------- pessoas com acesso ---------- */

async function novoConvite(db: D1Database, adminId: number, origem: string) {
  const token = novoToken()
  await db.batch([
    db.prepare('DELETE FROM convites WHERE admin_id = ?1 OR expira_em <= ?2').bind(adminId, agora()),
    db.prepare('INSERT INTO convites (token_hash, admin_id, expira_em) VALUES (?1, ?2, ?3)').bind(
      await hashToken(token),
      adminId,
      agora() + CONVITE_DIAS * 24 * 60 * 60,
    ),
  ])
  return { link: `${origem}/painel/convite/${token}`, dias: CONVITE_DIAS }
}

painel.get('/pessoas', async (c) => {
  const eu = c.get('admin').id
  const { results } = await c.env.DB.prepare(
    'SELECT id, email, nome, senha IS NOT NULL AS ativo, ultimo_acesso, criado_em FROM admins ORDER BY criado_em, id',
  ).all<{ id: number; email: string; nome: string; ativo: number; ultimo_acesso: string | null; criado_em: string }>()
  return c.json(
    results.map((r) => ({
      id: r.id,
      email: r.email,
      nome: r.nome,
      ativo: r.ativo === 1,
      ultimoAcesso: r.ultimo_acesso,
      voce: r.id === eu,
    })),
  )
})

painel.post('/pessoas', async (c) => {
  const db = c.env.DB
  const corpo = await lerCorpo(c)
  const nome = texto(corpo.nome, 'o nome', 80, true)
  const email = texto(corpo.email, 'o e-mail', 200, true).toLowerCase()
  if (!EMAIL.test(email)) throw falha(400, 'Esse e-mail não parece certo.')
  if (await db.prepare('SELECT 1 FROM admins WHERE email = ?1').bind(email).first()) throw falha(409, 'Essa pessoa já tem acesso.')
  const linha = await db.prepare('INSERT INTO admins (email, nome) VALUES (?1, ?2) RETURNING id').bind(email, nome).first<{ id: number }>()
  return c.json(await novoConvite(db, linha!.id, c.req.header('Origin')!), 201)
})

/** link novo: para o primeiro acesso ou para trocar uma senha esquecida */
painel.post('/pessoas/:id/link', async (c) => {
  const db = c.env.DB
  const id = idDe(c, 'Pessoa')
  if (!(await db.prepare('SELECT 1 FROM admins WHERE id = ?1').bind(id).first())) throw falha(404, 'Pessoa não encontrada.')
  return c.json(await novoConvite(db, id, c.req.header('Origin')!))
})

painel.delete('/pessoas/:id', async (c) => {
  const db = c.env.DB
  const id = idDe(c, 'Pessoa')
  if (id === c.get('admin').id) throw falha(400, 'Você não pode tirar o seu próprio acesso.')
  if (!(await db.prepare('SELECT 1 FROM admins WHERE id = ?1').bind(id).first())) throw falha(404, 'Pessoa não encontrada.')
  const ativos = await db.prepare('SELECT COUNT(*) AS n FROM admins WHERE senha IS NOT NULL AND id != ?1').bind(id).first<{ n: number }>()
  if (!ativos?.n) throw falha(400, 'O painel precisa de pelo menos uma pessoa com acesso.')
  await db.prepare('DELETE FROM admins WHERE id = ?1').bind(id).run()
  return c.json({ ok: true })
})

/* ---------- ajustes da loja ---------- */

/** PAC e SEDEX por região: vazio (null) = não envia por esse serviço para lá */
function lerTabelaFrete(v: unknown): TabelaFrete {
  const o = v && typeof v === 'object' ? (v as Corpo) : {}
  return Object.fromEntries(
    REGIOES.map(({ id, nome }) => {
      const r = (o[id] && typeof o[id] === 'object' ? o[id] : {}) as Corpo
      const preco = (x: unknown, servico: string) => (x == null ? null : inteiro(x, `${servico} para ${nome}`, 1, 100_000))
      return [id, { pac: preco(r.pac, 'PAC'), sedex: preco(r.sedex, 'SEDEX') }]
    }),
  ) as TabelaFrete
}

painel.get('/ajustes', async (c) => c.json({ ...(await lerAjustes(c.env.DB)), pagamentoPronto: PAGAMENTO_PRONTO }))

painel.put('/ajustes', async (c) => {
  const corpo = await lerCorpo(c)
  const whatsapp = numeroWhatsApp(texto(corpo.whatsapp, 'o WhatsApp', 30, true))
  if (!whatsapp) throw falha(400, 'Confira o WhatsApp: DDD e número, ex.: (82) 99811-5324.')
  const ajustes = {
    // sem o pagamento pronto, as vendas pelo site ficam desligadas
    vendasOnline: PAGAMENTO_PRONTO && corpo.vendasOnline === true,
    taxaMaceioCentavos: inteiro(corpo.taxaMaceioCentavos, 'Taxa de entrega', 0, 100_000),
    parcelasSemJuros: inteiro(corpo.parcelasSemJuros, 'Parcelas', 1, 12),
    whatsapp,
    freteCorreios: lerTabelaFrete(corpo.freteCorreios),
  }
  await salvarAjustes(c.env.DB, ajustes)
  return c.json({ ...ajustes, pagamentoPronto: PAGAMENTO_PRONTO })
})
