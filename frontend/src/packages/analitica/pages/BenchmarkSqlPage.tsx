import { useMutation, useQuery } from '@tanstack/react-query'
import { Gauge } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { EmptyState } from '@shared/components/EmptyState'
import { KPICard } from '@shared/components/KPICard'
import { apiErrorMessage } from '@shared/lib/api-client'
import { analiticaApi } from '../api/analitica.api'
import type { BenchmarkInforme } from '../types'
import styles from './BenchmarkSqlPage.module.css'

const fmtS = (n: number) => `${n.toFixed(3)}s`
const fmtN = (n: number) => n.toLocaleString('es-ES')

// Una tarjeta = una mutación propia (no un estado "midiendo" compartido en
// la página): con 3 informes en pantalla, dos "Medir ahora" pueden
// dispararse casi a la vez — un solo `useMutation` a nivel de página pisaría
// el estado de carga del primero con el del segundo (bug real encontrado en
// verificación con Playwright: 3 clics rápidos solo mostraban 1 resultado
// porque el indicador "Midiendo…" compartido se limpiaba con el primero que
// terminara, no con el que correspondía a cada botón).
function InformeBenchmarkCard({ informe }: { informe: BenchmarkInforme }) {
  const medir = useMutation({
    mutationFn: () => analiticaApi.benchmarkEjecutar(informe.informe_id),
  })

  const resultado = medir.data

  return (
    <div className={styles.panel}>
      <div className={styles.informeHead}>
        <div>
          <p className={styles.informeNombre}>{informe.nombre}</p>
          <p className={styles.informeMeta}>{informe.informe_gold} · {informe.tabla_gold}</p>
        </div>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={medir.isPending}
          onClick={() => medir.mutate()}
        >
          {medir.isPending ? 'Midiendo…' : 'Medir ahora'}
        </button>
      </div>

      {medir.isError && (
        <p className={styles.errorText}>{apiErrorMessage(medir.error, 'No se pudo ejecutar la medición.')}</p>
      )}

      {resultado && (
        <>
          <div className={styles.kpiRow}>
            <KPICard
              title="Factor de mejora"
              value={resultado.factor_mejora ? `${resultado.factor_mejora}x más rápido` : '—'}
              icon={Gauge}
            />
            <KPICard title="SQL directo (promedio 3 corridas)" value={fmtS(resultado.sql_directo.tiempo_promedio_s)} />
            <KPICard title="Gold (promedio 3 corridas)" value={fmtS(resultado.sql_gold.tiempo_promedio_s)} />
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thLeft}>Camino</th>
                  <th className={styles.thRight}>Corrida 1</th>
                  <th className={styles.thRight}>Corrida 2</th>
                  <th className={styles.thRight}>Corrida 3</th>
                  <th className={styles.thRight}>Promedio</th>
                  <th className={styles.thRight}>Filas leídas</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={styles.rowLabel}>SQL directo (catálogo, 8123)</td>
                  {resultado.sql_directo.tiempos_s.map((t, i) => <td key={i} className={styles.rowValue}>{fmtS(t)}</td>)}
                  <td className={styles.rowValue}><strong>{fmtS(resultado.sql_directo.tiempo_promedio_s)}</strong></td>
                  <td className={styles.rowValue}>{fmtN(resultado.sql_directo.filas_leidas)}</td>
                </tr>
                <tr>
                  <td className={styles.rowLabel}>Gold pre-agregado (8124)</td>
                  {resultado.sql_gold.tiempos_s.map((t, i) => <td key={i} className={styles.rowValue}>{fmtS(t)}</td>)}
                  <td className={styles.rowValue}><strong>{fmtS(resultado.sql_gold.tiempo_promedio_s)}</strong></td>
                  <td className={styles.rowValue}>{fmtN(resultado.sql_gold.filas_leidas)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className={resultado.coinciden ? styles.coincideOk : styles.coincideBad}>
            {resultado.coinciden
              ? '✓ Ambos caminos devuelven el mismo resultado.'
              : '✗ Los resultados NO coinciden — revisar la query directa.'}
          </p>

          <details className={styles.sqlDetails}>
            <summary className={styles.sqlSummary}>Ver queries usadas</summary>
            <p className={styles.sqlLabel}>SQL directo</p>
            <pre className={styles.sqlBlock}>{resultado.sql_directo.query}</pre>
            <p className={styles.sqlLabel}>Gold</p>
            <pre className={styles.sqlBlock}>{resultado.sql_gold.query}</pre>
          </details>
        </>
      )}
    </div>
  )
}

// S16-P2: no confundir con `/analitica/benchmark` (ArtistaBenchmarkPage,
// comparación de popularidad entre artistas — un informe de negocio). Esta
// pantalla mide infraestructura: SQL directo sobre el catálogo (8123) vs.
// lectura de la tabla Gold ya pre-agregada (8124), para el mismo informe
// compuesto exacto. Metodología completa y resultados de referencia en
// docs/BENCHMARK_SQL_VS_GOLD.md.
//
// Cada medición es un POST explícito ("Medir ahora") — nunca se dispara
// sola al entrar a la pantalla: la versión SQL directa agrega en caliente
// sobre FACT_ENGAGEMENT_USUARIO/FACT_TRACKS (millones de filas) y se repite
// 3 veces en el backend para promediar, no es algo para cada carga de página.
export function BenchmarkSqlPage() {
  useDocumentTitle('Benchmark SQL vs Gold')

  const informes = useQuery({
    queryKey: ['analitica', 'benchmark-sql', 'informes'],
    queryFn:  () => analiticaApi.benchmarkInformes(),
  })

  const data = informes.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Benchmark: SQL directo vs. Gold</h1>
      <span className={styles.subtitle}>
        // mide en vivo el mismo informe calculado desde cero sobre el catálogo vs. leído de la
        capa Gold pre-agregada — no confundir con "Benchmark" en el menú (comparación de artistas)
      </span>

      {informes.isLoading && <div className={styles.panel} style={{ minHeight: 120 }} />}
      {informes.isError && (
        <div className={styles.panel}><p className={styles.errorText}>No se pudieron cargar los informes disponibles.</p></div>
      )}

      {!informes.isLoading && data.length === 0 && (
        <EmptyState icon="◔" title="Sin informes de benchmark" body="No hay informes configurados para medir." />
      )}

      <div className={styles.informesGrid}>
        {data.map((informe) => <InformeBenchmarkCard key={informe.informe_id} informe={informe} />)}
      </div>
    </section>
  )
}
