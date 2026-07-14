import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { simulacionApi } from '../api/simulacion.api'
import styles from './SimulacionPage.module.css'

function fmt(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(n)
}

// CU-O78 (modelo-financiero-simulacion): genera streams + suscripciones +
// impresiones publicitarias juntos y liquida el período — los streams solos
// no mueven dinero (ver design.md, decisión 1), por eso las tres cantidades
// se generan y liquidan como una sola acción.
export function SimulacionPage() {
  useDocumentTitle('Simulación de negocio')
  const toast = useToast()

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
        onSubmit={(e) => { e.preventDefault(); generar.mutate() }}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sim-streams">Reproducciones</label>
          <input
            id="sim-streams" className={styles.input} type="number" min="0"
            value={nStreams} onChange={(e) => setNStreams(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sim-suscripciones">Suscripciones nuevas</label>
          <input
            id="sim-suscripciones" className={styles.input} type="number" min="0"
            value={nSuscripciones} onChange={(e) => setNSuscripciones(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sim-impresiones">Impresiones publicitarias</label>
          <input
            id="sim-impresiones" className={styles.input} type="number" min="0"
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
    </section>
  )
}
