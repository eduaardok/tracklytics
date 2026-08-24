import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'

import { AlbumArt } from '@shared/components/AlbumArt'
import { TrackName, FeaturingCaption } from '@shared/components/TrackName'
import { EmptyState } from '@shared/components/EmptyState'
import { ErrorState } from '@shared/components/ErrorState'
import { usePlayer } from '@shared/context/PlayerContext'

import { catalogoApi } from '../api/catalogo.api'
import type { SearchAlbum, SearchArtista, SearchPlaylist, SearchTrack } from '../types'
import styles from './SearchResultsPage.module.css'

const SKELETON_ROWS = [0, 1, 2, 3, 4]

// "Ver más" por grupo (S16-P10, brecha P2 search-all): la vista completa trae
// 8 por sección; con ?grupo=canciones|artistas|albumes|playlists la misma
// página muestra solo ese grupo ampliado (20) — un solo endpoint y una sola
// página para ambos niveles de profundidad.
const GRUPOS = ['canciones', 'artistas', 'albumes', 'playlists'] as const
type Grupo = (typeof GRUPOS)[number]

function grupoValido(v: string | null): Grupo | null {
  return GRUPOS.includes(v as Grupo) ? (v as Grupo) : null
}

/**
 * Resultados de la búsqueda unificada (change p2-descubrimiento-comunidad).
 *
 * Cuatro secciones por tipo de entidad, precedidas por el "mejor resultado":
 * el track más popular, que es lo que se busca la mayoría de las veces. Las
 * secciones vacías no se renderizan — una lista de encabezados sin contenido
 * hace parecer que la búsqueda falló.
 */
export function SearchResultsPage() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const grupo = grupoValido(params.get('grupo'))

  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalogo', 'search-all', q, grupo],
    queryFn:  () => catalogoApi.searchAll(q, grupo ? 20 : 8),
    enabled:  q.length > 0,
  })

  return (
    <section className={styles.page}>
      <header className={styles.pageHead}>
        <h1 className={styles.heading}>{grupo ? tituloDeGrupo(grupo) : 'Resultados'}</h1>
        <span className={styles.subtitle}>
          {q ? `// "${q}"` : '// escribe algo en la búsqueda del encabezado'}
        </span>
        {q && grupo && (
          <Link className={styles.verMas} to={`/buscar?q=${encodeURIComponent(q)}`}>
            ← Volver a todos los resultados
          </Link>
        )}
      </header>

      {!q && (
        <EmptyState
          icon={<Search size={28} />}
          title="Busca en todo el catálogo"
          body="Canciones, artistas, álbumes y playlists, todo a la vez."
        />
      )}

      {q && isLoading && (
        <div className={styles.sections}>
          {SKELETON_ROWS.map((i) => (
            <span key={i} className={styles.skel} style={{ width: `${70 - i * 8}%`, height: 40 }} />
          ))}
        </div>
      )}

      {q && isError && (
        <ErrorState
          title="No se pudo completar la búsqueda"
          message="Comprueba que la API esté activa e intenta de nuevo."
        />
      )}

      {q && data && <Resultados data={data} grupo={grupo} q={q} />}
    </section>
  )
}

function tituloDeGrupo(g: Grupo): string {
  return g === 'canciones' ? 'Canciones' : g === 'artistas' ? 'Artistas' : g === 'albumes' ? 'Álbumes' : 'Playlists'
}

function Resultados({ data, grupo, q }: { data: { tracks: SearchTrack[]; artistas: SearchArtista[]; albumes: SearchAlbum[]; playlists: SearchPlaylist[] }; grupo: Grupo | null; q: string }) {
  const total =
    data.tracks.length + data.artistas.length + data.albumes.length + data.playlists.length

  if (total === 0) {
    return (
      <EmptyState
        icon={<Search size={28} />}
        title="Sin resultados"
        body="Prueba con otro término o revisa la ortografía."
      />
    )
  }

  // Vista de un solo grupo ampliado (?grupo=...).
  if (grupo) {
    if (grupo === 'canciones') {
      return (
        <div className={styles.sections}>
          <Seccion titulo="Canciones">
            <ul className={styles.list}>
              {data.tracks.map((t, i) => <TrackRow key={t.fact_id} track={t} queue={data.tracks} index={i} />)}
            </ul>
          </Seccion>
        </div>
      )
    }
    if (grupo === 'artistas') {
      return (
        <div className={styles.sections}>
          <Seccion titulo="Artistas">
            <GridArtistas artistas={data.artistas} />
          </Seccion>
        </div>
      )
    }
    if (grupo === 'albumes') {
      return (
        <div className={styles.sections}>
          <Seccion titulo="Álbumes">
            <GridAlbumes albumes={data.albumes} />
          </Seccion>
        </div>
      )
    }
    return (
      <div className={styles.sections}>
        <Seccion titulo="Playlists">
          <GridPlaylists playlists={data.playlists} />
        </Seccion>
      </div>
    )
  }

  const mejor = data.tracks[0]

  return (
    <div className={styles.sections}>
      {mejor && <MejorResultado track={mejor} queue={data.tracks} />}

      {data.tracks.length > 0 && (
        <Seccion titulo="Canciones" verMas={`/buscar?q=${encodeURIComponent(q)}&grupo=canciones`}>
          <ul className={styles.list}>
            {data.tracks.map((t, i) => <TrackRow key={t.fact_id} track={t} queue={data.tracks} index={i} />)}
          </ul>
        </Seccion>
      )}

      {data.artistas.length > 0 && (
        <Seccion titulo="Artistas" verMas={`/buscar?q=${encodeURIComponent(q)}&grupo=artistas`}>
          <GridArtistas artistas={data.artistas} />
        </Seccion>
      )}

      {data.albumes.length > 0 && (
        <Seccion titulo="Álbumes" verMas={`/buscar?q=${encodeURIComponent(q)}&grupo=albumes`}>
          <GridAlbumes albumes={data.albumes} />
        </Seccion>
      )}

      {data.playlists.length > 0 && (
        <Seccion titulo="Playlists" verMas={`/buscar?q=${encodeURIComponent(q)}&grupo=playlists`}>
          <GridPlaylists playlists={data.playlists} />
        </Seccion>
      )}
    </div>
  )
}

