import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniLineChart } from '@shared/components/charts/MiniLineChart'
import { MiniBarChart } from '@shared/components/charts/MiniBarChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { socialApi } from '../api/social.api'
import type { Comentario, Denuncia, EstadoModeracion } from '../types'
import styles from './SocialPages.module.css'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function isoDiasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// Rango en días entre dos fechas ISO (inclusive) — para el título del
// gráfico, que antes decía "(14 días)" fijo sin reflejar el selector real.
function diasEntre(desde: string, hasta: string): number {
  const ms = new Date(hasta).getTime() - new Date(desde).getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
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

const COMENTARIOS_PAGE_SIZE = 20

export function ModeracionSocialPage() {
  useDocumentTitle('Moderación social')
  const queryClient = useQueryClient()
  const toast = useToast()
  const reportRef = useRef<HTMLElement>(null)
  const [estado, setEstado] = useState('')
  const [page, setPage] = useState(1)

  // Rango de fechas customizable (S17): antes la ventana de 14 días era
  // fija, mismo patrón `desde`/`hasta` de ChurnPage/MrrArrPage (analitica).
  const [desde, setDesde] = useState(() => isoDiasAtras(13))
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))

  const comentarios = useQuery({
    queryKey: ['social', 'admin', 'comentarios', estado, page],
    queryFn:  () => socialApi.comentariosAdmin({ estado: estado || undefined, page, limit: COMENTARIOS_PAGE_SIZE }),
  })

  const dashboard = useQuery({
    queryKey: ['social', 'dashboard', desde, hasta],
    queryFn:  () => socialApi.dashboard(desde, hasta),
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
  const totalComentarios = comentarios.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalComentarios / COMENTARIOS_PAGE_SIZE))

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Moderación social</h1>
        <ExportPDFButton targetRef={reportRef} fileName="moderacion-social" title="Moderación social" />
      </div>

      <div className={styles.queueFilters} data-pdf-export-ignore="true" style={{ marginBottom: 'var(--space-md)' }}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Desde</span>
          <input className={styles.input} type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Hasta</span>
          <input className={styles.input} type="date" value={hasta} min={desde} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>

      {dashboard.isError ? (
        <ErrorState message={apiErrorMessage(dashboard.error, 'No se pudo cargar el rango seleccionado.')} />
      ) : (
        <div className={styles.dashboardGrid}>
          <div className={styles.chartPanel}>
            <p className={styles.panelTitle}>Actividad social real por día ({diasEntre(desde, hasta)} días)</p>
            <MiniLineChart
              data={actividadPorDia}
              xKey="dia"
              series={[
                { key: 'comentario', label: 'Comentarios', color: CHART_COLORS.violeta },
                { key: 'comparticion', label: 'Comparticiones', color: CHART_COLORS.teal },
              ]}
              denseDates
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
      )}

      <div className={styles.queuePanel}>
        <div className={styles.queueHeader}>
          <span className={styles.queueTitle}>Comentarios ({totalComentarios})</span>
          <div className={styles.queueFilters} data-pdf-export-ignore="true">
            {FILTROS.map((f) => (
              <button
                key={f.value}
                className={`${styles.filterChip} ${estado === f.value ? styles['filterChip--active'] : ''}`}
                onClick={() => { setEstado(f.value); setPage(1) }}
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
                    <span className={styles.queueRowMeta}>{c.track_name ?? `track #${c.fact_id_track}`}{c.artist_name ? ` — ${c.artist_name}` : ''} · {fmtDate(c.fecha_creacion)}</span>
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

        {totalPages > 1 && (
          <div className={styles.queueHeader} data-pdf-export-ignore="true">
            <button className={styles.btnGhost} type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Anterior
            </button>
            <span className={styles.queueRowMeta}>Página {page} / {totalPages}</span>
            <button className={styles.btnGhost} type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Siguiente →
            </button>
          </div>
        )}
      </div>

      <DenunciasPanel />
    </section>
  )
}

const DEN_FILTROS: { value: string; label: string }[] = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'revisada', label: 'Revisadas' },
  { value: 'resuelta', label: 'Resueltas' },
  { value: '', label: 'Todas' },
]
const MOTIVO_LABEL: Record<string, string> = {
  spam: 'Spam', contenido_inapropiado: 'Contenido inapropiado', derechos_de_autor: 'Derechos de autor', otro: 'Otro',
}

const DENUNCIAS_PAGE_SIZE = 20

