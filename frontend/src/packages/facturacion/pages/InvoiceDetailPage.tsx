import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { SkeletonLoader, SkeletonTableRows } from '@shared/components/SkeletonLoader'
import { facturacionApi } from '../api/facturacion.api'
import styles from './InvoiceDetailPage.module.css'

function money(v: number, moneda: string | null) {
  return `${Number(v).toFixed(2)} ${moneda || 'USD'}`
}

function fmtDate(iso: string) {
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES')
}

// Vista imprimible de una invoice — antes solo existía en
// app/facturacion/invoice.html (legacy vanilla), sin equivalente en React
// (gap encontrado al consolidar todo a React, 2026-07-10). `data-print-hide`
// en AppShell (header/nav/PlayerBar) es lo que permite que `window.print()`
// aquí muestre solo la hoja de factura, igual que el `@media print` legacy.
export function InvoiceDetailPage() {
  useDocumentTitle('Factura')
  const { invoiceId } = useParams<{ invoiceId: string }>()

  const invoice = useQuery({
    queryKey: ['facturacion', 'invoice', invoiceId],
    queryFn:  () => facturacionApi.invoiceDetalle(invoiceId!),
    enabled:  !!invoiceId,
  })
  // Encabezado de la factura (razón social/RUC/dirección) — antes fijo en
  // este componente, ahora editable por admin (CU-O81, GET /facturacion/empresa).
  const empresa = useQuery({
    queryKey: ['facturacion', 'empresa'],
    queryFn:  () => facturacionApi.empresa(),
  })

  if (invoice.isLoading) {
    // Esqueleto con la forma de la hoja de factura (encabezado, título,
    // partes y tabla de conceptos) — el "Cargando…" plano no anticipaba nada.
    return (
      <section className={styles.page}>
        <div className={styles.toolbar} data-print-hide="true">
          <Link to="/facturacion" className={styles.btnGhost}>← Volver</Link>
        </div>
        <div className={styles.sheet}>
          <SkeletonLoader count={3} height={10} />
          <h1 className={styles.title}>Factura</h1>
          <div className={styles.parties}>
            <SkeletonLoader count={3} height={11} />
            <SkeletonLoader count={3} height={11} />
          </div>
          <table className={styles.table}>
            <tbody>
              <SkeletonTableRows columns={3} rows={4} />
            </tbody>
          </table>
        </div>
      </section>
    )
  }
  if (invoice.isError || !invoice.data) {
    return (
      <section className={styles.page}>
        <ErrorState message="No se pudo cargar la factura." />
      </section>
    )
  }

  const inv = invoice.data
  const total = Number(inv.monto) + Number(inv.iva)

  return (
    <section className={styles.page}>
      <div className={styles.toolbar} data-print-hide="true">
        <Link to="/facturacion" className={styles.btnGhost}>← Volver</Link>
        <button type="button" className={styles.btnPrimary} onClick={() => window.print()}>
          Descargar PDF
        </button>
      </div>

      <div className={styles.sheet}>
        <div className={styles.header}>
          <div className={styles.brand}>
            <img src="/logo.png" alt="" width={40} height={40} className={styles.brandLogo} />
            <span className={styles.brandName}>Tracklytics</span>
          </div>
          <div className={styles.meta}>
            <div>{empresa.data?.razon_social ?? '—'}</div>
            <div>{empresa.data ? `RUC ${empresa.data.ruc}` : '—'}</div>
            <div>{empresa.data?.direccion ?? '—'}</div>
          </div>
        </div>

        <h1 className={styles.title}>Factura</h1>
        <div className={styles.subtitle}>
          N.° {inv.invoice_id.slice(0, 8).toUpperCase()} · {fmtDate(inv.fecha_emision)}
        </div>

        <div className={styles.parties}>
          <div>
            <div className={styles.sectionLabel}>Facturado a</div>
            <div className={styles.partyName}>{inv.usuario_nombre || '—'}</div>
            <div className={styles.muted}>{inv.usuario_email || ''}</div>
          </div>
          <div>
            <div className={styles.sectionLabel}>Método de pago</div>
            <div>{inv.metodo_tipo ? `${inv.metodo_tipo} •••• ${inv.metodo_ultimos_4}` : '—'}</div>
            {inv.metodo_nombre_titular && <div className={styles.muted}>{inv.metodo_nombre_titular}</div>}
            {inv.metodo_pais && <div className={styles.muted}>{inv.metodo_pais}</div>}
          </div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr><th>Concepto</th><th>Estado</th><th className={styles.right}>Monto</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Suscripción {inv.plan_nombre}</td>
              <td>
                <span className={inv.estado === 'emitido' ? styles.statusOk : styles.statusPending}>
                  {inv.estado === 'emitido' ? 'Pagada' : inv.estado}
                </span>
              </td>
              <td className={styles.right}>{money(inv.monto, inv.moneda)}</td>
            </tr>
          </tbody>
        </table>

        <div className={styles.totals}>
          <div className={styles.totalsRow}><span>Subtotal</span><span>{money(inv.monto, inv.moneda)}</span></div>
          <div className={styles.totalsRow}><span>IVA</span><span>{money(inv.iva, inv.moneda)}</span></div>
          <div className={`${styles.totalsRow} ${styles.totalsRowFinal}`}><span>Total</span><span>{money(total, inv.moneda)}</span></div>
        </div>

        <p className={styles.footnote}>Documento generado automáticamente por Tracklytics · No requiere firma</p>
      </div>
    </section>
  )
}
