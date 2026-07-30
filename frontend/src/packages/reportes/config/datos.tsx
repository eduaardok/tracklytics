import { Clock, Database, Percent } from 'lucide-react'
import { KpiCards } from '@shared/components/reportes/KpiCards'
import { TrendChart } from '@shared/components/reportes/TrendChart'
import { DistributionChart } from '@shared/components/reportes/DistributionChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { fmtNum, fmtPct, num, sumaTotal } from './helpers'
import type { InformeConfig } from './registryTypes'

export const DATOS_INFORMES: InformeConfig[] = [
  {
    departamento: 'datos', informe: 'pipeline', codigo: 'C12', labelCorto: 'Pipeline de ingesta',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[
          { label: 'Duración promedio', value: `${fmtNum(num(resumen.duracion_promedio_s))} s`, icon: Clock },
          { label: 'Registros insertados', value: fmtNum(num(resumen.registros_insertados_total)), icon: Database },
        ]} />
        <TrendChart datos={datos} series={[
          { key: 'duracion_promedio_s', label: 'Duración (s)', color: CHART_COLORS.violeta, type: 'line' },
          { key: 'registros_insertados', label: 'Registros insertados', color: CHART_COLORS.teal, type: 'bar' },
        ]} />
      </>
    ),
  },
  {
    departamento: 'datos', informe: 'calidad', codigo: 'C13', labelCorto: 'Calidad de datos',
    render: (datos, resumen) => {
      const porFuente = [
        { nombre: 'Real', valor: sumaTotal(datos, 'registros_real') },
        { nombre: 'Sintético', valor: sumaTotal(datos, 'registros_synthetic') },
        { nombre: 'Subido por artista', valor: sumaTotal(datos, 'registros_uploaded') },
      ]
      return (
        <>
          <KpiCards kpis={[
            { label: 'Tasa de rechazo promedio', value: fmtPct(num(resumen.tasa_rechazo_promedio)), icon: Percent },
            { label: '% registros válidos', value: fmtPct(num(resumen.pct_valido_promedio)) },
          ]} />
          <DistributionChart datos={porFuente} tipo="pie" />
          <TrendChart datos={datos} series={[{ key: 'tasa_rechazo', label: 'Tasa de rechazo %', color: CHART_COLORS.ambar, type: 'line' }]} />
        </>
      )
    },
  },
]
