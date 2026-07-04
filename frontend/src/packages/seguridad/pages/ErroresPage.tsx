import { useQuery } from '@tanstack/react-query'
import { seguridadApi } from '../api/seguridad.api'
import styles from './SeguridadPages.module.css'

export function ErroresPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'errores'],
    queryFn:  () => seguridadApi.errores(50),
  })

  const errores = data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Errores de sistema</h1>
      <span className={styles.subtitle}>// excepciones no controladas capturadas por la API (CU-O19)</span>

      {isError && <div className={styles.errorBox}>No se pudieron cargar los errores (¿sesión de admin?).</div>}

      {!isError && (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Código</th>
                <th>Mensaje</th>
                <th>Servicio</th>
                <th>Usuario</th>
                <th>Resuelto</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6}>Cargando…</td></tr>
              ) : errores.length === 0 ? (
                <tr><td colSpan={6} className={styles.empty}>Sin errores registrados.</td></tr>
              ) : (
                errores.map((e) => (
                  <tr key={e.error_id}>
                    <td>{e.timestamp}</td>
                    <td>{e.codigo}</td>
                    <td>{e.mensaje}</td>
                    <td>{e.servicio}</td>
                    <td>{e.usuario_id ?? '—'}</td>
                    <td className={e.resolved ? styles.badgeOk : styles.badgeDenied}>
                      {e.resolved ? 'sí' : 'no'}
                    </td>
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
