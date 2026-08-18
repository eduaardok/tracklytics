export type TipoActor = 'b2c' | 'b2b'

export type MotivoCancelacion = 'precio' | 'no_uso' | 'competencia' | 'otro'

export type Plan = {
  id:          string
  tipo_actor:  TipoActor
  nombre:      string
  precio:      number
  moneda:      string
  descripcion: string
  // Solo viaja en el plan `premium` — calculado por el backend
  // (`pb_client.list_historial_por_plan`) porque depende del historial real
  // del usuario, que el frontend no tiene forma de replicar sin duplicar la
  // regla de negocio. `true` cuando confirmar este plan activaría el trial.
  elegible_trial?: boolean
  // Solo viaja en los planes B2B (basico/pro/enterprise) — catálogo de
  // features incluidas en ese tier, para que PlanesPage.tsx muestre la
  // escalera de valor real detrás del precio (b2b-tier-access-analitica).
  features?: string[]
  // Conversión a la moneda local del usuario (modelo-financiero-completar-
  // huecos, CU-O99) — tasa de referencia simulada, nunca forex real.
  moneda_local?: string
  precio_moneda_local?: number
}

// Espejo de `DIAS_TRIAL_PREMIUM` en `api/paquetes/suscripciones/router.py` —
// solo para calcular la fecha de fin de trial a mostrar ANTES de confirmar
// (design.md de `mejoras-producto-revision-qa`). Si cambia el backend, debe
// cambiar acá también.
export const DIAS_TRIAL_PREMIUM = 7

// Registro de PocketBase (colección `suscripciones`) devuelto tal cual por
// GET /app/v1/suscripciones/activa — trae más campos (collectionId, etc.)
// que PocketBase agrega automáticamente, pero solo tipamos los que se usan.
export type SuscripcionActiva = {
  id:                string
  usuario_o_cliente: string
  usuario_nombre?:   string
  usuario_email?:    string
  tipo_plan:         string
  monto:             number
  moneda:            string
  estado:            string
  created?:          string
  // Período de prueba gratuito (monetizacion-retencion-mejoras).
  en_prueba?:        boolean
  fecha_fin_trial?:  string | null
  // Dunning (modelo-financiero-completar-huecos, CU-O95) — `estado` puede
  // ser 'pago_pendiente' mientras no se agoten los reintentos de cobro.
  intentos_fallidos?: number
  metodo_pago_id?:    string
}

export type CambiarPlanResponse = {
  data: SuscripcionActiva
  ajuste: number
  pago_ajuste: PagoResultado | null
}

export type ProcesarCobroResponse = {
  data: SuscripcionActiva
  pago: PagoResultado
  degradado: boolean
  intentos_fallidos?: number
}

export type PrecioPlanAdmin = {
  plan_id: string
  nombre: string
  tipo_actor: TipoActor
  precio_usd: number
}

export type ConfirmarSuscripcionBody = {
  plan_id:              string
  metodo_pago_id?:       string | null
  // Requerido solo para plan_id='estudiante' (monetizacion-retencion-mejoras).
  email_institucional?:  string | null
}

export type PagoResultado = {
  status:         string
  transaccion_id: string
  estado:         'pendiente' | 'exitosa' | 'fallida'
  invoice_id:     string | null
}

export type ConfirmarSuscripcionResponse = {
  data: SuscripcionActiva
  pago: PagoResultado | null
}
