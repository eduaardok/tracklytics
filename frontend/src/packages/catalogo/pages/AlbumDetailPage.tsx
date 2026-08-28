import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Disc3 } from 'lucide-react'
import { catalogoApi } from '../api/catalogo.api'
import { TrackCard } from '../components/TrackCard'
import { AlbumArt } from '@shared/components/AlbumArt'
import { ErrorState } from '@shared/components/ErrorState'
import { EmptyState } from '@shared/components/EmptyState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ApiError } from '@shared/lib/api-client'
import type { Track } from '../types'
import styles from './DetailPages.module.css'

// Página mínima de detalle de álbum — no la pidió explícitamente el prompt
// como página propia, pero item 2 (detalle de track) pide navegación cruzada
// a "artista/álbum/género" y el endpoint/tipo ya existían en catalogo.api.ts.
export function AlbumDetailPage() {
  const { albumId } = useParams<{ albumId: string }>()
  const navigate = useNavigate()
  const id = Number(albumId)

  const { data: album, isLoading: loadingAlbum, isError: errorAlbum, error: albumError } = useQuery({
    queryKey: ['catalogo', 'album-detail', id],
    queryFn:  () => catalogoApi.albumDetail(id),
    enabled:  Number.isFinite(id),
  })

  const { data: tracksRes, isLoading: loadingTracks, isError: errorTracks } = useQuery({
    queryKey: ['catalogo', 'tracks-by-album', id],
    // 200 (bug real, reportado por usuario): con el límite anterior de 50,
    // un álbum con más canciones (`album.track_count` real, ej. 60) mostraba
    // el conteo correcto en la cabecera pero la lista se cortaba a la mitad
    // sin ningún aviso — 200 es el tope real que acepta el backend
    // (`Query(50, ge=1, le=200)`), muy por encima del máximo observado en el
    // catálogo (~138 canciones en una muestra de 100 álbumes).
    queryFn:  () => catalogoApi.tracksByAlbum(id, 200),
    enabled:  Number.isFinite(id),
  })

  useDocumentTitle(album?.name ?? 'Álbum')

  if (loadingAlbum) return <p className={styles.loading}>// cargando…</p>

  if (errorAlbum || !album) {
    const notFound = albumError instanceof ApiError && albumError.status === 404
    return (
      <ErrorState
        title={notFound ? 'Álbum no encontrado' : undefined}
        message={
          notFound
            ? 'Este álbum no existe o fue eliminado.'
            : 'No se pudo cargar este álbum. Puede que la API no esté disponible.'
        }
      />
    )
  }

  const tracks = tracksRes?.data ?? []
  // Contenedor auto-creado por `_resolver_album_id` (api/paquetes/creadores/
  // promocion.py) para un track subido sin álbum explícito — ya viene con
  // `album_type: 'Single'` real desde el backend, no hace falta inferirlo.
  const esSencillo = album.album_type === 'Single' && album.release_year === 0

  return (
    <section>
      <div className={styles.hero}>
        <div className={styles.heroBg} aria-hidden="true" />
        <AlbumArt src={album.imagen_url} alt="" size={96} />
        <div className={styles.heroMeta}>
          <span className={styles.heroType}>{esSencillo ? 'Sencillo' : 'Álbum'}</span>
          <h1 className={styles.heroName}>{album.name}</h1>
          <div className={styles.heroSub}>
            {/* `release_year && <span>` renderiza un "0" suelto sin etiqueta
                cuando el álbum no tiene año real (0 es el placeholder de
                `_resolver_album_id` para álbumes auto-creados sin metadata —
                bug encontrado en QA, S10 ronda 2): `0 && <JSX>` se evalúa a
                `0`, y React SÍ pinta un número falsy literal, a diferencia de
                `false`/`null`/`undefined`. `!!` fuerza booleano. */}
            {!!album.release_year && <span>{album.release_year}</span>}
            <span>· {album.track_count ?? tracks.length} canciones</span>
          </div>
        </div>
      </div>

      <div className={styles.attrGrid}>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Año</div>
          <div className={styles.attrValue}>{album.release_year || '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Tipo</div>
          <div className={styles.attrValue}>{album.album_type ?? '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Canciones</div>
          <div className={styles.attrValue}>{album.track_count ?? '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Popularidad</div>
          <div className={styles.attrValue}>{album.avg_popularity ?? '—'}</div>
        </div>
      </div>

      <h2 className={styles.sectionTitle}>Canciones</h2>
      {loadingTracks ? (
        <p className={styles.loading}>// cargando…</p>
      ) : errorTracks ? (
        <ErrorState message="No se pudieron cargar las canciones de este álbum." />
      ) : tracks.length === 0 ? (
        <EmptyState icon={<Disc3 size={22} aria-hidden="true" />} title="Sin canciones registradas para este álbum." />
      ) : (
        <ul className={styles.trackList} aria-label="Canciones del álbum">
          {tracks.map((track: Track, i: number) => (
            <li key={`${track.fact_id}-${track.track_id}`}>
              <TrackCard track={track} position={i + 1} queue={tracks} />
            </li>
          ))}
        </ul>
      )}

      {/* `window.history.length <= 1` = llegaste directo (deep-link/reload,
          común al abrir el detalle en una pestaña nueva desde una demo):
          `navigate(-1)` se traga la navegación y el botón parece roto — se
          cae a la portada del catálogo en ese caso. */}
      <button
        type="button"
        className={styles.btnBack}
        style={{ marginTop: 'var(--space-xl)' }}
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Volver
      </button>
    </section>
  )
}
