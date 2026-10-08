/*
  Visualização rápida (motion-primitives MorphingDialog): o cartão da peça
  se expande num quadro com foto, preço, tamanhos, sacola e WhatsApp,
  sem sair da página.
*/
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  MorphingDialog,
  MorphingDialogClose,
  MorphingDialogContainer,
  MorphingDialogContent,
  MorphingDialogDescription,
  MorphingDialogImage,
  MorphingDialogSubtitle,
  MorphingDialogTitle,
  MorphingDialogTrigger,
  useMorphingDialog,
} from './core/morphing-dialog'
import { precoBR, type Colecao, type Peca } from '../dados/colecoes'
import { linkWhatsApp, mensagemPeca } from '../dados/site'
import { adicionarNaSacola } from '../lib/sacola'
import { pausarRolagem } from '../lib/scroll'
import { cn } from '../lib/cn'
import { BotaoDesejo } from './Sacola'
import { Espaco } from './Espaco'
import { SetaDiagonal, WhatsApp } from './icones'

function FotoOuEspaco({ peca, classe }: { peca: Peca; classe: string }) {
  const { uniqueId } = useMorphingDialog()
  if (peca.fotos[0]) return <MorphingDialogImage src={peca.fotos[0]} alt={peca.nome} className={classe} />
  return (
    <motion.div layoutId={`dialog-img-${uniqueId}`} className={cn(classe, 'vr-espaco')}>
      <Espaco rotulo="Espaço para foto da peça" />
    </motion.div>
  )
}

/** pausa a rolagem suave enquanto o quadro está aberto */
function TravaRolagem() {
  const { isOpen } = useMorphingDialog()
  useEffect(() => {
    pausarRolagem(isOpen)
    return () => pausarRolagem(false)
  }, [isOpen])
  return null
}

function Acoes({ colecao, peca, aoDestacar }: { colecao: Colecao; peca: Peca; aoDestacar: () => void }) {
  const { setIsOpen } = useMorphingDialog()
  const [tamanho, setTamanho] = useState<string | null>(null)
  const [aviso, setAviso] = useState(false)
  const cor = peca.cores[0]
  return (
    <>
      <div className={cn('vr-tamanhos', aviso && !tamanho && 'aviso')} role="radiogroup" aria-label="Tamanho">
        {peca.tamanhos.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tamanho === t}
            className={cn(tamanho === t && 'ativo')}
            onClick={() => {
              setTamanho(t)
              setAviso(false)
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {aviso && !tamanho && <p className="vr-aviso">Escolha um tamanho para continuar.</p>}
      <div className="vr-acoes">
        <button
          type="button"
          className="pilula cheia"
          onClick={() => {
            if (!tamanho) return setAviso(true)
            window.open(linkWhatsApp(mensagemPeca(colecao, peca, cor.nome, tamanho)), '_blank', 'noopener')
          }}
        >
          <WhatsApp className="ico" /> Quero essa peça
        </button>
        <button
          type="button"
          className="pilula"
          onClick={() => adicionarNaSacola({ colecao: colecao.slug, peca: peca.slug, cor: cor.nome, tamanho })}
        >
          Guardar na sacola
        </button>
      </div>
      <button
        type="button"
        className="vr-destacar"
        onClick={() => {
          setIsOpen(false)
          aoDestacar()
        }}
      >
        Ver página da peça <SetaDiagonal className="seta" />
      </button>
    </>
  )
}

export function CartaoPeca({
  colecao,
  peca,
  atual,
  aoDestacar,
}: {
  colecao: Colecao
  peca: Peca
  atual: boolean
  aoDestacar: () => void
}) {
  return (
    <MorphingDialog transition={{ type: 'spring', bounce: 0.06, duration: 0.55 }}>
      <TravaRolagem />
      <div className={cn('pc-card', atual && 'atual')}>
        <MorphingDialogTrigger className="pc-card-gatilho">
          <span className="pc-card-img">
            <FotoOuEspaco peca={peca} classe="pc-card-foto" />
            {atual && <span className="pc-card-selo">Em destaque</span>}
          </span>
          <MorphingDialogTitle className="pc-card-nome">{peca.nome}</MorphingDialogTitle>
          <MorphingDialogSubtitle className="pc-card-preco">{precoBR(peca.preco)}</MorphingDialogSubtitle>
        </MorphingDialogTrigger>
        <BotaoDesejo className="pc-card-desejo" item={{ colecao: colecao.slug, peca: peca.slug, cor: peca.cores[0].nome, tamanho: null }} />
      </div>
      <MorphingDialogContainer>
        <MorphingDialogContent className={cn('vr', `tema-${colecao.tema}`)} style={{ '--fundo': colecao.fundo } as React.CSSProperties}>
          <FotoOuEspaco peca={peca} classe="vr-foto" />
          <div className="vr-info">
            <p className="sobretitulo">Coleção {colecao.nome}</p>
            <MorphingDialogTitle className="vr-nome">{peca.nome}</MorphingDialogTitle>
            <MorphingDialogSubtitle className="vr-preco">{precoBR(peca.preco)}</MorphingDialogSubtitle>
            <MorphingDialogDescription
              disableLayoutAnimation
              variants={{
                initial: { opacity: 0, y: 12 },
                animate: { opacity: 1, y: 0, transition: { delay: 0.15 } },
                exit: { opacity: 0, y: 8 },
              }}
              className="vr-desc"
            >
              <p>{peca.descricao}</p>
              <p className="vr-cor">
                Cor <span style={{ '--c': peca.cores[0].hex } as React.CSSProperties} /> {peca.cores[0].nome}
              </p>
              <Acoes colecao={colecao} peca={peca} aoDestacar={aoDestacar} />
            </MorphingDialogDescription>
          </div>
          <MorphingDialogClose className="vr-fechar" />
        </MorphingDialogContent>
      </MorphingDialogContainer>
    </MorphingDialog>
  )
}
