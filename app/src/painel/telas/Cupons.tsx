/*
  Cupons de desconto: a cliente digita o código ao fechar a compra no site, e
  o desconto (em %) vale sobre as peças, não sobre a entrega. Desligado, o
  cupom para de valer na hora, mas continua aqui para ligar de novo.
*/
import { useState, type FormEvent } from 'react'
import { api, mensagemDe, type Cupom } from '../api'
import { avisar, Campo, Carregando, confirmar, FalhaCarga, Interruptor, useCarregar } from '../ui'
import { CODIGO_CUPOM, DESCONTO_MAXIMO, normalizarCupom } from '../../../worker/descontos'

type Rascunho = { id: number | null; codigo: string; percentual: string }
const VAZIO: Rascunho = { id: null, codigo: '', percentual: '' }

const usado = (n: number) => (n === 0 ? 'Ainda não usado' : n === 1 ? 'Usado em 1 compra' : `Usado em ${n} compras`)

export function Cupons() {
  const carga = useCarregar(() => api<Cupom[]>('GET', '/cupons'))
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (carga.erro) return <FalhaCarga erro={carga.erro} tentar={carga.recarregar} />
  if (!carga.dados) return <Carregando />

  const editando = rascunho.id !== null

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    const codigo = normalizarCupom(rascunho.codigo)
    const percentual = Number(rascunho.percentual)
    if (!CODIGO_CUPOM.test(codigo)) return setErro('Use só letras sem acento e números, de 3 a 20 (ex.: LIVI10).')
    if (!Number.isInteger(percentual) || percentual < 1 || percentual > DESCONTO_MAXIMO)
      return setErro(`O desconto vai de 1% a ${DESCONTO_MAXIMO}%, sem vírgula.`)
    setErro('')
    setEnviando(true)
    try {
      if (editando) {
        const atual = carga.dados!.find((x) => x.id === rascunho.id)
        await api('PUT', `/cupons/${rascunho.id}`, { codigo, percentual, ativo: atual?.ativo ?? true })
        avisar('Cupom salvo.')
      } else {
        await api('POST', '/cupons', { codigo, percentual })
        avisar(`Cupom ${codigo} criado. Ele já vale no site.`)
      }
      setRascunho(VAZIO)
      carga.recarregar()
    } catch (x) {
      setErro(mensagemDe(x))
    } finally {
      setEnviando(false)
    }
  }

  const ligar = async (c: Cupom, ativo: boolean) => {
    try {
      await api('PUT', `/cupons/${c.id}`, { codigo: c.codigo, percentual: c.percentual, ativo })
      avisar(ativo ? `${c.codigo} voltou a valer.` : `${c.codigo} parou de valer.`)
      carga.recarregar()
    } catch (x) {
      avisar(mensagemDe(x), 'erro')
    }
  }

  const apagar = async (c: Cupom) => {
    const ok = await confirmar({
      titulo: `Apagar o cupom ${c.codigo}?`,
      texto: 'Ele para de valer na hora. Os pedidos que já usaram continuam mostrando o desconto. Para só pausar, desligue o cupom.',
      botao: 'Apagar cupom',
      perigo: true,
    })
    if (!ok) return
    try {
      await api('DELETE', `/cupons/${c.id}`)
      avisar('Cupom apagado.')
      if (rascunho.id === c.id) setRascunho(VAZIO)
      carga.recarregar()
    } catch (x) {
      avisar(mensagemDe(x), 'erro')
    }
  }

  const editar = (c: Cupom) => {
    setRascunho({ id: c.id, codigo: c.codigo, percentual: String(c.percentual) })
    setErro('')
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className="tela">
      <div className="tela-topo">
        <div>
          <h1>Cupons de desconto</h1>
          <p className="tela-resumo">A cliente digita o código ao fechar a compra. O desconto vale sobre as peças, não sobre a entrega.</p>
        </div>
      </div>

      {carga.dados.length === 0 ? (
        <p className="vazio">Nenhum cupom ainda. Crie o primeiro aqui embaixo.</p>
      ) : (
        <ul className="cupons">
          {carga.dados.map((c) => (
            <li key={c.id} className={c.ativo ? 'cupom' : 'cupom desligado'}>
              <span className="linha-texto">
                <strong>
                  <span className="cupom-codigo">{c.codigo}</span>
                  <span className="selo selo-claro">{c.percentual}% de desconto</span>
                </strong>
                <span>{usado(c.usos)}</span>
              </span>
              <Interruptor ligado={c.ativo} aoMudar={(v) => ligar(c, v)} rotulo={c.ativo ? 'Valendo' : 'Desligado'} />
              <span className="pessoa-acoes">
                <button type="button" className="botao-texto" onClick={() => editar(c)}>
                  Editar
                </button>
                <button type="button" className="botao-texto perigo" onClick={() => apagar(c)}>
                  Apagar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form className="cartao" onSubmit={salvar}>
        <h2>{editando ? `Editar o cupom ${carga.dados.find((x) => x.id === rascunho.id)?.codigo ?? ''}` : 'Novo cupom'}</h2>
        <div className="campos-lado">
          <Campo rotulo="Código" dica="O que a cliente digita. Letras e números, sem espaço (ex.: LIVI10).">
            {(i) => (
              <input
                id={i}
                value={rascunho.codigo}
                onChange={(e) => setRascunho((r) => ({ ...r, codigo: normalizarCupom(e.target.value) }))}
                maxLength={20}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                required
              />
            )}
          </Campo>
          <Campo rotulo="Desconto (%)" dica={`De 1% a ${DESCONTO_MAXIMO}%, sobre o valor das peças.`}>
            {(i) => (
              <input
                id={i}
                inputMode="numeric"
                value={rascunho.percentual}
                onChange={(e) => setRascunho((r) => ({ ...r, percentual: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                placeholder="10"
                required
              />
            )}
          </Campo>
        </div>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <div className="botoes">
          <button className="botao" disabled={enviando}>
            {enviando ? 'Salvando…' : editando ? 'Salvar cupom' : 'Criar cupom'}
          </button>
          {editando && (
            <button type="button" className="botao-texto" onClick={() => setRascunho(VAZIO)}>
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
