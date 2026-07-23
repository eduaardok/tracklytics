import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
import { experienciaApi } from '../api/experiencia.api'
import styles from './ExperienciaPages.module.css'

function fmtFecha(iso: string) {
  return String(iso).slice(0, 10)
}

// Panel admin (S12): todas las familias activas, a diferencia de
// `/seguridad/familia` (FamiliaAdminPage), que gestiona UNA familia ya
// conocida por `suscripcion_id`. `plan` viene resuelto por familia desde
// PocketBase en el propio endpoint (ver api/paquetes/experiencia/router.py).
export function FamiliasReportePage() {
  useDocumentTitle('Planes familiares')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['experiencia', 'admin', 'familias'],
    queryFn:  () => experienciaApi.familiasReporte(),
  })

  const familias = data?.familias ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Planes familiares</h1>
      <span className={styles.subtitle}>Familias activas, titular y cantidad de miembros.</span>

      {isError ? (
        <ErrorState message="No se pudieron cargar las familias (¿sesión de admin?)." />
      ) : (
        <div className={styles.tablePanel}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Familia ID</th>
                <th>Titular</th>
                <th>Miembros</th>
                <th>Plan</th>
                <th>Creada</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5}><span className={styles.emptyBody}>Cargando…</span></td></tr>
              ) : familias.length === 0 ? (
                <tr><td colSpan={5}>
                  <span className={styles.emptyBody}>No hay planes familiares activos todavía.</span>
                </td></tr>
              ) : (
                familias.map((f) => (
                  <tr key={f.familia_id}>
                    <td>{f.familia_id}</td>
                    <td>
                      <span className={styles.userCell}>
                        <span className={styles.userCellName}>{f.titular_nombre ?? f.titular_id ?? '—'}</span>
                        {f.titular_email && <span className={styles.userCellMeta}>{f.titular_email}</span>}
                      </span>
                    </td>
                    <td>{f.total_miembros}</td>
                    <td>{f.plan}</td>
                    <td>{fmtFecha(f.creada_en)}</td>
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
