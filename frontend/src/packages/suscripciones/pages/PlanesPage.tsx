import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRole } from '@shared/lib/session'
import { suscripcionesApi } from '../api/suscripciones.api'
import { PLAN_ACTIVO_QUERY_KEY } from '../hooks/usePlanActivo'
import type { Plan } from '../types'
import styles from './PlanesPage.module.css'

function fmtFecha(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES')
}

function fmtPrecio(precio: number, moneda: string): string {
  return precio > 0 ? `${precio} ${moneda}/mes` : 'Gratis'
}

// PlanesPage cubre "seleccionar plan", "consultar plan activo" y "cancelar"
// en una sola pantalla — igual que app/autenticacion/planes.html (legacy),
// que ya combina las tres en un único flujo. Separarlas en dos rutas
// distintas solo duplicaría el fetch de /suscripciones/activa sin aportar
// nada que el legacy no resolviera ya en una página.
export function PlanesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const onboarding = searchParams.get('onboarding') === '1'
  const role = getRole()

  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [metodoPago, setMetodoPago]     = useState('')
  const [formError, setFormError]       = useState<string | null>(null)

  const queryClient = useQueryClient()

  const planesQuery = useQuery({
    queryKey: ['suscripciones', 'planes'],
    queryFn:  () => suscripcionesApi.planes(),
  })
  const activaQuery = useQuery({
    queryKey: PLAN_ACTIVO_QUERY_KEY,
    queryFn:  () => suscripcionesApi.activa(),
  })

  const confirmar = useMutation({
    mutationFn: (body: { plan_id: string; metodo_pago: string | null }) => suscripcionesApi.confirmar(body),
    onSuccess: () => {
      setSelectedPlan(null)
      setMetodoPago('')
      setFormError(null)
      queryClient.invalidateQueries({ queryKey: PLAN_ACTIVO_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['suscripciones', 'planes'] })
      // Mismo comportamiento que el legacy en modo onboarding: confirmar
      // manda directo a la app en vez de quedarse en la página de planes.
      if (onboarding) navigate('/', { replace: true })
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'No se pudo confirmar la suscripción')
    },
  })

  const cancelar = useMutation({
    mutationFn: (suscripcionId: string) => suscripcionesApi.cancelar(suscripcionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAN_ACTIVO_QUERY_KEY }),
  })

  const planes = planesQuery.data?.data ?? []
  const activa = activaQuery.data?.data ?? null

  // Igual que loadAll() en planes.html: si en modo onboarding ya hay un plan
  // activo (ej. el usuario vuelve a esta URL), no tiene sentido mostrar la
  // selección — se entra directo a la app.
  if (onboarding && !activaQuery.isLoading && activa) {
    navigate('/', { replace: true })
    return null
  }

  function handleSelect(plan: Plan) {
    setSelectedPlan(plan)
    setMetodoPago('')
    setFormError(null)
  }

  function handleConfirmar(e: FormEvent) {
    e.preventDefault()
    if (!selectedPlan) return
    if (selectedPlan.precio > 0 && !metodoPago.trim()) {
      setFormError('Se requiere un método de pago válido para activar este plan.')
      return
    }
    confirmar.mutate({ plan_id: selectedPlan.id, metodo_pago: metodoPago.trim() || null })
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
          <button
            type="button"
            className={styles.btnDanger}
            disabled={cancelar.isPending}
            onClick={() => {
              if (confirm('¿Cancelar tu suscripción activa?')) cancelar.mutate(activa.id)
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
                <div className={styles.planPrecio}>{fmtPrecio(p.precio, p.moneda)}</div>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={esActual}
                  onClick={() => handleSelect(p)}
                >
                  {esActual ? 'Ya tienes este plan' : 'Suscribirme'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {selectedPlan && (
        <form className={styles.confirmForm} onSubmit={handleConfirmar}>
          <h2 className={styles.confirmTitle}>Confirmar suscripción a {selectedPlan.nombre}</h2>
          {formError && <p className={styles.formError} role="alert">{formError}</p>}
          {selectedPlan.precio > 0 && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="metodo-pago">Método de pago</label>
              <input
                id="metodo-pago"
                className={styles.input}
                type="text"
                placeholder="Ej. tarjeta terminada en 4242"
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
              />
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
        <div className={styles.bannerOk}>
          ✓ Suscripción confirmada.
          {!!confirmar.data?.data && Number(confirmar.data.data.monto) > 0 && (
            <> Registra tu método de pago y genera tu invoice en <Link to="/facturacion">Facturación</Link>.</>
          )}
        </div>
      )}
    </section>
  )
}
