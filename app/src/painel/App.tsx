/*
  Painel da loja: confere o login e monta a moldura (topo, navegação e a tela do endereço atual).
*/
import { useEffect, useState } from 'react'
import { api, definirSite, enderecoSite, EVENTO_SAIU, type Admin } from './api'
import { aoClicar, ir, podeSair, useTela, type Tela } from './rota'
import { Avisos, avisar, Carregando, Confirmacao, Icone } from './ui'
import { Convite, Entrar } from './acesso'
import { Pecas } from './telas/Pecas'
import { PecaForm } from './telas/PecaForm'
import { Colecoes } from './telas/Colecoes'
import { ColecaoForm } from './telas/ColecaoForm'
import { Pessoas } from './telas/Pessoas'
import { Ajustes } from './telas/Ajustes'
import { Pedidos } from './telas/Pedidos'
import { EVENTO_PEDIDOS, PedidoDetalhe } from './telas/PedidoDetalhe'
import { NovaVenda } from './telas/NovaVenda'

const NAV = [
  { caminho: '/painel/pedidos', rotulo: 'Pedidos', icone: Icone.pedidos, telas: ['pedidos', 'pedido', 'venda'] },
  { caminho: '/painel', rotulo: 'Peças', icone: Icone.pecas, telas: ['pecas', 'peca'] },
  { caminho: '/painel/colecoes', rotulo: 'Coleções', icone: Icone.colecoes, telas: ['colecoes', 'colecao'] },
  { caminho: '/painel/pessoas', rotulo: 'Acesso', icone: Icone.pessoas, telas: ['pessoas'] },
  { caminho: '/painel/ajustes', rotulo: 'Ajustes', icone: Icone.ajustes, telas: ['ajustes'] },
]

export function App() {
  const tela = useTela()
  // undefined = ainda conferindo o login
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined)

  useEffect(() => {
    api<{ admin: Admin | null }>('GET', '/sessao').then(
      ({ admin: a }) => {
        if (a) definirSite(a.site)
        setAdmin(a)
      },
      () => setAdmin(null),
    )
    const saiu = () => {
      setAdmin(null)
      avisar('Sua sessão terminou. Entre de novo.', 'erro')
    }
    window.addEventListener(EVENTO_SAIU, saiu)
    return () => window.removeEventListener(EVENTO_SAIU, saiu)
  }, [])

  const entrou = (a: Admin) => {
    definirSite(a.site)
    setAdmin(a)
    if (tela.nome === 'entrar' || tela.nome === 'convite') ir('/painel', { substituir: true, forcar: true })
  }

  let conteudo
  if (tela.nome === 'convite') conteudo = <Convite token={tela.token} aoEntrar={entrou} />
  else if (admin === undefined) conteudo = <Carregando />
  else if (!admin) conteudo = <Entrar aoEntrar={entrou} />
  else conteudo = <Moldura admin={admin} tela={tela} aoSair={() => setAdmin(null)} />

  return (
    <>
      {conteudo}
      <Avisos />
      <Confirmacao />
    </>
  )
}

/** quantos pedidos pagos esperam envio (o número na aba Pedidos); confere de novo ao trocar de tela */
function usePraEnviar(tela: Tela) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    const contar = () =>
      api<{ paraEnviar: number }>('GET', '/pedidos/contagem').then(
        (r) => vivo && setN(r.paraEnviar),
        () => {},
      )
    contar()
    window.addEventListener(EVENTO_PEDIDOS, contar)
    // a aba aberta: novos pedidos aparecem sem recarregar
    const relogio = setInterval(contar, 60_000)
    return () => {
      vivo = false
      window.removeEventListener(EVENTO_PEDIDOS, contar)
      clearInterval(relogio)
    }
  }, [tela.nome])
  return n
}

function Moldura({ admin, tela, aoSair }: { admin: Admin; tela: Tela; aoSair: () => void }) {
  const praEnviar = usePraEnviar(tela)
  useEffect(() => {
    if (tela.nome === 'entrar') ir('/painel', { substituir: true, forcar: true })
  }, [tela.nome])

  const marca = (caminho: string) =>
    caminho === '/painel/pedidos' && praEnviar > 0 ? (
      <span className="nav-numero" aria-label={`${praEnviar} pra enviar`}>
        {praEnviar > 99 ? '99+' : praEnviar}
      </span>
    ) : null

  const sair = async () => {
    if (!podeSair()) return
    await api('POST', '/sair').catch(() => {})
    aoSair()
    ir('/painel/entrar', { substituir: true, forcar: true })
  }

  return (
    <div className="moldura">
      <header className="topo">
        <a className="topo-marca" href="/painel" onClick={aoClicar('/painel')}>
          Livi <small>painel</small>
        </a>
        <nav className="topo-nav" aria-label="Seções do painel">
          {NAV.map((n) => (
            <a key={n.caminho} href={n.caminho} onClick={aoClicar(n.caminho)} aria-current={n.telas.includes(tela.nome) ? 'page' : undefined}>
              {n.rotulo}
              {marca(n.caminho)}
            </a>
          ))}
        </nav>
        <div className="topo-acoes">
          <a className="topo-botao" href={`${enderecoSite}/`} target="_blank" rel="noreferrer" title="Abrir o site em outra aba">
            {Icone.externo}
            <span>Ver site</span>
          </a>
          <button type="button" className="topo-botao" onClick={sair} title={`Sair (${admin.email})`}>
            {Icone.sair}
            <span>Sair</span>
          </button>
        </div>
      </header>

      <main className="conteudo">
        {tela.nome === 'pecas' && <Pecas />}
        {tela.nome === 'peca' && <PecaForm key={String(tela.id)} id={tela.id} colecaoInicial={tela.colecao} />}
        {tela.nome === 'colecoes' && <Colecoes />}
        {tela.nome === 'colecao' && <ColecaoForm key={String(tela.id)} id={tela.id} />}
        {tela.nome === 'pessoas' && <Pessoas />}
        {tela.nome === 'ajustes' && <Ajustes />}
        {tela.nome === 'pedidos' && <Pedidos />}
        {tela.nome === 'pedido' && <PedidoDetalhe key={tela.id} id={tela.id} />}
        {tela.nome === 'venda' && <NovaVenda />}
      </main>

      <nav className="abas" aria-label="Seções do painel">
        {NAV.map((n) => (
          <a key={n.caminho} href={n.caminho} onClick={aoClicar(n.caminho)} aria-current={n.telas.includes(tela.nome) ? 'page' : undefined}>
            <span className="abas-icone">
              {n.icone}
              {marca(n.caminho)}
            </span>
            <span>{n.rotulo}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
