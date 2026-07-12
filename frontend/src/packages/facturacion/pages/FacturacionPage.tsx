import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { facturacionApi } from '../api/facturacion.api'
import type { MetodoPago } from '../types'
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
  const [selectedMethodId, setSelectedMethodId] = useState('')
  const [showAddForm, setShowAddForm]           = useState(false)
  const [tipo, setTipo]                         = useState('')
  const [ultimos4, setUltimos4]                 = useState('')
  const [pais, setPais]                         = useState('')

  const queryClient = useQueryClient()
  const toast = useToast()

  const metodos = useQuery({
    queryKey: ['facturacion', 'metodos-pago'],
    queryFn:  () => facturacionApi.metodosPago(),
  })

  const transacciones = useQuery({
    queryKey: ['facturacion', 'transacciones'],
    queryFn:  () => facturacionApi.transacciones(),
  })

  const invoices = useQuery({
    queryKey: ['facturacion', 'invoices'],
    queryFn:  () => facturacionApi.invoices(),
  })

  const registrarMetodo = useMutation({
    mutationFn: () =>
      facturacionApi.registrarMetodoPago({ tipo, ultimos_4_digitos: ultimos4, pais }),
    onSuccess: () => {
      setTipo(''); setUltimos4(''); setPais(''); setShowAddForm(false)
      queryClient.invalidateQueries({ queryKey: ['facturacion', 'metodos-pago'] })
      toast.success('Método de pago agregado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo agregar el método de pago.')),
  })

  const pagar = useMutation({
    mutationFn: () =>
      facturacionApi.pagarSuscripcion({ metodo_pago_id: selectedMethodId }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facturacion', 'transacciones'] })
      queryClient.invalidateQueries({ queryKey: ['facturacion', 'invoices'] })
      if (res.estado === 'exitosa') toast.success('Pago procesado correctamente')
      else toast.error('El pago fue rechazado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo procesar el pago.')),
  })

  const metodosData: MetodoPago[] = metodos.data?.data ?? []
  const suscripcion               = metodos.data?.suscripcion ?? null
  const transaccionesData         = transacciones.data?.data ?? []
  const invoicesData              = invoices.data?.data ?? []

  const payLabel = pagar.isPending
    ? 'Procesando…'
    : suscripcion
    ? `Pagar — ${fmt(suscripcion.monto, suscripcion.moneda)}/mes`
    : 'Pagar'

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
              <button
                key={m.metodo_pago_id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`${styles.methodRow} ${selected ? styles.methodRowSelected : ''}`}
                onClick={() => setSelectedMethodId(m.metodo_pago_id)}
              >
                <span className={styles.radioIndicator} aria-hidden="true">
                  <span className={styles.radioDot} />
                </span>
                <span className={styles.methodType}>{m.tipo}</span>
                <span className={styles.methodNumber}>•••• {m.ultimos_4_digitos}</span>
                <span className={styles.methodCountry}>{m.pais || '—'}</span>
              </button>
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
        <form
          className={styles.addForm}
          onSubmit={(e) => {
            e.preventDefault()
            if (!tipo.trim() || ultimos4.trim().length !== 4) {
              toast.error('Completa el tipo y los últimos 4 dígitos de la tarjeta.')
              return
            }
            registrarMetodo.mutate()
          }}
          noValidate
        >
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="tipo">tipo</label>
            <input
              id="tipo"
              className={styles.input}
              type="text"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              placeholder="visa"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="ultimos4">últimos 4</label>
            <input
              id="ultimos4"
              className={styles.input}
              type="text"
              value={ultimos4}
              onChange={(e) => setUltimos4(e.target.value)}
              maxLength={4}
              inputMode="numeric"
              placeholder="4242"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="pais">país</label>
            <input
              id="pais"
              className={styles.input}
              type="text"
              value={pais}
              onChange={(e) => setPais(e.target.value)}
              placeholder="ES"
            />
          </div>
          <button
            className={styles.btnPrimary}
            type="submit"
            disabled={registrarMetodo.isPending}
          >
            {registrarMetodo.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}

      {/* ── Pago ──
          Bugfix QA S10 ronda 2: el plan free también llega como `suscripcion`
          no-nula (`{tipo_plan:"free", monto:0}` — GET /facturacion/metodos-pago,
          backend), así que el botón de pago se mostraba activo-looking como
          "Pagar — 0,00 US$/mes" para cualquier usuario free, sin nada real que
          cobrar. Solo tiene sentido mostrar el flujo de pago cuando hay un
          monto real pendiente (plan pagado) — un plan free se actualiza desde
          Mi Plan, no "pagando" $0 acá. */}
      {suscripcion && suscripcion.monto > 0 ? (
        <div className={styles.paySection}>
          <div className={styles.payRow}>
            <button
              className={styles.btnPrimary}
              type="button"
              disabled={!selectedMethodId || pagar.isPending}
              onClick={() => pagar.mutate()}
            >
              {payLabel}
            </button>
            {!selectedMethodId && metodosData.length > 0 && (
              <span className={styles.sectionLabel} style={{ marginBottom: 0 }}>
                Selecciona un método para continuar
              </span>
            )}
          </div>

          {pagar.isSuccess && pagar.data && (
            <div className={pagar.data.estado === 'exitosa' ? styles.bannerOk : styles.bannerError}>
              {pagar.data.estado === 'exitosa'
                ? `Pago exitoso${pagar.data.invoice_id ? ` — invoice ${pagar.data.invoice_id.slice(0, 8)}…` : ''}`
                : 'El pago fue rechazado. Intenta de nuevo o usa otro método.'}
            </div>
          )}
          {pagar.isError && (
            <ErrorState message="No se pudo procesar el pago — verifica que tengas una suscripción activa." />
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
                    <td>{fmt(inv.monto, 'EUR')}</td>
                    <td>{fmt(inv.iva, 'EUR')}</td>
                    <td><StatusBadge estado={inv.estado} /></td>
                    <td><Link to={`/facturacion/${inv.invoice_id}`}>Ver factura</Link></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
