/*
  Textos e contatos gerais do site. Troque aqui sem mexer no layout.
  Itens com [confirmar] aguardam confirmação da cliente.
*/

import { comBase } from '../lib/base'
import { precoBR, type Colecao, type Peca } from './colecoes'

export const site = {
  marca: 'Livi',
  assinatura: 'by LM',
  instagram: 'https://www.instagram.com/livibylm/',
  instagramArroba: '@livibylm',
  /** número do WhatsApp da loja no formato internacional, só dígitos (55 + DDD + número) */
  whatsapp: '5582998115324',
  /** arquivo do logo. Enquanto for null, aparece um espaço reservado. */
  logo: null as string | null,

  /** abertura (versão do Yan): o nome da marca gigante, como o título de uma revista, e a coleção em destaque */
  abertura: {
    marca: 'LIVI',
    esquerda: 'Coleção',
    direita: 'Velvet',
    /** coleção atual: o menu "Coleções" abre o catálogo por ela */
    colecao: 'velvet',
    /** foto da abertura: recorte (sem fundo) e a mesma foto com fundo */
    recorte: comBase('/img/hero/modelo2-recorte.webp'),
    foto: comBase('/img/hero/modelo2-foto.webp'),
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
    { rotulo: 'Sobre', href: '#sobre' },
    { rotulo: 'Contato', href: '#contato' },
  ],
}

/*
  MENSAGENS DO WHATSAPP
  Cada botão abre a conversa com uma mensagem pronta, de acordo com o pedido.
  No WhatsApp, *texto* sai em negrito.
*/
export const mensagens = {
  /** topo, menu, abertura e rodapé */
  geral: 'Olá! Vim pelo site da Livi e gostaria de atendimento.',
  /** "Disponível agora" */
  disponiveis: 'Olá! Vim pelo site da Livi e gostaria de conhecer as peças disponíveis.',
  /** "Ficou com alguma dúvida?" (como comprar): termina com dois-pontos para a cliente escrever a dúvida */
  duvida: 'Olá! Vim pelo site da Livi e fiquei com uma dúvida:',
}

export function linkWhatsApp(mensagem = mensagens.geral) {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(mensagem)}`
}

/** "Quero essa peça": uma peça, com cor e tamanho escolhidos */
export function mensagemPeca(colecao: Colecao, peca: Peca, cor: string, tamanho: string) {
  return [
    'Olá! Vim pelo site da Livi e tenho interesse nesta peça:',
    [`*${peca.nome}*`, `Coleção ${colecao.nome}`, `Cor: ${cor}`, `Tamanho: ${tamanho}`, `Valor: ${precoBR(peca.preco)}`].join('\n'),
    'Está disponível nesse tamanho?',
  ].join('\n\n')
}
