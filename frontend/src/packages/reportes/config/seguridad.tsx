import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { KpiCards } from '@shared/components/reportes/KpiCards'
import { TrendChart } from '@shared/components/reportes/TrendChart'
import { CATEGORICAL_ORDER } from '@shared/components/charts/colors'
import { fmtNum, fmtPct, num, pivotPorDimension } from './helpers'
import type { InformeConfig } from './registryTypes'

export const SEGURIDAD_INFORMES: InformeConfig[] = [
  {
    departamento: 'seguridad', informe: 'auditoria', codigo: 'C26', labelCorto: 'Auditoría',
    render: (datos, resumen) => {
      const { filas, dimensiones } = pivotPorDimension(datos, 'tipo_evento', 'eventos_auditoria_total', 6)
      return (
        <>
          <KpiCards kpis={[{ label: 'Eventos de auditoría totales', value: fmtNum(num(resumen.eventos_total)), icon: ShieldCheck }]} />
          <TrendChart
            datos={filas}
            series={dimensiones.map((d, i) => ({ key: d, label: d, color: CATEGORICAL_ORDER[i % CATEGORICAL_ORDER.length], type: 'bar' }))}
          />
        </>
      )
    },
  },
  {
    departamento: 'seguridad', informe: 'sanciones', codigo: 'C27', labelCorto: 'Sanciones',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[
          { label: 'Sanciones emitidas', value: fmtNum(num(resumen.sanciones_emitidas_total)), icon: ShieldAlert },
          { label: 'Suspensiones automáticas', value: fmtNum(num(resumen.suspensiones_automaticas_total)) },
          { label: 'Tasa de suspensión promedio', value: fmtPct(num(resumen.tasa_suspension_promedio)) },
        ]} />
        <TrendChart datos={datos} series={[
          { key: 'sanciones_emitidas', label: 'Sanciones emitidas', color: 'oklch(0.65 0.22 25)', type: 'bar' },
          { key: 'suspensiones_automaticas', label: 'Suspensiones automáticas', color: 'oklch(0.62 0.15 250)', type: 'line' },
        ]} />
      </>
    ),
  },
]
