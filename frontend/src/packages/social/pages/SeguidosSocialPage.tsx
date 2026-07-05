import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { TrackPicker, type TrackSearchResult } from '@shared/components/TrackPicker'
import { socialApi } from '../api/social.api'
import styles from './SocialPages.module.css'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function SeguidosSocialPage() {
  useDocumentTitle('Social')
  const navigate = useNavigate()
  const [selectedTrack, setSelectedTrack] = useState<TrackSearchResult | null>(null)

  const seguidos = useQuery({
    queryKey: ['social', 'seguimiento'],
    queryFn:  () => socialApi.misSeguidos(),
  })

  const data = seguidos.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Social</h1>

      <p className={styles.sectionLabel}>Artistas seguidos</p>

      {seguidos.isError ? (
        <div className={styles.bannerError} role="alert">No se pudieron cargar tus seguidos (¿sesión activa?).</div>
      ) : seguidos.isLoading ? (
        <ul className={styles.followedList}>
          <li className={styles.followedRow}><span className={styles.skel} style={{ width: '40%', height: 14 }} /></li>
        </ul>
      ) : data.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyTitle}>Todavía no sigues a ningún artista</span>
          <span className={styles.emptyBody}>
            Visita <code>/social/artista/&lt;id&gt;</code> con el id de un artista del catálogo para seguirlo.
          </span>
        </div>
      ) : (
        <ul className={styles.followedList}>
          {data.map((a) => (
            <Link key={a.artista_id} to={`/social/artista/${a.artista_id}`} className={styles.followedRow}>
              <span className={styles.followedName}>{a.nombre}</span>
              <span className={styles.followedMeta}>desde {fmtDate(a.fecha_inicio)}</span>
            </Link>
          ))}
        </ul>
      )}

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Comentar un track</p>
      <p className={styles.emptyBody} style={{ marginBottom: 0 }}>
        La navegación desde el catálogo hacia el detalle de un track la construye la capability
        <code> experiencia</code>. Mientras tanto, busca el track:
      </p>
      <form
        className={styles.jumpForm}
        style={{ alignItems: 'flex-end' }}
        onSubmit={(e) => {
          e.preventDefault()
          if (selectedTrack) navigate(`/social/track/${selectedTrack.fact_id}`)
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <TrackPicker
            label="Track"
            selected={selectedTrack}
            onSelect={setSelectedTrack}
            onClear={() => setSelectedTrack(null)}
          />
        </div>
        <button className={styles.btnPrimary} type="submit" disabled={!selectedTrack}>Ir</button>
      </form>
    </section>
  )
}
