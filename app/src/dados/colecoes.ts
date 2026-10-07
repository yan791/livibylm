/*
  ARQUIVO ÚNICO DE DADOS DA LIVI
  Coleções e peças moram aqui. Para criar uma coleção ou peça nova, basta
  copiar um bloco e trocar os valores: o layout se ajusta sozinho.

  ATENÇÃO: nomes de peças (exceto as das fotos principais) e preços são
  FICTÍCIOS, só para a apresentação à cliente. Itens marcados com
  "[confirmar]" ainda precisam ser confirmados com a cliente.
*/

export type Cor = { nome: string; hex: string }

export type Peca = {
  slug: string
  nome: string
  preco: number
  descricao: string
  tecido: string
  cores: Cor[]
  tamanhos: string[]
  /**
   * fotos da peça vestida, de 1 a 3 (ex.: frente, costas e detalhe). A primeira aparece na
   * vitrine e em destaque; as outras viram miniaturas na peça aberta. Vazio = espaço para foto.
   */
  fotos: string[]
  modelo: { altura: string; veste: string }
}

export type Colecao = {
  slug: string
  nome: string
  numero: string
  /** cor de fundo da coleção (acompanha o fundo das fotos) */
  fundo: string
  /** 'escuro' = textos claros por cima do fundo */
  tema: 'claro' | 'escuro'
  clima: string
  descricao: string
  capa: string
  /** "Compre o look": pontos sobre a foto da capa (x e y de 0 a 1) que levam a cada peça */
  pontos?: { x: number; y: number; peca: string }[]
  pecas: Peca[]
}

const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG'] // [confirmar] grade de tamanhos
const MODELO = { altura: '1,70 m [confirmar]', veste: 'P [confirmar]' }

