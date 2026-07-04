import { useQuery } from '@tanstack/react-query'
import { bibliotecaApi } from '../api/biblioteca.api'
import { LibraryTrackRow } from './LibraryTrackRow'
import styles from '../pages/BibliotecaPage.module.css'

function timeAgo(isoStr: string): string {
  // ClickHouse DateTime se devuelve sin zona horaria; forzar UTC para parseo correcto.
  const utc  = isoStr && !/Z|[+-]\d{2}:\d{2}$/.test(isoStr) ? isoStr.replace(' ', 'T') + 'Z' : isoStr
  const mins = Math.floor((Date.now() - new Date(utc).getTime()) / 60_000)
  if (mins < 1)  return 'ahora mismo'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} d`
}

export function HistorialTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['biblioteca', 'historial'],
    queryFn:  () => bibliotecaApi.historial(50),
  })

  if (isLoading) return <p className={styles.loading}>// cargando…</p>
  if (isError) return <div className={styles.blocked} role="alert">No se pudo cargar el historial.</div>

  const entries = data?.data ?? []

  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <span>⏱</span>
        <p>Historial vacío. Las canciones que escuches aparecerán aquí.</p>
      </div>
    )
  }

  return (
    <ul className={styles.trackList} aria-label="Historial de reproducción">
      {entries.map((entry, i) => (
        <li key={`${entry.fact_id}-${entry.event_timestamp}`}>
          <LibraryTrackRow track={entry} position={i + 1} timeAgo={timeAgo(entry.event_timestamp)} />
        </li>
      ))}
    </ul>
  )
}
