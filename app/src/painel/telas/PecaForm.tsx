/*
  Cadastro e edição de uma peça: fotos, informações, cores, tamanhos e estoque.
  O estoque é uma grade cor x tamanho; ao salvar, vai junto quanto havia ao
  abrir ("antes"), para o servidor aplicar só a diferença.
*/
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api, enderecoSite, mensagemDe, type Colecao, type CorPeca, type Peca } from '../api'
import { descartarFotos, enviarFoto, pequena } from '../imagem'
import { aoClicar, ir, segurarSaida } from '../rota'
import { avisar, Campo, Carregando, confirmar, FalhaCarga, Icone, Interruptor, useCarregar } from '../ui'

/** tamanhos que aparecem como opção, nessa ordem; a peça nova já vem com a grade da Livi (sem o GG) */
const PADRAO = ['PP', 'P', 'M', 'G', 'GG']
const GRADE_NOVA = ['PP', 'P', 'M', 'G']
const MAX_FOTOS = 10

const CORES_RAPIDAS = [
  { nome: 'Preto', hex: '#111111' },
  { nome: 'Off-white', hex: '#f3eee6' },
  { nome: 'Branco', hex: '#ffffff' },
  { nome: 'Bege', hex: '#d9c4a5' },
  { nome: 'Caramelo', hex: '#a8692f' },
  { nome: 'Chocolate', hex: '#3e1d12' },
  { nome: 'Vinho', hex: '#5f0421' },
  { nome: 'Vermelho', hex: '#b3172b' },
  { nome: 'Rosa', hex: '#e2a9b4' },
  { nome: 'Terracota', hex: '#9e521f' },
  { nome: 'Verde oliva', hex: '#5f6236' },
  { nome: 'Azul marinho', hex: '#26284b' },
]

type Rascunho = {
  colecaoId: number | null
  nome: string
  preco: string
  descricao: string
  tecido: string
  cores: CorPeca[]
  tamanhos: string[]
  fotos: string[]
  modeloAltura: string
  modeloVeste: string
  sobEncomenda: boolean
  prazoEncomenda: string
  visivel: boolean
  /** quantidade por "corId|tamanho" */
  estoque: Record<string, number>
}

const chave = (cor: string, tamanho: string) => `${cor}|${tamanho}`

/** "1.234,56", "689,9" ou "689.90" em centavos; null se não for um valor */
function centavosDe(texto: string): number | null {
  const t = texto.replace(/[^\d,.]/g, '')
  if (!t) return null
  let normal = t
  if (t.includes(',')) normal = t.replace(/\./g, '').replace(',', '.')
  else if (/\.\d{3}$/.test(t)) normal = t.replace(/\./g, '')
  const n = Number(normal)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

const textoDe = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: centavos % 100 ? 2 : 0, maximumFractionDigits: 2 })

const novoIdCor = (usados: CorPeca[]) => {
  for (;;) {
    const id = 'c' + Math.random().toString(36).slice(2, 7)
    if (!usados.some((c) => c.id === id)) return id
  }
}

function deUmaPeca(p: Peca): Rascunho {
  return {
    colecaoId: p.colecaoId,
    nome: p.nome,
    preco: textoDe(p.precoCentavos),
    descricao: p.descricao,
    tecido: p.tecido,
    cores: p.cores,
    tamanhos: p.tamanhos,
    fotos: p.fotos,
    modeloAltura: p.modeloAltura,
    modeloVeste: p.modeloVeste,
    sobEncomenda: p.sobEncomenda,
    prazoEncomenda: p.prazoEncomenda,
    visivel: p.visivel,
    estoque: Object.fromEntries(p.estoque.map((e) => [chave(e.cor, e.tamanho), e.quantidade])),
  }
}

const vazio = (colecaoId: number | null): Rascunho => ({
  colecaoId,
  nome: '',
  preco: '',
  descricao: '',
  tecido: '',
  cores: [],
  tamanhos: [...GRADE_NOVA],
  fotos: [],
  modeloAltura: '',
  modeloVeste: '',
  sobEncomenda: false,
  prazoEncomenda: '',
  visivel: true,
  estoque: {},
})

