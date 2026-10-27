import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LIMITE_VISIVEL, limparCacheCatalogo } from '../worker/catalogo'
import { chamar, criarPeca, entrar, loja, reservar, salvarPeca } from './ajuda'

type PecaSite = Record<string, unknown> & { slug: string; nome: string; preco: number; disponivel: Record<string, number>; esgotados: string[] }
type Loja = { colecoes: { slug: string; pecas: PecaSite[] }[]; ajustes: Record<string, unknown> }

const ambiente = env as unknown as Record<string, unknown>

async function lerDoSite(): Promise<Loja> {
  const r = await loja()
  expect(r.status).toBe(200)
  return r.json()
}
const pecaDoSite = (l: Loja, slug = 'vestido-teste') => l.colecoes.flatMap((c) => c.pecas).find((p) => p.slug === slug)

/** um "site publicado" de mentira no lugar dos arquivos do build */
const assetsFalsos = {
  fetch: async () =>
    new Response('<!doctype html><html><head><title>Livi</title></head><body></body></html>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"build"' },
    }),
}

// o catálogo fica guardado por alguns segundos: cada teste começa sem ele
beforeEach(() => limparCacheCatalogo())

describe('catálogo do site (/api/loja)', () => {
  it('mostra só peças e coleções visíveis; coleção sem peça visível fica de fora', async () => {
    const peca = await criarPeca({ M: 1 })
    expect(pecaDoSite(await lerDoSite())).toBeDefined()

    await env.DB.prepare('UPDATE pecas SET visivel = 0 WHERE id = ?1').bind(peca).run()
    limparCacheCatalogo()
    const semPeca = await lerDoSite()
    expect(pecaDoSite(semPeca)).toBeUndefined()
    expect(semPeca.colecoes.map((c) => c.slug)).not.toContain('teste')

    await env.DB.prepare('UPDATE pecas SET visivel = 1 WHERE id = ?1').bind(peca).run()
    await env.DB.prepare(`UPDATE colecoes SET visivel = 0 WHERE slug = 'teste'`).run()
    limparCacheCatalogo()
    expect(pecaDoSite(await lerDoSite())).toBeUndefined()
  })

  it(`o disponível desconta as reservas, para em ${LIMITE_VISIVEL} e marca o esgotado`, async () => {
    const peca = await criarPeca({ P: 0, M: 3, G: 50 })
    const p = pecaDoSite(await lerDoSite())!
    expect(p.disponivel).toEqual({ 'Preto|P': 0, 'Preto|M': 3, 'Preto|G': LIMITE_VISIVEL })
    expect(p.esgotados).toEqual(['Preto|P'])

    await reservar(peca, 'M', 2)
    limparCacheCatalogo()
    expect(pecaDoSite(await lerDoSite())!.disponivel['Preto|M']).toBe(1)

    // reserva vencida não segura nada
    await reservar(peca, 'M', 1, -1)
    limparCacheCatalogo()
    expect(pecaDoSite(await lerDoSite())!.disponivel['Preto|M']).toBe(1)
  })

  it('peça sob encomenda aparece sempre com o limite, mesmo sem estoque', async () => {
    const peca = await criarPeca({ M: 0 })
    await env.DB.prepare(`UPDATE pecas SET sob_encomenda = 1, prazo_encomenda = '15 dias' WHERE id = ?1`).bind(peca).run()
    const p = pecaDoSite(await lerDoSite())!
    expect(p).toMatchObject({ sobEncomenda: true, prazo: '15 dias', esgotados: [] })
    expect(p.disponivel['Preto|M']).toBe(LIMITE_VISIVEL)
  })

  it('a peça vai com o preço em reais e sem os números internos (id, id da cor, estoque real)', async () => {
    await criarPeca({ M: 7 })
    const p = pecaDoSite(await lerDoSite())!
    expect(p.preco).toBe(100)
    expect(Object.keys(p).sort()).toEqual(
      ['cores', 'descricao', 'disponivel', 'esgotados', 'fotos', 'modelo', 'nome', 'prazo', 'preco', 'slug', 'sobEncomenda', 'tamanhos', 'tecido'].sort(),
    )
    expect(p.cores).toEqual([{ nome: 'Preto', hex: '#000000' }])
  })

  it('o que muda no painel aparece no site na hora', async () => {
    const peca = await criarPeca({ M: 1 })
    expect(pecaDoSite(await lerDoSite())!.preco).toBe(100)
    const token = await entrar()
    expect((await salvarPeca(token, peca, (p) => void Object.assign(p, { precoCentavos: 25_000 }))).status).toBe(200)
    expect(pecaDoSite(await lerDoSite())!.preco).toBe(250)
  })

  it('os ajustes que o site recebe são só os públicos; os dados da loja só quando completos', async () => {
    const { ajustes } = await lerDoSite()
    expect(Object.keys(ajustes).sort()).toEqual(
      ['correios', 'freteTroca', 'loja', 'parcelas', 'taxaMaceioCentavos', 'trocaDias', 'vendasOnline', 'whatsapp'].sort(),
    )
    expect(ajustes.loja).toBeNull()
  })

  it('qualquer site pode ler o catálogo, e nada da API fica guardado em cache', async () => {
    const r = await loja()
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(r.headers.get('Cache-Control')).toBe('no-store')
  })

  it('a rota antiga /api/catalogo devolve as mesmas coleções', async () => {
    await criarPeca({ M: 1 })
    const antiga = (await (await chamar('http://localhost/api/catalogo')).json()) as Loja['colecoes']
    expect(antiga.map((c) => c.slug)).toEqual((await lerDoSite()).colecoes.map((c) => c.slug))
  })

  it('endereço desconhecido da API, ou com o método errado: 404 em JSON', async () => {
    for (const [metodo, caminho] of [
      ['GET', '/api/nao-existe'],
      ['GET', '/api/pagamento/aviso'],
      ['DELETE', '/api/loja'],
      ['PUT', '/api/pedidos'],
    ]) {
      const r = await chamar(`http://localhost${caminho}`, { method: metodo })
      expect(r.status, `${metodo} ${caminho}`).toBe(404)
      expect(await r.json()).toEqual({ erro: 'Endereço não encontrado.' })
    }
  })
})

