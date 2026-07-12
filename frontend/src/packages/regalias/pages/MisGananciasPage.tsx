import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { regaliasApi } from '../api/regalias.api'
import type { Ganancia } from '../types'
import styles from './RegaliasPages.module.css'

function fmtMoney(v: number, moneda = 'USD') {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(v)
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
          <tr><th>Track</th><th>Período</th><th>Streams</th><th>Monto</th></tr>
        </thead>
        <tbody>
          {data.map((g) => (
            <tr key={g.liquidacion_id}>
              <td>{g.track_name}</td>
              <td>{g.periodo_inicio} — {g.periodo_fin}</td>
              <td>{g.streams_periodo}</td>
              <td>{fmtMoney(g.monto, g.moneda)}</td>
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
          <TablaGanancias data={sello.data!.data} />
        </>
      )}
    </section>
  )
}
