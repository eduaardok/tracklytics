import { Bell, FlaskConical, Sparkles } from 'lucide-react'
import { KpiCards } from '@shared/components/reportes/KpiCards'
import { TrendChart } from '@shared/components/reportes/TrendChart'
import { DistributionChart } from '@shared/components/reportes/DistributionChart'
import { RankingTable } from '@shared/components/reportes/RankingTable'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { agruparPorDimension, agruparPorPeriodo, fmtNum, fmtPct, num } from './helpers'
import type { InformeConfig } from './registryTypes'

export const PRODUCTO_INFORMES: InformeConfig[] = [
  {
    departamento: 'producto', informe: 'recomendaciones', codigo: 'C28', labelCorto: 'Recomendaciones',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[
          { label: 'Recomendaciones generadas', value: fmtNum(num(resumen.recomendaciones_generadas_total)), icon: Sparkles },
          { label: 'Tasa de conversión promedio', value: fmtPct(num(resumen.tasa_conversion_promedio)) },
        ]} />
        <TrendChart datos={datos} series={[{ key: 'tasa_conversion_recomendacion', label: 'Tasa de conversión %', color: CHART_COLORS.violeta, type: 'line' }]} />
      </>
    ),
  },
  {
    departamento: 'producto', informe: 'ab-tests', codigo: 'C29', labelCorto: 'Experimentos A/B',
    render: (datos, resumen) => {
      const experimentos = (resumen.experimentos as string[] | undefined) ?? []
      const porVariante = agruparPorDimension(datos, 'dimension', 'exposiciones_variante')
      const impactoPorVariante = agruparPorDimension(datos, 'dimension', 'metrica_impacto')
      return (
        <>
          <KpiCards kpis={[
            { label: 'Experimentos', value: experimentos.length, icon: FlaskConical },
            { label: 'Exposiciones totales', value: fmtNum(num(resumen.exposiciones_total)) },
          ]} />
          <DistributionChart datos={porVariante} tipo="bar" />
          <RankingTable
            datos={impactoPorVariante.map((p) => ({ nombre: p.nombre, valor: p.valor }))}
            columnas={[{ key: 'valor', label: 'Impacto acumulado' }]}
          />
        </>
      )
    },
  },
  {
    departamento: 'producto', informe: 'notificaciones', codigo: 'C30', labelCorto: 'Notificaciones',
    render: (datos, resumen) => {
      const porPeriodo = agruparPorPeriodo(datos, ['notificaciones_enviadas', 'notificaciones_leidas'])
      const porTipo = agruparPorDimension(datos, 'dimension', 'notificaciones_enviadas')
      return (
        <>
          <KpiCards kpis={[
            { label: 'Notificaciones enviadas', value: fmtNum(num(resumen.notificaciones_enviadas_total)), icon: Bell },
            { label: 'Tasa de lectura promedio', value: fmtPct(num(resumen.tasa_lectura_promedio)) },
          ]} />
          <TrendChart datos={porPeriodo} series={[
            { key: 'notificaciones_enviadas', label: 'Enviadas', color: CHART_COLORS.violeta, type: 'bar' },
            { key: 'notificaciones_leidas', label: 'Leídas', color: CHART_COLORS.teal, type: 'bar' },
          ]} />
          <DistributionChart datos={porTipo} tipo="pie" />
        </>
      )
    },
  },
]
