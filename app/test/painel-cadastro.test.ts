import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { limparCacheCatalogo } from '../worker/catalogo'
import { criarPeca, entrar, loja, painel, salvarPeca } from './ajuda'

type Colecao = { id: number; slug: string; nome: string; visivel: boolean; ordem: number; pecas: number }

async function novaColecao(token: string, corpo: Record<string, unknown> = {}) {
  const r = await painel(token, 'POST', '/colecoes', { nome: 'Coleção Nova', fundo: '#4f0f10', ...corpo })
  expect(r.status).toBe(201)
  return (await r.json()) as Colecao
}

/** o que a tela da peça manda ao salvar uma peça nova */
const pecaNova = (colecaoId: number, mudar: Record<string, unknown> = {}) => ({
  colecaoId,
  nome: 'Saia Nova',
  precoCentavos: 18_990,
  descricao: 'Saia midi.',
  tecido: 'Crepe',
  cores: [
    { id: 'c1', nome: 'Vinho', hex: '#4f0f10' },
    { id: 'c2', nome: 'Creme', hex: '#F4EFEA' },
  ],
  tamanhos: ['P', 'M'],
  fotos: [],
  estoque: [
    { cor: 'c1', tamanho: 'P', quantidade: 2 },
    { cor: 'c2', tamanho: 'M', quantidade: 5 },
  ],
  modeloAltura: '1,70 m',
  modeloVeste: 'P',
  sobEncomenda: false,
  prazoEncomenda: '',
  visivel: true,
  ...mudar,
})

describe('coleções no painel', () => {
  it('cria com o endereço tirado do nome, sem repetir', async () => {
    const token = await entrar()
    expect((await novaColecao(token, { nome: 'Verão Ç 2026!' })).slug).toBe('verao-c-2026')
    expect((await novaColecao(token, { nome: 'Verão Ç 2026!' })).slug).toBe('verao-c-2026-2')
    expect((await novaColecao(token, { nome: '!!!' })).slug).toBe('item')
  })

  it('recusa coleção mal preenchida', async () => {
    const token = await entrar()
    for (const ruim of [
      { nome: '' },
      { nome: 'x'.repeat(61) },
      { fundo: 'vermelho' },
      { fundo: '#12345' },
      { capa: '/etc/passwd' },
      { capa: '/img/../segredo.webp' },
      { capa: 'https://outro-site.example/foto.webp' },
      { descricao: 'x'.repeat(601) },
    ]) {
      const r = await painel(token, 'POST', '/colecoes', { nome: 'Coleção', fundo: '#4f0f10', ...ruim })
      expect(r.status, JSON.stringify(ruim)).toBe(400)
    }
  })

  it('edita, esconde e muda a ordem; coleção que não existe dá 404', async () => {
    const token = await entrar()
    const a = await novaColecao(token, { nome: 'A' })
    const b = await novaColecao(token, { nome: 'B' })
    expect((await painel(token, 'PUT', `/colecoes/${a.id}`, { nome: 'A editada', fundo: '#000000', visivel: false })).status).toBe(200)
    expect((await painel(token, 'POST', '/colecoes/ordem', { ids: [b.id, a.id] })).status).toBe(200)
    const lista = (await (await painel(token, 'GET', '/colecoes')).json()) as Colecao[]
    const [primeira, segunda] = lista.filter((c) => [a.id, b.id].includes(c.id))
    expect(primeira).toMatchObject({ id: b.id })
    expect(segunda).toMatchObject({ id: a.id, nome: 'A editada', visivel: false })
    expect((await painel(token, 'PUT', '/colecoes/999999', { nome: 'X', fundo: '#000000' })).status).toBe(404)
    expect((await painel(token, 'POST', '/colecoes/ordem', { ids: ['um', 'dois'] })).status).toBe(400)
  })

  it('não apaga coleção que ainda tem peças; a vazia apaga', async () => {
    const token = await entrar()
    await criarPeca({ M: 1 })
    const comPeca = (await (await painel(token, 'GET', '/colecoes')).json()) as Colecao[]
    const teste = comPeca.find((c) => c.slug === 'teste')!
    expect(teste.pecas).toBe(1)
    expect((await painel(token, 'DELETE', `/colecoes/${teste.id}`)).status).toBe(409)
    const vazia = await novaColecao(token)
    expect((await painel(token, 'DELETE', `/colecoes/${vazia.id}`)).status).toBe(200)
    expect((await painel(token, 'DELETE', `/colecoes/${vazia.id}`)).status).toBe(404)
  })
})

