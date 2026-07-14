import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { publicidadApi } from '../api/publicidad.api'
import type { Anunciante, Campana, IngresoCampana, TipoAnuncio } from '../types'
import styles from './PublicidadAdminPage.module.css'

// CU-O66/CU-O68: admin registra anunciantes y campañas con CPM real, y
// consulta el ingreso publicitario real ya reconocido por impresión
// completada (no un valor simulado — ver capability `publicidad`, spec.md).
export function PublicidadAdminPage() {
  useDocumentTitle('Publicidad')
  const queryClient = useQueryClient()
  const toast = useToast()

  const [nombreAnunciante, setNombreAnunciante] = useState('')
  const [sector, setSector] = useState('')

  const [anuncianteId, setAnuncianteId] = useState('')
  const [nombreCampana, setNombreCampana] = useState('')
  const [cpm, setCpm] = useState('')
  const [presupuesto, setPresupuesto] = useState('')
  const [fechaInicio, setFechaInicio] = useState(() => new Date().toISOString().slice(0, 10))
  const [tipoAnuncio, setTipoAnuncio] = useState<TipoAnuncio>('audio')
  const [urlDestino, setUrlDestino] = useState('')

  const anunciantes = useQuery({ queryKey: ['publicidad', 'anunciantes'], queryFn: () => publicidadApi.anunciantes() })
  const campanas    = useQuery({ queryKey: ['publicidad', 'campanas'],    queryFn: () => publicidadApi.campanas() })
  const ingresos    = useQuery({ queryKey: ['publicidad', 'ingresos'],    queryFn: () => publicidadApi.ingresos() })

  const crearAnunciante = useMutation({
    mutationFn: () => publicidadApi.crearAnunciante({ nombre: nombreAnunciante, sector }),
    onSuccess: () => {
      setNombreAnunciante(''); setSector('')
      queryClient.invalidateQueries({ queryKey: ['publicidad', 'anunciantes'] })
      toast.success('Anunciante creado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear el anunciante.')),
  })

  const crearCampana = useMutation({
    mutationFn: () => publicidadApi.crearCampana({
      anunciante_id: Number(anuncianteId), nombre: nombreCampana, cpm: Number(cpm),
      presupuesto_total: Number(presupuesto), fecha_inicio: fechaInicio,
      tipo_anuncio: tipoAnuncio, url_destino: urlDestino,
    }),
    onSuccess: () => {
      setNombreCampana(''); setCpm(''); setPresupuesto(''); setUrlDestino('')
      queryClient.invalidateQueries({ queryKey: ['publicidad', 'campanas'] })
      toast.success('Campaña creada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear la campaña.')),
  })

  const anunciantesData: Anunciante[] = anunciantes.data?.data ?? []
  const campanasData: Campana[] = campanas.data?.data ?? []
  const ingresosData: IngresoCampana[] = ingresos.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Publicidad</h1>

      <p className={styles.sectionLabel}>Nuevo anunciante</p>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (nombreAnunciante.trim()) crearAnunciante.mutate() }}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="an-nombre">Nombre</label>
          <input id="an-nombre" className={styles.input} value={nombreAnunciante} onChange={(e) => setNombreAnunciante(e.target.value)} placeholder="Acme Corp" />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="an-sector">Sector</label>
          <input id="an-sector" className={styles.input} value={sector} onChange={(e) => setSector(e.target.value)} placeholder="retail" />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={crearAnunciante.isPending || !nombreAnunciante.trim()}>
          {crearAnunciante.isPending ? 'Creando…' : 'Crear anunciante'}
        </button>
      </form>

      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>ID</th><th>Nombre</th><th>Sector</th></tr></thead>
          <tbody>
            {anunciantesData.length === 0 ? (
              <tr><td colSpan={3} className={styles.emptyState}>Sin anunciantes todavía.</td></tr>
            ) : anunciantesData.map((a) => (
              <tr key={a.anunciante_id}><td>{a.anunciante_id}</td><td>{a.nombre}</td><td>{a.sector || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Nueva campaña</p>
      <form className={styles.form} onSubmit={(e) => {
        e.preventDefault()
        const urlOk = tipoAnuncio === 'audio' || urlDestino.trim().length > 0
        if (anuncianteId && nombreCampana.trim() && cpm && presupuesto && urlOk) crearCampana.mutate()
      }}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="camp-anunciante">Anunciante</label>
          <select id="camp-anunciante" className={styles.select} value={anuncianteId} onChange={(e) => setAnuncianteId(e.target.value)}>
            <option value="">Selecciona…</option>
            {anunciantesData.map((a) => <option key={a.anunciante_id} value={a.anunciante_id}>{a.nombre}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="camp-nombre">Nombre</label>
          <input id="camp-nombre" className={styles.input} value={nombreCampana} onChange={(e) => setNombreCampana(e.target.value)} placeholder="Verano 2026" />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="camp-tipo">Tipo de anuncio</label>
          <select id="camp-tipo" className={styles.select} value={tipoAnuncio} onChange={(e) => setTipoAnuncio(e.target.value as TipoAnuncio)}>
            <option value="audio">Audio (entre canciones)</option>
            <option value="display">Display (banner)</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="camp-cpm">CPM (USD)</label>
          <input id="camp-cpm" className={styles.input} type="number" step="0.01" min="0.01" value={cpm} onChange={(e) => setCpm(e.target.value)} placeholder="8.00" />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="camp-presupuesto">Presupuesto total</label>
          <input id="camp-presupuesto" className={styles.input} type="number" step="0.01" min="0" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} placeholder="1000" />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="camp-fecha">Fecha de inicio</label>
          <input id="camp-fecha" className={styles.input} type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </div>
        {tipoAnuncio === 'display' && (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="camp-url">URL de destino</label>
            <input id="camp-url" className={styles.input} type="url" value={urlDestino} onChange={(e) => setUrlDestino(e.target.value)} placeholder="https://anunciante.com/promo" />
          </div>
        )}
        <button type="submit" className={styles.btnPrimary} disabled={crearCampana.isPending}>
          {crearCampana.isPending ? 'Creando…' : 'Crear campaña'}
        </button>
      </form>

      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>ID</th><th>Nombre</th><th>Tipo</th><th>CPM</th><th>Inicio</th><th>Fin</th><th>Activa</th></tr></thead>
          <tbody>
            {campanasData.length === 0 ? (
              <tr><td colSpan={7} className={styles.emptyState}>Sin campañas todavía.</td></tr>
            ) : campanasData.map((c) => (
              <tr key={c.campana_id}>
                <td>{c.campana_id}</td><td>{c.nombre}</td><td>{c.tipo_anuncio === 'display' ? 'Display' : 'Audio'}</td><td>${c.cpm.toFixed(2)}</td>
                <td>{c.fecha_inicio}</td><td>{c.fecha_fin ?? 'indefinida'}</td><td>{c.activa ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Ingreso publicitario real por campaña</p>
      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>Campaña</th><th>Impresiones completadas</th><th>Ingreso total</th></tr></thead>
          <tbody>
            {ingresosData.length === 0 ? (
              <tr><td colSpan={3} className={styles.emptyState}>Sin ingreso registrado todavía.</td></tr>
            ) : ingresosData.map((i) => (
              <tr key={i.campana_id}>
                {/* toFixed(4) (bugfix QA S10 ronda 2): único monto de la app mostrado a 4
                    decimales en vez de 2 — inconsistente aunque cada impresión individual
                    (cpm/1000) sí puede valer fracciones de centavo, la vista es un total
                    agregado y debe leerse como dinero normal. */}
                <td>{i.campana_id}</td><td>{i.impresiones}</td><td>${i.ingreso_total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
