/*
  O que o site recebe ao abrir: o catálogo (só coleções e peças visíveis, no
  formato que o site já usava em src/dados/colecoes.ts) e os ajustes públicos
  da loja (WhatsApp e parcelamento). O disponível de cada combinação é o
  estoque menos o que está reservado em compras esperando pagamento,
  limitado a 10 (o site só precisa saber se tem, se é a última e até quanto
  a sacola deixa levar), nunca a quantidade real.

  Cache: cada servidor da Cloudflare guarda isso por alguns segundos, e
  muitas visitas seguidas viram uma consulta só ao banco. Qualquer alteração
  feita pelo painel limpa o cache daquele servidor; nos outros, a mudança
  aparece em até CACHE_MS.
*/
import type { CorPeca, LinhaColecao, LinhaEstoque, LinhaPeca } from './tipos'
import { ajustesPublicos, consultaAjustes, deLinha } from './ajustes'
import { chaveVariante, consultaReservas, mapaReservas, type LinhaReserva } from './reservas'

/** o máximo que o site enxerga de uma combinação (e que a sacola deixa levar) */
export const LIMITE_VISIVEL = 10
const CACHE_MS = 10_000

type Loja = Awaited<ReturnType<typeof consultar>>
let guardado: { dados: Loja; ate: number } | null = null

export async function lerLoja(db: D1Database) {
  if (guardado && guardado.ate > Date.now()) return guardado.dados
  const dados = await consultar(db)
  guardado = { dados, ate: Date.now() + CACHE_MS }
  return dados
}

export const limparCacheCatalogo = () => {
  guardado = null
}

async function consultar(db: D1Database) {
  const [colecoes, pecas, estoque, ajustes, reservas] = await db.batch([
    db.prepare('SELECT * FROM colecoes WHERE visivel = 1 ORDER BY ordem, id'),
    db.prepare('SELECT * FROM pecas WHERE visivel = 1 ORDER BY ordem, id'),
    db.prepare('SELECT e.* FROM estoque e JOIN pecas p ON p.id = e.peca_id WHERE p.visivel = 1'),
    consultaAjustes(db),
    consultaReservas(db),
  ])
  const linhasEstoque = estoque.results as LinhaEstoque[]
  const seguras = mapaReservas(reservas.results as LinhaReserva[])

  return {
    colecoes: montarColecoes(colecoes.results as LinhaColecao[], pecas.results as LinhaPeca[], linhasEstoque, seguras),
    ajustes: ajustesPublicos(deLinha((ajustes.results as { valor: string }[])[0]?.valor)),
  }
}

function montarColecoes(colecoes: LinhaColecao[], pecas: LinhaPeca[], linhasEstoque: LinhaEstoque[], seguras: Map<string, number>) {
  return colecoes
    .map((c) => {
      const daColecao = pecas.filter((p) => p.colecao_id === c.id).map((p) => pecaPublica(p, linhasEstoque, seguras))
      return {
        slug: c.slug,
        nome: c.nome,
        numero: c.numero,
        fundo: c.fundo,
        tema: c.tema,
        clima: c.clima,
        descricao: c.descricao,
        capa: c.capa ?? daColecao.find((p) => p.fotos[0])?.fotos[0] ?? '',
        proporcao: c.capa ? c.capa_proporcao : 0.68,
        pecas: daColecao,
      }
    })
    // coleção sem peça visível fica fora do site até ganhar a primeira
    .filter((c) => c.pecas.length > 0)
}

function pecaPublica(p: LinhaPeca, estoque: LinhaEstoque[], seguras: Map<string, number>) {
  const cores = JSON.parse(p.cores) as CorPeca[]
  const tamanhos = JSON.parse(p.tamanhos) as string[]
  const quantidade = (cor: string, tamanho: string) =>
    (estoque.find((e) => e.peca_id === p.id && e.cor === cor && e.tamanho === tamanho)?.quantidade ?? 0) -
    (seguras.get(chaveVariante(p.id, cor, tamanho)) ?? 0)
  /** "Cor|Tamanho" -> quantas a cliente pode levar (sob encomenda: sempre o limite) */
  const disponivel: Record<string, number> = {}
  for (const cor of cores)
    for (const t of tamanhos)
      disponivel[`${cor.nome}|${t}`] = p.sob_encomenda ? LIMITE_VISIVEL : Math.min(LIMITE_VISIVEL, Math.max(0, quantidade(cor.id, t)))
  return {
    slug: p.slug,
    nome: p.nome,
    preco: p.preco_centavos / 100,
    descricao: p.descricao,
    tecido: p.tecido,
    cores: cores.map(({ nome, hex }) => ({ nome, hex })),
    tamanhos,
    fotos: JSON.parse(p.fotos) as string[],
    modelo: { altura: p.modelo_altura, veste: p.modelo_veste },
    disponivel,
    esgotados: Object.keys(disponivel).filter((k) => disponivel[k] <= 0),
    sobEncomenda: p.sob_encomenda === 1,
    prazo: p.prazo_encomenda,
  }
}
