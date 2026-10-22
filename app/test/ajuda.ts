/*
  Ajuda dos testes: monta uma peça com estoque, segura peças como uma compra do
  site (a mesma função que o POST /api/pedidos usa) e chama a API do painel
  com uma sessão aberta direto no banco.
*/
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import app from '../worker/index'
import { gravarPedido, novoCodigo } from '../worker/pedidos'
import { agora, hashToken, novoToken } from '../worker/seguranca'

const HOST = 'livi.test'

/** uma peça visível de uma cor (c1) com o estoque de cada tamanho; devolve o id */
export async function criarPeca(estoque: Record<string, number>, slug = 'vestido-teste') {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO colecoes (slug, nome) VALUES ('teste', 'Teste') ON CONFLICT (slug) DO NOTHING`),
    env.DB.prepare(
      `INSERT INTO pecas (colecao_id, slug, nome, preco_centavos, cores, tamanhos)
       SELECT id, ?1, 'Vestido Teste', 10000, ?2, ?3 FROM colecoes WHERE slug = 'teste'`,
    ).bind(slug, JSON.stringify([{ id: 'c1', nome: 'Preto', hex: '#000000' }]), JSON.stringify(Object.keys(estoque))),
    ...Object.entries(estoque).map(([tamanho, quantidade]) =>
      env.DB.prepare(`INSERT INTO estoque (peca_id, cor, tamanho, quantidade) SELECT id, 'c1', ?2, ?3 FROM pecas WHERE slug = ?1`).bind(
        slug,
        tamanho,
        quantidade,
      ),
    ),
  ])
  return (await env.DB.prepare('SELECT id FROM pecas WHERE slug = ?1').bind(slug).first<number>('id'))!
}

/** uma compra do site esperando pagamento; minutos negativos = reserva já vencida. Devolve o código */
export async function reservar(pecaId: number, tamanho: string, quantidade: number, minutos = 30) {
  const codigo = novoCodigo()
  await gravarPedido(
    env.DB,
    {
      codigo,
      origem: 'site',
      reservaAte: agora() + minutos * 60,
      nome: 'Cliente Teste',
      whatsapp: '5582999999999',
      email: 'cliente@exemplo.com',
      cpf: '',
      entrega: 'maceio',
      cep: '57000000',
      rua: 'Rua Teste',
      numero: '1',
      complemento: '',
      bairro: 'Centro',
      cidade: 'Maceió',
      uf: 'AL',
      freteCentavos: 1500,
      pagamento: '',
      observacao: '',
    },
    [{ pecaId, cor: 'c1', tamanho, quantidade, precoCentavos: 10000, sobEncomenda: false, nome: 'Vestido Teste', corNome: 'Preto', colecaoNome: 'Teste', foto: '' }],
  )
  return codigo
}

export const estoqueDe = async (pecaId: number, tamanho: string) =>
  env.DB.prepare(`SELECT quantidade FROM estoque WHERE peca_id = ?1 AND cor = 'c1' AND tamanho = ?2`).bind(pecaId, tamanho).first<number>('quantidade')

export const pedido = (codigo: string) =>
  env.DB.prepare('SELECT id, situacao, estoque_baixado FROM pedidos WHERE codigo = ?1').bind(codigo).first<{ id: number; situacao: string; estoque_baixado: number }>()

/** abre uma sessão do painel direto no banco e devolve o token do cookie */
export async function entrar() {
  const token = novoToken()
  // um e-mail por sessão: o mesmo teste pode entrar mais de uma vez
  const admin = await env.DB.prepare(`INSERT INTO admins (email, nome, senha) VALUES (?1, 'Livia', 'x') RETURNING id`)
    .bind(`livia-${token.slice(0, 8)}@exemplo.com`)
    .first<number>('id')
  await env.DB.prepare('INSERT INTO sessoes (token_hash, admin_id, expira_em) VALUES (?1, ?2, ?3)').bind(await hashToken(token), admin, agora() + 3600).run()
  return token
}

/** chama a API do painel como o próprio painel chamaria (mesma origem, cookie da sessão) */
export async function painel(token: string, metodo: string, caminho: string, corpo?: unknown) {
  const ctx = createExecutionContext()
  const resposta = await app.fetch(
    new Request(`https://${HOST}/api/painel${caminho}`, {
      method: metodo,
      headers: {
        Host: HOST,
        Origin: `https://${HOST}`,
        Cookie: `livi_sessao=${token}`,
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    }),
    env,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return resposta
}

/** chama a API pública em localhost, onde TESTE_VENDAS deixa comprar com as vendas desligadas; ip = o que a Cloudflare mandaria */
async function publica(metodo: string, caminho: string, corpo?: unknown, ip?: string) {
  const ctx = createExecutionContext()
  const resposta = await app.fetch(
    new Request(`http://localhost${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(ip ? { 'CF-Connecting-IP': ip } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    }),
    env,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return resposta
}

/** chama a API de compras como o site chamaria */
export const site = (metodo: string, caminho: string, corpo?: unknown, ip?: string) => publica(metodo, `/api/pedidos${caminho}`, corpo, ip)

/** manda o aviso (webhook) que a InfinitePay manda quando aprova um pagamento */
export const aviso = (corpo: unknown) => publica('POST', '/api/pagamento/aviso', corpo)

type EstoquePainel = { cor: string; tamanho: string; quantidade: number; reservado: number }

/**
  Abre a peça no painel, muda o que precisar e salva, como a tela da peça faz:
  cada linha de estoque vai com a quantidade nova e a de quando a peça abriu ("antes").
*/
export async function salvarPeca(
  token: string,
  pecaId: number,
  mudar: (peca: { tamanhos: string[]; estoque: (EstoquePainel & { antes?: number | null })[] }) => void,
) {
  const peca = (await (await painel(token, 'GET', `/pecas/${pecaId}`)).json()) as Record<string, unknown> & {
    tamanhos: string[]
    estoque: (EstoquePainel & { antes?: number | null })[]
  }
  peca.estoque = peca.estoque.map((e) => ({ ...e, antes: e.quantidade }))
  mudar(peca)
  return painel(token, 'PUT', `/pecas/${pecaId}`, peca)
}
