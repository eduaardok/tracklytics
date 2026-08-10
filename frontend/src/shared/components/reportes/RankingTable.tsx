import { memo, useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { EmptyState } from '@shared/components/EmptyState'
import styles from './RankingTable.module.css'

export type RankingColumn = { key: string; label: string; format?: 'number' | 'percent' | 'currency' }
export type RankingRow = { nombre: string; variacionPct?: number } & Record<string, unknown>

type Props = {
  datos:      RankingRow[]
  columnas:   RankingColumn[]
  variacion?: boolean
  porPagina?: number
}

function formatear(valor: unknown, formato?: RankingColumn['format']): string {
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(n)) return String(valor ?? '—')
  if (formato === 'percent') return `${n.toLocaleString('es', { maximumFractionDigits: 1 })}%`
  if (formato === 'currency') return `$${n.toLocaleString('es', { maximumFractionDigits: 2 })}`
  return n.toLocaleString('es', { maximumFractionDigits: 2 })
}

function posClass(pos: number): string {
  if (pos === 1) return styles.posTop1
  if (pos === 2) return styles.posTop2
  if (pos === 3) return styles.posTop3
  return ''
}

// Tabla de ranking (S13-P3b) — géneros/artistas/partners/contratos/sellos
// ordenados por una métrica principal, con badge de posición (top 3
// destacado) y variación % opcional.
export const RankingTable = memo(function RankingTable({ datos, columnas, variacion = false, porPagina = 20 }: Props) {
  const [pagina, setPagina] = useState(1)

  if (datos.length === 0) {
    return <EmptyState icon="( ∅ )" title="Sin datos para este ranking" body="Prueba ampliando el rango de período." />
  }

  const totalPaginas = Math.max(1, Math.ceil(datos.length / porPagina))
  const visibles = datos.slice((pagina - 1) * porPagina, pagina * porPagina)

  return (
    <div>
      <div className={styles.wrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              {columnas.map((c) => <th key={c.key} className={styles.thRight}>{c.label}</th>)}
              {variacion && <th className={styles.thRight}>Variación</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.map((fila, i) => {
              const posicion = (pagina - 1) * porPagina + i + 1
              const v = fila.variacionPct
              const positiva = (v ?? 0) >= 0
              return (
                <tr key={`${fila.nombre}-${posicion}`}>
                  <td><span className={`${styles.posBadge} ${posClass(posicion)}`}>{posicion}</span></td>
                  <td>{fila.nombre}</td>
                  {columnas.map((c) => (
                    <td key={c.key} className={styles.tdRight}>{formatear(fila[c.key], c.format)}</td>
                  ))}
                  {variacion && (
                    <td className={styles.tdRight}>
                      {v !== undefined && (
                        <span className={`${styles.variacion} ${positiva ? styles.variacionUp : styles.variacionDown}`}>
                          {positiva ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
                          {Math.abs(v).toFixed(1)}%
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className={styles.pager}>
          <span>Página {pagina} / {totalPaginas} · {datos.length} filas</span>
          <div className={styles.pagerBtns}>
            <button type="button" className={styles.pagerBtn} disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>← Anterior</button>
            <button type="button" className={styles.pagerBtn} disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Siguiente →</button>
          </div>
        </div>
      )}
    </div>
  )
})
