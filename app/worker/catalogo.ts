/*
  O catálogo que o site mostra: só coleções e peças visíveis, no formato que o
  site já usava em src/dados/colecoes.ts. O estoque não sai daqui em números,
  só a lista do que está esgotado ("Cor|Tamanho").
*/
import type { CorPeca, LinhaColecao, LinhaEstoque, LinhaPeca } from './tipos'

export async function lerCatalogo(db: D1Database) {
  const [colecoes, pecas, estoque] = await db.batch([
    db.prepare('SELECT * FROM colecoes WHERE visivel = 1 ORDER BY ordem, id'),
    db.prepare('SELECT * FROM pecas WHERE visivel = 1 ORDER BY ordem, id'),
    db.prepare('SELECT e.* FROM estoque e JOIN pecas p ON p.id = e.peca_id WHERE p.visivel = 1'),
  ])
  const linhasEstoque = estoque.results as LinhaEstoque[]

  return (colecoes.results as LinhaColecao[])
    .map((c) => {
      const daColecao = (pecas.results as LinhaPeca[]).filter((p) => p.colecao_id === c.id).map((p) => pecaPublica(p, linhasEstoque))
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

function pecaPublica(p: LinhaPeca, estoque: LinhaEstoque[]) {
  const cores = JSON.parse(p.cores) as CorPeca[]
  const tamanhos = JSON.parse(p.tamanhos) as string[]
  const quantidade = (cor: string, tamanho: string) =>
    estoque.find((e) => e.peca_id === p.id && e.cor === cor && e.tamanho === tamanho)?.quantidade ?? 0
  const esgotados = p.sob_encomenda
    ? []
    : cores.flatMap((cor) => tamanhos.filter((t) => quantidade(cor.id, t) <= 0).map((t) => `${cor.nome}|${t}`))
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
    esgotados,
    sobEncomenda: p.sob_encomenda === 1,
    prazo: p.prazo_encomenda,
  }
}
