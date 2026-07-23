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

// Panel de moderación (S12): últimas 200 notificaciones de todo el sistema,
// a diferencia de la bandeja propia (`GET /social/notificaciones`, sin vista
// admin hasta ahora).
export function NotificacionesAdminPage() {
  useDocumentTitle('Notificaciones — administración')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['social', 'admin', 'notificaciones'],
    queryFn:  () => socialApi.notificacionesAdmin(),
  })

  const notificaciones = data?.notificaciones ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Notificaciones — administración</h1>
      <span className={styles.subtitle}>Últimas 200 notificaciones emitidas por el sistema.</span>

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
              ) : notificaciones.length === 0 ? (
                <tr><td colSpan={5}>
                  <span className={styles.emptyBody}>Sin notificaciones registradas.</span>
                </td></tr>
              ) : (
                notificaciones.map((n) => (
                  <tr key={n.fact_id}>
                    <td>{n.destinatario_nombre ?? n.usuario_destino_id}</td>
                    <td>{n.tipo}</td>
                    <td>{truncar(n.mensaje)}</td>
                    <td>
                      <span className={`${styles.badge} ${n.leido ? styles.badgeOk : styles.badgePending}`}>
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
