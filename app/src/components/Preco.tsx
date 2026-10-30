import { precoBR, type Peca } from '../dados/colecoes'

/** o preço da peça; com desconto, o preço cheio riscado, o preço com desconto e a porcentagem */
export function PrecoPeca({ peca }: { peca: Pick<Peca, 'preco' | 'precoCheio' | 'desconto'> }) {
  if (!peca.desconto) return <>{precoBR(peca.preco)}</>
  return (
    <span className="preco-promo">
      <span className="sr-only">De </span>
      <s>{precoBR(peca.precoCheio)}</s>
      <span className="sr-only"> por </span>
      <span>{precoBR(peca.preco)}</span>
      <span className="preco-promo-selo">−{peca.desconto}%</span>
    </span>
  )
}
