import { site } from '../dados/site'
import { cn } from '../lib/cn'

/**
 * Logo da Livi. Enquanto o arquivo do logo não chega (site.logo = null),
 * mostra um espaço reservado neutro, de propósito sem imitar a assinatura.
 */
export function Logo({ className, claro = false }: { className?: string; claro?: boolean }) {
  if (site.logo)
    return <img src={site.logo} alt="Livi by LM" className={cn('logo-img', className)} draggable={false} />
  return (
    <span className={cn('logo-provisorio', claro && 'claro', className)} aria-label="Livi by LM">
      <span className="logo-provisorio-nome">LIVI</span>
      <span className="logo-provisorio-sub">by LM</span>
    </span>
  )
}
