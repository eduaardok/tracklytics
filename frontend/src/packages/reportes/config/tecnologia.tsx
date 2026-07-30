import { Activity, AlertTriangle, Gauge, Percent } from 'lucide-react'
import { KpiCards } from '@shared/components/reportes/KpiCards'
import { TrendChart } from '@shared/components/reportes/TrendChart'
import { DistributionChart } from '@shared/components/reportes/DistributionChart'
import { RankingTable } from '@shared/components/reportes/RankingTable'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { agruparPorDimension, agruparPorPeriodo, fmtNum, fmtPct, num, promedioPorPeriodo } from './helpers'
import type { FilaInforme } from '../types'
import type { InformeConfig } from './registryTypes'

function promedioPorGrupo(datos: FilaInforme[], dimKey: string, valKey: string): Array<{ nombre: string; valor: number }> {
  const sumas = new Map<string, number>()
  const conteos = new Map<string, number>()
  for (const f of datos) {
    const nombre = String(f[dimKey] ?? 'Sin dato')
    sumas.set(nombre, (sumas.get(nombre) ?? 0) + num(f[valKey]))
    conteos.set(nombre, (conteos.get(nombre) ?? 0) + 1)
  }
  return Array.from(sumas.keys()).map((nombre) => ({
    nombre, valor: Math.round((sumas.get(nombre)! / conteos.get(nombre)!) * 100) / 100,
  }))
}

export const TECNOLOGIA_INFORMES: InformeConfig[] = [
  {
    departamento: 'tecnologia', informe: 'api-consumo', codigo: 'C04', labelCorto: 'Consumo de API',
    render: (datos, resumen) => {
      const porPeriodo = agruparPorPeriodo(datos, ['total_llamadas'])
      const porPartner = agruparPorDimension(datos, 'partner_id', 'total_llamadas')
      return (
        <>
          <KpiCards kpis={[
            { label: 'Llamadas totales', value: fmtNum(num(resumen.total_llamadas)), icon: Activity },
            { label: 'Tasa de éxito promedio', value: fmtPct(num(resumen.tasa_exito_promedio)), icon: Percent },
            { label: 'Latencia promedio', value: `${fmtNum(num(resumen.latencia_promedio_ms))} ms`, icon: Gauge },
          ]} />
          <TrendChart datos={porPeriodo} series={[{ key: 'total_llamadas', label: 'Llamadas', color: CHART_COLORS.violeta, type: 'bar' }]} />
          <RankingTable
            datos={porPartner.map((p) => ({ nombre: p.nombre, valor: p.valor }))}
            columnas={[{ key: 'valor', label: 'Llamadas' }]}
          />
        </>
      )
    },
  },
  {
    departamento: 'tecnologia', informe: 'disponibilidad', codigo: 'C05', labelCorto: 'Disponibilidad',
    render: (datos, resumen) => {
      const porPeriodo = promedioPorPeriodo(datos, 'uptime_porcentaje')
      const peoresComponentes = promedioPorGrupo(datos, 'componente', 'uptime_porcentaje').sort((a, b) => a.valor - b.valor)
      return (
        <>
          <KpiCards kpis={[
            { label: 'Uptime promedio', value: fmtPct(num(resumen.uptime_promedio)), icon: Gauge },
            { label: 'Incidentes totales', value: fmtNum(num(resumen.incidentes_total)), icon: AlertTriangle },
          ]} />
          <TrendChart datos={porPeriodo} series={[{ key: 'uptime_porcentaje', label: 'Uptime %', color: CHART_COLORS.teal, type: 'area' }]} />
          <RankingTable
            datos={peoresComponentes.map((p) => ({ nombre: p.nombre, valor: p.valor }))}
            columnas={[{ key: 'valor', label: 'Uptime %', format: 'percent' }]}
          />
        </>
      )
    },
  },
  {
    departamento: 'tecnologia', informe: 'errores', codigo: 'C06', labelCorto: 'Errores del sistema',
    render: (datos, resumen) => {
      const porPeriodo = agruparPorPeriodo(datos, ['errores_total'])
      const porComponente = agruparPorDimension(datos, 'componente', 'errores_total')
      return (
        <>
          <KpiCards kpis={[
            { label: 'Errores totales', value: fmtNum(num(resumen.errores_total)) },
            { label: 'Errores críticos', value: fmtNum(num(resumen.errores_criticos_total)) },
          ]} />
          <TrendChart datos={porPeriodo} series={[{ key: 'errores_total', label: 'Errores', color: CHART_COLORS.ambar, type: 'bar' }]} />
          <DistributionChart datos={porComponente} tipo="bar" />
        </>
      )
    },
  },
]
