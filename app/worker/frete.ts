/*
  Frete. Maceió tem uma taxa única (Ajustes). O resto do Brasil vai pelos
  Correios, PAC ou SEDEX, com um preço por região que a loja cadastra em
  Ajustes; a região sai do CEP. A loja posta ela mesma: o pedido pago aparece
  no painel com o endereço, e o rastreio entra quando ela marca como enviado.
  A tela de Ajustes do painel também usa este arquivo, então nada aqui depende do Worker.
*/

export const REGIOES = [
  { id: 'al', nome: 'Alagoas, fora de Maceió' },
  { id: 'nordeste', nome: 'Nordeste' },
  { id: 'norte', nome: 'Norte' },
  { id: 'centro-oeste', nome: 'Centro-Oeste' },
  { id: 'sudeste', nome: 'Sudeste' },
  { id: 'sul', nome: 'Sul' },
] as const

export type Regiao = (typeof REGIOES)[number]['id']
export type Servico = 'pac' | 'sedex'
export type TipoEntrega = 'maceio' | Servico

/** preço em centavos de cada serviço em cada região; null = não envia por esse serviço para lá */
export type TabelaFrete = Record<Regiao, Record<Servico, number | null>>

export const TABELA_VAZIA: TabelaFrete = Object.fromEntries(REGIOES.map((r) => [r.id, { pac: null, sedex: null }])) as TabelaFrete

export const NOME_ENTREGA: Record<TipoEntrega, string> = {
  maceio: 'Entrega em Maceió',
  pac: 'Correios PAC',
  sedex: 'Correios SEDEX',
}

export const ehTipoEntrega = (v: unknown): v is TipoEntrega => typeof v === 'string' && Object.hasOwn(NOME_ENTREGA, v)

/** CEPs de Maceió: 57000-000 a 57099-999 */
export const deMaceio = (cep: string) => cep >= '57000000' && cep <= '57099999'

// faixas de CEP de cada estado (os 5 primeiros dígitos), segundo os Correios
const FAIXAS: [number, number, string][] = [
  [1000, 19999, 'SP'],
  [20000, 28999, 'RJ'],
  [29000, 29999, 'ES'],
  [30000, 39999, 'MG'],
  [40000, 48999, 'BA'],
  [49000, 49999, 'SE'],
  [50000, 56999, 'PE'],
  [57000, 57999, 'AL'],
  [58000, 58999, 'PB'],
  [59000, 59999, 'RN'],
  [60000, 63999, 'CE'],
  [64000, 64999, 'PI'],
  [65000, 65999, 'MA'],
  [66000, 68899, 'PA'],
  [68900, 68999, 'AP'],
  [69000, 69299, 'AM'],
  [69300, 69399, 'RR'],
  [69400, 69899, 'AM'],
  [69900, 69999, 'AC'],
  [70000, 72799, 'DF'],
  [72800, 72999, 'GO'],
  [73000, 73699, 'DF'],
  [73700, 76799, 'GO'],
  [76800, 76999, 'RO'],
  [77000, 77999, 'TO'],
  [78000, 78899, 'MT'],
  [79000, 79999, 'MS'],
  [80000, 87999, 'PR'],
  [88000, 89999, 'SC'],
  [90000, 99999, 'RS'],
]

const REGIAO_DA_UF: Record<string, Exclude<Regiao, 'al'>> = {
  AC: 'norte', AP: 'norte', AM: 'norte', PA: 'norte', RO: 'norte', RR: 'norte', TO: 'norte',
  AL: 'nordeste', BA: 'nordeste', CE: 'nordeste', MA: 'nordeste', PB: 'nordeste', PE: 'nordeste', PI: 'nordeste', RN: 'nordeste', SE: 'nordeste',
  DF: 'centro-oeste', GO: 'centro-oeste', MT: 'centro-oeste', MS: 'centro-oeste',
  ES: 'sudeste', MG: 'sudeste', RJ: 'sudeste', SP: 'sudeste',
  PR: 'sul', RS: 'sul', SC: 'sul',
}

/** estados de cada região, como aparecem na tela de Ajustes */
export const ESTADOS_DA_REGIAO = Object.fromEntries(
  REGIOES.map(({ id }) => [
    id,
    id === 'al'
      ? 'AL'
      : Object.keys(REGIAO_DA_UF)
          .filter((uf) => REGIAO_DA_UF[uf] === id && uf !== 'AL')
          .join(', '),
  ]),
) as Record<Regiao, string>

/** estado de um CEP de 8 dígitos; null se ele não cair em nenhuma faixa */
export function ufDoCep(cep: string) {
  if (!/^\d{8}$/.test(cep)) return null
  const n = Number(cep.slice(0, 5))
  return FAIXAS.find(([de, ate]) => n >= de && n <= ate)?.[2] ?? null
}

/** região da tabela de frete; Alagoas fora de Maceió tem a sua, e Maceió não entra (tem taxa própria) */
export function regiaoDoCep(cep: string): Regiao | null {
  const uf = ufDoCep(cep)
  if (!uf || deMaceio(cep)) return null
  return uf === 'AL' ? 'al' : REGIAO_DA_UF[uf]
}

export type OpcaoEntrega = { tipo: TipoEntrega; nome: string; centavos: number }

/** o que a cliente pode escolher para esse CEP, com o preço; vazio se a loja não entrega lá */
export function opcoesDeEntrega(cep: string, taxaMaceioCentavos: number, tabela: TabelaFrete): OpcaoEntrega[] {
  if (deMaceio(cep)) return [{ tipo: 'maceio', nome: NOME_ENTREGA.maceio, centavos: taxaMaceioCentavos }]
  const regiao = regiaoDoCep(cep)
  if (!regiao) return []
  return (['pac', 'sedex'] as const).flatMap((s) => {
    const centavos = tabela[regiao][s]
    return centavos === null ? [] : [{ tipo: s, nome: NOME_ENTREGA[s], centavos }]
  })
}

/** a tabela guardada nos ajustes, conferida: o que não for um preço válido vira "não envia" */
export function tabelaDe(v: unknown): TabelaFrete {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  const preco = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x > 0 && x <= 100_000 ? x : null)
  return Object.fromEntries(
    REGIOES.map(({ id }) => {
      const r = o[id] && typeof o[id] === 'object' ? (o[id] as Record<string, unknown>) : {}
      return [id, { pac: preco(r.pac), sedex: preco(r.sedex) }]
    }),
  ) as TabelaFrete
}
