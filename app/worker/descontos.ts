/*
  Descontos da loja, em dois lugares:
  - na peça (desconto, em %): o site mostra o preço cheio riscado e cobra o preço com desconto;
  - no cupom (percentual): a cliente digita ao fechar a compra, e o desconto vale sobre as peças, não sobre a entrega.
  As contas ficam aqui, em centavos. O site (src/) usa as mesmas funções para mostrar o que o servidor vai cobrar.
*/

/** quanto um desconto de `percentual`% tira de `centavos` (arredondado ao centavo) */
export const descontoDe = (centavos: number, percentual: number) => Math.round((centavos * percentual) / 100)

/** o preço depois do desconto da peça */
export const comDesconto = (centavos: number, percentual: number) => centavos - descontoDe(centavos, percentual)

/** quanto o cupom tira das peças: o desconto de cada unidade, somado */
export const descontoDoCupom = (itens: { precoCentavos: number; quantidade: number }[], percentual: number) =>
  itens.reduce((s, i) => s + descontoDe(i.precoCentavos, percentual) * i.quantidade, 0)

/** o maior desconto aceito, na peça e no cupom (100% deixaria a compra de graça, e a InfinitePay não cobra zero) */
export const DESCONTO_MAXIMO = 90

/** o código do cupom como fica guardado: sem espaços e em maiúsculas */
export const normalizarCupom = (v: string) => v.replace(/\s+/g, '').toUpperCase()

/** letras sem acento e números, de 3 a 20 */
export const CODIGO_CUPOM = /^[A-Z0-9]{3,20}$/
