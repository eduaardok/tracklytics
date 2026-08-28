import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Play, Sparkles } from 'lucide-react'
import { usePlayer } from '@shared/context/PlayerContext'
import { AlbumArt } from '@shared/components/AlbumArt'
import { ErrorState } from '@shared/components/ErrorState'
import { SkeletonCard } from '@shared/components/SkeletonLoader'
import { genreAccent } from '@shared/lib/genre-colors'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { useDragScroll } from '@shared/hooks/useDragScroll'
import { experienciaApi } from '../api/experiencia.api'
import type { Recomendacion, SeccionRecomendaciones } from '../types'
import styles from './ExperienciaPages.module.css'

// Motivo corto por tarjeta. Desde el change p2-descubrimiento-comunidad el
// backend calcula el motivo y lo envía en cada track (`motivo`), que es la
// fuente correcta: conoce el género dominante real del usuario, algo que aquí
// solo se podía aproximar con el género del track sugerido. El mapeo local se
// conserva como respaldo para respuestas anteriores al cambio, que no traen el
// campo (ver api/paquetes/experiencia/router.py `obtener_recomendaciones`).
function motivo(r: Recomendacion): string {
  if (r.motivo) return r.motivo[0].toUpperCase() + r.motivo.slice(1)
  if (r.algoritmo === 'similar_a_tu_escucha') return `Porque escuchas mucho ${r.genre_name}`
  if (r.algoritmo === 'mismo_genero_favoritos') return `Mismo género que tus favoritos: ${r.genre_name}`
  if (r.algoritmo === 'novedades_artistas_seguidos') return 'Nuevo track de un artista que sigues'
  if (r.algoritmo === 'redescubre_historial_antiguo') return 'Ya lo escuchaste antes — redescúbrelo'
  return 'Popular en Tracklytics'
}

type PropsSeccion = {
  seccion: SeccionRecomendaciones
  generoFiltro: string | null
}

// Sección como carril horizontal de cards (S16-P7): el layout vertical de
// filas hacía que "Para ti" se sintiera como una tabla más y no como una
// experiencia de descubrimiento — mismo vocabulario de rails que el catálogo.
function SeccionRecos({ seccion, generoFiltro }: PropsSeccion) {
  const navigate = useNavigate()
  const { playList } = usePlayer()
  // Arrastre con mouse idéntico al catálogo (delegación global por atributo).
  const dragRail = useDragScroll()

  const items = generoFiltro
    ? seccion.data.filter((r) => r.genre_name === generoFiltro)
    : seccion.data

  if (items.length === 0) return null

  const aQueue = (xs: Recomendacion[]) =>
    xs.map((x) => ({ fact_id: x.fact_id, track_name: x.track_name, artist_name: x.artist_name, duration_ms: 0, imagen_url: x.imagen_url }))

  return (
    <div className={styles.recoSeccion}>
      <div className={styles.recoHead}>
        <p className={styles.sectionLabel}>
          {seccion.titulo}
          <span className={styles.recoCount}>{items.length}</span>
        </p>
        <button
          type="button"
          className={styles.btnGhostSm}
          onClick={() => playList(aQueue(items), 0)}
        >
          <Play size={12} aria-hidden="true" /> Reproducir todo
        </button>
      </div>

      <ul className={styles.recoRail} aria-label={seccion.titulo} {...dragRail}>
        {items.map((r, i) => (
          <li key={r.impresion_id} className={styles.recoCardLi} style={{ animationDelay: `${Math.min(i * 60, 480)}ms` }}>
            <div className={styles.recoCard}>
              <button
                type="button"
                className={styles.recoCardBtn}
                onClick={() => navigate(`/catalogo/track/${r.fact_id}`)}
                aria-label={`Ver ${r.track_name} de ${r.artist_name}`}
              >
                <span className={styles.recoCardArt}>
                  <AlbumArt src={r.imagen_url} alt="" size={150} trackId={r.track_id} />
                  <span
                    aria-hidden="true"
                    className={styles.recoPlayOverlay}
                    onClick={(e) => {
                      e.stopPropagation()
                      playList(aQueue(items), i)
                    }}
                  >
                    <Play size={18} fill="currentColor" />
                  </span>
                </span>
                <span className={styles.recoCardName}>{r.track_name}</span>
                <span className={styles.recoCardArtist}>{r.artist_name}</span>
              </button>
              <span
                className={styles.recoReasonChip}
                style={{
                  color: genreAccent(r.genre_name),
                  backgroundColor: genreAccent(r.genre_name, 0.10),
                }}
                title={motivo(r)}
              >
                {motivo(r)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RecomendacionesPage() {
  useDocumentTitle('Para ti')

  const [generoFiltro, setGeneroFiltro] = useState<string | null>(null)

  const recomendaciones = useQuery({
    queryKey: ['experiencia', 'recomendaciones'],
    queryFn:  () => experienciaApi.recomendaciones(12),
  })

  const secciones = recomendaciones.data?.secciones ?? []
  const totalTracks = secciones.reduce((acc, s) => acc + s.data.length, 0)

  // Géneros presentes en las sugerencias (client-side, sin endpoint nuevo):
  // alimentan los chips de filtro rápidos — "agregar algo más" con utilidad
  // real para acotar las miradas sin recargar nada.
  const generos = useMemo(() => {
    const conteo = new Map<string, number>()
    for (const s of secciones) {
      for (const r of s.data) {
        conteo.set(r.genre_name, (conteo.get(r.genre_name) ?? 0) + 1)
      }
    }
    return [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g]) => g)
  }, [secciones])

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Para ti</h1>
      <span className={styles.subtitle}>
        {totalTracks > 0
          ? `${totalTracks} sugerencias en ${secciones.length} mirada${secciones.length !== 1 ? 's' : ''}`
          : 'Recomendaciones personalizadas, en varias miradas'}
      </span>

      {generos.length > 1 && (
        <div className={styles.filtroChips} role="group" aria-label="Filtrar por género">
          <button
            type="button"
            className={`${styles.filtroChip} ${generoFiltro === null ? styles['filtroChip--activa'] : ''}`}
            onClick={() => setGeneroFiltro(null)}
          >
            Todos
          </button>
          {generos.map((g) => (
            <button
              key={g}
              type="button"
              className={`${styles.filtroChip} ${generoFiltro === g ? styles['filtroChip--activa'] : ''}`}
              style={generoFiltro !== g ? { borderColor: genreAccent(g, 0.35), color: genreAccent(g) } : undefined}
              onClick={() => setGeneroFiltro((v) => (v === g ? null : g))}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {recomendaciones.isError ? (
        <ErrorState message="No se pudieron cargar tus recomendaciones." />
      ) : recomendaciones.isLoading ? (
        <div className={styles.recoSkeletonRail} aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} height={210} />
          ))}
        </div>
      ) : totalTracks === 0 ? (
        <div className={styles.tablePanel}>
          <div className={styles.emptyState}>
            <Sparkles size={22} aria-hidden="true" />
            <span className={styles.emptyTitle}>Sin recomendaciones todavía</span>
            <span className={styles.emptyBody}>
              Escucha algunos tracks o márcalos como favoritos para que podamos sugerirte música parecida.
            </span>
          </div>
        </div>
      ) : (
        secciones.map((seccion) => (
          <SeccionRecos key={seccion.id} seccion={seccion} generoFiltro={generoFiltro} />
        ))
      )}
    </section>
  )
}
