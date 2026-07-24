import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
import { EmptyState } from '@shared/components/EmptyState'
import { experienciaApi } from '../api/experiencia.api'
import styles from './ExperienciaPages.module.css'

function fmtFecha(iso: string) {
  return String(iso).slice(0, 16).replace('T', ' ')
}

// Panel admin (S12): resumen de exposiciones por experimento/variante. Sin
// filtros — el volumen esperado (pocos experimentos activos a la vez) no
// justifica paginar ni filtrar todavía.
export function AbTestsPage() {
  useDocumentTitle('Pruebas A/B')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['experiencia', 'admin', 'ab-tests'],
    queryFn:  () => experienciaApi.abTests(),
  })

  const tests = data?.tests ?? []

  const stats = useMemo(() => ({
    experimentos: new Set(tests.map((t) => t.experimento)).size,
    variantes:    tests.length,
    exposiciones: tests.reduce((acc, t) => acc + t.exposiciones, 0),
  }), [tests])

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Pruebas A/B</h1>
      <span className={styles.subtitle}>Exposiciones por experimento y variante.</span>

      <div className={styles.statsRow}>
        <div className={styles.kpiPanel}>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{stats.experimentos}</span>
            <span className={styles.kpiLabel}>Experimentos</span>
          </div>
        </div>
        <div className={styles.kpiPanel}>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{stats.variantes}</span>
            <span className={styles.kpiLabel}>Variantes</span>
          </div>
        </div>
        <div className={styles.kpiPanel}>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{stats.exposiciones}</span>
            <span className={styles.kpiLabel}>Exposiciones totales</span>
          </div>
        </div>
      </div>

      {isError ? (
        <ErrorState message="No se pudieron cargar las pruebas A/B (¿sesión de admin?)." />
      ) : !isLoading && tests.length === 0 ? (
        <EmptyState
          icon="( A/B )"
          title="No hay pruebas A/B registradas"
          body="Los datos se generan cuando usuarios participan en experimentos activos."
        />
      ) : (
        <div className={styles.tablePanel}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Experimento</th>
                <th>Variante</th>
                <th>Exposiciones</th>
                <th>Usuarios únicos</th>
                <th>Primera fecha</th>
                <th>Última fecha</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6}><span className={styles.emptyBody}>Cargando…</span></td></tr>
              ) : (
                tests.map((t) => (
                  <tr key={`${t.experimento}:${t.variante}`}>
                    <td>{t.experimento}</td>
                    <td>{t.variante}</td>
                    <td>{t.exposiciones}</td>
                    <td>{t.usuarios_unicos}</td>
                    <td>{fmtFecha(t.primera_exposicion)}</td>
                    <td>{fmtFecha(t.ultima_exposicion)}</td>
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
