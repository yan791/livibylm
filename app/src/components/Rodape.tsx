import { site, linkWhatsApp } from '../dados/site'
import { colecoes } from '../dados/colecoes'
import { type Rota } from '../lib/rota'
import { mostrarCatalogo } from '../lib/catalogo'
import { irPara } from './Cabecalho'
import { Logo } from './Logo'
import { Instagram, SetaDiagonal, WhatsApp } from './icones'

export function Rodape({ rota }: { rota: Rota }) {
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
            href={'/' + m.href}
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
            href={`/colecao/${c.slug}`}
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
      </div>
      <p className="rodape-fim">© {new Date().getFullYear()} Livi by LM. Todos os direitos reservados.</p>
    </footer>
  )
}