export function PecaForm({ id, colecaoInicial }: { id: number | 'nova'; colecaoInicial?: number }) {
  const colecoes = useCarregar(() => api<Colecao[]>('GET', '/colecoes'))
  const peca = useCarregar(() => (id === 'nova' ? Promise.resolve(null) : api<Peca>('GET', `/pecas/${id}`)), [id])

  if (colecoes.erro || peca.erro)
    return (
      <FalhaCarga
        erro={(colecoes.erro || peca.erro)!}
        tentar={() => {
          colecoes.recarregar()
          peca.recarregar()
        }}
      />
    )
  // ao recarregar depois de salvar, o formulário continua na tela
  if (!colecoes.dados || peca.dados === undefined) return <Carregando />
  if (colecoes.dados.length === 0)
    return (
      <div className="tela">
        <div className="vazio">
          <p>Antes da primeira peça, crie uma coleção.</p>
          <a className="botao" href="/painel/colecao/nova" onClick={aoClicar('/painel/colecao/nova')}>
            Criar coleção
          </a>
        </div>
      </div>
    )

  return <Formulario id={id} peca={peca.dados ?? null} colecoes={colecoes.dados} colecaoInicial={colecaoInicial} aoSalvar={peca.recarregar} />
}

function Formulario({
  id,
  peca,
  colecoes,
  colecaoInicial,
  aoSalvar,
}: {
  id: number | 'nova'
  peca: Peca | null
  colecoes: Colecao[]
  colecaoInicial?: number
  aoSalvar: () => void
}) {
  const inicial = useMemo(
    () => (peca ? deUmaPeca(peca) : vazio(colecoes.find((c) => c.id === colecaoInicial)?.id ?? colecoes[0]?.id ?? null)),
    [peca, colecoes, colecaoInicial],
  )
  const [r, setR] = useState<Rascunho>(inicial)
  const [enviando, setEnviando] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const enviadas = useRef<string[]>([])
  const mudar = (f: (r: Rascunho) => Rascunho) => setR(f)
  const campo = <K extends keyof Rascunho>(k: K) => (v: Rascunho[K]) => mudar((x) => ({ ...x, [k]: v }))

  useEffect(() => setR(inicial), [inicial])

  const alterado = JSON.stringify(r) !== JSON.stringify(inicial)
  useEffect(() => {
    segurarSaida(alterado ? () => window.confirm('Sair sem salvar as alterações desta peça?') : null)
    const antesDeSair = (e: BeforeUnloadEvent) => {
      if (alterado) e.preventDefault()
    }
    window.addEventListener('beforeunload', antesDeSair)
    return () => {
      segurarSaida(null)
      window.removeEventListener('beforeunload', antesDeSair)
    }
  }, [alterado])

  // fotos enviadas que não ficaram em nenhuma peça salva são apagadas ao sair (o servidor confere)
  useEffect(() => () => descartarFotos(enviadas.current), [])

  const colecao = colecoes.find((c) => c.id === r.colecaoId)
  const total = r.cores.reduce((s, c) => s + r.tamanhos.reduce((t, tam) => t + (r.estoque[chave(c.id, tam)] ?? 0), 0), 0)

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    const precoCentavos = centavosDe(r.preco)
    const problema =
      (!r.colecaoId && 'Escolha a coleção.') ||
      (!r.nome.trim() && 'Preencha o nome da peça.') ||
      (precoCentavos === null && 'Preencha o preço (ex.: 459,90).') ||
      (r.cores.length === 0 && 'Adicione pelo menos uma cor.') ||
      (r.cores.some((c) => !c.nome.trim()) && 'Dê um nome para cada cor.') ||
      (r.tamanhos.length === 0 && 'Escolha pelo menos um tamanho.') ||
      (enviando > 0 && 'Espere as fotos terminarem de enviar.')
    if (problema) return setErro(problema)

    const antes = peca ? Object.fromEntries(peca.estoque.map((x) => [chave(x.cor, x.tamanho), x.quantidade])) : {}
    const corpo = {
      colecaoId: r.colecaoId,
      nome: r.nome,
      precoCentavos,
      descricao: r.descricao,
      tecido: r.tecido,
      cores: r.cores.map((c) => ({ ...c, nome: c.nome.trim() })),
      tamanhos: r.tamanhos,
      fotos: r.fotos,
      modeloAltura: r.modeloAltura,
      modeloVeste: r.modeloVeste,
      sobEncomenda: r.sobEncomenda,
      prazoEncomenda: r.prazoEncomenda,
      visivel: r.visivel,
      estoque: r.cores.flatMap((c) =>
        r.tamanhos.map((t) => ({ cor: c.id, tamanho: t, quantidade: r.estoque[chave(c.id, t)] ?? 0, antes: antes[chave(c.id, t)] })),
      ),
    }
    setSalvando(true)
    try {
      if (id === 'nova') {
        const nova = await api<{ id: number }>('POST', '/pecas', corpo)
        avisar('Peça cadastrada.')
        ir(`/painel/peca/${nova.id}`, { substituir: true, forcar: true })
      } else {
        await api('PUT', `/pecas/${id}`, corpo)
        avisar('Alterações salvas.')
        aoSalvar()
      }
    } catch (x) {
      setErro(mensagemDe(x))
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async () => {
    const ok = await confirmar({
      titulo: 'Excluir esta peça?',
      texto: 'Ela sai do site e as fotos dela são apagadas. Isso não tem volta. Para tirar do site só por um tempo, desligue "Mostrar no site".',
      botao: 'Excluir peça',
      perigo: true,
    })
    if (!ok) return
    try {
      await api('DELETE', `/pecas/${id}`)
      avisar('Peça excluída.')
      ir('/painel', { forcar: true })
    } catch (x) {
      avisar(mensagemDe(x), 'erro')
    }
  }

  return (
    <form className="tela tela-form" onSubmit={salvar} noValidate>
      <div className="tela-topo">
        <a className="voltar" href="/painel" onClick={aoClicar('/painel')}>
          {Icone.voltar} Peças
        </a>
        <h1>{id === 'nova' ? 'Nova peça' : r.nome || 'Peça sem nome'}</h1>
        {peca && colecao && peca.visivel && colecao.visivel && (
          <a className="link-acao" href={`${enderecoSite}/colecao/${colecao.slug}/${peca.slug}`} target="_blank" rel="noreferrer">
            {Icone.externo} Ver no site
          </a>
        )}
      </div>

      <section className="cartao">
        <h2>Fotos</h2>
        <EditorFotos
          fotos={r.fotos}
          mudar={(f) => mudar((x) => ({ ...x, fotos: f(x.fotos) }))}
          aoEnviar={(src) => enviadas.current.push(src)}
          aoMudarEnvios={(n) => setEnviando((e) => e + n)}
        />
      </section>

      <section className="cartao">
        <h2>Informações</h2>
        <Campo rotulo="Nome da peça">
          {(i) => <input id={i} value={r.nome} onChange={(e) => campo('nome')(e.target.value)} maxLength={120} placeholder="Ex.: Vestido Velvet" />}
        </Campo>
        <div className="campos-lado">
          <Campo rotulo="Coleção">
            {(i) => (
              <select id={i} value={r.colecaoId ?? ''} onChange={(e) => campo('colecaoId')(Number(e.target.value))}>
                {colecoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo rotulo="Preço">
            {(i) => (
              <span className="preco">
                <span aria-hidden="true">R$</span>
                <input
                  id={i}
                  inputMode="decimal"
                  value={r.preco}
                  onChange={(e) => campo('preco')(e.target.value)}
                  onBlur={() => {
                    const c = centavosDe(r.preco)
                    if (c !== null) campo('preco')(textoDe(c))
                  }}
                  placeholder="0,00"
                />
              </span>
            )}
          </Campo>
        </div>
        <Campo rotulo="Tecido">
          {(i) => <input id={i} value={r.tecido} onChange={(e) => campo('tecido')(e.target.value)} maxLength={120} placeholder="Ex.: Crepe acetinado" />}
        </Campo>
        <Campo rotulo="Descrição" dica="Aparece na página da peça. Conte o caimento, o comprimento e os detalhes.">
          {(i) => <textarea id={i} value={r.descricao} onChange={(e) => campo('descricao')(e.target.value)} maxLength={1500} rows={4} />}
        </Campo>
      </section>

      <section className="cartao">
        <h2>Cores</h2>
        <EditorCores cores={r.cores} mudar={(f) => mudar((x) => ({ ...x, cores: f(x.cores) }))} />
      </section>

      <section className="cartao">
        <h2>Tamanhos</h2>
        <EditorTamanhos tamanhos={r.tamanhos} aoMudar={campo('tamanhos')} />
      </section>

      <section className="cartao">
        <h2>Estoque</h2>
        <Interruptor
          ligado={r.sobEncomenda}
          aoMudar={campo('sobEncomenda')}
          rotulo="Feita sob encomenda"
          dica="Sem controle de estoque: a cliente compra e a peça é produzida."
        />
        {r.sobEncomenda ? (
          <Campo rotulo="Prazo de produção">
            {(i) => (
              <input id={i} value={r.prazoEncomenda} onChange={(e) => campo('prazoEncomenda')(e.target.value)} maxLength={80} placeholder="Ex.: 15 dias úteis" />
            )}
          </Campo>
        ) : r.cores.length === 0 || r.tamanhos.length === 0 ? (
          <p className="campo-dica">Escolha as cores e os tamanhos para preencher o estoque.</p>
        ) : (
          <GradeEstoque r={r} mudar={(k, n) => mudar((x) => ({ ...x, estoque: { ...x.estoque, [k]: n } }))} total={total} />
        )}
      </section>

      <section className="cartao">
        <h2>Modelo nas fotos</h2>
        <div className="campos-lado">
          <Campo rotulo="Altura da modelo">
            {(i) => <input id={i} value={r.modeloAltura} onChange={(e) => campo('modeloAltura')(e.target.value)} maxLength={40} placeholder="Ex.: 1,70 m" />}
          </Campo>
          <Campo rotulo="Tamanho que ela veste">
            {(i) => <input id={i} value={r.modeloVeste} onChange={(e) => campo('modeloVeste')(e.target.value)} maxLength={40} placeholder="Ex.: P" />}
          </Campo>
        </div>
      </section>

      <section className="cartao">
        <Interruptor ligado={r.visivel} aoMudar={campo('visivel')} rotulo="Mostrar no site" dica="Desligado, a peça fica guardada aqui e some do site." />
      </section>

      {id !== 'nova' && (
        <button type="button" className="botao-texto perigo" onClick={excluir}>
          {Icone.lixo} Excluir peça
        </button>
      )}

      <div className="barra-salvar">
        <p className={erro ? 'erro' : 'barra-estado'} role={erro ? 'alert' : undefined}>
          {erro || (alterado ? 'Alterações não salvas' : id === 'nova' ? '' : 'Tudo salvo')}
        </p>
        <button className="botao" disabled={salvando || (!alterado && id !== 'nova')}>
          {salvando ? 'Salvando…' : id === 'nova' ? 'Cadastrar peça' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

/* ---------- fotos ---------- */

type Envio = { chave: number; previa: string; erro?: string }

function EditorFotos({
  fotos,
  mudar,
  aoEnviar,
  aoMudarEnvios,
}: {
  fotos: string[]
  mudar: (f: (fotos: string[]) => string[]) => void
  aoEnviar: (src: string) => void
  aoMudarEnvios: (n: number) => void
}) {
  const [envios, setEnvios] = useState<Envio[]>([])
  const proximo = useRef(1)
  const vagas = MAX_FOTOS - fotos.length - envios.filter((e) => !e.erro).length

  const escolher = (lista: FileList | null) => {
    const arquivos = [...(lista ?? [])].slice(0, Math.max(0, vagas))
    if (lista && lista.length > arquivos.length) avisar(`Cada peça pode ter até ${MAX_FOTOS} fotos.`, 'erro')
    for (const arquivo of arquivos) {
      const envio: Envio = { chave: proximo.current++, previa: URL.createObjectURL(arquivo) }
      setEnvios((e) => [...e, envio])
      aoMudarEnvios(1)
      enviarFoto(arquivo).then(
        ({ src }) => {
          aoEnviar(src)
          mudar((f) => [...f, src])
          setEnvios((e) => e.filter((x) => x.chave !== envio.chave))
          URL.revokeObjectURL(envio.previa)
        },
        (x) => setEnvios((e) => e.map((y) => (y.chave === envio.chave ? { ...y, erro: mensagemDe(x) } : y))),
      ).finally(() => aoMudarEnvios(-1))
    }
  }

  const mover = (i: number, passo: -1 | 1) =>
    mudar((f) => {
      const n = [...f]
      ;[n[i], n[i + passo]] = [n[i + passo], n[i]]
      return n
    })

  return (
    <>
      <ul className="fotos">
        {fotos.map((src, i) => (
          <li key={src} className="foto">
            <img src={pequena(src)} alt={`Foto ${i + 1}`} />
            {i === 0 && <span className="foto-capa">Capa</span>}
            <span className="foto-acoes">
              <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Mover para a esquerda">
                {Icone.esquerda}
              </button>
              <button type="button" onClick={() => mover(i, 1)} disabled={i === fotos.length - 1} aria-label="Mover para a direita">
                {Icone.direita}
              </button>
              <button type="button" onClick={() => mudar((f) => f.filter((x) => x !== src))} aria-label="Tirar esta foto">
                {Icone.fechar}
              </button>
            </span>
          </li>
        ))}
        {envios.map((e) => (
          <li key={e.chave} className={`foto foto-enviando ${e.erro ? 'foto-erro' : ''}`}>
            <img src={e.previa} alt="" />
            {e.erro ? (
              <span className="foto-aviso">
                {e.erro}
                <button
                  type="button"
                  className="botao-texto"
                  onClick={() => {
                    URL.revokeObjectURL(e.previa)
                    setEnvios((l) => l.filter((x) => x.chave !== e.chave))
                  }}
                >
                  Tirar
                </button>
              </span>
            ) : (
              <span className="foto-aviso">
                <span className="giro" aria-hidden="true" />
                Enviando
              </span>
            )}
          </li>
        ))}
        {vagas > 0 && (
          <li className="foto foto-nova">
            <label>
              {Icone.mais}
              <span>{fotos.length || envios.length ? 'Mais fotos' : 'Adicionar fotos'}</span>
              <input type="file" accept="image/*" multiple onChange={(e) => (escolher(e.target.files), (e.target.value = ''))} />
            </label>
          </li>
        )}
      </ul>
      <p className="campo-dica">A primeira foto é a capa da peça. Fotos em pé (na vertical) ficam melhores no site.</p>
    </>
  )
}

/* ---------- cores ---------- */

function EditorCores({ cores, mudar }: { cores: CorPeca[]; mudar: (f: (c: CorPeca[]) => CorPeca[]) => void }) {
  const ultimo = useRef<HTMLInputElement>(null)
  const [focarUltimo, setFocarUltimo] = useState(false)
  useEffect(() => {
    if (focarUltimo) ultimo.current?.focus()
    setFocarUltimo(false)
  }, [focarUltimo])

  const usadas = new Set(cores.map((c) => c.nome.trim().toLowerCase()))
  const adicionar = (nome: string, hex: string) => mudar((c) => [...c, { id: novoIdCor(c), nome, hex }])
  const alterar = (id: string, v: Partial<CorPeca>) => mudar((c) => c.map((x) => (x.id === id ? { ...x, ...v } : x)))

  return (
    <>
      {cores.length > 0 && (
        <ul className="cores">
          {cores.map((c, i) => (
            <li key={c.id} className="cor">
              <label className="cor-amostra" style={{ background: c.hex }} title="Trocar o tom">
                <input type="color" value={c.hex} onChange={(e) => alterar(c.id, { hex: e.target.value })} aria-label={`Tom da cor ${c.nome}`} />
              </label>
              <input
                ref={i === cores.length - 1 ? ultimo : undefined}
                value={c.nome}
                onChange={(e) => alterar(c.id, { nome: e.target.value })}
                maxLength={40}
                placeholder="Nome da cor"
                aria-label="Nome da cor"
              />
              <button type="button" className="botao-icone" onClick={() => mudar((l) => l.filter((x) => x.id !== c.id))} aria-label={`Tirar a cor ${c.nome}`}>
                {Icone.fechar}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="campo-dica">{cores.length ? 'Adicionar outra cor:' : 'Toque numa cor para adicionar:'}</p>
      <div className="paleta">
        {CORES_RAPIDAS.filter((c) => !usadas.has(c.nome.toLowerCase())).map((c) => (
          <button key={c.nome} type="button" className="paleta-cor" onClick={() => adicionar(c.nome, c.hex)} title={c.nome}>
            <span style={{ background: c.hex }} aria-hidden="true" />
            {c.nome}
          </button>
        ))}
        <button
          type="button"
          className="paleta-cor paleta-outra"
          onClick={() => {
            adicionar('', '#8a6a55')
            setFocarUltimo(true)
          }}
        >
          {Icone.mais} Outra cor
        </button>
      </div>
    </>
  )
}

/* ---------- tamanhos ---------- */

function EditorTamanhos({ tamanhos, aoMudar }: { tamanhos: string[]; aoMudar: (t: string[]) => void }) {
  const [outro, setOutro] = useState('')
  const extras = tamanhos.filter((t) => !PADRAO.includes(t))
  const ordenar = (lista: string[]) => [...PADRAO.filter((t) => lista.includes(t)), ...lista.filter((t) => !PADRAO.includes(t))]
  const alternar = (t: string) => aoMudar(tamanhos.includes(t) ? tamanhos.filter((x) => x !== t) : ordenar([...tamanhos, t]))
  const adicionar = () => {
    const t = outro.trim()
    if (!t) return
    if (!tamanhos.some((x) => x.toLowerCase() === t.toLowerCase())) aoMudar(ordenar([...tamanhos, t]))
    setOutro('')
  }

  return (
    <>
      <div className="chips" role="group" aria-label="Tamanhos">
        {[...PADRAO, ...extras].map((t) => (
          <button key={t} type="button" className="chip chip-tamanho" aria-pressed={tamanhos.includes(t)} onClick={() => alternar(t)}>
            {t}
          </button>
        ))}
        {!tamanhos.includes('Único') && (
          <button type="button" className="chip" onClick={() => aoMudar(['Único'])}>
            Tamanho único
          </button>
        )}
      </div>
      <div className="outro-tamanho">
        <input
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              adicionar()
            }
          }}
          maxLength={12}
          placeholder="Outro tamanho (ex.: 38)"
          aria-label="Outro tamanho"
        />
        <button type="button" className="botao botao-claro" onClick={adicionar} disabled={!outro.trim()}>
          Adicionar
        </button>
      </div>
    </>
  )
}

/* ---------- estoque ---------- */

/** um bloco por cor, com os tamanhos lado a lado: cabe no celular com qualquer número de tamanhos */
function GradeEstoque({ r, mudar, total }: { r: Rascunho; mudar: (k: string, n: number) => void; total: number }) {
  return (
    <>
      <div className="estoque">
        {r.cores.map((c) => {
          const daCor = r.tamanhos.reduce((s, t) => s + (r.estoque[chave(c.id, t)] ?? 0), 0)
          return (
            <div key={c.id} className="estoque-cor">
              <p className="estoque-titulo">
                <span className="grade-cor" style={{ background: c.hex }} aria-hidden="true" />
                {c.nome || 'Sem nome'}
                <small>
                  {daCor} {daCor === 1 ? 'unidade' : 'unidades'}
                </small>
              </p>
              <div className="estoque-tamanhos">
                {r.tamanhos.map((t) => {
                  const k = chave(c.id, t)
                  const n = r.estoque[k] ?? 0
                  return (
                    <label key={t} className="estoque-celula">
                      <span>{t}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={9999}
                        value={n}
                        className={n === 0 ? 'zerado' : undefined}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => mudar(k, Math.max(0, Math.min(9999, Math.floor(Number(e.target.value) || 0))))}
                        aria-label={`${c.nome || 'Cor'}, tamanho ${t}`}
                      />
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <p className="campo-dica">
        Total: <strong>{total}</strong> {total === 1 ? 'unidade' : 'unidades'}. Com 0, a opção aparece como esgotada no site.
      </p>
    </>
  )
}
