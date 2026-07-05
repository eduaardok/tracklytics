import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { socialApi } from '../api/social.api'
import type { Comentario, EstadoModeracion } from '../types'
import styles from './SocialPages.module.css'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function EstadoBadge({ estado }: { estado: EstadoModeracion }) {
  const cls = estado === 'visible' ? styles.badgeOk : estado === 'oculto' ? styles.badgePending : styles.badgeError
  return <span className={`${styles.badge} ${cls}`}>{estado}</span>
}

const FILTROS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'visible', label: 'Visibles' },
  { value: 'oculto', label: 'Ocultos' },
  { value: 'eliminado', label: 'Eliminados' },
]

export function ModeracionSocialPage() {
  useDocumentTitle('Moderación social')
  const queryClient = useQueryClient()
  const [estado, setEstado] = useState('')

  const comentarios = useQuery({
    queryKey: ['social', 'admin', 'comentarios', estado],
    queryFn:  () => socialApi.comentariosAdmin({ estado: estado || undefined }),
  })

  const moderar = useMutation({
    mutationFn: ({ factId, decision }: { factId: number; decision: 'oculto' | 'eliminado' }) =>
      socialApi.moderarComentario(factId, { decision }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'admin', 'comentarios'] })
    },
  })

  const pending = moderar.isPending ? moderar.variables : undefined
  const data: Comentario[] = comentarios.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Moderación social</h1>

      <div className={styles.queuePanel}>
        <div className={styles.queueHeader}>
          <span className={styles.queueTitle}>Comentarios ({data.length})</span>
          <div className={styles.queueFilters}>
            {FILTROS.map((f) => (
              <button
                key={f.value}
                className={`${styles.filterChip} ${estado === f.value ? styles['filterChip--active'] : ''}`}
                onClick={() => setEstado(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {comentarios.isError ? (
          <div className={styles.bannerError} style={{ margin: 'var(--space-md)' }} role="alert">
            No se pudieron cargar los comentarios (¿sesión de admin?).
          </div>
        ) : comentarios.isLoading ? (
          <ul className={styles.queueList}>
            <li className={styles.queueRow}><span className={styles.skel} style={{ width: '60%', height: 14 }} /></li>
          </ul>
        ) : data.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Sin comentarios</span>
            <span className={styles.emptyBody}>No hay comentarios que coincidan con este filtro.</span>
          </div>
        ) : (
          <ul className={styles.queueList}>
            {data.map((c) => {
              const isThisPending = pending?.factId === c.fact_id
              return (
                <li key={c.fact_id} className={styles.queueRow}>
                  <div className={styles.queueRowInfo}>
                    <span className={styles.queueRowMeta}>track #{c.fact_id_track} · {fmtDate(c.fecha_creacion)}</span>
                    <p className={styles.queueRowBody}>{c.contenido}</p>
                  </div>
                  <EstadoBadge estado={c.estado_moderacion} />
                  <div className={styles.queueRowActions}>
                    <button
                      className={styles.btnGhost}
                      disabled={isThisPending || c.estado_moderacion === 'oculto'}
                      onClick={() => moderar.mutate({ factId: c.fact_id, decision: 'oculto' })}
                    >
                      {isThisPending && pending?.decision === 'oculto' ? '…' : 'Ocultar'}
                    </button>
                    <button
                      className={styles.btnGhostDanger}
                      disabled={isThisPending || c.estado_moderacion === 'eliminado'}
                      onClick={() => moderar.mutate({ factId: c.fact_id, decision: 'eliminado' })}
                    >
                      {isThisPending && pending?.decision === 'eliminado' ? '…' : 'Eliminar'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
