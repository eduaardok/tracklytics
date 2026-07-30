import { CheckCircle2, Clock, Globe } from 'lucide-react'
import { KpiCards } from '@shared/components/reportes/KpiCards'
import { TrendChart } from '@shared/components/reportes/TrendChart'
import { DistributionChart } from '@shared/components/reportes/DistributionChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { fmtNum, fmtPct, num } from './helpers'
import type { InformeConfig } from './registryTypes'

export const CONTENIDO_INFORMES: InformeConfig[] = [
  {
    departamento: 'contenido', informe: 'revision', codigo: 'C19', labelCorto: 'Revisión editorial',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[
          { label: 'Solicitudes recibidas', value: fmtNum(num(resumen.solicitudes_total)), icon: Clock },
          { label: 'Tasa de aprobación promedio', value: fmtPct(num(resumen.tasa_aprobacion_promedio)), icon: CheckCircle2 },
        ]} />
        <TrendChart datos={datos} series={[
          { key: 'aprobadas', label: 'Aprobadas', color: CHART_COLORS.teal, type: 'bar' },
          { key: 'rechazadas', label: 'Rechazadas', color: CHART_COLORS.ambar, type: 'bar' },
        ]} />
      </>
    ),
  },
  {
    departamento: 'contenido', informe: 'licencias', codigo: 'C20', labelCorto: 'Licencias por territorio',
    render: (datos, resumen) => {
      const porTerritorio = (datos as Array<{ territorio: string; licencias_activas: number }>)
        .map((f) => ({ nombre: f.territorio, valor: num(f.licencias_activas) }))
      return (
        <>
          <KpiCards kpis={[
            { label: 'Licencias activas', value: fmtNum(num(resumen.licencias_activas_total)), icon: Globe },
            { label: 'Período', value: String(resumen.periodo ?? '—') },
          ]} />
          <DistributionChart datos={porTerritorio} tipo="bar" />
        </>
      )
    },
  },
  {
    departamento: 'contenido', informe: 'cobertura', codigo: 'C21', labelCorto: 'Cobertura por país',
    render: (datos, resumen) => {
      const porTerritorio = (datos as Array<{ territorio: string; cobertura_pct: number }>)
        .map((f) => ({ nombre: f.territorio, valor: num(f.cobertura_pct) }))
      return (
        <>
          <KpiCards kpis={[{ label: 'Cobertura promedio', value: fmtPct(num(resumen.cobertura_pct_promedio)) }]} />
          <DistributionChart datos={porTerritorio} tipo="pie" />
        </>
      )
    },
  },
]
