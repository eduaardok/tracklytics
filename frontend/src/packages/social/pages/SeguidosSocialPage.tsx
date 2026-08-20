import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { TrackPicker, type TrackSearchResult } from '@shared/components/TrackPicker'
import { socialApi } from '../api/social.api'
import styles from './SocialPages.module.css'

// Descubrimiento de perfiles públicos por nombre (S16) — antes solo se podía
// llegar a un perfil ya conociendo su usuario_id (link compartido, comentario).
// Debounce 300ms, mismo patrón que UserPicker/ArtistPicker/TrackPicker en
// `shared/components`, pero sin selección persistente: cada resultado navega
// directo a `/usuarios/:usuarioId` en vez de quedar "elegido" en un formulario.
function BuscadorPerfiles() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  const resultados = useQuery({
    queryKey: ['social', 'buscar-perfiles', debouncedQ],
    queryFn:  () => socialApi.buscarPerfiles(debouncedQ),
    enabled:  debouncedQ.length >= 2,
  })

  const items = resultados.data?.data ?? []
  const mostrarDropdown = debouncedQ.length >= 2

  return (
    <div className={styles.profileSearchWrap}>
      <input
        className={styles.jumpInput}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar un perfil público por nombre…"
        aria-label="Buscar perfiles públicos"
      />
      {mostrarDropdown && (
        <ul className={styles.profileSearchDropdown} role="listbox" aria-label="Resultados de la búsqueda de perfiles">
          {items.length === 0 && !resultados.isLoading && (
            <li className={styles.emptyBody} style={{ padding: '10px 12px' }}>Sin perfiles públicos con ese nombre</li>
          )}
          {items.map((u) => (
            <li key={u.usuario_id}>
              <button
                type="button"
                className={styles.shareOption}
                style={{ width: '100%' }}
                onClick={() => navigate(`/usuarios/${u.usuario_id}`)}
              >
                {u.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

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

      <p className={styles.sectionLabel}>Buscar perfiles públicos</p>
      <BuscadorPerfiles />

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Actividad reciente de artistas que sigo</p>
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
