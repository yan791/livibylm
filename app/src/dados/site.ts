/*
  Textos e contatos gerais do site. Troque aqui sem mexer no layout.
  Itens com [confirmar] aguardam confirmação da cliente.
*/

import { comBase } from '../lib/base'
import { ajustes, colecoes, precoBR, rotuloTamanho, type Colecao, type Peca } from './colecoes'

export const site = {
  marca: 'Liví',
  assinatura: 'by LM',
  instagram: 'https://www.instagram.com/livibylm/',
  instagramArroba: '@livibylm',
  /**
   * número do WhatsApp da loja (55 + DDD + número, só dígitos). Vem do painel
   * (Ajustes); o daqui só vale se o servidor da loja não responder.
   */
  whatsapp: ajustes.whatsapp || '5582998115324',
  /** política de envio da Livia: quando o pedido sai, contado da aprovação do pagamento */
  prazoPostagem: 'até 3 dias úteis',
  /** arquivo do logo. Enquanto for null, aparece um espaço reservado. */
  logo: null as string | null,

  /** abertura (versão do Yan): o nome da marca gigante, como o título de uma revista, e a coleção em destaque */
  abertura: {
    marca: 'LIVÍ',
    esquerda: 'Coleção',
    direita: 'Velvet',
    /** coleção atual: o menu "Coleções" abre o catálogo por ela (se ela sair do site pelo painel, abre a primeira) */
    colecao: colecoes.some((c) => c.slug === 'velvet') ? 'velvet' : (colecoes[0]?.slug ?? ''),
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
    // página com as peças de todas as coleções, por tipo (paginas/Pecas.tsx)
    { rotulo: 'Peças', href: '/pecas' },
    { rotulo: 'Sobre', href: '#sobre' },
    { rotulo: 'Contato', href: '#contato' },
  ],
}

/** tabela de medidas da Liví, em centímetros (aparece no "Como comprar" e no "Guia de medidas" da peça) */
export const medidas = [
  { tamanho: 'PP', busto: 86, cintura: 67, quadril: 98 },
  { tamanho: 'P', busto: 90, cintura: 70, quadril: 100 },
  { tamanho: 'M', busto: 94, cintura: 74, quadril: 104 },
  { tamanho: 'G', busto: 98, cintura: 78, quadril: 108 },
]

/*
  MENSAGENS DO WHATSAPP
  Cada botão abre a conversa com uma mensagem pronta, de acordo com o pedido.
  No WhatsApp, *texto* sai em negrito.
*/
export const mensagens = {
  /** topo, menu, abertura e rodapé */
  geral: 'Olá! Vim pelo site da Liví e gostaria de atendimento.',
  /** "Disponível agora" */
  disponiveis: 'Olá! Vim pelo site da Liví e gostaria de conhecer as peças disponíveis.',
  /** "Ficou com alguma dúvida?" (como comprar): termina com dois-pontos para a cliente escrever a dúvida */
  duvida: 'Olá! Vim pelo site da Liví e fiquei com uma dúvida:',
}

export function linkWhatsApp(mensagem = mensagens.geral) {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(mensagem)}`
}

/** "Quero essa peça": uma peça, com cor e tamanho escolhidos */
export function mensagemPeca(colecao: Colecao, peca: Peca, cor: string, tamanho: string) {
  return [
    'Olá! Vim pelo site da Liví e tenho interesse nesta peça:',
    [`*${peca.nome}*`, `Coleção ${colecao.nome}`, `Cor: ${cor}`, `Tamanho: ${rotuloTamanho(tamanho)}`, `Valor: ${precoBR(peca.preco)}`].join('\n'),
    'Está disponível nesse tamanho?',
  ].join('\n\n')
}

/** peça esgotada: a cliente pergunta se ela volta */
export function mensagemEsgotada(colecao: Colecao, peca: Peca) {
  return [
    'Olá! Vim pelo site da Liví e gostei desta peça, que está esgotada:',
    [`*${peca.nome}*`, `Coleção ${colecao.nome}`].join('\n'),
    'Ela vai voltar?',
  ].join('\n\n')
}