// Bandeja de denuncias de contenido (change p1-ciclos-vida, rol admin_comunidad).
function DenunciasPanel() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [estado, setEstado] = useState('pendiente')
  // Fix S17 (auditoría, sección 3.2): backend y cliente ya soportan
  // page/limit/total (mismo contrato que `comentariosAdmin`, arriba), pero
  // este panel nunca mantenía estado de página — siempre pedía la página 1,
  // dejando cualquier denuncia más allá de la fila 20 inalcanzable.
  const [page, setPage] = useState(1)

  const denuncias = useQuery({
    queryKey: ['social', 'admin', 'denuncias', estado, page],
    queryFn: () => socialApi.denunciasAdmin({ estado: estado || undefined, page, limit: DENUNCIAS_PAGE_SIZE }),
  })
  // Strike al resolver (change p2-descubrimiento-comunidad): se arma por
  // denuncia, no global, porque la decisión de sancionar es de cada caso.
  const [strikePor, setStrikePor] = useState<Record<number, boolean>>({})
  const [motivoPor, setMotivoPor] = useState<Record<number, string>>({})

  const actualizar = useMutation({
    mutationFn: ({ id, nuevo }: { id: number; nuevo: 'revisada' | 'resuelta' }) =>
      socialApi.actualizarDenuncia(id, nuevo, {
        // Un strike solo tiene sentido al resolver: marcar "revisada" es
        // triaje, no una decisión sancionadora.
        emitirStrike: nuevo === 'resuelta' && !!strikePor[id],
        motivo: motivoPor[id]?.trim() || 'Contenido denunciado',
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['social', 'admin', 'denuncias'] })
      if (!r.strike) {
        toast.success('Denuncia actualizada')
      } else if (!r.strike.emitido) {
        // La denuncia sí se resolvió: el aviso es sobre la sanción, no un fallo.
        toast.error(r.strike.detalle ?? 'La denuncia se resolvió, pero no se pudo emitir el strike.')
      } else if (r.strike.cuenta_suspendida) {
        toast.success(`Strike emitido (${r.strike.strikes_activos}) — cuenta suspendida automáticamente`)
      } else {
        toast.success(`Strike emitido (${r.strike.strikes_activos} de 3)`)
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar la denuncia.')),
  })

  const data: Denuncia[] = denuncias.data?.data ?? []
  const totalDenuncias = denuncias.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalDenuncias / DENUNCIAS_PAGE_SIZE))

  return (
    <div className={styles.queuePanel} style={{ marginTop: 'var(--space-xl)' }}>
      <div className={styles.queueHeader}>
        <span className={styles.queueTitle}>Denuncias ({totalDenuncias})</span>
        <div className={styles.queueFilters} data-pdf-export-ignore="true">
          {DEN_FILTROS.map((f) => (
            <button
              key={f.value}
              className={`${styles.filterChip} ${estado === f.value ? styles['filterChip--active'] : ''}`}
              onClick={() => { setEstado(f.value); setPage(1) }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {denuncias.isError ? (
        <div className={styles.bannerError} style={{ margin: 'var(--space-md)' }} role="alert">No se pudieron cargar las denuncias (¿sesión de admin?).</div>
      ) : denuncias.isLoading ? (
        <ul className={styles.queueList}><li className={styles.queueRow}><span className={styles.skel} style={{ width: '60%', height: 14 }} /></li></ul>
      ) : data.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyTitle}>Sin denuncias</span>
          <span className={styles.emptyBody}>No hay denuncias que coincidan con este filtro.</span>
        </div>
      ) : (
        <ul className={styles.queueList}>
          {data.map((d) => {
            const isPending = actualizar.isPending && actualizar.variables?.id === d.denuncia_id
            return (
              <li key={d.denuncia_id} className={styles.queueRow}>
                <div className={styles.queueRowInfo}>
                  <span className={styles.queueRowMeta}>{d.tipo_objeto} #{d.objeto_id} · {MOTIVO_LABEL[d.motivo] ?? d.motivo} · {fmtDate(d.created_at)}</span>
                  <p className={styles.queueRowBody}>{d.descripcion || <em>Sin descripción</em>}</p>
                </div>
                <span className={`${styles.badge} ${d.estado === 'pendiente' ? styles.badgePending : d.estado === 'revisada' ? styles.badgeOk : styles.badgeError}`}>{d.estado}</span>
                <div className={styles.queueRowActions}>
                  <label className={styles.strikeToggle}>
                    <input
                      type="checkbox"
                      checked={!!strikePor[d.denuncia_id]}
                      onChange={(e) => setStrikePor((p) => ({ ...p, [d.denuncia_id]: e.target.checked }))}
                    />
                    Emitir strike
                  </label>
                  {strikePor[d.denuncia_id] && (
                    <input
                      type="text"
                      className={styles.strikeMotivo}
                      placeholder="Motivo del strike"
                      maxLength={500}
                      value={motivoPor[d.denuncia_id] ?? ''}
                      onChange={(e) => setMotivoPor((p) => ({ ...p, [d.denuncia_id]: e.target.value }))}
                    />
                  )}
                  <button className={styles.btnGhost} disabled={isPending || d.estado === 'revisada'} onClick={() => actualizar.mutate({ id: d.denuncia_id, nuevo: 'revisada' })}>Revisada</button>
                  <button className={styles.btnGhost} disabled={isPending || d.estado === 'resuelta'} onClick={() => actualizar.mutate({ id: d.denuncia_id, nuevo: 'resuelta' })}>Resuelta</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className={styles.queueHeader} data-pdf-export-ignore="true">
          <button className={styles.btnGhost} type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </button>
          <span className={styles.queueRowMeta}>Página {page} / {totalPages}</span>
          <button className={styles.btnGhost} type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
