import { DollarSign, Receipt, TrendingUp } from 'lucide-react'
import { KpiCards } from '@shared/components/reportes/KpiCards'
import { TrendChart } from '@shared/components/reportes/TrendChart'
import { RankingTable } from '@shared/components/reportes/RankingTable'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { agruparPorDimension, agruparPorPeriodo, fmtMoneda, fmtNum, fmtPct, num } from './helpers'
import type { InformeConfig } from './registryTypes'

export const FINANCIERO_INFORMES: InformeConfig[] = [
  {
    departamento: 'financiero', informe: 'mrr-arr', codigo: 'C07', labelCorto: 'MRR / ARR',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[
          { label: 'MRR actual', value: fmtMoneda(num(resumen.mrr_actual)), icon: DollarSign, helpText: 'Monthly Recurring Revenue: ingreso recurrente que generan las suscripciones activas en el mes.' },
          { label: 'ARR actual', value: fmtMoneda(num(resumen.arr_actual)), icon: TrendingUp, helpText: 'Annual Recurring Revenue: el MRR proyectado a 12 meses (MRR × 12).' },
          { label: 'Margen neto acumulado', value: fmtMoneda(num(resumen.margen_neto_acumulado)), icon: Receipt },
        ]} />
        <TrendChart datos={datos} series={[
          { key: 'ingresos_suscripciones', label: 'Ingresos suscripciones', color: CHART_COLORS.violeta, type: 'area' },
          { key: 'ingresos_publicidad', label: 'Ingresos publicidad', color: CHART_COLORS.azul, type: 'area' },
          { key: 'gastos_total', label: 'Gastos', color: CHART_COLORS.ambar, type: 'line' },
        ]} />
      </>
    ),
  },
  {
    departamento: 'financiero', informe: 'gastos-vs-ingresos', codigo: 'C08', labelCorto: 'Gastos vs. ingresos',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[
          { label: 'Ingresos totales', value: fmtMoneda(num(resumen.ingresos_total)) },
          { label: 'Gastos totales', value: fmtMoneda(num(resumen.gastos_total)) },
          { label: 'Reembolsos totales', value: fmtMoneda(num(resumen.reembolsos_total)) },
        ]} />
        {/* Mismo eje (ambas son cifras en USD del mismo período) — sin
            dual-axis, ver dataviz skill "One axis". */}
        <TrendChart datos={datos} series={[
          { key: 'ingresos_suscripciones', label: 'Ingresos suscripción', color: CHART_COLORS.violeta, type: 'bar' },
          { key: 'ingresos_publicidad', label: 'Ingresos publicidad', color: CHART_COLORS.azul, type: 'bar' },
          { key: 'gastos_total', label: 'Gastos', color: CHART_COLORS.ambar, type: 'bar' },
        ]} />
      </>
    ),
  },
  {
    departamento: 'financiero', informe: 'regalias', codigo: 'C09', labelCorto: 'Regalías liquidadas',
    render: (datos, resumen) => {
      const porSello = agruparPorDimension(datos, 'sello', 'monto_liquidado')
      const porPeriodo = agruparPorPeriodo(datos, ['monto_liquidado'])
      return (
        <>
          <KpiCards kpis={[
            { label: 'Monto liquidado total', value: fmtMoneda(num(resumen.monto_liquidado_total)) },
            { label: 'Reproducciones totales', value: fmtNum(num(resumen.reproducciones_total)) },
          ]} />
          <TrendChart
            datos={porPeriodo}
            series={[{ key: 'monto_liquidado', label: 'Monto liquidado', color: CHART_COLORS.violeta, type: 'bar' }]}
          />
          <RankingTable
            datos={porSello.map((p) => ({ nombre: p.nombre, valor: p.valor }))}
            columnas={[{ key: 'valor', label: 'Monto liquidado', format: 'currency' }]}
          />
        </>
      )
    },
  },
  {
    departamento: 'financiero', informe: 'publicidad', codigo: 'C10', labelCorto: 'Ingresos publicitarios',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[{ label: 'Ingresos publicitarios totales', value: fmtMoneda(num(resumen.ingresos_publicidad_total)) }]} />
        <TrendChart datos={datos} series={[{ key: 'ingresos_publicidad', label: 'Ingresos publicidad', color: CHART_COLORS.azul, type: 'area' }]} />
      </>
    ),
  },
  {
    departamento: 'financiero', informe: 'facturacion', codigo: 'C11', labelCorto: 'Facturación y cobro',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[
          { label: 'Facturas emitidas', value: fmtNum(num(resumen.facturas_emitidas_total)) },
          { label: 'Facturas cobradas', value: fmtNum(num(resumen.facturas_cobradas_total)) },
          { label: 'Tasa de cobro promedio', value: fmtPct(num(resumen.tasa_cobro_promedio)) },
        ]} />
        <TrendChart datos={datos} series={[
          { key: 'facturas_emitidas', label: 'Emitidas', color: CHART_COLORS.violeta, type: 'bar' },
          { key: 'facturas_cobradas', label: 'Cobradas', color: CHART_COLORS.teal, type: 'bar' },
        ]} />
      </>
    ),
  },
]