function Seccion({ titulo, verMas, children }: { titulo: string; verMas?: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>
        {titulo}
        {verMas && (
          <Link className={styles.verMas} to={verMas}>Ver más →</Link>
        )}
      </p>
      {children}
    </div>
  )
}

function GridArtistas({ artistas }: { artistas: SearchArtista[] }) {
  return (
    <div className={styles.grid}>
      {artistas.map((a) => (
        <Link key={a.artist_id} to={`/catalogo/artista/${a.artist_id}`} className={styles.gridCard}>
          <AlbumArt src={a.imagen_url} alt="" size={56} />
          <div className={styles.gridInfo}>
            <span className={styles.gridName}>{a.name}</span>
            <span className={styles.gridMeta}>{a.track_count} canciones</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

function GridAlbumes({ albumes }: { albumes: SearchAlbum[] }) {
  return (
    <div className={styles.grid}>
      {albumes.map((al) => (
        <Link key={al.album_id} to={`/catalogo/album/${al.album_id}`} className={styles.gridCard}>
          <AlbumArt src={al.imagen_url} alt="" size={56} />
          <div className={styles.gridInfo}>
            <span className={styles.gridName}>{al.name}</span>
            <span className={styles.gridMeta}>
              {al.artist_name}{al.release_year ? ` · ${al.release_year}` : ''}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}

function GridPlaylists({ playlists }: { playlists: SearchPlaylist[] }) {
  return (
    <div className={styles.grid}>
      {playlists.map((p) => (
        <Link key={p.playlist_id} to="/biblioteca" className={styles.gridCard}>
          <div className={styles.playlistIcon} aria-hidden="true">♪</div>
          <div className={styles.gridInfo}>
            <span className={styles.gridName}>{p.name}</span>
            <span className={styles.gridMeta}>
              {p.es_propia ? 'Tuya' : 'Pública'}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}

function toPlayable(track: SearchTrack) {
  return {
    fact_id:       track.fact_id,
    track_name:    track.track_name,
    artist_name:   track.artist_name,
    duration_ms:   track.duration_ms,
    imagen_url:    track.imagen_url,
    es_featuring:  track.es_featuring,
    artistas_feat: track.artistas_feat,
    source_type:   track.source_type,
  }
}

function MejorResultado({ track, queue }: { track: SearchTrack; queue: SearchTrack[] }) {
  const { play, playList } = usePlayer()
  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>Mejor resultado</p>
      <div className={styles.best}>
        <AlbumArt src={track.imagen_url} alt="" size={88} />
        <div className={styles.bestInfo}>
          <Link to={`/catalogo/track/${track.fact_id}`} className={styles.bestName}>
            <TrackName name={track.track_name} esFeaturing={track.es_featuring} sourceType={track.source_type} featBadgeClassName={styles.featBadge} explicitId={track.explicit_id} />
          </Link>
          <span className={styles.bestMeta}>{track.artist_name}</span>
          <span className={styles.bestGenre}>{track.genre_name}</span>
          <FeaturingCaption esFeaturing={track.es_featuring} artistasFeat={track.artistas_feat} className={styles.featArtists} />
        </div>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => queue.length > 0 ? playList(queue.map(toPlayable), 0) : play(toPlayable(track))}
        >
          Reproducir
        </button>
      </div>
    </div>
  )
}

function TrackRow({ track, queue, index }: { track: SearchTrack; queue: SearchTrack[]; index: number }) {
  const { play, playList } = usePlayer()
  return (
    <li className={styles.row}>
      <AlbumArt src={track.imagen_url} alt="" size={40} />
      <div className={styles.rowInfo}>
        <Link to={`/catalogo/track/${track.fact_id}`} className={styles.rowName}>
          <TrackName name={track.track_name} esFeaturing={track.es_featuring} sourceType={track.source_type} featBadgeClassName={styles.featBadge} explicitId={track.explicit_id} />
        </Link>
        <span className={styles.rowMeta}>{track.artist_name} · {track.genre_name}</span>
        <FeaturingCaption esFeaturing={track.es_featuring} artistasFeat={track.artistas_feat} className={styles.featArtists} />
      </div>
      <button
        type="button"
        className={styles.btnGhost}
        onClick={() => queue.length > 0 ? playList(queue.map(toPlayable), index) : play(toPlayable(track))}
      >
        Reproducir
      </button>
    </li>
  )
}
