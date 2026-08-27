import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { AirflowLinkButton } from '@shared/components/AirflowLinkButton'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import { simulacionApi } from '../api/simulacion.api'
import { DOMINIOS_BAJO_DEMANDA, type DominioBajoDemanda } from '../types'
import styles from './SimulacionPage.module.css'

function fmt(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(n)
}

// CU-O78 (modelo-financiero-simulacion): genera streams + suscripciones +
// impresiones publicitarias juntos y liquida el período — los streams solos
// no mueven dinero (ver design.md, decisión 1), por eso las tres cantidades
// se generan y liquidan como una sola acción.
function mesesAtras(n: number): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString().slice(0, 10)
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function SimulacionPage() {
  useDocumentTitle('Simulación de negocio')
  const toast = useToast()
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const [nStreams, setNStreams] = useState('5000')
  const [nSuscripciones, setNSuscripciones] = useState('50')
  const [nImpresiones, setNImpresiones] = useState('200')

  const generar = useMutation({
    mutationFn: () => simulacionApi.generarActividad({
      n_streams: Number(nStreams),
      n_suscripciones: Number(nSuscripciones),
      n_impresiones: Number(nImpresiones),
    }),
    onSuccess: () => toast.success('Actividad de negocio generada'),
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo generar la actividad simulada.')),
  })

  const resultado = generar.data

  // ── Fase 5 (S14-P4): generación histórica con relleno de huecos ──────────
  const [periodoInicio, setPeriodoInicio] = useState(mesesAtras(3))
  const [periodoFin, setPeriodoFin] = useState(hoyISO())
  const [dominiosSeleccionados, setDominiosSeleccionados] = useState<DominioBajoDemanda[]>(
    [...DOMINIOS_BAJO_DEMANDA],
  )

  const estado = useQuery({
    queryKey: ['simulacion', 'estado'],
    queryFn: () => simulacionApi.estado(),
    refetchInterval: 15_000, // el refresco de Gold puede tardar varios minutos — se refleja solo
  })

  const generarHistorico = useMutation({
    mutationFn: () => simulacionApi.generarHistorico({
      periodo_inicio: periodoInicio,
      periodo_fin: periodoFin,
      dominios: dominiosSeleccionados,
    }),
    onSuccess: () => {
      toast.success('Generación disparada — rellena huecos y refresca la capa Gold a continuación.')
      queryClient.invalidateQueries({ queryKey: ['simulacion', 'estado'] })
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo disparar la generación histórica.')),
  })

  function toggleDominio(d: DominioBajoDemanda) {
    setDominiosSeleccionados((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])
  }

  // Fix S17 (auditoría de navegación/UX, sección 3.3): ambas acciones de esta
  // página movían dinero real / disparaban infraestructura sin ningún
  // diálogo — mismo patrón que `PlanesPage.tsx` (mensaje con el efecto real
  // calculado, no un "¿estás seguro?" genérico).
  async function handleSimular(e: FormEvent) {
    e.preventDefault()
    const ok = await confirm(
      `Esto genera ${Number(nStreams).toLocaleString('es-ES')} reproducciones, ` +
      `${Number(nSuscripciones).toLocaleString('es-ES')} suscripciones nuevas y ` +
      `${Number(nImpresiones).toLocaleString('es-ES')} impresiones publicitarias, y liquida el ` +
      `período de inmediato — el ingreso generado se reparte a rightsholders reales.`,
      { title: 'Simular y liquidar', confirmLabel: 'Simular y liquidar', danger: true },
    )
    if (!ok) return
    generar.mutate()
  }

  async function handleGenerarHistorico(e: FormEvent) {
    e.preventDefault()
    const ok = await confirm(
      `Esto genera actividad de negocio para el período ${periodoInicio} → ${periodoFin} en ` +
      `${dominiosSeleccionados.length} dominio${dominiosSeleccionados.length !== 1 ? 's' : ''} ` +
      `(${dominiosSeleccionados.join(', ')}), y dispara un refresco completo de la capa Gold ` +
      `(60 tareas de Airflow) que puede tardar varios minutos.`,
      { title: 'Generar y refrescar Gold', confirmLabel: 'Generar y refrescar Gold' },
    )
    if (!ok) return
    generarHistorico.mutate()
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Simulación de negocio</h1>
      <span className={styles.subtitle}>
        // genera reproducciones, suscripciones e impresiones publicitarias juntas y liquida el período
      </span>

      <p className={styles.note}>
        Las reproducciones por sí solas no generan ingreso — el pool que reparten las regalías sale
        de las suscripciones y la publicidad. Por eso esta acción genera los tres tipos de
        actividad a la vez, en la misma ventana de tiempo, y liquida el resultado de inmediato.
      </p>

      <form
        className={styles.form}
        onSubmit={handleSimular}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sim-streams">Reproducciones</label>
          <input
            id="sim-streams" className={styles.input} type="number" min="0" max="500000"
            value={nStreams} onChange={(e) => setNStreams(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sim-suscripciones">Suscripciones nuevas</label>
          <input
            id="sim-suscripciones" className={styles.input} type="number" min="0" max="5000"
            value={nSuscripciones} onChange={(e) => setNSuscripciones(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sim-impresiones">Impresiones publicitarias</label>
          <input
            id="sim-impresiones" className={styles.input} type="number" min="0" max="20000"
            value={nImpresiones} onChange={(e) => setNImpresiones(e.target.value)}
          />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={generar.isPending}>
          {generar.isPending ? 'Simulando…' : 'Simular actividad de negocio'}
        </button>
      </form>

      {resultado && (
        <div className={styles.panel}>
          <p className={styles.panelTitle}>Resultado de esta corrida</p>
          <div className={styles.kpiRow}>
            <div className={styles.kpiTile}>
              <span className={styles.kpiValue}>{resultado.streams_generados}</span>
              <span className={styles.kpiLabel}>Reproducciones generadas</span>
            </div>
            <div className={styles.kpiTile}>
              <span className={styles.kpiValue}>{fmt(resultado.ingreso_suscripciones_generado)}</span>
              <span className={styles.kpiLabel}>Ingreso por suscripciones</span>
            </div>
            <div className={styles.kpiTile}>
              <span className={styles.kpiValue}>{fmt(resultado.ingreso_publicitario_generado)}</span>
              <span className={styles.kpiLabel}>Ingreso publicitario</span>
            </div>
            <div className={styles.kpiTile}>
              <span className={styles.kpiValue}>{resultado.liquidacion.liquidaciones}</span>
              <span className={styles.kpiLabel}>Liquidaciones de regalías creadas</span>
            </div>
          </div>
          {resultado.liquidacion.status === 'ya_liquidado' && (
            <p className={styles.note}>
              El período de hoy ya estaba liquidado — el ingreso generado en esta corrida ya se ve
              en P&amp;L y MRR, pero no se repartió a rightsholders (eso solo pasa una vez por día).
            </p>
          )}
          <Link to="/analitica/pnl" className={styles.btnOutline}>Ver impacto en P&amp;L →</Link>
        </div>
      )}

      <h2 className={styles.heading}>Generación histórica (relleno de huecos)</h2>
      <p className={styles.note}>
        Genera actividad de negocio para un rango de períodos y refresca la capa Gold completa a
        continuación. Si un dominio ya tiene datos para un mes dentro del rango, ese mes se salta —
        solo se completan los huecos, no se duplica nada. Puede tardar varios minutos (el refresco
        de Gold corre 60 tareas); el estado de abajo se actualiza solo.
      </p>

      <form
        className={styles.form}
        onSubmit={handleGenerarHistorico}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="hist-inicio">Período — inicio</label>
          <input
            id="hist-inicio" className={styles.input} type="date"
            value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="hist-fin">Período — fin</label>
          <input
            id="hist-fin" className={styles.input} type="date"
            value={periodoFin} onChange={(e) => setPeriodoFin(e.target.value)}
          />
        </div>
        <button
          type="submit" className={styles.btnPrimary}
          disabled={generarHistorico.isPending || dominiosSeleccionados.length === 0}
        >
          {generarHistorico.isPending ? 'Disparando…' : 'Generar y refrescar Gold'}
        </button>
        <AirflowLinkButton dagId="dag_generar_bajo_demanda" className={styles.btnGhost} />
      </form>

      <div className={styles.chipRow}>
        {DOMINIOS_BAJO_DEMANDA.map((d) => (
          <label key={d} className={styles.chip}>
            <input
              type="checkbox"
              checked={dominiosSeleccionados.includes(d)}
              onChange={() => toggleDominio(d)}
            />
            {d}
          </label>
        ))}
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>
          Estado de generación
          {estado.data?.ejecucion_en_curso && <span className={styles.badgeEnCurso}>en curso</span>}
        </p>

        {/* S16-P11: "Cargando estado…" plano -> tabla shimmer con la misma
            estructura del estado real (4 columnas). */}
        {estado.isLoading && (
          <table className={styles.table}>
            <thead>
              <tr><th>Dominio</th><th>Última corrida</th><th>Filas totales</th><th>Corridas</th></tr>
            </thead>
            <tbody><SkeletonTableRows columns={4} rows={3} /></tbody>
          </table>
        )}
        {estado.isError && <p className={styles.note}>No se pudo cargar el estado.</p>}

        {estado.data && (
          <>
            <p className={styles.subtableTitle}>Última corrida por dominio de negocio</p>
            <table className={styles.table}>
              <thead>
                <tr><th>Dominio</th><th>Última corrida</th><th>Filas totales</th><th>Corridas</th></tr>
              </thead>
              <tbody>
                {estado.data.dominios_negocio.map((d) => (
                  <tr key={d.checksum}>
                    <td>{d.checksum.replace('backfill_negocio:', '')}</td>
                    <td>{new Date(d.ultima_corrida).toLocaleString('es-ES')}</td>
                    <td>{d.total_filas.toLocaleString('es-ES')}</td>
                    <td>{d.corridas}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className={styles.subtableTitle}>Última corrida por tabla Gold</p>
            <table className={styles.table}>
              <thead>
                <tr><th>Tabla</th><th>Granularidad</th><th>Última corrida</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {estado.data.tablas_gold.map((t) => (
                  <tr key={`${t.tabla}:${t.granularidad}`}>
                    <td>{t.tabla}</td>
                    <td>{t.granularidad}</td>
                    <td>{new Date(t.ultima_corrida).toLocaleString('es-ES')}</td>
                    <td>{t.ultimo_estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  )
}
