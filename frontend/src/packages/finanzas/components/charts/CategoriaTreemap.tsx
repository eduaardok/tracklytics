import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import { ChartTooltip } from '@shared/components/charts/ChartTooltip'
import { formatTooltipValue } from '@shared/components/charts/format'
import type { CategoriaGasto } from '../../types'
import styles from './charts.module.css'

// Paleta categórica de `finanzas` — extiende CHART_COLORS (violeta/teal/
// ambar, ya validada para el proyecto) con 5 tonos más en la misma banda de
// luminosidad/croma (L 0.64, C 0.15) rotando el hue en pasos ~45°, porque
// gastos operativos tiene 8 categorías fijas y la paleta de 3 no alcanza.
const CATEGORIA_COLOR: Record<CategoriaGasto, string> = {
  infraestructura: 'oklch(0.64 0.15 290)', // violeta (CHART_COLORS.violeta)
  marketing:       'oklch(0.65 0.14 195)', // teal (CHART_COLORS.teal)
  nomina:          'oklch(0.62 0.16 70)',  // ambar (CHART_COLORS.ambar)
  licencias:       'oklch(0.64 0.15 235)',
  servicios:       'oklch(0.64 0.15 155)',
  soporte:         'oklch(0.64 0.15 335)',
  legal:           'oklch(0.64 0.15 115)',
  otros:           'oklch(0.58 0.010 285)', // gris — categoría catch-all, deliberadamente neutra
}

const LABEL_LEGIBLE: Record<CategoriaGasto, string> = {
  infraestructura: 'Infraestructura', marketing: 'Marketing', nomina: 'Nómina',
  licencias: 'Licencias', servicios: 'Servicios', soporte: 'Soporte', legal: 'Legal', otros: 'Otros',
}

export type TreemapDatum = { categoria: CategoriaGasto; total: number }

function TreemapCell(props: { x?: number; y?: number; width?: number; height?: number; categoria?: CategoriaGasto; total?: number }) {
  const { x = 0, y = 0, width = 0, height = 0, categoria, total } = props
  if (!categoria || width <= 0 || height <= 0) return null
  const fill = CATEGORIA_COLOR[categoria]
  const showLabel = width > 64 && height > 32

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.82} stroke="oklch(0.09 0.010 285)" strokeWidth={2} rx={4} />
      {showLabel && (
        <>
          <text x={x + 8} y={y + 18} fontSize={11.5} fontFamily="var(--font-sans)" fontWeight={600} fill="oklch(0.09 0.010 285)">
            {LABEL_LEGIBLE[categoria]}
          </text>
          <text x={x + 8} y={y + 34} fontSize={10.5} fontFamily="var(--font-mono)" fill="oklch(0.09 0.010 285)" opacity={0.85}>
            {formatTooltipValue(total)}
          </text>
        </>
      )}
    </g>
  )
}

// Proporción de gasto por categoría — un treemap comunica "cuánto pesa cada
// categoría del total" con área en vez de longitud/ángulo, y a diferencia de
// un donut de 8 rebanadas, no obliga a leer una leyenda aparte: el nombre y
// el monto viven dentro del propio bloque cuando hay espacio.
export function CategoriaTreemap({ data, emptyLabel = 'Sin gastos registrados en este rango.' }: { data: TreemapDatum[]; emptyLabel?: string }) {
  const filtered = data.filter((d) => d.total > 0)
  if (filtered.length === 0) return <div className={styles.emptyChart}>{emptyLabel}</div>

  return (
    <div className={styles.chartBoxTall}>
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={filtered}
          dataKey="total"
          nameKey="categoria"
          content={<TreemapCell />}
          animationDuration={300}
        >
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null
              const p = payload[0].payload as TreemapDatum
              return <ChartTooltip rows={[{ label: LABEL_LEGIBLE[p.categoria], color: CATEGORIA_COLOR[p.categoria], value: formatTooltipValue(p.total) }]} />
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  )
}
