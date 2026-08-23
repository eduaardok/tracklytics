import { lazy, Suspense, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, CreditCard, Crown, FileText, GraduationCap } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUser } from '@shared/lib/session'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { SkeletonCard, SkeletonLoader } from '@shared/components/SkeletonLoader'
// Import directo, no vía el barrel `@packages/facturacion` (arrastraría
// AuditoriaFacturacionPage —con Recharts— al bundle principal, PlanesPage es
// una ruta B2C eager; ver comentario equivalente en router.tsx).
import { facturacionApi } from '@packages/facturacion/api/facturacion.api'
import type { MetodoPago } from '@packages/facturacion/types'
import { FormMetodoPago } from '@packages/facturacion/components/FormMetodoPago'
import { suscripcionesApi } from '../api/suscripciones.api'
import { PLAN_ACTIVO_QUERY_KEY } from '../hooks/usePlanActivo'
import { DIAS_TRIAL_PREMIUM, type MotivoCancelacion, type Plan } from '../types'
import styles from './PlanesPage.module.css'

// Hub S16-P8 (inversión del pedido original): SUSCRIPCIONES es la página
// principal y Facturación vive acoplada como tab — al revés de P7, donde el
// hub era FacturacionPage. Lazy para no arrastrar el bundle de facturación
// (ni su CSS) al chunk principal; solo se baja si el usuario abre el tab.
const FacturacionPage = lazy(() =>
  import('@packages/facturacion/pages/FacturacionPage').then((m) => ({ default: m.FacturacionPage })),
)

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
//
// `embebido` (S16-P7/P8): en P7 FacturacionPage montaba esta página dentro de
// su tab; desde la inversión del hub (P8) es al revés — aquí se monta
// FacturacionPage. La prop se conserva por compatibilidad y para ocultar la
// cabecera si algún día vuelve a embeberse.
export function PlanesPage({ embebido = false }: { embebido?: boolean }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Hub: "Mi plan" es el tab principal; "Facturación" el acoplado (?tab=).
  const tab = searchParams.get('tab') === 'facturacion' ? 'facturacion' : 'plan'
  function setTabHub(next: 'plan' | 'facturacion') {
    const params = new URLSearchParams(searchParams)
    if (next === 'facturacion') params.set('tab', 'facturacion')
    else params.delete('tab')
    setSearchParams(params, { replace: true })
  }
  // Roving con flechas — mismo vocabulario de tabs que Biblioteca.
  function onTablistKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const siguiente = tab === 'plan' ? 'facturacion' : 'plan'
    setTabHub(siguiente)
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${siguiente}"]`)?.focus()
  }
  useDocumentTitle(tab === 'facturacion' ? 'Facturación · Mi plan' : 'Mi plan')
  const onboarding = searchParams.get('onboarding') === '1'
  // `esAdmin` (no el `role` crudo de PocketBase): un admin de área
  // (admin_finanzas, ...) tiene `role==='user'` en PocketBase — el rol
  // administrativo vive en BRIDGE_USUARIO_ROL_ADMIN y llega poblado como
  // `esAdmin` en el login (ver session.ts). Antes esta página solo
  // reconocía al superadmin bootstrap (`role==='admin'`), así que cualquier
  // otro admin caía en el flujo de checkout B2C real (bug real, confirmado
  // navegando como admin_finanzas — ver docs/PLAN_PRUEBAS_EJECUCION_S16.md).
  const esAdmin = Boolean(getUser()?.esAdmin)

  const [selectedPlan, setSelectedPlan]   = useState<Plan | null>(null)
  const [metodoElegidoId, setMetodoElegidoId] = useState<string | null>(null)
  const [formError, setFormError]         = useState<string | null>(null)
  const [motivoCancelacion, setMotivoCancelacion] = useState<MotivoCancelacion>('otro')
  const [emailInstitucional, setEmailInstitucional] = useState('')
  // Wizard de verificación estudiante (S16-P8, comprobante real desde P2/S16):
  // paso 1 = correo institucional con validación en vivo; paso 2 = archivo
  // real, subido a POST /suscripciones/estudiante/comprobante ANTES de
  // confirmar el plan — ya no es solo evidencia local del paso.
  const [pasoEstudiante, setPasoEstudiante] = useState<1 | 2>(1)
  const [comprobanteArchivo, setComprobanteArchivo] = useState<File | null>(null)

  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  // admin ya tiene acceso completo sin plan — evita el roundtrip innecesario
  // (el backend igual devolvería `[]`/`null`, ver planes.py).
  const planesQuery = useQuery({
    queryKey: ['suscripciones', 'planes'],
    queryFn:  () => suscripcionesApi.planes(),
    enabled:  !esAdmin,
  })
  const activaQuery = useQuery({
    queryKey: PLAN_ACTIVO_QUERY_KEY,
    queryFn:  () => suscripcionesApi.activa(),
    enabled:  !esAdmin,
  })
  // Se necesita tanto para confirmar un plan de pago nuevo como para cobrar
  // el ajuste de un cambio de plan (CU-O94) o reintentar un cobro fallido
  // (CU-O95) — se carga siempre que hay sesión no-admin, no solo cuando hay
  // un plan seleccionado.
  const metodosQuery = useQuery({
    queryKey: ['facturacion', 'metodos-pago'],
    queryFn:  () => facturacionApi.metodosPago(),
    enabled:  !esAdmin,
  })
  const metodos: MetodoPago[] = metodosQuery.data?.data ?? []

  const confirmar = useMutation({
    mutationFn: (body: { plan_id: string; metodo_pago_id: string | null; email_institucional?: string | null }) =>
      suscripcionesApi.confirmar(body),
    onSuccess: (res) => {
      setSelectedPlan(null)
      setMetodoElegidoId(null)
      setEmailInstitucional('')
      setPasoEstudiante(1)
      setComprobanteArchivo(null)
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
      const msg = apiErrorMessage(err, 'No se pudo confirmar la suscripción.')
      setFormError(msg)
      toast.error(msg)
    },
  })

  // Sube el comprobante ANTES de confirmar el plan (handleConfirmar espera
  // esta promesa) — si falla, no se llega a confirmar la suscripción.
  const subirComprobante = useMutation({
    mutationFn: ({ email, archivo }: { email: string; archivo: File }) =>
      suscripcionesApi.subirComprobanteEstudiante(email, archivo),
    onError: (err: unknown) => {
      setFormError(apiErrorMessage(err, 'No se pudo subir el comprobante.'))
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
    // Aviso de método de pago ANTES de iniciar el flujo de cobro (S16 —
    // antes este chequeo vivía después del modal de confirmación del ajuste,
    // como un toast al que ya no se podía reaccionar: el usuario ya había
    // "aceptado" cobrar un ajuste que después no se podía procesar).
    if (ajusteEstimado > 0 && !metodoPagoId) {
      const irAFacturacion = await confirm(
        'Necesitas un método de pago registrado para este upgrade. ¿Ir a Facturación para agregarlo?',
        { title: 'Sin método de pago', confirmLabel: 'Ir a Facturación' },
      )
      if (irAFacturacion) navigate('/suscripciones?tab=facturacion')
      return
    }
    const mensaje = ajusteEstimado > 0
      ? `Cambiar a ${nuevoPlan.nombre} — se cobrará un ajuste estimado de ${ajusteEstimado.toFixed(2)} ${activaActual.moneda} por los días restantes de tu ciclo actual.`
      : ajusteEstimado < 0
      ? `Cambiar a ${nuevoPlan.nombre} — recibirás un crédito informativo de ${Math.abs(ajusteEstimado).toFixed(2)} ${activaActual.moneda}, sin cobro.`
      : `¿Cambiar a ${nuevoPlan.nombre}?`
    const ok = await confirm(mensaje, { confirmLabel: 'Cambiar de plan' })
    if (!ok) return
    cambiarPlan.mutate({ suscripcionId: activaActual.id, nuevoPlanId: nuevoPlan.id, metodoPagoId })
  }

  // Mismo aviso previo para quien todavía no tiene ninguna suscripción
  // (primer plan pagado) — antes el formulario de confirmación se abría
  // directo y el aviso de "sin método de pago" solo aparecía como texto
  // dentro de ese mismo formulario, ya iniciado el flujo.
  async function handleSelectClick(plan: Plan) {
    if (plan.precio > 0 && !metodosQuery.isLoading && metodos.length === 0) {
      const continuar = await confirm(
        'Todavía no tienes un método de pago guardado. Vas a poder agregarlo en el siguiente paso, antes de confirmar.',
        { title: 'Sin método de pago', confirmLabel: 'Continuar', cancelLabel: 'Volver' },
      )
      if (!continuar) return
    }
    handleSelect(plan)
  }

  const planes = planesQuery.data?.data ?? []
  const activa = activaQuery.data?.data ?? null

  // Correo institucional válido — mismo criterio que el gate del submit
  // (formato email + contiene .edu, la regla heredada del backend).
  const emailEstudianteValido =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInstitucional.trim()) &&
    emailInstitucional.trim().toLowerCase().includes('.edu')

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
  if (esAdmin) {
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
    setEmailInstitucional('')
    setPasoEstudiante(1)
    setComprobanteArchivo(null)
    setFormError(null)
  }

  async function handleConfirmar(e: FormEvent) {
    e.preventDefault()
    if (!selectedPlan) return
    if (selectedPlan.precio > 0 && !metodoElegidoId) {
      setFormError('Selecciona o agrega un método de pago para continuar.')
      return
    }
    if (selectedPlan.id === 'estudiante' && !emailEstudianteValido) {
      setFormError('Ingresa un email institucional válido (.edu) para el plan estudiante.')
      return
    }
    if (selectedPlan.id === 'estudiante' && comprobanteArchivo) {
      // Comprobante real (P2, S16): sube el archivo antes de activar el
      // plan — si la subida falla, `onError` deja el mensaje en `formError`
      // y no se llega a confirmar. La revisión admin ocurre después, aparte
      // (el plan queda activo con verificación provisional mientras tanto,
      // igual que documentaba el wizard desde S16-P8).
      try {
        await subirComprobante.mutateAsync({ email: emailInstitucional.trim(), archivo: comprobanteArchivo })
      } catch {
        return
      }
    }
    confirmar.mutate({
      plan_id: selectedPlan.id,
      metodo_pago_id: metodoElegidoId,
      email_institucional: selectedPlan.id === 'estudiante' ? emailInstitucional.trim() : null,
    })
  }

  // Cabecera compartida del hub: título + tabs (el h1 sigue siendo "Mi plan"
  // porque la página principal ES suscripciones; Facturación es el tab
  // acoplado). En modo onboarding se ocultan los tabs: primero hay que elegir
  // plan, no pasear por pagos.
  const cabecera = (
    <>
      <h1 className={styles.heading}>Mi plan</h1>
      <span className={styles.subtitle}>Tu suscripción y tus pagos, en un solo lugar.</span>
      {!embebido && !onboarding && (
        <div className={styles.hubTabs} role="tablist" aria-label="Mi plan y Facturación" onKeyDown={onTablistKeyDown}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'plan'}
            data-tab="plan"
            tabIndex={tab === 'plan' ? 0 : -1}
            className={`${styles.hubTab} ${tab === 'plan' ? styles.hubTabActive : ''}`}
            onClick={() => setTabHub('plan')}
          >
            <span className={styles.hubTabIcon} aria-hidden="true"><Crown size={15} strokeWidth={2.2} /></span>
            <span>Mi plan</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'facturacion'}
            data-tab="facturacion"
            tabIndex={tab === 'facturacion' ? 0 : -1}
            className={`${styles.hubTab} ${tab === 'facturacion' ? styles.hubTabActive : ''}`}
            onClick={() => setTabHub('facturacion')}
          >
            <span className={styles.hubTabIcon} aria-hidden="true"><CreditCard size={15} strokeWidth={2.2} /></span>
            <span>Facturación</span>
          </button>
        </div>
      )}
    </>
  )

  // Tab acoplado de Facturación: mismo shell (título + tabs), contenido lazy.
  if (!embebido && tab === 'facturacion') {
    return (
      <section className={styles.page}>
        {cabecera}
        <Suspense fallback={<SkeletonCard height={420} />}>
          <FacturacionPage embebido />
        </Suspense>
      </section>
    )
  }

  return (
    <section className={styles.page}>
      {!embebido && cabecera}

      {onboarding && (
        <div className={styles.onboardingBanner}>
          <strong>Activa tu cuenta empresarial.</strong> Para acceder a Tracklytics como Cliente B2B
          debes seleccionar un plan. El plan Básico incluye todos los paneles analíticos.
        </div>
      )}

      <p className={styles.sectionLabel}>Plan actual</p>
      {activaQuery.isLoading ? (
        <SkeletonCard height={92} />
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
        <div className={styles.plansGrid}>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} height={340} />)}
        </div>
      ) : (
        <div className={styles.plansGrid}>
          {planes.map((p, idx) => {
            const esActual = activa?.tipo_plan === p.id
            // Destacado cosmético: el plan premium lleva el filete con el
            // gradiente de marca y el badge "Más popular" — guía el ojo sin
            // tocar precios ni features (bloque dinero congelado).
            const esPopular = p.id === 'premium'
            return (
              <div
                key={p.id}
                className={[
                  styles.planCard,
                  esActual ? styles.planCardCurrent : '',
                  esPopular ? styles.planCardDestacado : '',
                  styles.planCardAnim,
                ].filter(Boolean).join(' ')}
                style={{ animationDelay: `${Math.min(idx * 90, 360)}ms` }}
              >
                <div className={styles.planTitle}>
                  {p.nombre}
                  {esActual && <span className={styles.currentBadge}>Plan actual</span>}
                  {!esActual && esPopular && <span className={styles.popularBadge}>Más popular</span>}
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
              {/* Verificación de estudiante (S16-P8, comprobante real desde
                  P2/S16): mini-registro en dos pasos — correo institucional
                  con validación EN VIVO y comprobante. El archivo del paso 2
                  sube de verdad a POST /suscripciones/estudiante/comprobante
                  al confirmar (handleConfirmar), quedando "pendiente" hasta
                  que un admin lo revise. */}
              <div className={styles.wizardPasos} aria-hidden="true">
                <span className={`${styles.pasoPunto} ${pasoEstudiante === 1 ? styles.pasoPuntoActivo : styles.pasoPuntoHecho}`}>1</span>
                <span className={`${styles.pasoNombre}`}>Correo</span>
                <span className={styles.pasoLinea} />
                <span className={`${styles.pasoPunto} ${pasoEstudiante === 2 ? styles.pasoPuntoActivo : ''}`}>2</span>
                <span className={`${styles.pasoNombre}`}>Comprobante</span>
              </div>

              {pasoEstudiante === 1 ? (
                <>
                  <p className={styles.estudianteIntro}>
                    <GraduationCap size={15} aria-hidden="true" />
                    Verificamos tu estado de estudiante con tu correo de la universidad.
                  </p>
                  <label className={styles.fieldLabel} htmlFor="email-institucional">Email institucional</label>
                  <input
                    id="email-institucional"
                    className={styles.input}
                    type="email"
                    placeholder="tu.nombre@universidad.edu"
                    value={emailInstitucional}
                    onChange={(e) => setEmailInstitucional(e.target.value)}
                  />
                  {emailInstitucional.trim().length > 0 && !emailEstudianteValido && (
                    <span className={styles.hintSoft}>Necesita formato de email y terminar en .edu</span>
                  )}
                  {emailEstudianteValido && (
                    <span className={styles.hintOk}>
                      <Check size={12} aria-hidden="true" /> Correo institucional válido
                    </span>
                  )}
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    style={{ marginTop: 'var(--space-sm)' }}
                    disabled={!emailEstudianteValido}
                    onClick={() => setPasoEstudiante(2)}
                  >
                    Continuar
                  </button>
                </>
              ) : (
                <>
                  <p className={styles.estudianteIntro}>
                    <GraduationCap size={15} aria-hidden="true" />
                    Último paso: adjunta un comprobante de matrícula (carnet, constancia o certificado).
                  </p>
                  <label className={styles.comprobanteDrop}>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      style={{ display: 'none' }}
                      onChange={(e) => setComprobanteArchivo(e.target.files?.[0] ?? null)}
                    />
                    {comprobanteArchivo ? (
                      <span className={styles.archivoChip}>
                        <FileText size={13} aria-hidden="true" />
                        <span>{comprobanteArchivo.name}</span>
                      </span>
                    ) : (
                      <>Haz clic para elegir un archivo — PDF, JPG o PNG (máx. 5MB)</>
                    )}
                  </label>
                  {subirComprobante.isError && (
                    <span className={styles.hintSoft}>No se pudo subir el comprobante — intenta de nuevo.</span>
                  )}
                  <p className={styles.wizardNota}>
                    Revisamos el documento en menos de 24 h; mientras tanto tu plan queda activo con
                    verificación provisional. Sin comprobante, el descuento puede suspenderse.
                  </p>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    style={{ marginTop: 'var(--space-xs)', alignSelf: 'flex-start' }}
                    onClick={() => setPasoEstudiante(1)}
                  >
                    ← Corregir el correo
                  </button>
                </>
              )}
            </div>
          )}
          {selectedPlan.precio > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Método de pago</span>
              {metodosQuery.isLoading ? (
                <SkeletonLoader count={2} height={12} />
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
                {/* F7: mismo formulario (y mismo rigor: Luhn, expiración, CVV,
                    dirección fiscal) que Facturación — antes acá solo se pedía
                    tipo + 4 dígitos para el mismo objeto DIM_METODO_PAGO. Al
                    guardar, el método nuevo queda seleccionado. */}
                <FormMetodoPago onRegistrado={(metodoPagoId) => setMetodoElegidoId(metodoPagoId)} />
              </div>
            </div>
          )}
          <div className={styles.confirmActions}>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={
                confirmar.isPending || subirComprobante.isPending ||
                (selectedPlan.id === 'estudiante' && (pasoEstudiante === 1 || !comprobanteArchivo))
              }
            >
              {subirComprobante.isPending
                ? 'Subiendo comprobante…'
                : confirmar.isPending
                ? 'Confirmando…'
                : selectedPlan.id === 'estudiante'
                ? 'Enviar solicitud'
                : 'Confirmar suscripción'}
            </button>
            <button type="button" className={styles.btnGhost} onClick={() => setSelectedPlan(null)}>
              Cancelar
            </button>
          </div>
          {selectedPlan.id === 'estudiante' && (pasoEstudiante === 1 || !comprobanteArchivo) && (
            <p className={styles.hintSoft}>Completa la verificación de estudiante para enviar la solicitud.</p>
          )}
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
          {/* Factura visible de inmediato (S16), no solo buscándola después
              en Facturación. */}
          {confirmar.data?.pago?.estado === 'exitosa' && confirmar.data.pago.invoice_id && (
            <> <Link to={`/facturacion/${confirmar.data.pago.invoice_id}`}>Ver factura</Link></>
          )}
        </div>
      )}
    </section>
  )
}
