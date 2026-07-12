import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniLineChart } from '@shared/components/charts/MiniLineChart'
import { MiniBarChart } from '@shared/components/charts/MiniBarChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
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
  const toast = useToast()
  const [estado, setEstado] = useState('')

  const comentarios = useQuery({
    queryKey: ['social', 'admin', 'comentarios', estado],
    queryFn:  () => socialApi.comentariosAdmin({ estado: estado || undefined }),
  })

  const dashboard = useQuery({
    queryKey: ['social', 'dashboard'],
    queryFn:  () => socialApi.dashboard(),
  })

  // Backend devuelve formato largo (una fila por día×tipo) — se pivota a
  // formato ancho (una fila por día, una columna por tipo) para MiniLineChart.
  const actividadPorDia = (() => {
    const porDia = new Map<string, { dia: string; comentario: number; comparticion: number }>()
    for (const r of dashboard.data?.actividad_por_dia ?? []) {
      const fila = porDia.get(r.dia) ?? { dia: r.dia, comentario: 0, comparticion: 0 }
      if (r.tipo === 'comentario') fila.comentario = r.total
      else fila.comparticion = r.total
      porDia.set(r.dia, fila)
    }
    return Array.from(porDia.values()).sort((a, b) => a.dia.localeCompare(b.dia))
  })()

  const moderar = useMutation({
    mutationFn: ({ factId, decision }: { factId: number; decision: 'oculto' | 'eliminado' }) =>
      socialApi.moderarComentario(factId, { decision }),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['social', 'admin', 'comentarios'] })
      toast.success(variables.decision === 'oculto' ? 'Comentario ocultado' : 'Comentario eliminado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo moderar el comentario.')),
  })

  const pending = moderar.isPending ? moderar.variables : undefined
  const data: Comentario[] = comentarios.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Moderación social</h1>

      <div className={styles.dashboardGrid}>
        <div className={styles.chartPanel}>
          <p className={styles.panelTitle}>Actividad social real por día (14 días)</p>
          <MiniLineChart
            data={actividadPorDia}
            xKey="dia"
            series={[
              { key: 'comentario', label: 'Comentarios', color: CHART_COLORS.violeta },
              { key: 'comparticion', label: 'Comparticiones', color: CHART_COLORS.teal },
            ]}
          />
        </div>
        <div className={styles.chartPanel}>
          <p className={styles.panelTitle}>Artistas más seguidos</p>
          <MiniBarChart
            data={(dashboard.data?.artistas_mas_seguidos ?? []).map((a) => ({ name: a.nombre, value: a.seguidores }))}
            color={CHART_COLORS.ambar}
          />
        </div>
      </div>

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