describe('peças no painel', () => {
  it('cadastra a peça com o estoque de cada cor e tamanho, e ela aparece no site', async () => {
    const token = await entrar()
    const colecao = await novaColecao(token)
    const r = await painel(token, 'POST', '/pecas', pecaNova(colecao.id))
    expect(r.status).toBe(201)
    const { id, slug } = (await r.json()) as { id: number; slug: string }
    expect(slug).toBe('saia-nova')

    const peca = (await (await painel(token, 'GET', `/pecas/${id}`)).json()) as { estoque: { cor: string; tamanho: string; quantidade: number }[]; cores: { hex: string }[] }
    expect(peca.estoque).toEqual(
      expect.arrayContaining([
        { cor: 'c1', tamanho: 'P', quantidade: 2, reservado: 0 },
        { cor: 'c1', tamanho: 'M', quantidade: 0, reservado: 0 },
        { cor: 'c2', tamanho: 'P', quantidade: 0, reservado: 0 },
        { cor: 'c2', tamanho: 'M', quantidade: 5, reservado: 0 },
      ]),
    )
    expect(peca.cores[1].hex).toBe('#f4efea')

    limparCacheCatalogo()
    const site = (await (await loja()).json()) as { colecoes: { pecas: { slug: string; preco: number; disponivel: Record<string, number> }[] }[] }
    const noSite = site.colecoes.flatMap((c) => c.pecas).find((p) => p.slug === 'saia-nova')
    expect(noSite).toMatchObject({ preco: 189.9, disponivel: { 'Vinho|P': 2, 'Vinho|M': 0, 'Creme|P': 0, 'Creme|M': 5 } })
  })

  it('o mesmo nome ganha outro endereço', async () => {
    const token = await entrar()
    const colecao = await novaColecao(token)
    await painel(token, 'POST', '/pecas', pecaNova(colecao.id))
    const r = await painel(token, 'POST', '/pecas', pecaNova(colecao.id))
    expect(((await r.json()) as { slug: string }).slug).toBe('saia-nova-2')
  })

  it('recusa peça mal preenchida, sem gravar nada', async () => {
    const token = await entrar()
    const colecao = await novaColecao(token)
    const antes = await env.DB.prepare('SELECT COUNT(*) AS n FROM pecas').first<number>('n')
    const ruins: [string, Record<string, unknown>][] = [
      ['sem cor', { cores: [] }],
      ['cor com hex errado', { cores: [{ id: 'c1', nome: 'Vinho', hex: 'vinho' }] }],
      ['cor com id estranho', { cores: [{ id: 'C 1!', nome: 'Vinho', hex: '#4f0f10' }] }],
      ['cor repetida', { cores: [{ id: 'c1', nome: 'A', hex: '#000000' }, { id: 'c1', nome: 'B', hex: '#ffffff' }] }],
      ['nome de cor repetido', { cores: [{ id: 'c1', nome: 'Preto', hex: '#000000' }, { id: 'c2', nome: 'preto', hex: '#111111' }] }],
      ['13 cores', { cores: Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, nome: `Cor ${i}`, hex: '#000000' })) }],
      ['sem tamanho', { tamanhos: [] }],
      ['tamanho repetido', { tamanhos: ['M', 'm'] }],
      ['11 fotos', { fotos: Array.from({ length: 11 }, () => '/img/pecas/x.webp') }],
      ['foto de fora', { fotos: ['https://outro-site.example/x.webp'] }],
      ['foto subindo pasta', { fotos: ['/img/../../etc/passwd.webp'] }],
      ['preço zero', { precoCentavos: 0 }],
      ['preço negativo', { precoCentavos: -100 }],
      ['preço com centavo quebrado', { precoCentavos: 10.5 }],
      ['preço em texto', { precoCentavos: '189,90' }],
      ['coleção que não existe', { colecaoId: 999999 }],
      ['quantidade negativa', { estoque: [{ cor: 'c1', tamanho: 'P', quantidade: -1 }] }],
      ['quantidade enorme', { estoque: [{ cor: 'c1', tamanho: 'P', quantidade: 10_000 }] }],
      ['nome vazio', { nome: '  ' }],
      ['nome enorme', { nome: 'x'.repeat(121) }],
    ]
    for (const [caso, mudar] of ruins) expect((await painel(token, 'POST', '/pecas', pecaNova(colecao.id, mudar))).status, caso).toBe(400)
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM pecas').first<number>('n')).toBe(antes)
  })

  it('tirar um tamanho da peça apaga o estoque dele; trocar de coleção leva a peça para o fim', async () => {
    const token = await entrar()
    const a = await novaColecao(token, { nome: 'A' })
    const b = await novaColecao(token, { nome: 'B' })
    await painel(token, 'POST', '/pecas', pecaNova(b.id, { nome: 'Já em B' }))
    const { id } = (await (await painel(token, 'POST', '/pecas', pecaNova(a.id))).json()) as { id: number }

    const r = await salvarPeca(token, id, (p) => {
      p.tamanhos = ['P']
      p.estoque = p.estoque.filter((e) => e.tamanho === 'P')
      Object.assign(p, { colecaoId: b.id })
    })
    expect(r.status).toBe(200)
    const linhas = await env.DB.prepare('SELECT tamanho FROM estoque WHERE peca_id = ?1').bind(id).all<{ tamanho: string }>()
    expect(linhas.results.map((l) => l.tamanho)).toEqual(['P', 'P'])
    const ordem = await env.DB.prepare('SELECT nome, ordem FROM pecas WHERE colecao_id = ?1 ORDER BY ordem').bind(b.id).all<{ nome: string }>()
    expect(ordem.results.map((p) => p.nome)).toEqual(['Já em B', 'Saia Nova'])
  })

  it('apagar a peça tira do site; a que não existe dá 404', async () => {
    const token = await entrar()
    const peca = await criarPeca({ M: 1 })
    expect((await painel(token, 'DELETE', `/pecas/${peca}`)).status).toBe(200)
    limparCacheCatalogo()
    expect(JSON.stringify(await (await loja()).json())).not.toContain('vestido-teste')
    expect((await painel(token, 'DELETE', `/pecas/${peca}`)).status).toBe(404)
    expect((await painel(token, 'GET', `/pecas/${peca}`)).status).toBe(404)
    expect((await painel(token, 'PUT', `/pecas/${peca}`, pecaNova(1))).status).toBe(404)
  })

  it('muda a ordem das peças', async () => {
    const token = await entrar()
    const colecao = await novaColecao(token)
    const um = ((await (await painel(token, 'POST', '/pecas', pecaNova(colecao.id, { nome: 'Um' }))).json()) as { id: number }).id
    const dois = ((await (await painel(token, 'POST', '/pecas', pecaNova(colecao.id, { nome: 'Dois' }))).json()) as { id: number }).id
    expect((await painel(token, 'POST', '/pecas/ordem', { ids: [dois, um] })).status).toBe(200)
    const lista = (await (await painel(token, 'GET', '/pecas')).json()) as { id: number }[]
    const ids = lista.map((p) => p.id).filter((x) => x === um || x === dois)
    expect(ids).toEqual([dois, um])
  })

  it('a lista do painel soma o estoque e conta as combinações zeradas', async () => {
    const token = await entrar()
    const colecao = await novaColecao(token)
    const { id } = (await (await painel(token, 'POST', '/pecas', pecaNova(colecao.id))).json()) as { id: number }
    const lista = (await (await painel(token, 'GET', '/pecas')).json()) as { id: number; total: number; combinacoes: number; zeradas: number }[]
    expect(lista.find((p) => p.id === id)).toMatchObject({ total: 7, combinacoes: 4, zeradas: 2 })
  })
})

