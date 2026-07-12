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
