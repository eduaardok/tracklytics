import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
import { socialApi } from '../api/social.api'
import styles from './SocialPages.module.css'

function fmtFecha(iso: string) {
  return String(iso).slice(0, 16).replace('T', ' ')
}

function truncar(texto: string, max = 60) {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto
}

function opcionesUnicas(valores: string[]): string[] {
  return Array.from(new Set(valores.filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

// Panel de moderación (S12): últimas 200 notificaciones de todo el sistema,
// a diferencia de la bandeja propia (`GET /social/notificaciones`, sin vista
// admin hasta ahora).
export function NotificacionesAdminPage() {
  useDocumentTitle('Notificaciones — administración')
  const [tipo, setTipo]     = useState('')
  const [leido, setLeido]   = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['social', 'admin', 'notificaciones'],
    queryFn:  () => socialApi.notificacionesAdmin(),
  })

  const notificaciones = data?.notificaciones ?? []
  const tipos = useMemo(() => opcionesUnicas(notificaciones.map((n) => n.tipo)), [notificaciones])

  const filtradas = notificaciones.filter((n) =>
    (!tipo || n.tipo === tipo) &&
    (!leido || (leido === 'leido' ? !!n.leido : !n.leido)),
  )

  // KPIs sobre `filtradas` — reflejan el subconjunto que los filtros de tipo/
  // lectura están mostrando ahora mismo, no el total sin filtrar.
  const stats = useMemo(() => {
    const total = filtradas.length
    const leidas = filtradas.filter((n) => n.leido).length
    return {
      total,
      tasaLectura: total === 0 ? 0 : Math.round((leidas / total) * 100),
      tiposUnicos: new Set(filtradas.map((n) => n.tipo)).size,
    }
  }, [filtradas])

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Notificaciones — administración</h1>
      <span className={styles.subtitle}>Últimas 200 notificaciones emitidas por el sistema.</span>

      <div className={styles.statsRow}>
        <div className={styles.kpiPanel}>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{stats.total}</span>
            <span className={styles.kpiLabel}>Total notificaciones</span>
          </div>
        </div>
        <div className={styles.kpiPanel}>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{stats.tasaLectura}%</span>
            <span className={styles.kpiLabel}>Tasa de lectura</span>
          </div>
        </div>
        <div className={styles.kpiPanel}>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{stats.tiposUnicos}</span>
            <span className={styles.kpiLabel}>Tipos únicos</span>
          </div>
        </div>
      </div>

      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="f-tipo">Tipo</label>
          <select id="f-tipo" className={styles.select} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="f-leido">Lectura</label>
          <select id="f-leido" className={styles.select} value={leido} onChange={(e) => setLeido(e.target.value)}>
            <option value="">Todas</option>
            <option value="leido">Leídas</option>
            <option value="no_leido">No leídas</option>
          </select>
        </div>
      </div>

      {isError ? (
        <ErrorState message="No se pudieron cargar las notificaciones (¿sesión de admin_comunidad o superadmin?)." />
      ) : (
        <div className={styles.tablePanel}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Destinatario</th>
                <th>Tipo</th>
                <th>Mensaje</th>
                <th>Leído</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5}><span className={styles.emptyBody}>Cargando…</span></td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={5}>
                  <span className={styles.emptyBody}>Sin notificaciones que coincidan con el filtro.</span>
                </td></tr>
              ) : (
                filtradas.map((n) => (
                  <tr key={n.fact_id}>
                    <td>{n.destinatario_nombre ?? n.usuario_destino_id}</td>
                    <td>{n.tipo}</td>
                    <td>{truncar(n.mensaje)}</td>
                    <td>
                      <span className={`${styles.badge} ${n.leido ? styles.badgeRead : styles.badgeUnread}`}>
                        {n.leido ? 'sí' : 'no'}
                      </span>
                    </td>
                    <td>{fmtFecha(n.fecha_creacion)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
