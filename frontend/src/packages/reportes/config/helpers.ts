import type { FilaInforme } from '../types'

// Helpers compartidos por los 30 configs de informes (S13-P3b) — cada
// endpoint de Gold devuelve una fila por (periodo, dimensión), así que casi
// todos los configs necesitan agrupar por período (para TrendChart) o por
// dimensión (para DistributionChart/RankingTable) antes de pasarle los datos
// a la plantilla. Un solo lugar para esa lógica en vez de repetirla 30 veces.

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function agruparPorPeriodo(datos: FilaInforme[], claves: string[]): Array<Record<string, unknown>> {
  const mapa = new Map<string, Record<string, unknown>>()
  for (const fila of datos) {
    const periodo = String(fila.periodo ?? '')
    if (!periodo) continue
    const acc = mapa.get(periodo) ?? { periodo }
    for (const clave of claves) acc[clave] = num(acc[clave]) + num(fila[clave])
    mapa.set(periodo, acc)
  }
  return Array.from(mapa.values()).sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)))
}

export function promedioPorPeriodo(datos: FilaInforme[], clave: string): Array<Record<string, unknown>> {
  const sumas = new Map<string, number>()
  const conteos = new Map<string, number>()
  for (const fila of datos) {
    const periodo = String(fila.periodo ?? '')
    if (!periodo) continue
    sumas.set(periodo, (sumas.get(periodo) ?? 0) + num(fila[clave]))
    conteos.set(periodo, (conteos.get(periodo) ?? 0) + 1)
  }
  return Array.from(sumas.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((periodo) => ({ periodo, [clave]: Math.round((sumas.get(periodo)! / conteos.get(periodo)!) * 100) / 100 }))
}

export function agruparPorDimension(datos: FilaInforme[], dimKey: string, valKey: string, excluir: unknown[] = ['']): Array<{ nombre: string; valor: number }> {
  const mapa = new Map<string, number>()
  for (const fila of datos) {
    const dim = fila[dimKey]
    if (excluir.includes(dim)) continue
    const nombre = String(dim ?? 'Sin dato')
    mapa.set(nombre, (mapa.get(nombre) ?? 0) + num(fila[valKey]))
  }
  return Array.from(mapa.entries())
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor)
}

export function sumaTotal(datos: FilaInforme[], clave: string): number {
  return Math.round(datos.reduce((acc, f) => acc + num(f[clave]), 0) * 100) / 100
}

export function promedioSimple(datos: FilaInforme[], clave: string): number {
  const valores = datos.map((f) => num(f[clave]))
  if (valores.length === 0) return 0
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100
}

export function ultimoValor(datos: FilaInforme[], clave: string): number {
  const ordenados = [...datos].sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)))
  return num(ordenados[ordenados.length - 1]?.[clave])
}

// Reacomoda filas (periodo, dimensión, valor) en formato "ancho" — una
// columna por cada una de las N dimensiones con más volumen total, para
// graficar varias series (ej. top 5 géneros) en el mismo TrendChart.
export function pivotPorDimension(datos: FilaInforme[], dimKey: string, valKey: string, topN = 5): {
  filas: Array<Record<string, unknown>>
  dimensiones: string[]
} {
  const totales = agruparPorDimension(datos, dimKey, valKey)
  const top = totales.slice(0, topN).map((t) => t.nombre)
  const mapa = new Map<string, Record<string, unknown>>()
  for (const fila of datos) {
    const dim = String(fila[dimKey] ?? '')
    if (!top.includes(dim)) continue
    const periodo = String(fila.periodo ?? '')
    if (!periodo) continue
    const acc = mapa.get(periodo) ?? { periodo }
    acc[dim] = num(fila[valKey])
    mapa.set(periodo, acc)
  }
  const filas = Array.from(mapa.values()).sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)))
  return { filas, dimensiones: top }
}

export function fmtNum(n: number): string {
  return n.toLocaleString('es', { maximumFractionDigits: 2 })
}

export function fmtMoneda(n: number): string {
  return `$${n.toLocaleString('es', { maximumFractionDigits: 2 })}`
}

export function fmtPct(n: number): string {
  return `${n.toLocaleString('es', { maximumFractionDigits: 1 })}%`
}
