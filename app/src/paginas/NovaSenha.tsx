/*
  Página da senha nova (/nova-senha/<link>). Quando a cliente esquece a senha,
  a loja manda este link pelo WhatsApp da conta (painel, na página do pedido).
  Ele vale por 24 horas e uma vez só. Com a senha nova, ela já entra e vê os
  pedidos (a gaveta abre na aba "Pedidos").
*/
import { useEffect, useLayoutEffect, useState, type FormEvent } from 'react'
import { conferirLinkSenha, definirSenhaNova, SENHA_MINIMA } from '../lib/conta'
import { navegar } from '../lib/rota'
import { rolarPara } from '../lib/scroll'
import { abrirGaveta } from '../lib/lista'
import { linkWhatsApp } from '../dados/site'
import { CampoSenha } from '../components/Campo'
import { WhatsApp } from '../components/icones'

export function NovaSenha({ link }: { link: string }) {
  // undefined = conferindo o link
  const [estado, setEstado] = useState<{ nome: string } | { erro: string } | undefined>(undefined)
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useLayoutEffect(() => rolarPara(0, { imediato: true }), [])

  useEffect(() => {
    document.title = 'Senha nova · Livi'
    let vivo = true
    void conferirLinkSenha(link).then((r) => vivo && setEstado(r))
    return () => {
      vivo = false
      document.title = 'Livi by LM | Moda feminina autoral'
    }
  }, [link])

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (senha.length < SENHA_MINIMA) return setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
    if (senha !== repetida) return setErro('As duas senhas não são iguais.')
    setEnviando(true)
    const falha = await definirSenhaNova(link, senha)
    if (falha) {
      setErro(falha)
      setEnviando(false)
      return
    }
    // já entrou: vai para o início com os pedidos abertos
    await navegar('/', { substituir: true, semTransicao: true })
    abrirGaveta('pedidos')
  }

  return (
    <main className="pedido">
      <div className="pedido-caixa">
        {!estado ? (
          <p className="pedido-carregando" role="status">
            <span className="pedido-giro" aria-hidden="true" /> Abrindo o link…
          </p>
        ) : 'erro' in estado ? (
          <>
            <h1 className="pedido-titulo">Este link não vale mais.</h1>
            <p className="pedido-texto">{estado.erro}</p>
            <div className="pedido-botoes">
              <a className="pilula cheia" href={linkWhatsApp('Olá! O link de senha nova da minha conta no site da Livi não abriu. Pode mandar outro?')} target="_blank" rel="noreferrer">
                <WhatsApp className="ico" /> Pedir outro link
              </a>
            </div>
          </>
        ) : (
          <>
            <h1 className="pedido-titulo">Senha nova</h1>
            <p className="pedido-texto">
              {estado.nome ? `Olá, ${estado.nome}! ` : ''}Crie uma senha nova para a sua conta. Depois é só entrar com o seu WhatsApp e essa senha.
            </p>
            <form className="compra-bloco senha-nova" onSubmit={salvar} noValidate>
              <CampoSenha rotulo="Senha nova" valor={senha} mudar={setSenha} nova dica={`Pelo menos ${SENHA_MINIMA} caracteres.`} />
              <CampoSenha rotulo="Repita a senha" valor={repetida} mudar={setRepetida} nova />
              {erro && (
                <p className="compra-erro" role="alert">
                  {erro}
                </p>
              )}
              <button type="submit" className="pilula cheia" disabled={enviando}>
                {enviando ? 'Salvando…' : 'Salvar e entrar'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
