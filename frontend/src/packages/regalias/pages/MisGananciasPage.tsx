import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { regaliasApi } from '../api/regalias.api'
import { ArtistaHubTabs } from '@packages/creadores'
import type { Ganancia, Retiro } from '../types'
import styles from './RegaliasPages.module.css'

function fmtMoney(v: number, moneda = 'USD') {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(v)
}

const ESTADO_LABEL: Record<Retiro['estado'], string> = {
  pendiente: 'Pendiente', procesado: 'Procesado', rechazado: 'Rechazado',
}

// Widget de retiro (CU-O75, modelo-financiero-simulacion) — reusado tanto
// para la pestaña de artista como la de sello, solo cambia qué query/mutation
// de `regaliasApi` recibe.
function RetiroWidget({
  tipo, saldoQueryKey, fetchSaldo, solicitarRetiro,
}: {
  tipo: 'artista' | 'sello'
  saldoQueryKey: string[]
  fetchSaldo: () => ReturnType<typeof regaliasApi.saldoArtista>
  solicitarRetiro: (monto: number) => ReturnType<typeof regaliasApi.solicitarRetiroArtista>
}) {
  const [monto, setMonto] = useState('')
  const queryClient = useQueryClient()
  const toast = useToast()

  const saldo = useQuery({ queryKey: saldoQueryKey, queryFn: fetchSaldo })

  const solicitar = useMutation({
    mutationFn: () => solicitarRetiro(Number(monto)),
    onSuccess: () => {
      setMonto('')
      queryClient.invalidateQueries({ queryKey: saldoQueryKey })
      toast.success('Retiro solicitado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo solicitar el retiro.')),
  })

  const disponible = saldo.data?.saldo_disponible ?? 0
  const retiros = saldo.data?.retiros ?? []

  return (
    <div className={styles.totalCard}>
      <div className={styles.totalLabel}>Saldo disponible para retiro</div>
      <div className={styles.totalValue}>{saldo.isLoading ? '…' : fmtMoney(disponible)}</div>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          if (Number(monto) > 0) solicitar.mutate()
        }}
      >
        <input
          className={styles.input}
          type="number"
          step="0.01"
          min="0.01"
          max={disponible}
          placeholder="Monto a retirar"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={solicitar.isPending || !monto || Number(monto) <= 0 || Number(monto) > disponible}
        >
          {solicitar.isPending ? 'Solicitando…' : 'Solicitar retiro'}
        </button>
      </form>
      {retiros.length > 0 && (
        <table className={styles.table} style={{ marginTop: 'var(--space-md)' }}>
          <thead><tr><th>Fecha</th><th>Monto</th><th>Estado</th></tr></thead>
          <tbody>
            {retiros.map((r) => (
              <tr key={r.retiro_id}>
                <td>{r.fecha_solicitud}</td>
                <td>{fmtMoney(r.monto)}</td>
                <td>{ESTADO_LABEL[r.estado]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function TablaGanancias({ data }: { data: Ganancia[] }) {
  if (data.length === 0) {
    return (
      <div className={styles.tablePanel}>
        <div className={styles.emptyState}>
          Sin liquidaciones todavía — aparecerán aquí cuando se calcule el período con tus streams reales.
        </div>
      </div>
    )
  }
  return (
    <div className={styles.tablePanel}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Track</th><th>Período</th><th>Streams</th>
            <th>Bruto</th><th>Retención</th><th>Neto</th>
          </tr>
        </thead>
        <tbody>
          {data.map((g) => (
            <tr key={g.liquidacion_id}>
              <td>{g.track_name}</td>
              <td>{g.periodo_inicio} — {g.periodo_fin}</td>
              <td>{g.streams_periodo}</td>
              <td>{fmtMoney(g.monto_bruto, g.moneda)}</td>
              <td>{g.retencion_pct}% ({fmtMoney(g.monto_retenido, g.moneda)})</td>
              <td><strong>{fmtMoney(g.monto, g.moneda)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// CU-O64/CU-O65: un usuario puede tener cuenta de artista Y cuenta de sello
// al mismo tiempo (nada en el modelo lo impide) — las dos consultas corren
// siempre en paralelo, sin depender una de la otra, y se muestran ambas
// pestañas cuando ambas existen (antes la de sello solo se pedía si la de
// artista fallaba, así que un usuario con ambas cuentas nunca veía la de
// sello — bug encontrado en verificación visual, S10 día 5).
export function MisGananciasPage() {
  useDocumentTitle('Mis ganancias')
  const [tab, setTab] = useState<'artista' | 'sello'>('artista')

  const artista = useQuery({
    queryKey: ['regalias', 'mis-ganancias-artista'],
    queryFn:  () => regaliasApi.misGananciasArtista(),
    retry: false,
  })
  const sello = useQuery({
    queryKey: ['regalias', 'mis-ganancias-sello'],
    queryFn:  () => regaliasApi.misGananciasSello(),
    retry: false,
  })
  const cuentaSello = useQuery({
    queryKey: ['regalias', 'mi-cuenta-sello'],
    queryFn:  () => regaliasApi.miCuentaSello(),
    retry: false,
    enabled: sello.isSuccess,
  })

  if (artista.isLoading || sello.isLoading) {
    return <section className={styles.page}><p className={styles.subtitle}>Cargando…</p></section>
  }

  const tieneArtista = artista.isSuccess
  const tieneSello   = sello.isSuccess

  if (!tieneArtista && !tieneSello) {
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Mis ganancias</h1>
        <div className={styles.tablePanel}>
          <div className={styles.emptyState}>
            No tienes una cuenta de artista aprobada ni una cuenta de sello — esta sección es solo para rightsholders.
          </div>
        </div>
      </section>
    )
  }

  const vistaActiva = tieneArtista && tieneSello ? tab : (tieneArtista ? 'artista' : 'sello')
  const nombreSello = cuentaSello.data?.nombre_sello

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Mis ganancias</h1>

      {/* F2 (hub de artista): puente de vuelta a /creadores — el dinero del
          artista ya no es una isla. Solo aplica a quien tiene cuenta de
          artista; un rightsholder solo-sello no tiene hub. */}
      {tieneArtista && <ArtistaHubTabs activa="ganancias" />}

      {tieneArtista && tieneSello && (
        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'artista' ? styles.tabActive : ''}`}
            onClick={() => setTab('artista')}
          >
            Como artista
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'sello' ? styles.tabActive : ''}`}
            onClick={() => setTab('sello')}
          >
            Como sello{nombreSello ? ` · ${nombreSello}` : ''}
          </button>
        </div>
      )}

      {vistaActiva === 'artista' ? (
        <>
          <span className={styles.subtitle}>Regalías liquidadas por tus streams reales, como artista</span>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>Total acumulado</div>
            <div className={styles.totalValue}>{fmtMoney(artista.data!.total)}</div>
          </div>
          <RetiroWidget
            tipo="artista"
            saldoQueryKey={['regalias', 'saldo-artista']}
            fetchSaldo={regaliasApi.saldoArtista}
            solicitarRetiro={regaliasApi.solicitarRetiroArtista}
          />
          <TablaGanancias data={artista.data!.data} />
        </>
      ) : (
        <>
          <span className={styles.subtitle}>
            Regalías liquidadas por los streams reales de todos los artistas firmados a{nombreSello ? ` ${nombreSello}` : ' tu sello'}
          </span>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>Total acumulado</div>
            <div className={styles.totalValue}>{fmtMoney(sello.data!.total)}</div>
          </div>
          <RetiroWidget
            tipo="sello"
            saldoQueryKey={['regalias', 'saldo-sello']}
            fetchSaldo={regaliasApi.saldoSello}
            solicitarRetiro={regaliasApi.solicitarRetiroSello}
          />
          <TablaGanancias data={sello.data!.data} />
        </>
      )}
    </section>
  )
}
