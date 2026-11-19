/*
  Descontos da loja, em dois lugares:
  - na peça (desconto, em %): o site mostra o preço cheio riscado e cobra o preço com desconto;
  - no cupom (percentual): a cliente digita ao fechar a compra, e o desconto vale sobre as peças, não sobre a entrega.
  Os dois nunca somam: o cupom não vale nas peças que já estão com desconto.
  As contas ficam aqui, em centavos. O site (src/) usa as mesmas funções para mostrar o que o servidor vai cobrar.
*/

/** quanto um desconto de `percentual`% tira de `centavos` (arredondado ao centavo) */
export const descontoDe = (centavos: number, percentual: number) => Math.round((centavos * percentual) / 100)

/** o preço depois do desconto da peça */
export const comDesconto = (centavos: number, percentual: number) => centavos - descontoDe(centavos, percentual)

type ItemComCupom = { precoCentavos: number; quantidade: number; emPromocao?: boolean }

/** quanto o cupom tira de uma unidade da peça (nada se a peça já está com desconto) */
export const descontoDoCupomNaPeca = (i: ItemComCupom, percentual: number) => (i.emPromocao ? 0 : descontoDe(i.precoCentavos, percentual))

/** quanto o cupom tira das peças: o desconto de cada unidade, somado (as peças em promoção ficam de fora) */
export const descontoDoCupom = (itens: ItemComCupom[], percentual: number) =>
  itens.reduce((s, i) => s + descontoDoCupomNaPeca(i, percentual) * i.quantidade, 0)

/** o maior desconto aceito, na peça e no cupom (100% deixaria a compra de graça, e a InfinitePay não cobra zero) */
export const DESCONTO_MAXIMO = 90

/** o código do cupom como fica guardado: sem espaços e em maiúsculas */
export const normalizarCupom = (v: string) => v.replace(/\s+/g, '').toUpperCase()

/** letras sem acento e números, de 3 a 20 */
export const CODIGO_CUPOM = /^[A-Z0-9]{3,20}$/
