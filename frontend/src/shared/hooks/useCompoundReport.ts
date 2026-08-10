import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportesApi } from '@packages/reportes/api/reportes.api'
import { apiErrorMessage } from '@shared/lib/api-client'
import type { FilaInforme } from '@packages/reportes/types'

// Hook único para los 30 informes compuestos (S13-P3b) — trae el rango
// COMPLETO una sola vez (los 30 endpoints devuelven como mucho ~180 filas,
// ver docs/BITACORA_S13.md P3a) y filtra el rango de período elegido
// EN CLIENTE, sin volver a pegarle al backend por cada cambio de selector
// — ambos extremos (`periodoInicio`/`periodoFin`) son strings ISO
// 'YYYY-WNN', que ordenan correctamente por comparación lexicográfica.
export function useCompoundReport(departamento: string, informe: string) {
  const [periodoInicio, setPeriodoInicio] = useState<string | null>(null)
  const [periodoFin, setPeriodoFin] = useState<string | null>(null)
  const [granularidad, setGranularidad] = useState('mes')

  const query = useQuery({
    queryKey: ['reportes', 'compuesto', departamento, informe, granularidad],
    queryFn:  () => reportesApi.compuesto(departamento, informe, { granularidad }),
  })

  const todos: FilaInforme[] = query.data?.datos ?? []

  const periodosDisponibles = useMemo(
    () => Array.from(new Set(todos.map((d) => d.periodo).filter((p): p is string => !!p))).sort(),
    [todos],
  )

  const datos = useMemo(() => todos.filter((d) => {
    const p = d.periodo
    if (!p) return true
    if (periodoInicio && p < periodoInicio) return false
    if (periodoFin && p > periodoFin) return false
    return true
  }), [todos, periodoInicio, periodoFin])

  const hayEstimados = datos.some((d) => Number(d.es_estimado) === 1)
  const ultimaActualizacion = todos.reduce<string | null>((max, d) => {
    const u = d.updated_at
    return typeof u === 'string' && (!max || u > max) ? u : max
  }, null)

  function onPeriodoChange(inicio: string | null, fin: string | null) {
    setPeriodoInicio(inicio)
    setPeriodoFin(fin)
  }

  // Cambiar de granularidad cambia el formato del string de período
  // ('2026-W20' en semana vs '2026-03' en mes, etc.) — un filtro de rango
  // heredado de la granularidad anterior ya no compara nada sensato, así
  // que se limpia junto con el cambio.
  function onGranularidadChange(nueva: string) {
    setGranularidad(nueva)
    setPeriodoInicio(null)
    setPeriodoFin(null)
  }

  return {
    datos,
    resumen: query.data?.resumen ?? {},
    titulo: query.data?.titulo ?? '',
    objetivo: query.data?.objetivo ?? '',
    departamentoLabel: query.data?.departamento ?? '',
    loading: query.isLoading,
    error: query.isError ? apiErrorMessage(query.error, 'No se pudo cargar el informe.') : null,
    refetch: query.refetch,
    periodosDisponibles,
    periodoInicio,
    periodoFin,
    onPeriodoChange,
    granularidad,
    onGranularidadChange,
    hayEstimados,
    ultimaActualizacion,
  }
}
