import { cn } from '../lib/cn'
import { IconeCabide } from './icones'

/** espaço reservado para uma foto que ainda vai chegar */
export function Espaco({ rotulo, className, proporcao = '3 / 4' }: { rotulo: string; className?: string; proporcao?: string }) {
  return (
    <div className={cn('espaco', className)} style={{ aspectRatio: proporcao }} role="img" aria-label={`${rotulo} (em breve)`}>
      <IconeCabide className="espaco-icone" />
      <span>{rotulo}</span>
    </div>
  )
}

/** texto que ainda precisa ser confirmado com a cliente */
export function Ph({ children }: { children: React.ReactNode }) {
  return (
    <span className="ph" title="Aguardando confirmação da cliente">
      {children}
    </span>
  )
}
