/** proporção (largura / altura) da foto de cada coleção */
export const PROPORCAO: Record<string, number> = {
  lumina: 1094 / 1600,
  velvet: 980 / 1600,
  carmim: 1080 / 1600,
  confianca: 401 / 615,
}

/** altura do cartão de foto dos looks (fração da tela), igual na abertura e nos looks */
export const alturaCartao = (desk: boolean) => (desk ? 0.78 : 0.62)
