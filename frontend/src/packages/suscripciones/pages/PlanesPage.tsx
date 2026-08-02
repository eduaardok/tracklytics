import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRole } from '@shared/lib/session'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
// Import directo, no vía el barrel `@packages/facturacion` (arrastraría
// AuditoriaFacturacionPage —con Recharts— al bundle principal, PlanesPage es
// una ruta B2C eager; ver comentario equivalente en router.tsx).
import { facturacionApi } from '@packages/facturacion/api/facturacion.api'
import type { MetodoPago } from '@packages/facturacion/types'
import { suscripcionesApi } from '../api/suscripciones.api'
import { PLAN_ACTIVO_QUERY_KEY } from '../hooks/usePlanActivo'
import { DIAS_TRIAL_PREMIUM, type MotivoCancelacion, type Plan } from '../types'
import styles from './PlanesPage.module.css'

const TIPOS_METODO = ['Visa', 'Mastercard', 'Amex']

const MOTIVOS_CANCELACION: { value: MotivoCancelacion; label: string }[] = [
  { value: 'otro',        label: 'Prefiero no decir' },
  { value: 'precio',      label: 'El precio' },
  { value: 'no_uso',      label: 'No lo uso lo suficiente' },
  { value: 'competencia', label: 'Uso otro servicio' },
]

function fmtFecha(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES')
}

function fmtPrecio(precio: number, moneda: string): string {
  // `precio` puede venir de DIM_PLAN (ClickHouse Float32) con ruido de
  // precisión de punto flotante (ej. 12.989999771118164) — se redondea a 2
  // decimales para mostrar, mismo criterio que el resto de montos de dinero
  // del proyecto (ver MiniLineChart, formatTooltipValue).
  return precio > 0 ? `${precio.toFixed(2)} ${moneda}/mes` : 'Gratis'
}

// Estimación client-side del ajuste prorrateado (modelo-financiero-completar-
// huecos, CU-O94) — mismo ciclo de 30 días y misma fórmula que
// `PUT /suscripciones/{id}/plan` en el backend, que es quien calcula el
// monto real al confirmar; esto solo evita confirmar "a ciegas".
const DIAS_CICLO = 30

function estimarAjuste(activa: { created?: string; monto: number }, precioNuevo: number): number {
  const creado = activa.created ? new Date(activa.created.replace(' ', 'T')) : new Date()
  const diasTranscurridos = Math.floor((Date.now() - creado.getTime()) / 86_400_000) % DIAS_CICLO
  const diasRestantes = DIAS_CICLO - diasTranscurridos
  return Math.round((precioNuevo - activa.monto) * diasRestantes / DIAS_CICLO * 100) / 100
}

function fmtFechaCobroTrial(): string {
  const fin = new Date()
  fin.setDate(fin.getDate() + DIAS_TRIAL_PREMIUM)
  return fin.toLocaleDateString('es-ES')
}

