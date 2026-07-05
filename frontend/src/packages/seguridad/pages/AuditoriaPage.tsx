import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { seguridadApi } from '../api/seguridad.api'
import styles from './SeguridadPages.module.css'

export function AuditoriaPage() {
  useDocumentTitle('Auditoría')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'auditoria'],
    queryFn:  () => seguridadApi.auditoria(50),
  })

  const entradas = data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Auditoría</h1>

      {isError && <div className={styles.errorBox}>No se pudo cargar la auditoría (¿sesión de admin?).</div>}

      {!isError && (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Tabla afectada</th>
                <th>Antes</th>
                <th>Después</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6}>Cargando…</td></tr>
              ) : entradas.length === 0 ? (
                <tr><td colSpan={6} className={styles.empty}>Sin registros de auditoría todavía.</td></tr>
              ) : (
                entradas.map((e) => (
                  <tr key={e.audit_id}>
                    <td>{e.timestamp}</td>
                    <td>{e.usuario_id}</td>
                    <td>{e.accion}</td>
                    <td>{e.tabla_afectada}</td>
                    <td>{e.antes}</td>
                    <td>{e.despues}</td>
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
