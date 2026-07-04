import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { socialApi } from '../api/social.api'
import styles from './SocialPages.module.css'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function SeguidosSocialPage() {
  const navigate = useNavigate()
  const [factIdInput, setFactIdInput] = useState('')

  const seguidos = useQuery({
    queryKey: ['social', 'seguimiento'],
    queryFn:  () => socialApi.misSeguidos(),
  })

  const data = seguidos.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Social</h1>
      <span className={styles.subtitle}>// artistas que sigues y acceso a comentarios de un track</span>

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
        <code> experiencia</code>. Mientras tanto, ingresa el identificador del track:
      </p>
      <form
        className={styles.jumpForm}
        onSubmit={(e) => {
          e.preventDefault()
          if (factIdInput.trim()) navigate(`/social/track/${factIdInput.trim()}`)
        }}
      >
        <input
          className={styles.jumpInput}
          type="number"
          min={1}
          value={factIdInput}
          onChange={(e) => setFactIdInput(e.target.value)}
          placeholder="fact_id del track"
        />
        <button className={styles.btnPrimary} type="submit">Ir</button>
      </form>
    </section>
  )
}
