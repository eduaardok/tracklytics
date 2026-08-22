import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { getUser } from '@shared/lib/session'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { facturacionApi } from '../api/facturacion.api'
import type { MetodoPago } from '../types'
import { FormMetodoPago } from '../components/FormMetodoPago'
import styles from './FacturacionPages.module.css'

function fmt(monto: number, moneda = 'EUR') {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(monto)
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES')
}

function StatusBadge({ estado }: { estado: string }) {
  const cls =
    estado === 'exitosa' || estado === 'emitido'
      ? styles.badgeOk
      : estado === 'fallida' || estado === 'anulado'
      ? styles.badgeDenied
      : styles.badgePending
  return <span className={`${styles.badge} ${cls}`}>{estado}</span>
}

function SkelRows({ cols, n = 3 }: { cols: number; n?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className={styles.skelCell}>
              <span
                className={styles.skel}
                style={{
                  width: j === 0 ? '80px' : j === cols - 1 ? '56px' : '100%',
                  height: '13px',
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function FacturacionPage() {
  useDocumentTitle('Facturación')
  // `esAdmin` (no el `role` crudo de PocketBase): un admin de área
  // (admin_finanzas, ...) tiene `role==='user'` en PocketBase — el rol
  // administrativo vive en BRIDGE_USUARIO_ROL_ADMIN y llega poblado como
  // `esAdmin` en el login (ver session.ts). Antes esta página solo
  // reconocía al superadmin bootstrap (`role==='admin'`), así que cualquier
  // otro admin caía en el flujo de checkout B2C real (bug real, confirmado
  // navegando como admin_finanzas — ver docs/PLAN_PRUEBAS_EJECUCION_S16.md).
  const esAdmin = Boolean(getUser()?.esAdmin)
  const [selectedMethodId, setSelectedMethodId] = useState('')
  const [showAddForm, setShowAddForm]           = useState(false)

  // Estados intermedios del "procesando pago" simulado (Validando… /
  // Autorizando…) — puramente cosmético en el cliente; el resultado real
  // siempre viene de `facturacionApi.pagarSuscripcion`, nunca se inventa acá.
  const [procesando, setProcesando] = useState<null | 'validando' | 'autorizando'>(null)

  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  // admin ya tiene acceso completo sin pagar — evita el roundtrip
  // innecesario (no hay nada que facturar para ese rol).
  const metodos = useQuery({
    queryKey: ['facturacion', 'metodos-pago'],
    queryFn:  () => facturacionApi.metodosPago(),
    enabled:  !esAdmin,
  })

  const transacciones = useQuery({
    queryKey: ['facturacion', 'transacciones'],
    queryFn:  () => facturacionApi.transacciones(),
    enabled:  !esAdmin,
  })

  const invoices = useQuery({
    queryKey: ['facturacion', 'invoices'],
    queryFn:  () => facturacionApi.invoices(),
    enabled:  !esAdmin,
  })

  // Notificaciones simuladas de factura enviada por correo (CU-O99,
  // modelo-financiero-completar-huecos) — nunca sale a un proveedor real.
  const notificaciones = useQuery({
    queryKey: ['facturacion', 'notificaciones'],
    queryFn:  () => facturacionApi.notificaciones(),
    enabled:  !esAdmin,
  })

  const eliminarMetodo = useMutation({
    mutationFn: (metodoPagoId: string) => facturacionApi.eliminarMetodoPago(metodoPagoId),
    onSuccess: (_res, metodoPagoId) => {
      if (selectedMethodId === metodoPagoId) setSelectedMethodId('')
      queryClient.invalidateQueries({ queryKey: ['facturacion', 'metodos-pago'] })
      toast.success('Método de pago eliminado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar el método de pago.')),
  })

  async function handleEliminarMetodo(e: MouseEvent, metodoPagoId: string, ultimos4: string) {
    e.stopPropagation()
    const ok = await confirm(
      `¿Eliminar el método de pago terminado en ${ultimos4}? Esta acción no se puede deshacer.`,
      { title: 'Eliminar método de pago', confirmLabel: 'Eliminar' },
    )
    if (ok) eliminarMetodo.mutate(metodoPagoId)
  }

  // Espera `ms` sin bloquear — usada solo para los estados intermedios
  // cosméticos ("Validando…" / "Autorizando…") antes de la llamada real.
  const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const pagar = useMutation({
    mutationFn: async () => {
      setProcesando('validando')
      await esperar(600)
      setProcesando('autorizando')
      await esperar(600)
      try {
        return await facturacionApi.pagarSuscripcion({ metodo_pago_id: selectedMethodId })
      } finally {
        setProcesando(null)
      }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facturacion', 'transacciones'] })
      queryClient.invalidateQueries({ queryKey: ['facturacion', 'invoices'] })
      // Sin esto, `suscripcion.pagado` quedaba con el valor de antes del pago
      // — el botón "Pagar" no desaparecía hasta el siguiente refresh manual
      // de la página (bug S13-P5, ver AUDITORIA_S13.md §5).
      queryClient.invalidateQueries({ queryKey: ['facturacion', 'metodos-pago'] })
      if (res.estado === 'exitosa') toast.success('Pago procesado correctamente')
      else toast.error('El pago fue rechazado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo procesar el pago.')),
  })

  // Confirmación antes de cobrar (S13-P5): antes el clic ejecutaba el cargo
  // directo, sin ningún paso intermedio — ver AUDITORIA_S13.md §5.
  async function handlePagarClick() {
    if (!suscripcion) return
    const ok = await confirm(
      `Vas a cargar ${fmt(suscripcion.monto, suscripcion.moneda)} a tu método de pago. ¿Confirmar?`,
      { title: 'Confirmar pago', confirmLabel: 'Pagar' },
    )
    if (ok) pagar.mutate()
  }

  const metodosData: MetodoPago[] = metodos.data?.data ?? []
  const suscripcion               = metodos.data?.suscripcion ?? null
  const transaccionesData         = transacciones.data?.data ?? []
  const invoicesData              = invoices.data?.data ?? []
  const notificacionesData        = notificaciones.data?.data ?? []

  const payLabel = pagar.isPending
    ? procesando === 'validando'
      ? 'Validando…'
      : procesando === 'autorizando'
      ? 'Autorizando…'
      : 'Procesando…'
    : suscripcion
    ? `Pagar — ${fmt(suscripcion.monto, suscripcion.moneda)}/mes`
    : 'Pagar'

  // admin (Lead Data Engineer/CTO) ya tiene acceso completo a la plataforma
  // sin pagar — no le corresponde ningún flujo de facturación.
  if (esAdmin) {
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Facturación</h1>
        <p className={styles.emptyMethods}>
          Como administrador, tienes acceso completo a la plataforma sin necesidad de facturación.
        </p>
      </section>
    )
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Facturación</h1>

      {/* ── Métodos de pago ── */}
      <p className={styles.sectionLabel}>Método de pago</p>

      {metodos.isLoading && (
        <div className={styles.methodList}>
          {[0, 1].map((i) => (
            <div key={i} className={styles.skelMethodRow}>
              <span
                className={styles.skel}
                style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0 }}
              />
              <span className={styles.skel} style={{ width: 48, height: 13 }} />
              <span className={styles.skel} style={{ width: 120, height: 13, flex: 1 }} />
              <span className={styles.skel} style={{ width: 32, height: 13 }} />
            </div>
          ))}
        </div>
      )}

      {metodos.isError && (
        <ErrorState
          message="No se pudieron cargar los métodos de pago — ¿hay sesión activa?"
          style={{ marginBottom: 'var(--space-md)' }}
        />
      )}

      {!metodos.isLoading && !metodos.isError && metodosData.length === 0 && (
        <p className={styles.emptyMethods}>
          Sin métodos de pago registrados. Añade uno para poder pagar.
        </p>
      )}

      {!metodos.isLoading && !metodos.isError && metodosData.length > 0 && (
        <div className={styles.methodList} role="radiogroup" aria-label="Seleccionar método de pago">
          {metodosData.map((m) => {
            const selected = m.metodo_pago_id === selectedMethodId
            return (
              <div
                key={m.metodo_pago_id}
                role="radio"
                tabIndex={0}
                aria-checked={selected}
                className={`${styles.methodRow} ${selected ? styles.methodRowSelected : ''}`}
                onClick={() => setSelectedMethodId(m.metodo_pago_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedMethodId(m.metodo_pago_id)
                  }
                }}
              >
                <span className={styles.radioIndicator} aria-hidden="true">
                  <span className={styles.radioDot} />
                </span>
                <span className={styles.methodType}>{m.tipo}</span>
                <span className={styles.methodNumber}>•••• {m.ultimos_4_digitos}</span>
                {m.nombre_titular && <span className={styles.methodCountry}>{m.nombre_titular}</span>}
                <span className={styles.methodCountry}>{m.pais || '—'}</span>
                <button
                  type="button"
                  aria-label={`Eliminar método de pago terminado en ${m.ultimos_4_digitos}`}
                  className={styles.deleteBtn}
                  disabled={eliminarMetodo.isPending}
                  onClick={(e) => handleEliminarMetodo(e, m.metodo_pago_id, m.ultimos_4_digitos)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Añadir método ── */}
      <button
        type="button"
        className={`${styles.addToggle} ${showAddForm ? styles.addToggleOpen : ''}`}
        onClick={() => setShowAddForm((v) => !v)}
      >
        {showAddForm ? '−' : '+'}&nbsp;&nbsp;Añadir método
      </button>

      {showAddForm && (
        <FormMetodoPago onRegistrado={() => setShowAddForm(false)} />
      )}

      {/* ── Pago ──
          Bugfix QA S10 ronda 2: el plan free también llega como `suscripcion`
          no-nula (`{tipo_plan:"free", monto:0}` — GET /facturacion/metodos-pago,
          backend), así que el botón de pago se mostraba activo-looking como
          "Pagar — 0,00 US$/mes" para cualquier usuario free, sin nada real que
          cobrar. Solo tiene sentido mostrar el flujo de pago cuando hay un
          monto real pendiente (plan pagado) — un plan free se actualiza desde
          Mi Plan, no "pagando" $0 acá.

          S13-P5 (AUDITORIA_S13.md §5): el botón "Pagar" también se
          mostraba siempre para un plan pagado, sin importar si el período en
          curso ya estaba cobrado — permitía generar invoices duplicadas a
          fuerza de clics (el backend ahora lo rechaza con 409, pero acá
          además se oculta el botón para no ofrecer la acción). Con el
          período cubierto se muestra un estado "Al día" en su lugar. */}
      {suscripcion && suscripcion.monto > 0 && suscripcion.pagado ? (
        <div className={styles.paySection}>
          <div className={styles.payRow}>
            <span className={`${styles.badge} ${styles.badgeOk}`}>Al día</span>
            <span className={styles.sectionLabel} style={{ marginBottom: 0 }}>
              Cubierto hasta {fmtDate(suscripcion.periodo_fin ?? '')}
              {suscripcion.proximo_cobro && ` · Próximo cobro: ${fmtDate(suscripcion.proximo_cobro)}`}
            </span>
          </div>
        </div>
      ) : suscripcion && suscripcion.monto > 0 ? (
        <div className={styles.paySection}>
          <div className={styles.payRow}>
            <button
              className={styles.btnPrimary}
              type="button"
              disabled={!selectedMethodId || pagar.isPending}
              onClick={handlePagarClick}
            >
              {payLabel}
            </button>
            {!selectedMethodId && metodosData.length > 0 && (
              <span className={styles.sectionLabel} style={{ marginBottom: 0 }}>
                Selecciona un método para continuar
              </span>
            )}
            {procesando && (
              <span className={`${styles.badge} ${styles.badgePending}`}>
                {procesando === 'validando' ? 'Validando…' : 'Autorizando…'}
              </span>
            )}
          </div>

          {pagar.isSuccess && pagar.data && (
            <div className={pagar.data.estado === 'exitosa' ? styles.bannerOk : styles.bannerError}>
              {pagar.data.estado === 'exitosa' ? (
                <>
                  Pago procesado correctamente.
                  {/* Factura visible de inmediato (S16) — antes solo quedaba
                      accesible buscándola en la tabla de invoices de abajo. */}
                  {pagar.data.invoice_id && (
                    <> <Link to={`/facturacion/${pagar.data.invoice_id}`}>Ver factura</Link></>
                  )}
                </>
              ) : (
                'El pago fue rechazado. Intenta de nuevo o usa otro método.'
              )}
            </div>
          )}
          {pagar.isError && (
            <ErrorState message={apiErrorMessage(pagar.error, 'No se pudo procesar el pago — verifica que tengas una suscripción activa.')} />
          )}
        </div>
      ) : suscripcion ? (
        <p className={styles.emptyMethods}>
          Tu plan actual es gratuito — no hay ningún cargo pendiente. Para pasarte a Premium, ve a{' '}
          <Link to="/suscripciones">Mi Plan</Link>.
        </p>
      ) : null}

      {/* ── Historial ── */}
      <div className={styles.historyGrid}>
        <div className={styles.historyBlock}>
          <p className={styles.sectionLabel}>Mis transacciones</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {transacciones.isLoading ? (
                <SkelRows cols={3} />
              ) : transaccionesData.length === 0 ? (
                <tr>
                  <td colSpan={3} className={styles.tableEmpty}>
                    Sin transacciones todavía.
                  </td>
                </tr>
              ) : (
                transaccionesData.map((t) => (
                  <tr key={t.transaccion_id}>
                    <td>{fmtDate(t.fecha)}</td>
                    <td>{fmt(t.monto, t.moneda)}</td>
                    <td><StatusBadge estado={t.estado} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.historyBlock}>
          <p className={styles.sectionLabel}>Mis invoices</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Emitido</th>
                <th>Monto</th>
                <th>IVA</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.isLoading ? (
                <SkelRows cols={5} />
              ) : invoicesData.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.tableEmpty}>
                    Sin invoices todavía.
                  </td>
                </tr>
              ) : (
                invoicesData.map((inv) => (
                  <tr key={inv.invoice_id}>
                    <td>{fmtDate(inv.fecha_emision)}</td>
                    <td>{fmt(inv.monto, inv.moneda ?? undefined)}</td>
                    <td>{fmt(inv.iva, inv.moneda ?? undefined)}</td>
                    <td><StatusBadge estado={inv.estado} /></td>
                    <td><Link to={`/facturacion/${inv.invoice_id}`}>Ver factura</Link></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Notificaciones simuladas de factura enviada por correo (CU-O99) ── */}
      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>
        Notificaciones enviadas
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Destinatario</th>
            <th>Asunto</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {notificaciones.isLoading ? (
            <SkelRows cols={4} />
          ) : notificacionesData.length === 0 ? (
            <tr>
              <td colSpan={4} className={styles.tableEmpty}>
                Sin notificaciones enviadas todavía.
              </td>
            </tr>
          ) : (
            notificacionesData.map((n) => (
              <tr key={n.notificacion_id} title={n.cuerpo}>
                <td>{fmtDate(n.fecha_envio)}</td>
                <td>{n.destinatario}</td>
                <td>{n.asunto}</td>
                <td><StatusBadge estado={n.estado} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}
