/*
  Textos e contatos gerais do site. Troque aqui sem mexer no layout.
  Itens com [confirmar] aguardam confirmação da cliente.
*/

/**
 * Uma foto da abertura. `recorte`: foto sem fundo (a modelo fica solta sobre o creme).
 * Foto com fundo de estúdio: `fundo` é a cor do fundo da foto (a abertura assume essa cor
 * e as bordas da foto se dissolvem nela) e `tema` 'escuro' deixa os textos claros.
 */
export type FotoAbertura = { colecao: string; src: string; recorte?: boolean; fundo?: string; tema?: 'claro' | 'escuro' }

/** fotos que se revezam na abertura, uma por coleção (o nome gigante muda junto). [Confiança: aguardando foto] */
const fotosAbertura: FotoAbertura[] = [
  { colecao: 'velvet', src: '/img/hero/modelo-recorte.webp', recorte: true },
  { colecao: 'carmim', src: '/img/hero/carmim.webp', fundo: '#350d01', tema: 'escuro' },
  { colecao: 'lumina', src: '/img/hero/lumina.webp', fundo: '#dfdcda', tema: 'claro' },
]

export const site = {
  marca: 'Livi',
  assinatura: 'by LM',
  instagram: 'https://www.instagram.com/livibylm/',
  instagramArroba: '@livibylm',
  /** número no formato internacional, só dígitos. [confirmar] */
  whatsapp: '5500000000000',
  /** arquivo do logo. Enquanto for null, aparece um espaço reservado. */
  logo: null as string | null,

  abertura: {
    /** coleção atual: o menu "Coleções" abre o catálogo por ela */
    colecao: 'velvet',
    /** palavra gigante da esquerda; a da direita é o nome da coleção da foto que está aparecendo */
    esquerda: 'Coleção',
    /** segundos que cada foto fica na abertura antes de passar para a próxima */
    intervalo: 6,
    fotos: fotosAbertura,
    /** proporção (largura / altura) da caixa das fotos */
    proporcao: 986 / 1532,
    titulo: 'Cada peça, uma assinatura.',
    apoio:
      'Modelagens autorais e caimento fluido, pensados para acompanhar o seu movimento. Atendimento próximo, pelo WhatsApp.',
  },

  menu: [
    { rotulo: 'Início', href: '#inicio' },
    { rotulo: 'Coleções', href: '#colecoes' },
    { rotulo: 'Sobre', href: '#sobre' },
    { rotulo: 'Contato', href: '#contato' },
  ],
}

export function linkWhatsApp(mensagem = 'Olá! Vim pelo site da Livi e gostaria de atendimento.') {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(mensagem)}`
}

export function mensagemPeca(nome: string, cor: string, tamanho: string) {
  return `Olá! Tenho interesse na peça ${nome}, na cor ${cor}, tamanho ${tamanho}.`
}