export const colecoes: Colecao[] = [
  {
    slug: 'lumina',
    nome: 'Lúmina',
    numero: '01',
    fundo: '#c8c2bb',
    tema: 'claro',
    clima: 'Luz e linhas longas.',
    descricao: 'Peças claras, de brilho suave, pensadas para a luz do fim de tarde.',
    capa: '/img/colecoes/lumina.webp',
    pontos: [{ x: 0.47, y: 0.52, peca: 'vestido-lumina' }],
    pecas: [
      {
        slug: 'vestido-lumina',
        nome: 'Vestido Lúmina',
        preco: 689,
        descricao: 'Gola halter, costas abertas e fenda lateral. Caimento longo e fluido até o tornozelo.',
        tecido: 'Cetim [confirmar]',
        cores: [{ nome: 'Pérola', hex: '#efeae3' }],
        tamanhos: TAMANHOS,
        fotos: ['/img/colecoes/lumina.webp'],
        modelo: MODELO,
      },
      {
        slug: 'vestido-lumina-midi',
        nome: 'Vestido Lúmina Midi',
        preco: 549,
        descricao: 'A mesma gola halter, agora na altura midi.',
        tecido: 'Cetim [confirmar]',
        cores: [{ nome: 'Champanhe', hex: '#e6d6bf' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
      {
        slug: 'top-lumina-halter',
        nome: 'Top Lúmina Halter',
        preco: 329,
        descricao: 'Top de gola alta e costas livres, para usar com saia ou alfaiataria.',
        tecido: 'Cetim [confirmar]',
        cores: [{ nome: 'Pérola', hex: '#efeae3' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
      {
        slug: 'saia-lumina-fluida',
        nome: 'Saia Lúmina Fluida',
        preco: 389,
        descricao: 'Saia longa de cintura alta, com movimento a cada passo.',
        tecido: 'Cetim [confirmar]',
        cores: [{ nome: 'Pérola', hex: '#efeae3' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
    ],
  },
  {
    slug: 'velvet',
    nome: 'Velvet',
    numero: '02',
    fundo: '#84400f',
    tema: 'escuro',
    clima: 'Terra, calor e drapeado.',
    descricao: 'Tons de terra e chocolate, com drapeados que acompanham o corpo.',
    capa: '/img/colecoes/velvet.webp',
    pontos: [{ x: 0.55, y: 0.44, peca: 'vestido-velvet' }],
    pecas: [
      {
        slug: 'vestido-velvet',
        nome: 'Vestido Velvet',
        preco: 459,
        descricao: 'Gola alta com decote drapeado, cintura franzida e saia curta.',
        tecido: 'Crepe [confirmar]',
        cores: [{ nome: 'Chocolate', hex: '#3e1d12' }],
        tamanhos: TAMANHOS,
        fotos: ['/img/colecoes/velvet.webp'],
        modelo: MODELO,
      },
      {
        slug: 'vestido-velvet-longo',
        nome: 'Vestido Velvet Longo',
        preco: 589,
        descricao: 'O drapeado da Velvet em versão longa.',
        tecido: 'Crepe [confirmar]',
        cores: [{ nome: 'Ferrugem', hex: '#833a1a' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
      {
        slug: 'top-velvet-drapeado',
        nome: 'Top Velvet Drapeado',
        preco: 289,
        descricao: 'Top de decote drapeado e gola halter.',
        tecido: 'Crepe [confirmar]',
        cores: [{ nome: 'Chocolate', hex: '#3e1d12' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
      {
        slug: 'saia-velvet',
        nome: 'Saia Velvet',
        preco: 299,
        descricao: 'Saia curta de cintura alta, em tom terracota.',
        tecido: 'Crepe [confirmar]',
        cores: [{ nome: 'Terracota', hex: '#9e521f' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
    ],
  },
  {
    slug: 'carmim',
    nome: 'Carmim',
    numero: '03',
    fundo: '#5a4638',
    tema: 'escuro',
    clima: 'Contraste, sombra e caimento.',
    descricao: 'Preto e vinho em peças de linhas limpas, feitas para a noite.',
    capa: '/img/colecoes/carmim.webp',
    pontos: [
      { x: 0.5, y: 0.4, peca: 'conjunto-carmim' },
      { x: 0.58, y: 0.84, peca: 'saia-carmim' },
    ],
    pecas: [
      {
        slug: 'conjunto-carmim',
        nome: 'Conjunto Carmim',
        preco: 519,
        descricao: 'Top de gola halter com decote drapeado e saia curta.',
        tecido: 'Crepe acetinado [confirmar]',
        cores: [{ nome: 'Preto', hex: '#120c0b' }],
        tamanhos: TAMANHOS,
        fotos: ['/img/colecoes/carmim.webp'],
        modelo: MODELO,
      },
      {
        slug: 'top-carmim-drapeado',
        nome: 'Top Carmim Drapeado',
        preco: 309,
        descricao: 'O top do conjunto, em bordô.',
        tecido: 'Crepe acetinado [confirmar]',
        cores: [{ nome: 'Bordô', hex: '#6e0f1c' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
      {
        slug: 'saia-carmim',
        nome: 'Saia Carmim',
        preco: 279,
        descricao: 'Saia curta, reta e de cintura alta.',
        tecido: 'Crepe acetinado [confirmar]',
        cores: [{ nome: 'Preto', hex: '#120c0b' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
      {
        slug: 'vestido-carmim-longo',
        nome: 'Vestido Carmim Longo',
        preco: 649,
        descricao: 'Gola halter e caimento longo, em vinho profundo.',
        tecido: 'Cetim [confirmar]',
        cores: [{ nome: 'Vinho', hex: '#5f0421' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
    ],
  },
  {
    slug: 'confianca',
    nome: 'Confiança',
    numero: '04',
    fundo: '#c6bdb9',
    tema: 'claro',
    clima: 'Estrutura e presença.',
    descricao: 'Modelagens ajustadas, de recortes precisos, para quem gosta de presença.',
    capa: '/img/colecoes/confianca.webp',
    pontos: [{ x: 0.5, y: 0.56, peca: 'vestido-confianca' }],
    pecas: [
      {
        slug: 'vestido-confianca',
        nome: 'Vestido Confiança',
        preco: 429,
        descricao: 'Tomara que caia com decote coração e recortes que desenham a silhueta.',
        tecido: 'Alfaiataria com elastano [confirmar]',
        cores: [{ nome: 'Preto', hex: '#0f0b0a' }],
        tamanhos: TAMANHOS,
        fotos: ['/img/colecoes/confianca.webp'],
        modelo: MODELO,
      },
      {
        slug: 'corset-confianca',
        nome: 'Corset Confiança',
        preco: 359,
        descricao: 'O busto estruturado do vestido, em versão corset.',
        tecido: 'Alfaiataria [confirmar]',
        cores: [{ nome: 'Vinho', hex: '#4f0f10' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
      {
        slug: 'vestido-confianca-midi',
        nome: 'Vestido Confiança Midi',
        preco: 499,
        descricao: 'Decote coração e saia lápis na altura midi.',
        tecido: 'Alfaiataria com elastano [confirmar]',
        cores: [{ nome: 'Marinho', hex: '#26284b' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
      {
        slug: 'saia-lapis-confianca',
        nome: 'Saia Lápis Confiança',
        preco: 289,
        descricao: 'Saia lápis de cintura alta, ajustada ao corpo.',
        tecido: 'Alfaiataria com elastano [confirmar]',
        cores: [{ nome: 'Preto', hex: '#0f0b0a' }],
        tamanhos: TAMANHOS,
        fotos: [],
        modelo: MODELO,
      },
    ],
  },
]

export function acharColecao(slug?: string) {
  return colecoes.find((c) => c.slug === slug)
}

export function acharPeca(colecao: Colecao, slug?: string) {
  return colecao.pecas.find((p) => p.slug === slug) ?? colecao.pecas[0]
}

export const precoBR = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
