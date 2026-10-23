import { HTTPException } from 'hono/http-exception'
import { describe, expect, it } from 'vitest'
import { numeroWhatsApp } from '../worker/ajustes'
import { deBase32, paraBase32 } from '../worker/dois-fatores'
import { deMaceio, opcoesDeEntrega, regiaoDoCep, TABELA_VAZIA, tabelaDe, ufDoCep } from '../worker/frete'
import { EMAIL, inteiro, texto } from '../worker/validar'

/** a mensagem e o status de um erro de validação */
function erroDe(f: () => unknown) {
  try {
    f()
  } catch (e) {
    if (e instanceof HTTPException) return { status: e.status, mensagem: e.message }
    throw e
  }
  return null
}

describe('WhatsApp', () => {
  it('aceita o número escrito de qualquer jeito e devolve 55 + DDD + número', () => {
    for (const digitado of ['(82) 99999-1234', '82 99999 1234', '82999991234', '+55 82 99999-1234', '5582999991234', '0 82 99999-1234', '055 82 99999 1234'])
      expect(numeroWhatsApp(digitado), digitado).toBe('5582999991234')
    // fixo, com 8 números
    expect(numeroWhatsApp('(82) 3333-4444')).toBe('558233334444')
  })

  it('recusa número curto, longo, de outro país ou com DDD inválido', () => {
    for (const digitado of ['', '123', '9999-1234', '(82) 9999-12345678', '+1 415 555 2671', '0044 20 7946 0958', '(01) 99999-1234', '(82) 19999-1234', 'abc'])
      expect(numeroWhatsApp(digitado), digitado).toBeNull()
  })
})

