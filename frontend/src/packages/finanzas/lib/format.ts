export function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)
}

export function fmtPct(v: number | null | undefined, { fromRatio = false }: { fromRatio?: boolean } = {}) {
  if (v == null) return '—'
  const pct = fromRatio ? v * 100 : v
  return `${pct.toFixed(1)}%`
}

export function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

export function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

export const CATEGORIA_LABEL: Record<string, string> = {
  infraestructura: 'Infraestructura', marketing: 'Marketing', nomina: 'Nómina',
  licencias: 'Licencias', servicios: 'Servicios', soporte: 'Soporte', legal: 'Legal', otros: 'Otros',
}

export const ALERTA_LABEL: Record<string, string> = {
  campana_presupuesto_agotado: 'Presupuesto de campaña agotado',
  campana_presupuesto_alto:    'Presupuesto de campaña alto',
  factura_vencida:              'Factura vencida',
  retiro_regalia_pendiente:     'Retiro de regalía pendiente',
  regalias_sin_retiro:          'Regalías sin retirar',
  gasto_mayor_a_ingreso:        'Gasto mayor al ingreso',
  caida_ingreso:                'Caída de ingreso',
  reembolso_elevado:            'Reembolso elevado',
}

// Severidad por tipo de alerta — solo 'campana_presupuesto_agotado' y
// 'factura_vencida'/'gasto_mayor_a_ingreso' son bloqueantes de verdad
// (dinero ya perdido o campaña ya parada); el resto son advertencias a
// vigilar, no incidentes.
const ALERTAS_ERROR = new Set(['campana_presupuesto_agotado', 'factura_vencida', 'gasto_mayor_a_ingreso'])
export function severidadAlerta(tipo: string): 'error' | 'warning' {
  return ALERTAS_ERROR.has(tipo) ? 'error' : 'warning'
}
