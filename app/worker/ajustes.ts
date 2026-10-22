/*
  Ajustes da loja (tela "Ajustes" do painel). Ficam numa linha só da tabela
  configuracoes (chave 'ajustes', valor em JSON); o que ainda não foi salvo
  usa o PADRAO daqui.
*/
import { TABELA_VAZIA, tabelaDe, type TabelaFrete } from './frete'
import { cnpjValido, cpfValido, EMAIL } from './validar'

/**
  Quem vende, como aparece no rodapé do site e nas páginas de trocas e de
  privacidade. A lei do comércio eletrônico (Decreto 7.962/2013) pede o nome, o
  CPF ou CNPJ e um endereço físico e eletrônico para contato.
*/
export type DadosLoja = {
  /** nome completo ou razão social */
  nome: string
  /** CPF ou CNPJ sem a pontuação (o CNPJ pode ter letras) */
  documento: string
  endereco: string
  email: string
}

/** quem paga o frete de uma troca (de tamanho, cor ou peça; desistência e defeito são sempre por conta da loja) */
export type FreteTroca = 'loja' | 'dividido' | 'cliente'
export const FRETES_TROCA: FreteTroca[] = ['loja', 'dividido', 'cliente']

export type Ajustes = {
  vendasOnline: boolean
  taxaMaceioCentavos: number
  /** 1 = sem parcelamento */
  parcelasSemJuros: number
  /** 55 + DDD + número, só dígitos */
  whatsapp: string
  /** PAC e SEDEX por região, para fora de Maceió (worker/frete.ts) */
  freteCorreios: TabelaFrete
  loja: DadosLoja
  /** dias, contados do recebimento, para pedir troca de tamanho, cor ou peça */
  trocaDias: number
  freteTroca: FreteTroca
}

export const PADRAO: Ajustes = {
  vendasOnline: false,
  taxaMaceioCentavos: 1500,
  parcelasSemJuros: 3,
  whatsapp: '5582998115324',
  freteCorreios: TABELA_VAZIA,
  loja: { nome: '', documento: '', endereco: '', email: '' },
  trocaDias: 7,
  freteTroca: 'dividido',
}

const CHAVE = 'ajustes'

export const consultaAjustes = (db: D1Database) => db.prepare('SELECT valor FROM configuracoes WHERE chave = ?1').bind(CHAVE)

/** o valor guardado no banco, completado com o PADRAO (e sem nada de tipo errado) */
export function deLinha(valor: string | null | undefined): Ajustes {
  let v: Partial<Record<keyof Ajustes, unknown>> = {}
  try {
    v = valor ? JSON.parse(valor) : {}
  } catch {
    /* fica o padrão */
  }
  const loja = lojaDe(v.loja)
  return {
    // sem os dados de quem vende, o site não vende (o painel também confere ao salvar, junto com a compra de teste)
    vendasOnline: v.vendasOnline === true && lojaCompleta(loja),
    taxaMaceioCentavos: typeof v.taxaMaceioCentavos === 'number' ? v.taxaMaceioCentavos : PADRAO.taxaMaceioCentavos,
    parcelasSemJuros: typeof v.parcelasSemJuros === 'number' ? v.parcelasSemJuros : PADRAO.parcelasSemJuros,
    whatsapp: typeof v.whatsapp === 'string' && v.whatsapp ? v.whatsapp : PADRAO.whatsapp,
    freteCorreios: tabelaDe(v.freteCorreios),
    loja,
    trocaDias: typeof v.trocaDias === 'number' && v.trocaDias >= 7 ? v.trocaDias : PADRAO.trocaDias,
    freteTroca: FRETES_TROCA.includes(v.freteTroca as FreteTroca) ? (v.freteTroca as FreteTroca) : PADRAO.freteTroca,
  }
}

function lojaDe(v: unknown): DadosLoja {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  const t = (x: unknown) => (typeof x === 'string' ? x : '')
  return { nome: t(o.nome), documento: t(o.documento), endereco: t(o.endereco), email: t(o.email) }
}

/** os dados da loja estão completos e certos (sem eles, as vendas pelo site não ligam) */
export const lojaCompleta = (l: DadosLoja) =>
  l.nome.length >= 3 && !!(cpfValido(l.documento) || cnpjValido(l.documento)) && l.endereco.length >= 5 && EMAIL.test(l.email)

/** "000.000.000-00" ou "00.000.000/0000-00" */
export const documentoTexto = (d: string) =>
  d.length === 11
    ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
    : d.replace(/^([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})(\d{2})$/, '$1.$2.$3/$4-$5')

export async function lerAjustes(db: D1Database) {
  return deLinha((await consultaAjustes(db).first<{ valor: string }>())?.valor)
}

export async function salvarAjustes(db: D1Database, a: Ajustes) {
  await db
    .prepare('INSERT INTO configuracoes (chave, valor) VALUES (?1, ?2) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor')
    .bind(CHAVE, JSON.stringify(a))
    .run()
}

/**
  Só o que o site precisa saber (o frete de cada CEP ele pergunta em /api/pedidos/frete).
  loja = null enquanto os dados não estiverem completos: o site ainda não mostra
  o rodapé com eles nem os links das páginas de trocas e de privacidade.
*/
export const ajustesPublicos = (a: Ajustes) => ({
  whatsapp: a.whatsapp,
  parcelas: a.parcelasSemJuros,
  vendasOnline: a.vendasOnline,
  taxaMaceioCentavos: a.taxaMaceioCentavos,
  /** há algum preço de PAC ou SEDEX na tabela */
  correios: Object.values(a.freteCorreios).some((r) => r.pac !== null || r.sedex !== null),
  loja: lojaCompleta(a.loja) ? { ...a.loja, documento: documentoTexto(a.loja.documento) } : null,
  trocaDias: a.trocaDias,
  freteTroca: a.freteTroca,
})

/**
  "(82) 99811-5324", "(082) 99811-5324", "82998115324" ou "+55 82 9..." viram 5582998115324;
  null se não parecer um celular (9 + 8 dígitos) ou fixo (8 dígitos) do Brasil com DDD
*/
export function numeroWhatsApp(texto: string) {
  // número de outro país (+1, 0044...) não serve
  if (/^\s*(\+|00)(?!\s*55)/.test(texto)) return null
  let n = texto.replace(/\D/g, '').replace(/^0+/, '')
  if (n.length === 10 || n.length === 11) n = '55' + n
  return /^55[1-9]{2}(9\d{8}|[2-8]\d{7})$/.test(n) ? n : null
}