describe('e-mail, texto e número', () => {
  it('e-mail com @ e domínio, sem espaço nem aspas', () => {
    for (const ok of ['livia@exemplo.com', 'a.b+c@dominio.com.br']) expect(EMAIL.test(ok), ok).toBe(true)
    for (const ruim of ['livia', 'livia@', '@exemplo.com', 'livia@exemplo', 'li via@exemplo.com', "o'neil@exemplo.com", 'a"b@c.com']) expect(EMAIL.test(ruim), ruim).toBe(false)
  })

  it('texto: tira os espaços das pontas, exige quando obrigatório e respeita o tamanho', () => {
    expect(texto('  Livia  ', 'o nome', 10)).toBe('Livia')
    expect(texto(undefined, 'o nome', 10)).toBe('')
    expect(texto(null, 'o nome', 10)).toBe('')
    expect(erroDe(() => texto('   ', 'o nome', 10, true))).toEqual({ status: 400, mensagem: 'Preencha o nome.' })
    expect(erroDe(() => texto('x'.repeat(11), 'O nome', 10))?.status).toBe(400)
    expect(erroDe(() => texto(123, 'O nome', 10))?.status).toBe(400)
    expect(erroDe(() => texto({ toString: () => 'x' }, 'O nome', 10))?.status).toBe(400)
  })

  it('inteiro: só número inteiro dentro dos limites', () => {
    expect(inteiro(5, 'Qtd', 1, 10)).toBe(5)
    for (const ruim of [0, 11, 1.5, '5', null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) expect(erroDe(() => inteiro(ruim, 'Qtd', 1, 10))?.status, String(ruim)).toBe(400)
  })
})

describe('faixas de CEP de cada estado', () => {
  // [primeiro CEP da faixa, último CEP da faixa, UF, região da tabela de frete]
  const FAIXAS: [string, string, string, string][] = [
    ['01000000', '19999999', 'SP', 'sudeste'],
    ['20000000', '28999999', 'RJ', 'sudeste'],
    ['29000000', '29999999', 'ES', 'sudeste'],
    ['30000000', '39999999', 'MG', 'sudeste'],
    ['40000000', '48999999', 'BA', 'nordeste'],
    ['49000000', '49999999', 'SE', 'nordeste'],
    ['50000000', '56999999', 'PE', 'nordeste'],
    ['57100000', '57999999', 'AL', 'al'],
    ['58000000', '58999999', 'PB', 'nordeste'],
    ['59000000', '59999999', 'RN', 'nordeste'],
    ['60000000', '63999999', 'CE', 'nordeste'],
    ['64000000', '64999999', 'PI', 'nordeste'],
    ['65000000', '65999999', 'MA', 'nordeste'],
    ['66000000', '68899999', 'PA', 'norte'],
    ['68900000', '68999999', 'AP', 'norte'],
    ['69000000', '69299999', 'AM', 'norte'],
    ['69300000', '69399999', 'RR', 'norte'],
    ['69400000', '69899999', 'AM', 'norte'],
    ['69900000', '69999999', 'AC', 'norte'],
    ['70000000', '72799999', 'DF', 'centro-oeste'],
    ['72800000', '72999999', 'GO', 'centro-oeste'],
    ['73000000', '73699999', 'DF', 'centro-oeste'],
    ['73700000', '76799999', 'GO', 'centro-oeste'],
    ['76800000', '76999999', 'RO', 'norte'],
    ['77000000', '77999999', 'TO', 'norte'],
    ['78000000', '78899999', 'MT', 'centro-oeste'],
    ['79000000', '79999999', 'MS', 'centro-oeste'],
    ['80000000', '87999999', 'PR', 'sul'],
    ['88000000', '89999999', 'SC', 'sul'],
    ['90000000', '99999999', 'RS', 'sul'],
  ]

  it('o primeiro e o último CEP de cada faixa dão o estado e a região certos', () => {
    for (const [de, ate, uf, regiao] of FAIXAS)
      for (const cep of [de, ate]) {
        expect(ufDoCep(cep), cep).toBe(uf)
        expect(regiaoDoCep(cep), cep).toBe(regiao)
      }
  })

  it('Maceió vai de 57000-000 a 57099-999: tem taxa própria e não entra na tabela', () => {
    for (const cep of ['57000000', '57020000', '57099999']) {
      expect(deMaceio(cep), cep).toBe(true)
      expect(ufDoCep(cep)).toBe('AL')
      expect(regiaoDoCep(cep)).toBeNull()
    }
    expect(deMaceio('57100000')).toBe(false)
    expect(deMaceio('56999999')).toBe(false)
  })

  it('CEP fora de qualquer faixa ou mal escrito não dá estado nem entrega', () => {
    for (const cep of ['00000000', '00999999', '1000000', '570200000', '57020-000', 'abcdefgh', ''])
      expect(ufDoCep(cep), cep).toBeNull()
    expect(opcoesDeEntrega('00999999', 1500, { ...TABELA_VAZIA, sudeste: { pac: 100, sedex: 200 } })).toEqual([])
  })

  it('a tabela guardada só aceita preço inteiro e positivo; o resto vira "não envia"', () => {
    const t = tabelaDe({ nordeste: { pac: 2500, sedex: -1 }, sul: { pac: 12.5, sedex: '3000' }, norte: { pac: 100_001 }, estranha: { pac: 1 } })
    expect(t.nordeste).toEqual({ pac: 2500, sedex: null })
    expect(t.sul).toEqual({ pac: null, sedex: null })
    expect(t.norte).toEqual({ pac: null, sedex: null })
    expect(Object.keys(t)).not.toContain('estranha')
    expect(tabelaDe(null)).toEqual(TABELA_VAZIA)
    expect(tabelaDe('lixo')).toEqual(TABELA_VAZIA)
  })
})

describe('base32 do app autenticador', () => {
  it('bate com o exemplo da RFC 4648 e volta igual', () => {
    const rfc = new TextEncoder().encode('12345678901234567890')
    expect(paraBase32(rfc)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
    expect(paraBase32(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI')
    for (let n = 1; n <= 40; n++) {
      const bytes = crypto.getRandomValues(new Uint8Array(n))
      expect(deBase32(paraBase32(bytes))).toEqual(bytes)
    }
  })

  it('lê o segredo digitado com espaços e letras minúsculas', () => {
    expect(deBase32('gezd gnbv gy3t qojq')).toEqual(deBase32('GEZDGNBVGY3TQOJQ'))
  })
})
