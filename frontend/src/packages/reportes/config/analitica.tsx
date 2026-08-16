import { useMemo, useState } from 'react'
import { Music2, Play, UserPlus, Users } from 'lucide-react'
import { KpiCards } from '@shared/components/reportes/KpiCards'
import { TrendChart } from '@shared/components/reportes/TrendChart'
import { RankingTable } from '@shared/components/reportes/RankingTable'
import { PredictionChart } from '@shared/components/reportes/PredictionChart'
import { CHART_COLORS, CATEGORICAL_ORDER } from '@shared/components/charts/colors'
import { fmtNum, fmtPct, num, pivotPorDimension } from './helpers'
import type { FilaInforme } from '../types'
import type { InformeConfig } from './registryTypes'

function iso_weeks_after(periodo: string, n: number): string[] {
  // Mismo formato 'YYYY-WNN' que el backend — solo necesita sumar semanas
  // dentro del mismo año para las 4 etiquetas de proyección (ventana corta,
  // nunca cruza fin de año en un horizonte de 4 semanas real).
  const [anio, semana] = periodo.split('-W').map(Number)
  return Array.from({ length: n }, (_, i) => `${anio}-W${String(semana + i + 1).padStart(2, '0')}`)
}

function PrediccionesGenero({ datos }: { datos: FilaInforme[] }) {
  const generos = useMemo(() => {
    const conProyeccion = datos.filter((f) => Array.isArray(f.prediccion_4sem) && (f.prediccion_4sem as number[]).length > 0)
    return Array.from(new Set(conProyeccion.map((f) => String(f.genero))))
  }, [datos])
  const [seleccionado, setSeleccionado] = useState(generos[0] ?? '')
  const genero = seleccionado || generos[0] || ''

  const serieGenero = useMemo(
    () => datos.filter((f) => f.genero === genero).sort((a, b) => String(a.periodo).localeCompare(String(b.periodo))),
    [datos, genero],
  )
  const filaConProyeccion = serieGenero.find((f) => Array.isArray(f.prediccion_4sem) && (f.prediccion_4sem as number[]).length > 0)
  const ultimoPeriodo = serieGenero[serieGenero.length - 1]?.periodo as string | undefined
  const proyeccion = (filaConProyeccion?.prediccion_4sem as number[]) ?? []
  const etiquetasProyeccion = ultimoPeriodo ? iso_weeks_after(ultimoPeriodo, proyeccion.length) : []

  if (generos.length === 0) {
    return <RankingTable datos={[]} columnas={[]} />
  }

  return (
    <>
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)', maxWidth: 220 }}>
          Género
          <select
            value={genero}
            onChange={(e) => setSeleccionado(e.target.value)}
            style={{
              background: 'var(--color-surface)', color: 'var(--color-ink)', fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem', padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
            }}
          >
            {generos.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </div>
      <PredictionChart
        datosReales={serieGenero.map((f) => ({ periodo: String(f.periodo), valor: num(f.reproducciones) }))}
        datosProyectados={etiquetasProyeccion.map((periodo, i) => ({ periodo, valor: proyeccion[i] }))}
        metricaLabel="Reproducciones"
      />
      <RankingTable
        datos={[{
          nombre: genero,
          pendiente: filaConProyeccion ? num(filaConProyeccion.pendiente_regresion) : 0,
          intercepto: filaConProyeccion ? num(filaConProyeccion.intercepto_regresion) : 0,
        }]}
        columnas={[
          { key: 'pendiente', label: 'Pendiente (tendencia/semana)' },
          { key: 'intercepto', label: 'Intercepto' },
        ]}
      />
    </>
  )
}

