import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { TrackPicker, type TrackSearchResult } from '@shared/components/TrackPicker'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { distribucionApi } from '../api/distribucion.api'
import styles from '../pages/DistribucionPages.module.css'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function RestriccionesTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const reportRef = useRef<HTMLDivElement>(null)
  const [track, setTrack] = useState<TrackSearchResult | null>(null)
  const consultado = track?.fact_id ?? null
  const [paisId, setPaisId] = useState('')
  const [canalId, setCanalId] = useState('')
  const [tipoRestriccionId, setTipoRestriccionId] = useState('')

  const paises = useQuery({ queryKey: ['distribucion', 'paises'], queryFn: () => distribucionApi.paises() })
  const canales = useQuery({ queryKey: ['distribucion', 'canales'], queryFn: () => distribucionApi.canales() })
  const tipos = useQuery({ queryKey: ['distribucion', 'tipos-restriccion'], queryFn: () => distribucionApi.tiposRestriccion() })

  const restricciones = useQuery({
    queryKey: ['distribucion', 'restricciones', consultado],
    queryFn:  () => distribucionApi.restricciones(consultado as number),
    enabled:  consultado !== null,
  })

  const crear = useMutation({
    mutationFn: () => distribucionApi.crearRestriccion({
      fact_id_track: consultado as number,
      pais_id: Number(paisId),
      canal_id: Number(canalId),
      tipo_restriccion_id: Number(tipoRestriccionId),
    }),
    onSuccess: () => {
      setPaisId(''); setCanalId(''); setTipoRestriccionId('')
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'restricciones', consultado] })
      toast.success('Restricción creada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear la restricción.')),
  })

  const desactivar = useMutation({
    mutationFn: ({ pais, canal }: { pais: number; canal: number }) =>
      distribucionApi.desactivarRestriccion(consultado as number, pais, canal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'restricciones', consultado] })
      toast.success('Restricción desactivada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo desactivar la restricción.')),
  })

  const paisesData = paises.data?.data ?? []
  const canalesData = canales.data?.data ?? []
  const tiposData = tipos.data?.data ?? []
  const data = restricciones.data?.data ?? []

  return (
    <div ref={reportRef}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-sm)' }}>
        <ExportPDFButton targetRef={reportRef} fileName="distribucion-restricciones" title="Distribución — Restricciones geográficas" />
      </div>
      <TrackPicker
        label="Track"
        selected={track}
        onSelect={setTrack}
        onClear={() => setTrack(null)}
      />

      {consultado !== null && (
        <>
          <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Nueva restricción para «{track?.track_name}»</p>
          <form
            className={styles.form}
            onSubmit={(e) => { e.preventDefault(); if (paisId && canalId && tipoRestriccionId) crear.mutate() }}
          >
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="res-pais">País</label>
              <select id="res-pais" className={styles.select} value={paisId} onChange={(e) => setPaisId(e.target.value)}>
                <option value="">Selecciona…</option>
                {paisesData.map((p) => <option key={p.pais_id} value={p.pais_id}>{p.nombre}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="res-canal">Canal</label>
              <select id="res-canal" className={styles.select} value={canalId} onChange={(e) => setCanalId(e.target.value)}>
                <option value="">Selecciona…</option>
                {canalesData.map((c) => <option key={c.canal_id} value={c.canal_id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="res-tipo">Tipo</label>
              <select id="res-tipo" className={styles.select} value={tipoRestriccionId} onChange={(e) => setTipoRestriccionId(e.target.value)}>
                <option value="">Selecciona…</option>
                {tiposData.map((t) => <option key={t.tipo_restriccion_id} value={t.tipo_restriccion_id}>{t.nombre}</option>)}
              </select>
            </div>
            <button className={styles.btnPrimary} type="submit" disabled={crear.isPending || !paisId || !canalId || !tipoRestriccionId}>
              {crear.isPending ? 'Creando…' : 'Crear restricción'}
            </button>
          </form>

          <div className={styles.tablePanel}>
            {restricciones.isError ? (
              <ErrorState message="No se pudieron cargar las restricciones (¿sesión de admin?)." />
            ) : restricciones.isLoading ? (
              <div style={{ padding: 'var(--space-md)' }}><span className={styles.skel} style={{ width: '40%', height: 14 }} /></div>
            ) : data.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyTitle}>Sin restricciones</span>
                <span className={styles.emptyBody}>Este track no tiene restricciones registradas.</span>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr><th>País</th><th>Canal</th><th>Tipo</th><th>Desde</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>
                  {data.map((r) => {
                    const isPending = desactivar.isPending
                      && desactivar.variables?.pais === r.pais_id
                      && desactivar.variables?.canal === r.canal_id
                    return (
                      <tr key={`${r.pais_id}-${r.canal_id}`}>
                        <td>{r.pais_nombre}</td>
                        <td>{r.canal_nombre}</td>
                        <td>{r.tipo_restriccion_nombre}</td>
                        <td>{fmtDate(r.fecha_inicio)}</td>
                        <td>
                          <span className={`${styles.badge} ${r.activo ? styles.badgeOk : styles.badgePending}`}>
                            {r.activo ? 'activa' : 'inactiva'}
                          </span>
                        </td>
                        <td className={styles.tableActions}>
                          {!!r.activo && (
                            <button
                              className={styles.btnGhostDanger}
                              disabled={isPending}
                              onClick={() => desactivar.mutate({ pais: r.pais_id, canal: r.canal_id })}
                            >
                              {isPending ? '…' : 'Desactivar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
