import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { TrackPicker, type TrackSearchResult } from '@shared/components/TrackPicker'
import { UserPicker, type UserSearchResult } from '@shared/components/UserPicker'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { distribucionApi } from '@packages/distribucion'
import { creadoresApi } from '@packages/creadores'
import { regaliasApi } from '../api/regalias.api'
import type { Contrato } from '../types'
import styles from './RegaliasPages.module.css'

function fmtMoney(v: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)
}

// Panel admin de `regalias` (CU-O59-O63): productores, contratos de reparto,
// cuentas de sello, y liquidación de un período — ver design.md del change
// `2026-07-11-regalias-publicidad` para la fórmula completa.
export function RegaliasAdminPage() {
  useDocumentTitle('Regalías')
  const queryClient = useQueryClient()
  const toast = useToast()

  const productores = useQuery({ queryKey: ['regalias', 'productores'], queryFn: () => regaliasApi.productores() })
  const contratos   = useQuery({ queryKey: ['regalias', 'contratos'],   queryFn: () => regaliasApi.contratos() })
  const sellos      = useQuery({ queryKey: ['distribucion', 'sellos'],  queryFn: () => distribucionApi.sellos() })
  const artistas     = useQuery({ queryKey: ['creadores', 'cuentas-aprobadas'], queryFn: () => creadoresApi.cuentasAdmin('aprobada') })

  // ── Nuevo productor ──────────────────────────────────────────────────────
  const [nombreProductor, setNombreProductor] = useState('')
  const crearProductor = useMutation({
    mutationFn: () => regaliasApi.crearProductor(nombreProductor),
    onSuccess: () => {
      setNombreProductor('')
      queryClient.invalidateQueries({ queryKey: ['regalias', 'productores'] })
      toast.success('Productor creado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear el productor.')),
  })

  // ── Asignar productor a track ────────────────────────────────────────────
  const [productorAsignarId, setProductorAsignarId] = useState('')
  const [trackAsignar, setTrackAsignar] = useState<TrackSearchResult | null>(null)
  const asignarProductor = useMutation({
    mutationFn: () => regaliasApi.asignarProductor(Number(productorAsignarId), trackAsignar!.fact_id),
    onSuccess: () => {
      setTrackAsignar(null); setProductorAsignarId('')
      toast.success('Productor asignado al track')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo asignar el productor.')),
  })

  // ── Cuenta de sello ──────────────────────────────────────────────────────
  const [usuarioSello, setUsuarioSello] = useState<UserSearchResult | null>(null)
  const [selloParaCuenta, setSelloParaCuenta] = useState('')
  const crearCuentaSello = useMutation({
    mutationFn: () => regaliasApi.crearCuentaSello(usuarioSello!.usuario_id, Number(selloParaCuenta)),
    onSuccess: () => {
      setUsuarioSello(null); setSelloParaCuenta('')
      toast.success('Cuenta de sello vinculada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear la cuenta de sello.')),
  })

  // ── Contrato ─────────────────────────────────────────────────────────────
  const [trackContrato, setTrackContrato] = useState<TrackSearchResult | null>(null)
  const [selloId, setSelloId] = useState('')
  const [cuentaArtistaId, setCuentaArtistaId] = useState('')
  const [productorId, setProductorId] = useState('')
  const [pctMasterSello, setPctMasterSello] = useState('50')
  const [pctMasterArtista, setPctMasterArtista] = useState('40')
  const [pctMasterProductor, setPctMasterProductor] = useState('10')
  const [pctPubSello, setPctPubSello] = useState('20')
  const [pctPubArtista, setPctPubArtista] = useState('80')
  const [vigenteDesde, setVigenteDesde] = useState(() => new Date().toISOString().slice(0, 10))

  const crearContrato = useMutation({
    mutationFn: () => regaliasApi.crearContrato({
      fact_id_track: trackContrato!.fact_id,
      sello_id: selloId ? Number(selloId) : null,
      cuenta_artista_id: cuentaArtistaId || null,
      productor_id: productorId ? Number(productorId) : null,
      pct_master_sello: Number(pctMasterSello), pct_master_artista: Number(pctMasterArtista), pct_master_productor: Number(pctMasterProductor),
      pct_publishing_sello: Number(pctPubSello), pct_publishing_artista: Number(pctPubArtista),
      vigente_desde: vigenteDesde,
    }),
    onSuccess: () => {
      setTrackContrato(null)
      queryClient.invalidateQueries({ queryKey: ['regalias', 'contratos'] })
      toast.success('Contrato de reparto creado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear el contrato — revisa que los porcentajes sumen 100.')),
  })

  // ── Liquidar período ─────────────────────────────────────────────────────
  const hoy = new Date().toISOString().slice(0, 10)
  const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  const [periodoInicio, setPeriodoInicio] = useState(hace7)
  const [periodoFin, setPeriodoFin] = useState(hoy)
  const liquidar = useMutation({
    mutationFn: () => regaliasApi.liquidar({ periodo_inicio: periodoInicio, periodo_fin: periodoFin }),
    onSuccess: (res) => toast.success(`Período liquidado — ${res.liquidaciones} liquidaciones generadas`),
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo liquidar el período.')),
  })

  const productoresData = productores.data?.data ?? []
  const contratosData: Contrato[] = contratos.data?.data ?? []
  const sellosData = sellos.data?.data ?? []
  const artistasData = artistas.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Regalías</h1>

      <p className={styles.sectionLabel}>Nuevo productor</p>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (nombreProductor.trim()) crearProductor.mutate() }}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="prod-nombre">Nombre</label>
          <input id="prod-nombre" className={styles.input} value={nombreProductor} onChange={(e) => setNombreProductor(e.target.value)} placeholder="Nombre del productor" />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={crearProductor.isPending || !nombreProductor.trim()}>
          {crearProductor.isPending ? 'Creando…' : 'Crear productor'}
        </button>
      </form>

      <p className={styles.sectionLabel}>Asignar productor a un track</p>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (productorAsignarId && trackAsignar) asignarProductor.mutate() }}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="prod-asignar">Productor</label>
          <select id="prod-asignar" className={styles.select} value={productorAsignarId} onChange={(e) => setProductorAsignarId(e.target.value)}>
            <option value="">Selecciona…</option>
            {productoresData.map((p) => <option key={p.productor_id} value={p.productor_id}>{p.nombre}</option>)}
          </select>
        </div>
        <TrackPicker label="Track" selected={trackAsignar} onSelect={setTrackAsignar} onClear={() => setTrackAsignar(null)} />
        <button type="submit" className={styles.btnPrimary} disabled={asignarProductor.isPending || !productorAsignarId || !trackAsignar}>
          {asignarProductor.isPending ? 'Asignando…' : 'Asignar'}
        </button>
      </form>

      <p className={styles.sectionLabel}>Nueva cuenta de sello</p>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (usuarioSello && selloParaCuenta) crearCuentaSello.mutate() }}>
        <UserPicker label="Usuario" selected={usuarioSello} onSelect={setUsuarioSello} onClear={() => setUsuarioSello(null)} />
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sello-cuenta">Sello</label>
          <select id="sello-cuenta" className={styles.select} value={selloParaCuenta} onChange={(e) => setSelloParaCuenta(e.target.value)}>
            <option value="">Selecciona…</option>
            {sellosData.map((s) => <option key={s.sello_id} value={s.sello_id}>{s.nombre}</option>)}
          </select>
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={crearCuentaSello.isPending || !usuarioSello || !selloParaCuenta}>
          {crearCuentaSello.isPending ? 'Creando…' : 'Vincular cuenta'}
        </button>
      </form>
      {crearCuentaSello.isError && <p className={styles.bannerError}>No se pudo crear la cuenta de sello.</p>}

      <p className={styles.sectionLabel}>Nuevo contrato de reparto</p>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (trackContrato) crearContrato.mutate() }}>
        <TrackPicker label="Track" selected={trackContrato} onSelect={setTrackContrato} onClear={() => setTrackContrato(null)} />
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ctr-sello">Sello</label>
          <select id="ctr-sello" className={styles.select} value={selloId} onChange={(e) => setSelloId(e.target.value)}>
            <option value="">Ninguno</option>
            {sellosData.map((s) => <option key={s.sello_id} value={s.sello_id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ctr-artista">Artista</label>
          <select id="ctr-artista" className={styles.select} value={cuentaArtistaId} onChange={(e) => setCuentaArtistaId(e.target.value)}>
            <option value="">Ninguno</option>
            {artistasData.map((a) => <option key={a.cuenta_artista_id} value={a.cuenta_artista_id}>{a.nombre_artistico}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ctr-productor">Productor</label>
          <select id="ctr-productor" className={styles.select} value={productorId} onChange={(e) => setProductorId(e.target.value)}>
            <option value="">Ninguno</option>
            {productoresData.map((p) => <option key={p.productor_id} value={p.productor_id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ctr-mseello">% master sello</label>
          <input id="ctr-mseello" className={styles.input} type="number" value={pctMasterSello} onChange={(e) => setPctMasterSello(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ctr-martista">% master artista</label>
          <input id="ctr-martista" className={styles.input} type="number" value={pctMasterArtista} onChange={(e) => setPctMasterArtista(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ctr-mproductor">% master productor</label>
          <input id="ctr-mproductor" className={styles.input} type="number" value={pctMasterProductor} onChange={(e) => setPctMasterProductor(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ctr-psello">% publishing sello</label>
          <input id="ctr-psello" className={styles.input} type="number" value={pctPubSello} onChange={(e) => setPctPubSello(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ctr-partista">% publishing artista</label>
          <input id="ctr-partista" className={styles.input} type="number" value={pctPubArtista} onChange={(e) => setPctPubArtista(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ctr-vigente">Vigente desde</label>
          <input id="ctr-vigente" className={styles.input} type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={crearContrato.isPending || !trackContrato}>
          {crearContrato.isPending ? 'Creando…' : 'Crear contrato'}
        </button>
      </form>
      {crearContrato.isError && (
        <p className={styles.bannerError}>
          No se pudo crear el contrato — revisa que los porcentajes de master y de publishing sumen 100 cada uno.
        </p>
      )}

      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>Track</th><th>Sello</th><th>Artista</th><th>Productor</th><th>Vigente desde</th></tr></thead>
          <tbody>
            {contratosData.length === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>Sin contratos todavía.</td></tr>
            ) : contratosData.map((c) => (
              <tr key={c.contrato_id}>
                <td>{c.fact_id_track}</td><td>{c.sello_id ?? '—'}</td>
                <td>{c.cuenta_artista_id ? c.cuenta_artista_id.slice(0, 8) + '…' : '—'}</td>
                <td>{c.productor_id ?? '—'}</td><td>{c.vigente_desde}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Liquidar un período</p>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); liquidar.mutate() }}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="liq-inicio">Desde</label>
          <input id="liq-inicio" className={styles.input} type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="liq-fin">Hasta</label>
          <input id="liq-fin" className={styles.input} type="date" value={periodoFin} onChange={(e) => setPeriodoFin(e.target.value)} />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={liquidar.isPending}>
          {liquidar.isPending ? 'Liquidando…' : 'Liquidar período'}
        </button>
      </form>
      {liquidar.isSuccess && (
        <p className={styles.bannerOk}>
          {liquidar.data.status === 'ya_liquidado'
            ? 'Ese período exacto ya estaba liquidado — no se generaron duplicados.'
            : `${liquidar.data.liquidaciones} liquidaciones — pool total ${fmtMoney(liquidar.data.pool_total ?? 0)}, `
              + `pool rightsholders ${fmtMoney(liquidar.data.pool_rightsholders ?? 0)}, ${liquidar.data.total_streams ?? 0} streams del período.`}
        </p>
      )}

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Solicitudes de retiro</p>
      <RetirosAdminTable />
    </section>
  )
}

// CU-O76 (modelo-financiero-simulacion) — panel de aprobación/rechazo de
// retiros solicitados por artista/sello.
function RetirosAdminTable() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const retiros = useQuery({ queryKey: ['regalias', 'admin', 'retiros'], queryFn: () => regaliasApi.retirosAdmin() })

  const procesar = useMutation({
    mutationFn: (retiroId: string) => regaliasApi.procesarRetiro(retiroId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regalias', 'admin', 'retiros'] })
      toast.success('Retiro procesado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo procesar el retiro.')),
  })

  const rechazar = useMutation({
    mutationFn: (retiroId: string) => regaliasApi.rechazarRetiro(retiroId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regalias', 'admin', 'retiros'] })
      toast.success('Retiro rechazado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo rechazar el retiro.')),
  })

  const data = retiros.data?.data ?? []

  return (
    <div className={styles.tablePanel}>
      <table className={styles.table}>
        <thead>
          <tr><th>Tipo</th><th>Rightsholder</th><th>Monto</th><th>Estado</th><th>Solicitado</th><th></th></tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={6} className={styles.emptyState}>Sin solicitudes de retiro todavía.</td></tr>
          ) : data.map((r) => (
            <tr key={r.retiro_id}>
              <td>{r.tipo_rightsholder}</td>
              <td>{r.rightsholder_id.slice(0, 8)}…</td>
              <td>{fmtMoney(r.monto)}</td>
              <td>{r.estado}</td>
              <td>{r.fecha_solicitud}</td>
              <td>
                {r.estado === 'pendiente' && (
                  <>
                    <button type="button" className={styles.btnPrimary} disabled={procesar.isPending} onClick={() => procesar.mutate(r.retiro_id)}>
                      Procesar
                    </button>
                    {' '}
                    <button type="button" className={styles.btnPrimary} disabled={rechazar.isPending} onClick={() => rechazar.mutate(r.retiro_id)}>
                      Rechazar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
