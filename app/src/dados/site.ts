/*
  Textos e contatos gerais do site. Troque aqui sem mexer no layout.
  Itens com [confirmar] aguardam confirmação da cliente.
*/

export const site = {
  marca: 'Livi',
  assinatura: 'by LM',
  instagram: 'https://www.instagram.com/livibylm/',
  instagramArroba: '@livibylm',
  /** número no formato internacional, só dígitos. [confirmar] */
  whatsapp: '5500000000000',
  /** arquivo do logo. Enquanto for null, aparece um espaço reservado. */
  logo: null as string | null,

  /** abertura: o nome da marca gigante, como o título de uma revista, e a coleção em destaque */
  abertura: {
    marca: 'LIVI',
    esquerda: 'Coleção',
    direita: 'Velvet',
    colecao: 'velvet',
    /** foto da abertura: recorte (sem fundo) e a mesma foto com fundo, para o zoom */
    recorte: '/img/hero/modelo2-recorte.webp',
    foto: '/img/hero/modelo2-foto.webp',
    /** proporção da foto (largura / altura) e cor do fundo dela */
    proporcao: 1126 / 1666,
    fundoFoto: '#9a501f',
    /** número da coleção na "capa" e o texto do selo que gira */
    edicao: 'Nº 02',
    selo: 'Moda autoral · by LM · Role para ver as coleções · ',
    titulo: 'Cada peça, uma assinatura.',
    apoio:
      'Modelagens autorais e caimento fluido, pensados para acompanhar o seu movimento. Atendimento próximo, pelo WhatsApp.',
  },

  menu: [
    { rotulo: 'Início', href: '#inicio' },
    { rotulo: 'Coleções', href: '#colecoes' },
    { rotulo: 'Ateliê', href: '#atelie' },
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
