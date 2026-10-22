/*
  Conferência do que chega nas rotas (painel e compras do site): cada função
  devolve o valor limpo ou para tudo com uma mensagem que a pessoa entende.
*/
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Ambiente } from './tipos'

export const falha = (status: ContentfulStatusCode, mensagem: string) => new HTTPException(status, { message: mensagem })

export type Corpo = Record<string, unknown>

export async function lerCorpo(c: Context<Ambiente>): Promise<Corpo> {
  try {
    const v = await c.req.json()
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Corpo
  } catch {
    /* cai no erro abaixo */
  }
  throw falha(400, 'Pedido inválido.')
}

export function texto(v: unknown, campo: string, max: number, obrigatorio = false) {
  if (v != null && typeof v !== 'string') throw falha(400, `${campo}: valor inválido.`)
  const t = (v ?? '').trim()
  if (obrigatorio && !t) throw falha(400, `Preencha ${campo}.`)
  if (t.length > max) throw falha(400, `${campo} pode ter até ${max} caracteres.`)
  return t
}

/** o número no endereço (/pecas/12); qualquer outra coisa é "não encontrada" (ou "não encontrado") */
export function idDe(c: Context<Ambiente>, oque: 'Peça' | 'Coleção' | 'Pessoa' | 'Pedido') {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id < 1) throw falha(404, `${oque} não ${oque === 'Pedido' ? 'encontrado' : 'encontrada'}.`)
  return id
}

export function inteiro(v: unknown, campo: string, min: number, max: number) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw falha(400, `${campo}: valor inválido.`)
  return v
}

export const EMAIL = /^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/

/** só os dígitos de um CPF válido (confere os dois dígitos finais); null se não for */
export function cpfValido(texto: string) {
  const n = texto.replace(/\D/g, '')
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return null
  const digito = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(n[i]) * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(9) === Number(n[9]) && digito(10) === Number(n[10]) ? n : null
}

/**
  O CNPJ válido sem a pontuação (confere os dois dígitos finais); null se não for.
  Desde julho de 2026 a Receita também emite CNPJ com letras nas 12 primeiras
  posições (os 2 finais seguem números): cada caractere vale o código dele menos 48
  (0 a 9 continuam 0 a 9, A vale 17), e a conta é a mesma de sempre.
*/
export function cnpjValido(texto: string) {
  const n = texto.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (!/^[0-9A-Z]{12}\d{2}$/.test(n) || /^(\d)\1{13}$/.test(n)) return null
  const digito = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += (n.charCodeAt(i) - 48) * (((ate - 1 - i) % 8) + 2)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return digito(12) === Number(n[12]) && digito(13) === Number(n[13]) ? n : null
}
