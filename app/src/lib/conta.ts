/*
  Conta da cliente no site: ela entra com o WhatsApp e a senha, e os pedidos
  ficam na conta (aparecem em qualquer aparelho). A conta nasce na compra: a
  sacola pede para entrar ou criar a conta antes do pagamento.
  O token da sessão fica no navegador (localStorage) e vai no cabeçalho
  Authorization: o servidor mora em outro endereço, e cookie de outro site o
  navegador bloqueia. Os dados da conta vêm do servidor (worker/contas.ts).
  Sair fecha a sessão e esquece os pedidos guardados neste aparelho.
*/
import { useSyncExternalStore } from 'react'
import { API } from './base'
import { esquecerTodos, type PedidoPublico } from './meus-pedidos'

const CHAVE = 'livi-conta'
const SEM_REDE = 'Não conseguimos falar com a loja agora. Confira a internet e tente de novo.'

export type DadosConta = { nome: string; whatsapp: string; email: string }
/** a última entrega da conta, para a próxima compra já vir preenchida */
export type UltimaEntrega = { cep: string; rua: string; numero: string; complemento: string; bairro: string; cidade: string; cpf: string }
type Resposta = { token?: string; conta: DadosConta; entrega: UltimaEntrega | null; pedidos: number; erro?: string }

export type Sessao =
  | { situacao: 'fora' }
  /** tem a sessão guardada, esperando o servidor dizer de quem é */
  | { situacao: 'carregando' }
  | { situacao: 'dentro'; conta: DadosConta; entrega: UltimaEntrega | null; pedidos: number }

export type PedidoDaConta = PedidoPublico & { daConta: boolean }

const ouvintes = new Set<() => void>()

function lerToken() {
  try {
    const t = localStorage.getItem(CHAVE)
    return t && /^[\w-]{20,100}$/.test(t) ? t : ''
  } catch {
    return ''
  }
}

let token = typeof window === 'undefined' ? '' : lerToken()
let sessao: Sessao = token ? { situacao: 'carregando' } : { situacao: 'fora' }

function mudar(novo: Sessao) {
  sessao = novo
  ouvintes.forEach((f) => f())
}

function guardarToken(t: string) {
  token = t
  try {
    if (t) localStorage.setItem(CHAVE, t)
    else localStorage.removeItem(CHAVE)
  } catch {
    /* sem armazenamento: a conta fica aberta só nesta visita */
  }
}

/** o cabeçalho que leva a sessão (compra e pedidos da conta) */
export const cabecalhoConta = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {})

async function chamar(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown) {
  const r = await fetch(`${API}/api/conta${caminho}`, {
    method: metodo,
    headers: { ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...cabecalhoConta() },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  let dados: Record<string, unknown> = {}
  try {
    dados = await r.json()
  } catch {
    /* resposta sem JSON: fica o erro padrão */
  }
  return { status: r.status, dados }
}

/** a sessão venceu ou foi fechada em outro lugar: volta para "fora" */
export function sessaoEncerrada() {
  guardarToken('')
  mudar({ situacao: 'fora' })
}

function abrir(d: Resposta) {
  if (d.token) guardarToken(d.token)
  mudar({ situacao: 'dentro', conta: d.conta, entrega: d.entrega, pedidos: d.pedidos })
}

/** confere a sessão guardada com o servidor (ao abrir o site e quando outra aba entra ou sai) */
async function carregar() {
  if (!token) return mudar({ situacao: 'fora' })
  mudar({ situacao: 'carregando' })
  try {
    const { status, dados } = await chamar('GET', '')
    if (status === 200) abrir(dados as Resposta)
    else if (status === 401) sessaoEncerrada()
    // servidor fora do ar: a sessão fica guardada para a próxima visita
    else mudar({ situacao: 'fora' })
  } catch {
    mudar({ situacao: 'fora' })
  }
}

if (typeof window !== 'undefined') {
  if (token) void carregar()
  // o mesmo site aberto em outra aba entrou ou saiu da conta
  window.addEventListener('storage', (e) => {
    if (e.key !== CHAVE) return
    token = lerToken()
    void carregar()
  })
}

export const useConta = () =>
  useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb)
      return () => ouvintes.delete(cb)
    },
    () => sessao,
    () => sessao,
  )

/** entra com o WhatsApp e a senha; devolve a mensagem de erro, ou '' se entrou */
export async function entrarNaConta(whatsapp: string, senha: string) {
  try {
    const { status, dados } = await chamar('POST', '/entrar', { whatsapp, senha })
    if (status !== 200) return String(dados.erro ?? SEM_REDE)
    abrir(dados as Resposta)
    return ''
  } catch {
    return SEM_REDE
  }
}

/** cria a conta e já entra; jaTem = o WhatsApp já tem conta (ela precisa entrar com a senha) */
export async function criarConta(d: { nome: string; whatsapp: string; email: string; senha: string }) {
  try {
    const { status, dados } = await chamar('POST', '/criar', d)
    if (status !== 201) return { erro: String(dados.erro ?? SEM_REDE), jaTem: status === 409 }
    abrir(dados as Resposta)
    return { erro: '', jaTem: false }
  } catch {
    return { erro: SEM_REDE, jaTem: false }
  }
}

/** sai da conta neste aparelho e esquece os pedidos guardados nele */
export function sairDaConta() {
  void chamar('POST', '/sair', {}).catch(() => {})
  sessaoEncerrada()
  esquecerTodos()
}

/**
  Os pedidos da conta e os do aparelho (os do mesmo WhatsApp entram na conta).
  Sessão vencida: sai da conta e devolve null.
*/
export async function pedidosDaConta(codigos: string[]): Promise<PedidoDaConta[] | null> {
  const { status, dados } = await chamar('POST', '/pedidos', { codigos })
  if (status === 401) {
    sessaoEncerrada()
    return null
  }
  if (status !== 200) throw new Error(String(status))
  const pedidos = dados.pedidos as PedidoDaConta[]
  if (sessao.situacao === 'dentro' && sessao.pedidos !== pedidos.length) mudar({ ...sessao, pedidos: pedidos.length })
  return pedidos
}

/** o link de senha nova ainda vale? devolve o primeiro nome, ou a mensagem de erro */
export async function conferirLinkSenha(link: string): Promise<{ nome: string } | { erro: string }> {
  try {
    const { status, dados } = await chamar('GET', `/nova-senha/${encodeURIComponent(link)}`)
    return status === 200 ? { nome: String(dados.nome ?? '') } : { erro: String(dados.erro ?? SEM_REDE) }
  } catch {
    return { erro: SEM_REDE }
  }
}

/** troca a senha pelo link e já entra; devolve a mensagem de erro, ou '' se deu certo */
export async function definirSenhaNova(link: string, senha: string) {
  try {
    const { status, dados } = await chamar('POST', `/nova-senha/${encodeURIComponent(link)}`, { senha })
    if (status !== 200) return String(dados.erro ?? SEM_REDE)
    abrir(dados as Resposta)
    return ''
  } catch {
    return SEM_REDE
  }
}

/** "5582999998888" -> "(82) 99999-8888" */
export const telefoneTexto = (n: string) => n.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')

/** a senha das clientes tem pelo menos 8 caracteres (SENHA_MINIMA em worker/contas.ts) */
export const SENHA_MINIMA = 8
