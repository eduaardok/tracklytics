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

function fmtDateTime(iso: string) {
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// El backend (`FEED_ACTIVIDAD_SEGUIDOS`) ya devuelve como máximo 30 filas
// (LIMIT fijo, sin offset/page — no hay verdadera paginación de servidor).
// Paginación en el cliente sobre esas ≤30 filas, mismo patrón visual
// (Anterior/Siguiente + "Página X / Y") que `ModeracionSocialPage`.
const FEED_PAGE_SIZE = 5

export function SeguidosSocialPage() {
  useDocumentTitle('Social')
  const navigate = useNavigate()
  const [selectedTrack, setSelectedTrack] = useState<TrackSearchResult | null>(null)
  const [feedPage, setFeedPage] = useState(1)

  const seguidos = useQuery({
    queryKey: ['social', 'seguimiento'],
    queryFn:  () => socialApi.misSeguidos(),
  })

  const feed = useQuery({
    queryKey: ['social', 'feed'],
    queryFn:  () => socialApi.feed(),
  })

  const data = seguidos.data?.data ?? []
  const feedData = feed.data?.data ?? []
  const totalFeedPages = Math.max(1, Math.ceil(feedData.length / FEED_PAGE_SIZE))
  const pagedFeed = feedData.slice((feedPage - 1) * FEED_PAGE_SIZE, feedPage * FEED_PAGE_SIZE)

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Social</h1>

      <p className={styles.sectionLabel}>Actividad reciente de artistas que sigo</p>
      {feed.isError ? (
        <div className={styles.bannerError} role="alert">No se pudo cargar el feed de actividad.</div>
      ) : feed.isLoading ? (
        <ul className={styles.followedList}>
          <li className={styles.followedRow}><span className={styles.skel} style={{ width: '50%', height: 14 }} /></li>
        </ul>
      ) : feedData.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyTitle}>Sin actividad todavía</span>
          <span className={styles.emptyBody}>
            Cuando sigas artistas y otros usuarios comenten o compartan sus tracks, aparecerá aquí.
          </span>
        </div>
      ) : (
        <>
          <ul className={styles.followedList}>
            {pagedFeed.map((item) => (
              <li key={`${item.tipo}-${item.id}`} className={styles.followedRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span className={styles.followedName}>
                  {item.usuario_nombre || 'Alguien'}{' '}
                  {item.tipo === 'comentario' ? 'comentó' : 'compartió'} un track de {item.artista_nombre}
                </span>
                {item.tipo === 'comentario' && item.contenido && (
                  <span className={styles.followedMeta}>&ldquo;{item.contenido}&rdquo;</span>
                )}
                <span className={styles.followedMeta}>{item.track_name} · {fmtDateTime(item.fecha)}</span>
              </li>
            ))}
          </ul>
          {totalFeedPages > 1 && (
            <div className={styles.queueHeader}>
              <button className={styles.btnGhost} type="button" disabled={feedPage <= 1} onClick={() => setFeedPage((p) => p - 1)}>
                ← Anterior
              </button>
              <span className={styles.queueRowMeta}>Página {feedPage} / {totalFeedPages}</span>
              <button className={styles.btnGhost} type="button" disabled={feedPage >= totalFeedPages} onClick={() => setFeedPage((p) => p + 1)}>
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Artistas seguidos</p>

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
            Entra al perfil de un artista desde el <Link to="/catalogo">catálogo</Link> y usa el botón "Seguir".
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
        Busca el track por nombre o artista, y selecciónalo de la lista de sugerencias:
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
