// Compartido por MiniLineChart/MiniBarChart — antes cada uno hacía
// `String(value)` directo en el tooltip, mostrando el float crudo sin
// redondear (ej. "29.969999313354492" en series de dinero agregadas en
// ClickHouse con SUM sobre columnas Float32/Float64, que arrastran ruido de
// precisión real — bugfix QA S10 ronda 2). Tope de 2 decimales redondea
// igual de bien un conteo entero (sin decimales de más) que un monto.
export function formatTooltipValue(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return String(value ?? 0)
  return n.toLocaleString('es-ES', { maximumFractionDigits: 2 })
}

// Series diarias (ej. "Ingreso por día (14 días)"): el eje X con 14 fechas
// ISO completas ("2026-07-13") se superpone. "13/7" es suficiente contexto
// cuando el rango es de días, no meses — usado solo por gráficos que pasan
// `denseDates` a MiniLineChart, no globalmente (otros usos de MiniLineChart
// grafican por mes, donde día/mes sería incorrecto).
export function formatShortDate(value: unknown): string {
  const d = new Date(String(value))
  if (isNaN(d.getTime())) return String(value ?? '')
  return `${d.getDate()}/${d.getMonth() + 1}`
}