describe('páginas servidas pelo Worker', () => {
  const original = { SITE_PUBLICO: env.SITE_PUBLICO, ASSETS: env.ASSETS }
  afterEach(() => {
    ambiente.SITE_PUBLICO = original.SITE_PUBLICO
    ambiente.ASSETS = original.ASSETS
  })

  it('com o site no GitHub Pages, o endereço do Worker leva para lá, com o mesmo caminho', async () => {
    // fixo aqui: o .dev.vars do PC esvazia o SITE_PUBLICO para o Worker mostrar o site
    ambiente.SITE_PUBLICO = 'https://yan791.github.io/livibylm/'
    const r = await chamar('http://localhost/colecao/velvet?de=instagram', { redirect: 'manual' })
    expect(r.status).toBe(302)
    expect(r.headers.get('Location')).toBe('https://yan791.github.io/livibylm/colecao/velvet?de=instagram')
  })

  it('com domínio próprio (sem SITE_PUBLICO), o catálogo vai dentro do HTML sem abrir brecha para script', async () => {
    ambiente.SITE_PUBLICO = ''
    ambiente.ASSETS = assetsFalsos
    await criarPeca({ M: 1 })
    const ataque = '</script><script>alert(1)</script>'
    await env.DB.prepare(`UPDATE pecas SET nome = ?1 WHERE slug = 'vestido-teste'`).bind(ataque).run()
    limparCacheCatalogo()

    const r = await chamar('http://localhost/')
    const html = await r.text()
    expect(r.headers.get('Cache-Control')).toBe('no-cache')
    expect(r.headers.get('ETag')).toBeNull()
    const json = /<script id="livi-loja" type="application\/json">(.*?)<\/script>/s.exec(html)?.[1] ?? ''
    expect(json).not.toContain('<')
    expect(html).not.toContain('<script>alert(1)')
    const dados = JSON.parse(json) as Loja
    expect(pecaDoSite(dados)?.nome).toBe(ataque)
  })

  it('o painel abre com proteção contra moldura, robôs e cache', async () => {
    ambiente.ASSETS = assetsFalsos
    for (const caminho of ['/painel', '/painel/pedidos', '/painel/convite/abc']) {
      const r = await chamar(`http://localhost${caminho}`)
      expect(r.status, caminho).toBe(200)
      expect(r.headers.get('X-Frame-Options')).toBe('DENY')
      expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
      expect(r.headers.get('Referrer-Policy')).toBe('same-origin')
      expect(r.headers.get('Cache-Control')).toBe('no-cache')
    }
  })
})
