import { medidas } from '../dados/site'
import { cn } from '../lib/cn'

/** tabela de medidas, em cm; na peça, a linha do tamanho escolhido fica marcada */
export function TabelaMedidas({ destaque, className }: { destaque?: string | null; className?: string }) {
  return (
    <table className={cn('medidas', className)}>
      <caption>Medidas em centímetros</caption>
      <thead>
        <tr>
          <th scope="col">Tamanho</th>
          <th scope="col">Busto</th>
          <th scope="col">Cintura</th>
          <th scope="col">Quadril</th>
        </tr>
      </thead>
      <tbody>
        {medidas.map((m) => (
          <tr key={m.tamanho} className={cn(m.tamanho === destaque && 'ativo')}>
            <th scope="row">{m.tamanho}</th>
            <td>{m.busto}</td>
            <td>{m.cintura}</td>
            <td>{m.quadril}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
