import { site, linkWhatsApp } from '../dados/site'
import { ajustes, colecoes } from '../dados/colecoes'
import { type Rota } from '../lib/rota'
import { mostrarCatalogo } from '../lib/catalogo'
import { irPara } from './Cabecalho'
import { Logo } from './Logo'
import { Instagram, SetaDiagonal, WhatsApp } from './icones'
import { comBase } from '../lib/base'
import { LinkPolitica } from '../paginas/Politica'

export function Rodape({ rota }: { rota: Rota }) {
  const loja = ajustes.loja
  return (
    <footer className="rodape">
      <div className="rodape-marca">
        <Logo claro />
        <p>Moda feminina autoral.</p>
      </div>
      <nav className="rodape-col" aria-label="Navegação do rodapé">
        <p className="sobretitulo">Navegação</p>
        {site.menu.map((m) => (
          <a
            key={m.href}
            href={comBase('/' + m.href)}
            onClick={(e) => {
              e.preventDefault()
              irPara(m.href, rota)
            }}
          >
            {m.rotulo}
          </a>
        ))}
      </nav>
      <nav className="rodape-col" aria-label="Coleções">
        <p className="sobretitulo">Coleções</p>
        {colecoes.map((c) => (
          <a
            key={c.slug}
            href={comBase(`/colecao/${c.slug}`)}
            onClick={(e) => {
              e.preventDefault()
              mostrarCatalogo(c.slug)
            }}
          >
            {c.nome}
          </a>
        ))}
      </nav>
      <div className="rodape-col">
        <p className="sobretitulo">Atendimento</p>
        <a href={linkWhatsApp()} target="_blank" rel="noreferrer">
          <WhatsApp className="ico" /> WhatsApp <SetaDiagonal className="seta" />
        </a>
        <a href={site.instagram} target="_blank" rel="noreferrer">
          <Instagram className="ico" /> {site.instagramArroba}
        </a>
        {/* as políticas aparecem quando a loja preenche os dados dela no painel (Ajustes) */}
        {loja && (
          <>
            <LinkPolitica nome="trocas" />
            <LinkPolitica nome="privacidade" />
          </>
        )}
      </div>
      <div className="rodape-fim">
        <p>© {new Date().getFullYear()} Livi by LM. Todos os direitos reservados.</p>
        {loja && (
          <p className="rodape-loja">
            {[loja.nome, `${loja.documento.length > 14 ? 'CNPJ' : 'CPF'} ${loja.documento}`, loja.endereco, loja.email].join(' · ')}
          </p>
        )}
      </div>
    </footer>
  )
}
