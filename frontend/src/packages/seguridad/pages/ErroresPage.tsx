import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import { EmptyState } from '@shared/components/EmptyState'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { seguridadApi } from '../api/seguridad.api'
import styles from './SeguridadPages.module.css'

export function ErroresPage() {
  useDocumentTitle('Errores de sistema')
  const reportRef = useRef<HTMLElement>(null)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'errores'],
    queryFn:  () => seguridadApi.errores(50),
  })

  const errores = data?.data ?? []

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Errores de sistema</h1>
        <ExportPDFButton targetRef={reportRef} fileName="errores-sistema" title="Errores de sistema" />
      </div>

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
                <SkeletonTableRows columns={6} />
              ) : errores.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon={<CheckCircle2 size={22} aria-hidden="true" />} title="Sin errores registrados." /></td></tr>
              ) : (
                errores.map((e) => (
                  <tr key={e.error_id}>
                    <td>{e.timestamp}</td>
                    <td>{e.codigo}</td>
                    <td>{e.mensaje}</td>
                    <td>{e.servicio}</td>
                    <td>
                      {e.usuario_nombre ? (
                        <span className={styles.userCell}>
                          <span className={styles.userCellName}>{e.usuario_nombre}</span>
                          <span className={styles.userCellMeta}>{e.usuario_email ?? e.usuario_id}</span>
                        </span>
                      ) : (
                        <span className={styles.userCellMeta}>{e.usuario_id ?? '—'}</span>
                      )}
                    </td>
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
