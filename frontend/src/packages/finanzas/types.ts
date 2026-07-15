// Tipos del paquete `finanzas` — mismos campos snake_case que el backend
// (api/paquetes/finanzas/router.py), sin transformar a camelCase.

export type CategoriaGasto =
  | 'infraestructura' | 'marketing' | 'nomina' | 'licencias'
  | 'servicios' | 'soporte' | 'legal' | 'otros'

export type EstadoGasto = 'activo' | 'anulado'

export type GastoOperativo = {
  gasto_id: string
  concepto: string
  categoria: CategoriaGasto
  monto: number
  fecha: string
  descripcion: string
  estado: EstadoGasto
  responsable_id: string
  fecha_registro: string
}

export type GastoBody = {
  concepto: string
  categoria: CategoriaGasto
  monto: number
  fecha: string
  descripcion?: string
}

export type TipoReembolso = 'total' | 'parcial'
export type EstadoReembolso = 'procesado' | 'rechazado' | 'cancelado'

export type Reembolso = {
  reembolso_id: string
  transaccion_id: string
  monto: number
  tipo: TipoReembolso
  motivo: string
  fecha: string
  responsable_id: string
  estado: EstadoReembolso
}

export type ReembolsoBody = {
  transaccion_id: string
  monto: number
  tipo: TipoReembolso
  motivo: string
}

export type MetricasPeriodo = {
  ingreso_suscripciones: number
  ingreso_publicitario: number
  ingreso_total: number
  regalias_pagadas: number
  retiros_regalia_procesados: number
  gastos_operativos: number
  reembolsos_procesados: number
  utilidad_estimada: number
  margen: number | null
}

export type DashboardFinanciero = MetricasPeriodo & {
  comparacion?: MetricasPeriodo
  delta_pct?: Partial<Record<keyof MetricasPeriodo, number | null>>
}

export type InvoicePendiente = {
  invoice_id: string
  usuario_id: string
  monto: number
  iva: number
  fecha_emision: string
  estado: string
  dias_desde_emision: number
}

export type RetiroPendiente = {
  retiro_id: string
  tipo_rightsholder: 'artista' | 'sello'
  rightsholder_id: string
  monto: number
  fecha_solicitud: string
}

export type CuentasPorCobrar = {
  total_por_cobrar: number
  total_vencido: number
  num_invoices_pendientes: number
  num_invoices_vencidas: number
  proximos_vencimientos: InvoicePendiente[]
}

export type CuentasPorPagar = {
  total_por_pagar: number
  retiros_pendientes: number
  num_retiros_pendientes: number
  regalias_liquidadas_no_retiradas: number
  aging_retiros: RetiroPendiente[]
}

export type CuentasFinancieras = {
  cuentas_por_cobrar: CuentasPorCobrar
  cuentas_por_pagar: CuentasPorPagar
}

export type PresupuestoCampana = {
  campana_id: number
  nombre: string
  anunciante_id: number
  presupuesto_total: number
  consumido: number
  restante: number
  porcentaje_utilizado: number | null
  impresiones: number
  cpm: number
  cpm_efectivo: number | null
  fecha_agotamiento_estimada: string | null
  activa: boolean
  alerta_80: boolean
  alerta_agotado: boolean
}

export type GastoPorCategoria = { categoria: string; total: number }

export type IndicadoresFinancieros = {
  arpu: number | null
  usuarios_pago_activos: number
  pct_ingresos_regalias: number | null
  pct_ingresos_gastos: number | null
  gasto_por_categoria: GastoPorCategoria[]
  ingreso_promedio_por_anunciante: number
  num_anunciantes_con_ingreso: number
  crecimiento_ingreso_pct: number | null
}

export type TipoAlerta =
  | 'campana_presupuesto_agotado' | 'campana_presupuesto_alto'
  | 'factura_vencida' | 'retiro_regalia_pendiente' | 'regalias_sin_retiro'
  | 'gasto_mayor_a_ingreso' | 'caida_ingreso' | 'reembolso_elevado'

export type AlertaFinanciera = {
  tipo: TipoAlerta
  detalle: string
  campana_id?: number
  invoice_id?: string
  retiro_id?: string
  rightsholder_id?: string
  reembolso_id?: string
}

export type AlertasFinancieras = {
  data: AlertaFinanciera[]
  desde: string
  hasta: string
}

export type ReporteFinanciero = {
  periodo: { desde: string; hasta: string }
  ingresos: { suscripciones: number; publicitario: number; total: number }
  gastos: { total: number; por_categoria: GastoPorCategoria[] }
  regalias: { pagadas: number; retiros_procesados: number }
  reembolsos_procesados: number
  cuentas_por_cobrar: CuentasPorCobrar
  cuentas_por_pagar: CuentasPorPagar
  utilidad_estimada: number
  margen: number | null
  indicadores: IndicadoresFinancieros
}