// PlanesPage cubre "seleccionar plan", "consultar plan activo" y "cancelar"
// en una sola pantalla — igual que app/autenticacion/planes.html (legacy),
// que ya combina las tres en un único flujo. Separarlas en dos rutas
// distintas solo duplicaría el fetch de /suscripciones/activa sin aportar
// nada que el legacy no resolviera ya en una página.
export function PlanesPage() {
  useDocumentTitle('Mi plan')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const onboarding = searchParams.get('onboarding') === '1'
  const role = getRole()

  const [selectedPlan, setSelectedPlan]   = useState<Plan | null>(null)
  const [metodoElegidoId, setMetodoElegidoId] = useState<string | null>(null)
  const [nuevoTipo, setNuevoTipo]         = useState(TIPOS_METODO[0])
  const [nuevoDigitos, setNuevoDigitos]   = useState('')
  const [formError, setFormError]         = useState<string | null>(null)
  const [motivoCancelacion, setMotivoCancelacion] = useState<MotivoCancelacion>('otro')
  const [emailInstitucional, setEmailInstitucional] = useState('')

  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  // admin ya tiene acceso completo sin plan — evita el roundtrip innecesario
  // (el backend igual devolvería `[]`/`null`, ver planes.py).
  const planesQuery = useQuery({
    queryKey: ['suscripciones', 'planes'],
    queryFn:  () => suscripcionesApi.planes(),
    enabled:  role !== 'admin',
  })
  const activaQuery = useQuery({
    queryKey: PLAN_ACTIVO_QUERY_KEY,
    queryFn:  () => suscripcionesApi.activa(),
    enabled:  role !== 'admin',
  })
  // Se necesita tanto para confirmar un plan de pago nuevo como para cobrar
  // el ajuste de un cambio de plan (CU-O94) o reintentar un cobro fallido
  // (CU-O95) — se carga siempre que hay sesión no-admin, no solo cuando hay
  // un plan seleccionado.
  const metodosQuery = useQuery({
    queryKey: ['facturacion', 'metodos-pago'],
    queryFn:  () => facturacionApi.metodosPago(),
    enabled:  role !== 'admin',
  })
  const metodos: MetodoPago[] = metodosQuery.data?.data ?? []

  const agregarMetodo = useMutation({
    mutationFn: () => facturacionApi.registrarMetodoPago({ tipo: nuevoTipo, ultimos_4_digitos: nuevoDigitos }),
    onSuccess: (res) => {
      setMetodoElegidoId(res.metodo_pago_id)
      setNuevoDigitos('')
      setFormError(null)
      queryClient.invalidateQueries({ queryKey: ['facturacion', 'metodos-pago'] })
      toast.success('Método de pago agregado')
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'No se pudo agregar el método de pago')
      toast.error(apiErrorMessage(err, 'No se pudo agregar el método de pago.'))
    },
  })

  const confirmar = useMutation({
    mutationFn: (body: { plan_id: string; metodo_pago_id: string | null; email_institucional?: string | null }) =>
      suscripcionesApi.confirmar(body),
    onSuccess: (res) => {
      setSelectedPlan(null)
      setMetodoElegidoId(null)
      setEmailInstitucional('')
      setFormError(null)
      queryClient.invalidateQueries({ queryKey: PLAN_ACTIVO_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['suscripciones', 'planes'] })
      if (res?.pago?.estado === 'fallida') toast.error('El plan se activó pero el cobro fue rechazado')
      else toast.success('Suscripción confirmada')
      // Mismo comportamiento que el legacy en modo onboarding: confirmar
      // manda directo a la app en vez de quedarse en la página de planes.
      if (onboarding) navigate('/', { replace: true })
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'No se pudo confirmar la suscripción')
      toast.error(apiErrorMessage(err, 'No se pudo confirmar la suscripción.'))
    },
  })

  const cancelar = useMutation({
    mutationFn: ({ suscripcionId, motivo }: { suscripcionId: string; motivo: MotivoCancelacion }) =>
      suscripcionesApi.cancelar(suscripcionId, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAN_ACTIVO_QUERY_KEY })
      toast.success('Suscripción cancelada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cancelar la suscripción.')),
  })

  // Cambio de plan con prorrateo (CU-O94, modelo-financiero-completar-huecos).
  const cambiarPlan = useMutation({
    mutationFn: ({ suscripcionId, nuevoPlanId, metodoPagoId }: { suscripcionId: string; nuevoPlanId: string; metodoPagoId: string | null }) =>
      suscripcionesApi.cambiarPlan(suscripcionId, nuevoPlanId, metodoPagoId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: PLAN_ACTIVO_QUERY_KEY })
      if (res.ajuste > 0) toast.success(`Plan cambiado — se cobró un ajuste de ${res.ajuste.toFixed(2)}`)
      else if (res.ajuste < 0) toast.success(`Plan cambiado — crédito de ${Math.abs(res.ajuste).toFixed(2)} (sin cobro)`)
      else toast.success('Plan cambiado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cambiar de plan.')),
  })

  // Dunning: reintento de cobro fallido (CU-O95).
  const procesarCobro = useMutation({
    mutationFn: ({ suscripcionId, metodoPagoId }: { suscripcionId: string; metodoPagoId: string | null }) =>
      suscripcionesApi.procesarCobro(suscripcionId, metodoPagoId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: PLAN_ACTIVO_QUERY_KEY })
      if (res.pago.estado === 'exitosa') toast.success('Cobro procesado — tu suscripción está activa de nuevo')
      else if (res.degradado) toast.error('Se agotaron los intentos de cobro — tu plan fue degradado')
      else toast.error(`El cobro volvió a fallar (intento ${res.intentos_fallidos} de 3)`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo procesar el cobro.')),
  })

  async function handleCambiarPlan(nuevoPlan: Plan, activaActual: NonNullable<typeof activa>) {
    const ajusteEstimado = estimarAjuste(activaActual, nuevoPlan.precio)
    const metodoPagoId = activaActual.metodo_pago_id || metodos[0]?.metodo_pago_id || null
    const mensaje = ajusteEstimado > 0
      ? `Cambiar a ${nuevoPlan.nombre} — se cobrará un ajuste estimado de ${ajusteEstimado.toFixed(2)} ${activaActual.moneda} por los días restantes de tu ciclo actual.`
      : ajusteEstimado < 0
      ? `Cambiar a ${nuevoPlan.nombre} — recibirás un crédito informativo de ${Math.abs(ajusteEstimado).toFixed(2)} ${activaActual.moneda}, sin cobro.`
      : `¿Cambiar a ${nuevoPlan.nombre}?`
    const ok = await confirm(mensaje, { confirmLabel: 'Cambiar de plan' })
    if (!ok) return
    if (ajusteEstimado > 0 && !metodoPagoId) {
      toast.error('Necesitas un método de pago registrado para este upgrade — agrégalo en Facturación.')
      return
    }
    cambiarPlan.mutate({ suscripcionId: activaActual.id, nuevoPlanId: nuevoPlan.id, metodoPagoId })
  }

  const planes = planesQuery.data?.data ?? []
  const activa = activaQuery.data?.data ?? null

  // Igual que loadAll() en planes.html: si en modo onboarding ya hay un plan
  // activo (ej. el usuario vuelve a esta URL), no tiene sentido mostrar la
  // selección — se entra directo a la app.
  if (onboarding && !activaQuery.isLoading && activa) {
    navigate('/', { replace: true })
    return null
  }

  // admin (Lead Data Engineer/CTO) ya tiene acceso completo a la plataforma
  // sin pagar — el backend rechaza confirmar/planear una suscripción para
  // este rol (ver suscripciones/router.py), así que esta ruta no le muestra
  // el flujo de selección de plan aunque llegue acá por URL directa.
  if (role === 'admin') {
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Mi plan</h1>
        <p className={styles.muted}>
          Como administrador, tienes acceso completo a la plataforma sin necesidad de una suscripción.
        </p>
      </section>
    )
  }

  function handleSelect(plan: Plan) {
    setSelectedPlan(plan)
    setMetodoElegidoId(null)
    setNuevoDigitos('')
    setEmailInstitucional('')
    setFormError(null)
  }

  function handleConfirmar(e: FormEvent) {
    e.preventDefault()
    if (!selectedPlan) return
    if (selectedPlan.precio > 0 && !metodoElegidoId) {
      setFormError('Selecciona o agrega un método de pago para continuar.')
      return
    }
    if (selectedPlan.id === 'estudiante' && !emailInstitucional.trim().toLowerCase().includes('.edu')) {
      setFormError('Ingresa un email institucional válido (.edu) para el plan estudiante.')
      return
    }
    confirmar.mutate({
      plan_id: selectedPlan.id,
      metodo_pago_id: metodoElegidoId,
      email_institucional: selectedPlan.id === 'estudiante' ? emailInstitucional.trim() : null,
    })
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Mi plan</h1>
      <span className={styles.subtitle}>
        // {role === 'analyst' ? 'planes empresariales' : 'planes personales'}
      </span>

      {onboarding && (
        <div className={styles.onboardingBanner}>
          <strong>Activa tu cuenta empresarial.</strong> Para acceder a Tracklytics como Cliente B2B
          debes seleccionar un plan. El plan Básico incluye todos los paneles analíticos.
        </div>
      )}

      <p className={styles.sectionLabel}>Plan actual</p>
      {activaQuery.isLoading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : activa ? (
        <div className={styles.currentCard}>
          <div className={styles.currentTitle}>Plan activo: {activa.tipo_plan}</div>
          <div className={styles.currentSub}>
            {fmtPrecio(activa.monto, activa.moneda)} · desde {fmtFecha(activa.created)}
          </div>
          {activa.en_prueba && (
            <p className={styles.muted}>
              En período de prueba — termina el {fmtFecha(activa.fecha_fin_trial ?? undefined)}
            </p>
          )}
          {activa.estado === 'pago_pendiente' && (
            <div className={styles.dunningBanner} role="alert">
              <p className={styles.dunningText}>
                <AlertTriangle size={14} className={styles.warnIcon} aria-hidden="true" />
                Tu último cobro falló ({activa.intentos_fallidos ?? 1} de 3 intentos) — tu plan
                seguirá activo mientras reintentas, pero se degradará si se agotan los intentos.
              </p>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={procesarCobro.isPending}
                onClick={() => procesarCobro.mutate({
                  suscripcionId: activa.id,
                  metodoPagoId: activa.metodo_pago_id || metodos[0]?.metodo_pago_id || null,
                })}
              >
                {procesarCobro.isPending ? 'Reintentando…' : 'Reintentar cobro'}
              </button>
            </div>
          )}
          {activa.tipo_plan !== 'free' && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="motivo-cancelacion">Motivo (si cancelas)</label>
              <select
                id="motivo-cancelacion"
                className={styles.input}
                value={motivoCancelacion}
                onChange={(e) => setMotivoCancelacion(e.target.value as MotivoCancelacion)}
              >
                {MOTIVOS_CANCELACION.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}
          <button
            type="button"
            className={styles.btnDanger}
            disabled={cancelar.isPending}
            onClick={async () => {
              const ok = await confirm('¿Cancelar tu suscripción activa?', { danger: true, confirmLabel: 'Cancelar suscripción' })
              if (ok) cancelar.mutate({ suscripcionId: activa.id, motivo: motivoCancelacion })
            }}
          >
            {cancelar.isPending ? 'Cancelando…' : 'Cancelar suscripción'}
          </button>
          {cancelar.isError && <p className={styles.formError}>No se pudo cancelar la suscripción.</p>}
        </div>
      ) : (
        <p className={styles.muted}>No tienes una suscripción activa.</p>
      )}

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Planes disponibles</p>
      {planesQuery.isLoading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : (
        <div className={styles.plansGrid}>
          {planes.map((p) => {
            const esActual = activa?.tipo_plan === p.id
            return (
              <div key={p.id} className={esActual ? `${styles.planCard} ${styles.planCardCurrent}` : styles.planCard}>
                <div className={styles.planTitle}>
                  {p.nombre}
                  {esActual && <span className={styles.currentBadge}>Plan actual</span>}
                </div>
                <p className={styles.planDesc}>{p.descripcion}</p>
                {p.features && p.features.length > 0 && (
                  <ul className={styles.planFeatures}>
                    {p.features.map((feature) => (
                      <li key={feature} className={styles.planFeatureItem}>{feature}</li>
                    ))}
                  </ul>
                )}
                <div className={styles.planPrecio}>{fmtPrecio(p.precio, p.moneda)}</div>
                {p.moneda_local && p.moneda_local !== p.moneda && p.precio > 0 && (
                  <div className={styles.planPrecioLocal}>
                    ≈ {p.precio_moneda_local?.toFixed(2)} {p.moneda_local}/mes (referencial)
                  </div>
                )}
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={esActual || cambiarPlan.isPending}
                  onClick={() => (activa ? handleCambiarPlan(p, activa) : handleSelect(p))}
                >
                  {esActual
                    ? 'Ya tienes este plan'
                    : activa
                    ? (cambiarPlan.isPending ? 'Cambiando…' : 'Cambiar a este plan')
                    : 'Suscribirme'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {selectedPlan && (
        <form className={styles.confirmForm} onSubmit={handleConfirmar}>
          <h2 className={styles.confirmTitle}>Confirmar suscripción a {selectedPlan.nombre}</h2>
          {selectedPlan.elegible_trial && (
            <p className={styles.muted}>
              Tu prueba gratuita dura {DIAS_TRIAL_PREMIUM} días. A partir del {fmtFechaCobroTrial()} se
              te cobrará el precio del plan, salvo que canceles antes.
            </p>
          )}
          {formError && <p className={styles.formError} role="alert">{formError}</p>}
          {selectedPlan.id === 'estudiante' && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="email-institucional">Email institucional</label>
              <input
                id="email-institucional"
                className={styles.input}
                type="email"
                placeholder="tu.nombre@universidad.edu"
                value={emailInstitucional}
                onChange={(e) => setEmailInstitucional(e.target.value)}
              />
            </div>
          )}
          {selectedPlan.precio > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Método de pago</span>
              {metodosQuery.isLoading ? (
                <p className={styles.muted}>Cargando métodos…</p>
              ) : metodos.length > 0 ? (
                <div className={styles.paymentMethodsList}>
                  {metodos.map((m) => (
                    <label key={m.metodo_pago_id} className={styles.paymentMethodItem}>
                      <input
                        type="radio"
                        name="metodo-elegido"
                        value={m.metodo_pago_id}
                        checked={m.metodo_pago_id === metodoElegidoId}
                        onChange={() => setMetodoElegidoId(m.metodo_pago_id)}
                      />
                      <span>{m.tipo} •••• {m.ultimos_4_digitos}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              <div className={styles.newMethodForm}>
                <span className={styles.newMethodLabel}>
                  {metodos.length > 0 ? 'O agregar un método nuevo' : 'No tienes un método de pago registrado — agrega uno para continuar'}
                </span>
                <select
                  className={styles.input}
                  value={nuevoTipo}
                  onChange={(e) => setNuevoTipo(e.target.value)}
                >
                  {TIPOS_METODO.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Últimos 4 dígitos"
                  maxLength={4}
                  inputMode="numeric"
                  value={nuevoDigitos}
                  onChange={(e) => setNuevoDigitos(e.target.value.replace(/\D/g, ''))}
                />
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={agregarMetodo.isPending || !/^\d{4}$/.test(nuevoDigitos)}
                  onClick={() => agregarMetodo.mutate()}
                >
                  {agregarMetodo.isPending ? 'Guardando…' : 'Guardar método'}
                </button>
              </div>
            </div>
          )}
          <div className={styles.confirmActions}>
            <button type="submit" className={styles.btnPrimary} disabled={confirmar.isPending}>
              {confirmar.isPending ? 'Confirmando…' : 'Confirmar suscripción'}
            </button>
            <button type="button" className={styles.btnGhost} onClick={() => setSelectedPlan(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {confirmar.isSuccess && !onboarding && (
        <div className={confirmar.data?.pago?.estado === 'fallida' ? styles.formError : styles.bannerOk}>
          {confirmar.data?.pago?.estado === 'fallida' && (
            <AlertTriangle size={14} className={styles.warnIcon} aria-hidden="true" />
          )}
          {confirmar.data?.pago?.estado === 'fallida'
            ? 'El plan se activó pero el cobro fue rechazado — verifica tu método de pago.'
            : confirmar.data?.data?.en_prueba
            ? 'Suscripción confirmada — período de prueba de 7 días, sin cobro por ahora.'
            : 'Suscripción confirmada' + (confirmar.data?.pago ? ' y cobro procesado.' : '.')}
        </div>
      )}
    </section>
  )
}
