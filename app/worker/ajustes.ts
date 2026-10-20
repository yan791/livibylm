/*
  Ajustes da loja (tela "Ajustes" do painel). Ficam numa linha só da tabela
  configuracoes (chave 'ajustes', valor em JSON); o que ainda não foi salvo
  usa o PADRAO daqui.
*/

/** pagamento pelo site (InfinitePay). Enquanto for false, as vendas pelo site não ligam e a sacola segue pelo WhatsApp */
export const PAGAMENTO_PRONTO = false

export type Ajustes = {
  vendasOnline: boolean
  taxaMaceioCentavos: number
  /** 1 = sem parcelamento */
  parcelasSemJuros: number
  /** 55 + DDD + número, só dígitos */
  whatsapp: string
}

export const PADRAO: Ajustes = {
  vendasOnline: false,
  taxaMaceioCentavos: 1500,
  parcelasSemJuros: 3,
  whatsapp: '5582998115324',
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
  return {
    vendasOnline: PAGAMENTO_PRONTO && v.vendasOnline === true,
    taxaMaceioCentavos: typeof v.taxaMaceioCentavos === 'number' ? v.taxaMaceioCentavos : PADRAO.taxaMaceioCentavos,
    parcelasSemJuros: typeof v.parcelasSemJuros === 'number' ? v.parcelasSemJuros : PADRAO.parcelasSemJuros,
    whatsapp: typeof v.whatsapp === 'string' && v.whatsapp ? v.whatsapp : PADRAO.whatsapp,
  }
}

export async function lerAjustes(db: D1Database) {
  return deLinha((await consultaAjustes(db).first<{ valor: string }>())?.valor)
}

export async function salvarAjustes(db: D1Database, a: Ajustes) {
  await db
    .prepare('INSERT INTO configuracoes (chave, valor) VALUES (?1, ?2) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor')
    .bind(CHAVE, JSON.stringify(a))
    .run()
}

/** só o que o site precisa saber */
export const ajustesPublicos = (a: Ajustes) => ({ whatsapp: a.whatsapp, parcelas: a.parcelasSemJuros })

/** "(82) 99811-5324", "82998115324" ou "+55 82 9..." viram 5582998115324; null se não parecer um celular com DDD */
export function numeroWhatsApp(texto: string) {
  let n = texto.replace(/\D/g, '')
  if (n.length === 10 || n.length === 11) n = '55' + n
  return /^55[1-9]\d{9,10}$/.test(n) ? n : null
}
