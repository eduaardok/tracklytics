import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePlayer } from '@shared/context/PlayerContext'
import { AlbumArt } from '@shared/components/AlbumArt'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
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

// "Para ti" en secciones (S10 ronda 2) — antes una sola lista genérica.
// Hasta 3 secciones independientes, cada una con su propio título y el mismo
// layout de tarjeta: "Hecho para ti" (el algoritmo de 3 niveles que ya
// existía, solo renombrado), "Novedades de artistas que sigues" y
// "Redescubre" (ambas ausentes si no hay señal suficiente — el backend ya no
// las incluye en `secciones` si vienen vacías, esta página no filtra nada).
function SeccionRecos({ seccion }: { seccion: SeccionRecomendaciones }) {
  const navigate = useNavigate()
  const { play } = usePlayer()

  return (
    <div className={styles.recoSeccion}>
      <p className={styles.sectionLabel}>{seccion.titulo}</p>
      <ul className={styles.recoList}>
        {seccion.data.map((r) => (
          <li key={r.impresion_id}>
            <div
              className={styles.recoRow}
              onClick={() => navigate(`/catalogo/track/${r.fact_id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/catalogo/track/${r.fact_id}`)}
              role="button"
              tabIndex={0}
            >
              <AlbumArt src={r.imagen_url} alt="" size={44} />
              <div className={styles.recoInfo}>
                <div className={styles.recoName}>{r.track_name}</div>
                <div className={styles.recoMeta}>{r.artist_name}</div>
                <div className={styles.recoReason}>{motivo(r)}</div>
              </div>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={(e) => {
                  e.stopPropagation()
                  play({ fact_id: r.fact_id, track_name: r.track_name, artist_name: r.artist_name, duration_ms: 0 })
                }}
              >
                Reproducir
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RecomendacionesPage() {
  useDocumentTitle('Para ti')
  const reportRef = useRef<HTMLElement>(null)

  const recomendaciones = useQuery({
    queryKey: ['experiencia', 'recomendaciones'],
    queryFn:  () => experienciaApi.recomendaciones(12),
  })

  const secciones = recomendaciones.data?.secciones ?? []
  const totalTracks = secciones.reduce((acc, s) => acc + s.data.length, 0)

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Para ti</h1>
        <ExportPDFButton targetRef={reportRef} fileName="recomendaciones" title="Para ti" />
      </div>
      <span className={styles.subtitle}>Recomendaciones personalizadas, en varias miradas</span>

      {recomendaciones.isError ? (
        <ErrorState message="No se pudieron cargar tus recomendaciones." />
      ) : recomendaciones.isLoading ? (
        <ul className={styles.recoList} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className={styles.recoRow}>
              <span className={styles.skel} style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
              <span className={styles.skel} style={{ width: '50%', height: 14 }} />
            </li>
          ))}
        </ul>
      ) : totalTracks === 0 ? (
        <div className={styles.tablePanel}>
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Sin recomendaciones todavía</span>
            <span className={styles.emptyBody}>
              Escucha algunos tracks o márcalos como favoritos para que podamos sugerirte música parecida.
            </span>
          </div>
        </div>
      ) : (
        secciones.map((seccion) => <SeccionRecos key={seccion.id} seccion={seccion} />)
      )}
    </section>
  )
}
