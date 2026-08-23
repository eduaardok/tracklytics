import { useQuery } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { CHART_COLORS, STATUS_COLORS } from '@shared/components/charts/colors'
import { finanzasApi } from '../api/finanzas.api'
import { RadialGauge } from './charts/RadialGauge'
import { fmtMoney, fmtDate } from '../lib/format'
import { SkeletonCard } from '@shared/components/SkeletonLoader'
import styles from '../pages/FinanzasPages.module.css'

// Consumo de presupuesto por campaña (CU-O87) — cada gauge es la proporción
// consumido/presupuesto_total de UNA campaña; una campaña ≥100% ya fue
// pausada automáticamente por el backend (activa=0) al momento de esta
// misma consulta (design.md, Decisión 5), por eso el badge "Pausada" puede
// aparecer sin que el admin haya hecho nada todavía.
export function PresupuestoTab() {
  const presupuesto = useQuery({ queryKey: ['finanzas', 'campanas', 'presupuesto'], queryFn: () => finanzasApi.presupuestoCampanas() })

  if (presupuesto.isError) return <ErrorState message={apiErrorMessage(presupuesto.error, 'No se pudo cargar el presupuesto de campañas.')} />

  const data = presupuesto.data?.data ?? []

  if (!presupuesto.isLoading && data.length === 0) {
    return <div className={styles.emptyState}>Sin campañas publicitarias registradas todavía.</div>
  }

  return (
    <div className={styles.gaugeGrid}>
      {presupuesto.isLoading ? (
        <>{[0, 1, 2].map((i) => <SkeletonCard key={i} height={150} />)}</>
      ) : data.map((c) => {
        const color = c.alerta_agotado ? STATUS_COLORS.error : c.alerta_80 ? STATUS_COLORS.warning : CHART_COLORS.teal
        return (
          <div key={c.campana_id} className={styles.campaignCard}>
            <RadialGauge pct={c.porcentaje_utilizado ?? 0} color={color} label="del presupuesto" />
            <span className={styles.campaignName}>{c.nombre}</span>
            <span className={styles.campaignMeta}>{fmtMoney(c.consumido)} / {fmtMoney(c.presupuesto_total)}</span>
            <span className={styles.campaignMeta}>{c.impresiones} impresiones · CPM efectivo {c.cpm_efectivo != null ? fmtMoney(c.cpm_efectivo) : '—'}</span>
            {c.fecha_agotamiento_estimada && (
              <span className={styles.campaignMeta}>Agotamiento estimado: {fmtDate(c.fecha_agotamiento_estimada)}</span>
            )}
            <span className={`${styles.badge} ${c.activa ? styles.badgeOk : styles.badgeNeutral}`}>
              {c.activa ? 'Activa' : 'Pausada'}
            </span>
            {c.alerta_agotado && <span className={`${styles.badge} ${styles.badgeError}`}>Presupuesto agotado</span>}
            {!c.alerta_agotado && c.alerta_80 && <span className={`${styles.badge} ${styles.badgePending}`}>≥80% consumido</span>}
          </div>
        )
      })}
    </div>
  )
}
