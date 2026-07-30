import { Flag, Heart, MessageSquare, Ticket } from 'lucide-react'
import { KpiCards } from '@shared/components/reportes/KpiCards'
import { TrendChart } from '@shared/components/reportes/TrendChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { fmtNum, num } from './helpers'
import type { InformeConfig } from './registryTypes'

export const COMUNIDAD_INFORMES: InformeConfig[] = [
  {
    departamento: 'comunidad', informe: 'moderacion', codigo: 'C22', labelCorto: 'Moderación',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[{ label: 'Acciones de moderación', value: fmtNum(num(resumen.acciones_moderacion_total)), icon: MessageSquare }]} />
        <TrendChart datos={datos} series={[{ key: 'acciones_moderacion', label: 'Acciones de moderación', color: CHART_COLORS.violeta, type: 'bar' }]} />
      </>
    ),
  },
  {
    departamento: 'comunidad', informe: 'denuncias', codigo: 'C23', labelCorto: 'Denuncias',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[
          { label: 'Denuncias recibidas', value: fmtNum(num(resumen.denuncias_recibidas_total)), icon: Flag },
          { label: 'Denuncias resueltas', value: fmtNum(num(resumen.denuncias_resueltas_total)) },
          { label: 'Sanciones derivadas', value: fmtNum(num(resumen.sanciones_derivadas_total)) },
        ]} />
        <TrendChart datos={datos} series={[
          { key: 'denuncias_recibidas', label: 'Denuncias recibidas', color: CHART_COLORS.ambar, type: 'bar' },
          { key: 'sanciones_derivadas', label: 'Sanciones derivadas', color: CHART_COLORS.violeta, type: 'line' },
        ]} />
      </>
    ),
  },
  {
    departamento: 'comunidad', informe: 'soporte', codigo: 'C24', labelCorto: 'Soporte / tickets',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[
          { label: 'Tickets abiertos', value: fmtNum(num(resumen.tickets_abiertos_total)), icon: Ticket },
          { label: 'Tickets resueltos', value: fmtNum(num(resumen.tickets_resueltos_total)) },
          { label: 'Tiempo resolución promedio', value: `${fmtNum(num(resumen.tiempo_resolucion_promedio_h))} h` },
        ]} />
        <TrendChart datos={datos} series={[
          { key: 'tickets_abiertos', label: 'Abiertos', color: CHART_COLORS.ambar, type: 'bar' },
          { key: 'tickets_resueltos', label: 'Resueltos', color: CHART_COLORS.teal, type: 'bar' },
        ]} />
      </>
    ),
  },
  {
    departamento: 'comunidad', informe: 'interacciones', codigo: 'C25', labelCorto: 'Actividad social',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[
          { label: 'Interacciones totales', value: fmtNum(num(resumen.interacciones_total)), icon: Heart },
          { label: 'Crecimiento promedio', value: `${num(resumen.crecimiento_pct_promedio).toFixed(1)}%`, trend: num(resumen.crecimiento_pct_promedio) },
        ]} />
        <TrendChart datos={datos} series={[{ key: 'interacciones_sociales_total', label: 'Interacciones', color: CHART_COLORS.violeta, type: 'area' }]} />
      </>
    ),
  },
]
