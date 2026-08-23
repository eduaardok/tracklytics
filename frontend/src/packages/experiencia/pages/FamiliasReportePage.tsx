import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { experienciaApi } from '../api/experiencia.api'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import styles from './ExperienciaPages.module.css'

function fmtFecha(iso: string) {
  return String(iso).slice(0, 10)
}

function opcionesUnicas(valores: string[]): string[] {
  return Array.from(new Set(valores.filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

// Panel admin (S12): todas las familias activas, a diferencia de
// `/seguridad/familia` (FamiliaAdminPage), que gestiona UNA familia ya
// conocida por `suscripcion_id`. `plan` viene resuelto por familia desde
// PocketBase en el propio endpoint (ver api/paquetes/experiencia/router.py).
export function FamiliasReportePage() {
  useDocumentTitle('Planes familiares')
  const reportRef = useRef<HTMLElement>(null)
  const [plan, setPlan] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['experiencia', 'admin', 'familias'],
    queryFn:  () => experienciaApi.familiasReporte(),
  })

  const familias = data?.familias ?? []
  const planes = useMemo(() => opcionesUnicas(familias.map((f) => f.plan)), [familias])

  const filtradas = familias.filter((f) => !plan || f.plan === plan)

  const stats = useMemo(() => {
    const totalFamilias = filtradas.length
    const totalMiembros = filtradas.reduce((acc, f) => acc + f.total_miembros, 0)
    return {
      totalFamilias,
      totalMiembros,
      promedio: totalFamilias === 0 ? 0 : totalMiembros / totalFamilias,
    }
  }, [filtradas])

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Planes familiares</h1>
        <ExportPDFButton targetRef={reportRef} fileName="planes-familiares" title="Planes familiares" />
      </div>
      <span className={styles.subtitle}>Familias activas, titular y cantidad de miembros.</span>

      <div className={styles.statsRow}>
        <div className={styles.kpiPanel}>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{stats.totalFamilias}</span>
            <span className={styles.kpiLabel}>Familias</span>
          </div>
        </div>
        <div className={styles.kpiPanel}>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{stats.totalMiembros}</span>
            <span className={styles.kpiLabel}>Miembros totales</span>
          </div>
        </div>
        <div className={styles.kpiPanel}>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{stats.promedio.toFixed(1)}</span>
            <span className={styles.kpiLabel}>Miembros / familia</span>
          </div>
        </div>
      </div>

      <div className={styles.form} data-pdf-export-ignore="true">
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="f-plan">Plan</label>
          <select id="f-plan" className={styles.select} value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">Todos</option>
            {planes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

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
                <SkeletonTableRows columns={5} rows={5} />
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={5}>
                  <span className={styles.emptyBody}>No hay planes familiares que coincidan con el filtro.</span>
                </td></tr>
              ) : (
                filtradas.map((f) => (
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
