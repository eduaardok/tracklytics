import { Users, TrendingDown, CreditCard } from 'lucide-react'
import { KpiCards } from '@shared/components/reportes/KpiCards'
import { TrendChart } from '@shared/components/reportes/TrendChart'
import { DistributionChart } from '@shared/components/reportes/DistributionChart'
import { RankingTable } from '@shared/components/reportes/RankingTable'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { agruparPorDimension, agruparPorPeriodo, fmtMoneda, fmtNum, num } from './helpers'
import type { InformeConfig } from './registryTypes'

export const COMERCIAL_INFORMES: InformeConfig[] = [
  {
    departamento: 'comercial', informe: 'adquisicion', codigo: 'C01', labelCorto: 'Adquisición y CAC',
    render: (datos, resumen) => {
      const porPeriodo = agruparPorPeriodo(datos, ['registros_nuevos'])
      const porPais = agruparPorDimension(datos, 'pais', 'registros_nuevos')
      return (
        <>
          <KpiCards kpis={[
            { label: 'Registros nuevos', value: fmtNum(num(resumen.registros_nuevos_total)), icon: Users },
            { label: 'CAC promedio', value: fmtMoneda(num(resumen.cac_promedio)), icon: CreditCard },
            { label: 'Deserciones', value: fmtNum(num(resumen.deserciones_total)), icon: TrendingDown },
          ]} />
          <TrendChart datos={porPeriodo} series={[{ key: 'registros_nuevos', label: 'Registros nuevos', color: CHART_COLORS.violeta, type: 'bar' }]} />
          <DistributionChart datos={porPais} tipo="bar" />
        </>
      )
    },
  },
  {
    departamento: 'comercial', informe: 'conversion', codigo: 'C02', labelCorto: 'Conversión free→pago',
    render: (datos, resumen) => {
      const porPeriodo = agruparPorPeriodo(datos, ['conversiones_free_to_paid'])
      const porPlan = agruparPorDimension(datos, 'plan', 'conversiones_free_to_paid')
      return (
        <>
          <KpiCards kpis={[
            { label: 'Conversiones free→pago', value: fmtNum(num(resumen.conversiones_total)) },
            { label: 'Deserciones', value: fmtNum(num(resumen.deserciones_total)) },
          ]} />
          <TrendChart datos={porPeriodo} series={[{ key: 'conversiones_free_to_paid', label: 'Conversiones', color: CHART_COLORS.violeta }]} />
          <RankingTable
            datos={porPlan.map((p) => ({ nombre: p.nombre, valor: p.valor }))}
            columnas={[{ key: 'valor', label: 'Conversiones' }]}
          />
        </>
      )
    },
  },
  {
    departamento: 'comercial', informe: 'suscripciones', codigo: 'C03', labelCorto: 'Suscriptores por plan',
    render: (datos, resumen) => {
      const activasPorPlan = agruparPorDimension(datos, 'plan', 'suscripciones_activas')
      const porPeriodo = agruparPorPeriodo(datos, ['suscripciones_activas'])
      const ultimoPeriodo = String(resumen.periodo_mas_reciente ?? '')
      return (
        <>
          <KpiCards kpis={[
            { label: 'Suscriptores activos (total)', value: fmtNum(activasPorPlan.reduce((a, p) => a + p.valor, 0)) },
            { label: 'Último período', value: ultimoPeriodo || '—' },
          ]} />
          <DistributionChart datos={activasPorPlan} tipo="pie" />
          <TrendChart datos={porPeriodo} series={[{ key: 'suscripciones_activas', label: 'Suscriptores activos', color: CHART_COLORS.violeta, type: 'area' }]} />
        </>
      )
    },
  },
]
