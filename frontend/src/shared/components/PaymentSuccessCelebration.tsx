import { Link } from 'react-router-dom'
import { CheckCircle2, FileText } from 'lucide-react'
import styles from './PaymentSuccessCelebration.module.css'

// Momento de éxito de un pago (S17, TASK 3) — primer uso real en
// PlanesPage.tsx tras confirmar una suscripción de pago. Se promueve a
// `shared/components` desde el principio (no hay un patrón de "modal/toast
// de éxito de pago" ya existente en `regalias`/`finanzas` para reutilizar,
// según auditoría previa) para que un futuro flujo de pago (upgrade manual,
// renovación forzada desde admin, etc.) pueda montarlo sin duplicar el CSS
// de entrada ni la regla de `prefers-reduced-motion`.
export type PaymentSuccessCelebrationProps = {
  /** Nombre del plan ya confirmado (dato real, no inventado). */
  plan: string
  /** Monto cobrado (o 0 si es un plan gratuito / trial sin cobro). */
  monto: number
  moneda: string
  /** Fecha del próximo cobro (fin del período ya pagado o fin de trial) —
   *  `undefined` si no aplica (ej. plan free). */
  proximoCobro?: string
  /** Texto de estado (ej. "En período de prueba — sin cobro por ahora"),
   *  reemplaza al monto cuando no hubo cobro real en esta confirmación. */
  notaCobro?: string
  /** `href` de la factura real generada por este pago — si no hay (ej.
   *  trial sin cobro), el botón "Ver factura" no se muestra. */
  invoiceHref?: string
}

export function PaymentSuccessCelebration({
  plan, monto, moneda, proximoCobro, notaCobro, invoiceHref,
}: PaymentSuccessCelebrationProps) {
  return (
    <div className={styles.card} role="status">
      <div className={styles.iconWrap}>
        <CheckCircle2 className={styles.icon} size={40} strokeWidth={2} aria-hidden="true" />
      </div>
      <p className={styles.title}>¡Pago realizado!</p>
      <p className={styles.subtitle}>Tu suscripción a {plan} está activa.</p>

      <dl className={styles.summary}>
        <div className={styles.summaryRow}>
          <dt>Plan</dt>
          <dd>{plan}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>{notaCobro ? 'Estado' : 'Monto cobrado'}</dt>
          <dd>{notaCobro ?? (monto > 0 ? `${monto.toFixed(2)} ${moneda}` : 'Gratis')}</dd>
        </div>
        {proximoCobro && (
          <div className={styles.summaryRow}>
            <dt>Próximo cobro</dt>
            <dd>{proximoCobro}</dd>
          </div>
        )}
      </dl>

      {invoiceHref && (
        <Link to={invoiceHref} className={styles.invoiceBtn}>
          <FileText size={15} aria-hidden="true" />
          Ver factura
        </Link>
      )}
    </div>
  )
}