describe('ajustes da loja', () => {
  const ajustesBons = {
    vendasOnline: false,
    taxaMaceioCentavos: 1500,
    parcelasSemJuros: 3,
    whatsapp: '(82) 99811-5324',
    freteCorreios: {},
    loja: { nome: 'Livia Teste', documento: '529.982.247-25', endereco: 'Rua A, 1, Maceió', email: 'loja@exemplo.com' },
    trocaDias: 7,
    freteTroca: 'dividido',
  }

  it('guarda e devolve os ajustes', async () => {
    const token = await entrar()
    expect((await painel(token, 'PUT', '/ajustes', ajustesBons)).status).toBe(200)
    expect(await (await painel(token, 'GET', '/ajustes')).json()).toMatchObject({
      taxaMaceioCentavos: 1500,
      parcelasSemJuros: 3,
      whatsapp: '5582998115324',
      trocaDias: 7,
      freteTroca: 'dividido',
      loja: { documento: '52998224725' },
    })
  })

  it('recusa ajustes fora do lugar, sem mudar o que estava salvo', async () => {
    const token = await entrar()
    await painel(token, 'PUT', '/ajustes', ajustesBons)
    const ruins: [string, Record<string, unknown>][] = [
      ['WhatsApp curto', { whatsapp: '123' }],
      ['WhatsApp vazio', { whatsapp: '' }],
      ['taxa negativa', { taxaMaceioCentavos: -1 }],
      ['taxa enorme', { taxaMaceioCentavos: 100_001 }],
      ['taxa quebrada', { taxaMaceioCentavos: 15.5 }],
      ['zero parcelas', { parcelasSemJuros: 0 }],
      ['13 parcelas', { parcelasSemJuros: 13 }],
      ['troca em 6 dias (menos que a lei)', { trocaDias: 6 }],
      ['troca em 91 dias', { trocaDias: 91 }],
      ['frete da troca inventado', { freteTroca: 'metade' }],
      ['CPF que não confere', { loja: { ...ajustesBons.loja, documento: '111.111.111-11' } }],
      ['e-mail da loja errado', { loja: { ...ajustesBons.loja, email: 'loja@' } }],
      ['frete negativo', { freteCorreios: { nordeste: { pac: -5 } } }],
    ]
    for (const [caso, mudar] of ruins) expect((await painel(token, 'PUT', '/ajustes', { ...ajustesBons, ...mudar })).status, caso).toBe(400)
    expect(await (await painel(token, 'GET', '/ajustes')).json()).toMatchObject({ taxaMaceioCentavos: 1500, parcelasSemJuros: 3, trocaDias: 7 })
  })
})
