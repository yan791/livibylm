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

  /** palavras gigantes da abertura: troque a cada coleção */
  abertura: {
    esquerda: 'Coleção',
    direita: 'Velvet',
    colecao: 'velvet',
    /** foto da abertura: recorte (sem fundo) e a mesma foto com fundo, para o zoom */
    recorte: '/img/hero/modelo-recorte.webp',
    foto: '/img/hero/modelo-foto.webp',
    /** proporção da foto (largura / altura) e cor do fundo dela */
    proporcao: 986 / 1532,
    fundoFoto: '#7e6655',
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