export const ANALITICA_INFORMES: InformeConfig[] = [
  {
    departamento: 'analitica', informe: 'panel-ejecutivo', codigo: 'C14', labelCorto: 'Panel ejecutivo',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[
          { label: 'Reproducciones totales', value: fmtNum(num(resumen.reproducciones_total)), icon: Play },
          { label: 'Usuarios activos (promedio)', value: fmtNum(num(resumen.usuarios_activos_promedio)), icon: Users },
          { label: 'Nuevos usuarios', value: fmtNum(num(resumen.nuevos_usuarios_total)), icon: UserPlus },
          { label: 'Usuarios retenidos', value: fmtNum(num(resumen.usuarios_retenidos_total)) },
        ]} />
        <TrendChart datos={datos} series={[
          { key: 'reproducciones_total', label: 'Reproducciones', color: CHART_COLORS.violeta, type: 'area' },
          { key: 'favoritos_total', label: 'Favoritos', color: CHART_COLORS.azul, type: 'line' },
          { key: 'playlist_adds_total', label: 'Adds a playlist', color: CHART_COLORS.teal, type: 'line' },
        ]} />
        <TrendChart datos={datos} series={[
          { key: 'usuarios_activos', label: 'Usuarios activos', color: CHART_COLORS.violeta, type: 'line' },
          { key: 'nuevos_usuarios', label: 'Nuevos usuarios', color: CHART_COLORS.verde, type: 'bar' },
          { key: 'usuarios_retenidos', label: 'Retenidos', color: CHART_COLORS.ambar, type: 'line' },
        ]} />
      </>
    ),
  },
  {
    departamento: 'analitica', informe: 'ranking-generos', codigo: 'C15', labelCorto: 'Ranking de géneros',
    render: (datos, resumen) => {
      const topGeneros = (resumen.top_generos as Array<{ genero: string; reproducciones: number }> | undefined) ?? []
      const { filas, dimensiones } = pivotPorDimension(datos, 'genero', 'reproducciones', 5)
      return (
        <>
          <RankingTable
            datos={topGeneros.map((g) => ({ nombre: g.genero, valor: g.reproducciones }))}
            columnas={[{ key: 'valor', label: 'Reproducciones' }]}
          />
          <TrendChart
            datos={filas}
            series={dimensiones.map((d, i) => ({ key: d, label: d, color: CATEGORICAL_ORDER[i % CATEGORICAL_ORDER.length] }))}
          />
        </>
      )
    },
  },
  {
    departamento: 'analitica', informe: 'series-temporales', codigo: 'C16', labelCorto: 'Series temporales',
    render: (datos) => (
      <TrendChart
        datos={datos}
        series={[
          { key: 'reproducciones_total', label: 'Reproducciones', color: CHART_COLORS.violeta, type: 'bar' },
          { key: 'promedio_movil_reproducciones', label: 'Promedio móvil (3 semanas)', color: CHART_COLORS.ambar, type: 'line' },
          { key: 'popularidad_promedio', label: 'Popularidad promedio', color: CHART_COLORS.teal, type: 'line' },
        ]}
        altura={400}
      />
    ),
  },
  {
    departamento: 'analitica', informe: 'proyeccion', codigo: 'C17', labelCorto: 'Proyecciones (4 sem.)',
    // `prediccion_4sem` (GOLD_CONSUMO_GENERO_PERIODO) solo se calcula a
    // granularidad semanal - con el default global 'mes' este informe
    // devolvía 0 filas siempre (confirmado: 0 en mes/trimestre, 15 en
    // semana), mostrando "Sin datos" sin ninguna pista de que alcanzaba con
    // cambiar el selector de granularidad.
    granularidadDefault: 'semana',
    render: (datos) => <PrediccionesGenero datos={datos} />,
  },
  {
    departamento: 'analitica', informe: 'benchmark', codigo: 'C18', labelCorto: 'Benchmark vs. catálogo',
    render: (datos, resumen) => (
      <>
        <KpiCards kpis={[{ label: 'Popularidad promedio del catálogo', value: fmtPct(num(resumen.popularidad_catalogo_base)) }]} />
        <RankingTable
          datos={datos.map((f) => ({
            nombre: String(f.genero),
            popularidad_interna: num(f.popularidad_interna_promedio),
            variacionPct: num(f.diferencia_pct_benchmark),
          }))}
          columnas={[{ key: 'popularidad_interna', label: 'Popularidad interna' }]}
          variacion
        />
      </>
    ),
  },
]
