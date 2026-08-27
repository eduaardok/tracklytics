import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Megaphone, Pause, Play } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { CrudModal } from '@shared/components/CrudModal'
import { CrudActionButtons } from '@shared/components/CrudActionButtons'
import { MiniDonutChart } from '@shared/components/charts/MiniDonutChart'
import { STATUS_COLORS } from '@shared/components/charts/colors'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import { EmptyState } from '@shared/components/EmptyState'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { publicidadApi } from '../api/publicidad.api'
import type { Anunciante, Campana, CampanaBody, FormatoCampana, IngresoCampana, TipoAnuncio } from '../types'
import styles from './PublicidadAdminPage.module.css'

// Estado de negocio legible de una campaña (change p1-ciclos-vida): el eje
// manual (pausada/finalizada) manda sobre el de presupuesto (activa).
function estadoCampana(c: Campana): { label: string; tone: 'ok' | 'warn' | 'off' } {
  if (c.estado_manual === 'finalizada') return { label: 'Finalizada', tone: 'off' }
  if (c.estado_manual === 'pausada') return { label: 'Pausada', tone: 'warn' }
  if (!c.activa) return { label: 'Sin presupuesto', tone: 'off' }
  return { label: 'Activa', tone: 'ok' }
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// dd/mm/yy en vez del ISO completo (yyyy-mm-dd) — la columna "Vigencia" junta
// 2 fechas (o fecha + "indefinida"), y el formato largo era el mayor
// contribuyente a que la tabla no entrara en viewports de ~1024px sin
// scroll horizontal (ver fix de overflow de la tabla de campañas).
function fmtFechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : iso
}

// 4 estados posibles de `estadoCampana`, 4 colores distinguibles del donut —
// mismo criterio que TicketsAdminPage (STATUS_COLORS reservados, nunca dos
// categorías comparten color).
const ESTADO_COLOR: Record<string, string> = {
  Activa:            STATUS_COLORS.good,
  Pausada:           STATUS_COLORS.warning,
  Finalizada:        STATUS_COLORS.neutral,
  'Sin presupuesto': STATUS_COLORS.error,
}

const ESTADOS_FILTRO = ['Activa', 'Pausada', 'Finalizada', 'Sin presupuesto']

type Tab = 'campanas' | 'anunciantes'
const TABS: { id: Tab; label: string }[] = [
  { id: 'campanas',    label: 'Campañas' },
  { id: 'anunciantes', label: 'Anunciantes' },
]

type CampanaModalState =
  | { mode: 'create' }
  | { mode: 'edit'; campana: Campana }
  | { mode: 'view'; campana: Campana }
  | null

type AnuncianteModalState = { mode: 'create' } | null

const PAGE_SIZE = 20

// CU-O66/CU-O68: admin registra anunciantes y campañas con CPM real, y
// consulta el ingreso publicitario real ya reconocido por impresión
// completada (no un valor simulado — ver capability `publicidad`, spec.md).
//
// S13 (rediseño): antes era un único scroll vertical de 2 formularios inline
// + 3 tablas, sin KPIs ni filtros — llevado al mismo estándar que
// TicketsAdminPage/AdminPartnersPage (S13-P2): tabs por entidad, KPIs con
// donut, filtros de tabla, alta vía `CrudModal` compartido. La tabla de
// "ingreso por campaña" (antes una 3ª sección aparte) se integra como
// columna de la tabla de campañas — misma información, sin la tabla extra.
export function PublicidadAdminPage() {
  useDocumentTitle('Publicidad')
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const reportRef = useRef<HTMLElement>(null)

  const [tab, setTab] = useState<Tab>('campanas')

  const [campanaModal, setCampanaModal]       = useState<CampanaModalState>(null)
  const [anuncianteModal, setAnuncianteModal] = useState<AnuncianteModalState>(null)

  const [filtroEstadoCampana, setFiltroEstadoCampana] = useState('')
  const [filtroTipoCampana, setFiltroTipoCampana]     = useState('')
  const [busquedaCampana, setBusquedaCampana]         = useState('')

  const [campanaPage, setCampanaPage]         = useState(1)
  const [anunciantePage, setAnunciantePage]   = useState(1)

  const anunciantes = useQuery({ queryKey: ['publicidad', 'anunciantes', anunciantePage], queryFn: () => publicidadApi.anunciantes(anunciantePage, PAGE_SIZE) })
  const campanas    = useQuery({ queryKey: ['publicidad', 'campanas', campanaPage, filtroEstadoCampana, filtroTipoCampana, busquedaCampana],       queryFn: () => publicidadApi.campanas({ page: campanaPage, limit: PAGE_SIZE, estado: filtroEstadoCampana || undefined, tipo_anuncio: filtroTipoCampana || undefined, q: busquedaCampana || undefined }) })
  const ingresos    = useQuery({ queryKey: ['publicidad', 'ingresos'],                    queryFn: () => publicidadApi.ingresos() })

  const crearAnunciante = useMutation({
    mutationFn: (vals: { nombre: string; sector: string }) => publicidadApi.crearAnunciante(vals),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publicidad', 'anunciantes'] })
      setAnuncianteModal(null)
      toast.success('Anunciante creado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear el anunciante.')),
  })

  const crearCampana = useMutation({
    mutationFn: (vals: CampanaBody) => publicidadApi.crearCampana(vals),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publicidad', 'campanas'] })
      setCampanaModal(null)
      toast.success('Campaña creada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear la campaña.')),
  })

  const transicion = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'pausar' | 'reanudar' | 'finalizar' }) =>
      publicidadApi.transicionCampana(id, accion),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['publicidad', 'campanas'] })
      toast.success(v.accion === 'pausar' ? 'Campaña pausada' : v.accion === 'reanudar' ? 'Campaña reanudada' : 'Campaña finalizada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar la campaña.')),
  })

  const guardarCampana = useMutation({
    mutationFn: ({ id, nombre, presupuesto_total, fecha_inicio, fecha_fin, formato }: { id: number } & {
      nombre: string; presupuesto_total: number; fecha_inicio: string; fecha_fin: string | null; formato: FormatoCampana
    }) => publicidadApi.editarCampana(id, { nombre, presupuesto_total, fecha_inicio, fecha_fin, formato }),
    onSuccess: () => {
      setCampanaModal(null)
      queryClient.invalidateQueries({ queryKey: ['publicidad', 'campanas'] })
      toast.success('Campaña actualizada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar la campaña.')),
  })

  const desactivarAnunciante = useMutation({
    mutationFn: (id: number) => publicidadApi.desactivarAnunciante(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publicidad', 'anunciantes'] })
      toast.success('Anunciante desactivado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo desactivar el anunciante.')),
  })

  async function pedirFinalizar(c: Campana) {
    if (await confirm(`Finalizar la campaña "${c.nombre}" es permanente: no podrá reanudarse.`, { title: 'Finalizar campaña', danger: true })) {
      transicion.mutate({ id: c.campana_id, accion: 'finalizar' })
    }
  }
  async function pedirPausar(c: Campana) {
    if (await confirm(`"${c.nombre}" dejará de servir impresiones hasta que la reanudes.`, { title: 'Pausar campaña' })) {
      transicion.mutate({ id: c.campana_id, accion: 'pausar' })
    }
  }
  async function pedirDesactivarAnunciante(a: Anunciante) {
    if (await confirm(`El anunciante "${a.nombre}" quedará inactivo y no se ofrecerá para campañas nuevas.`, { title: 'Desactivar anunciante', danger: true })) {
      desactivarAnunciante.mutate(a.anunciante_id)
    }
  }

  const anunciantesData: Anunciante[] = anunciantes.data?.data ?? []
  const campanasData: Campana[]       = campanas.data?.data ?? []
  const ingresosData: IngresoCampana[] = ingresos.data?.data ?? []
  const campanasTotal = campanas.data?.total ?? 0
  const anunciantesTotal = anunciantes.data?.total ?? 0
  const campanasTotalPages = Math.max(1, Math.ceil(campanasTotal / PAGE_SIZE))
  const anunciantesTotalPages = Math.max(1, Math.ceil(anunciantesTotal / PAGE_SIZE))

  const kpisCampanas = useMemo(() => ({
    total:      campanasTotal,
    activas:    campanasData.filter((c) => estadoCampana(c).label === 'Activa').length,
    presupuesto: campanasData.reduce((sum, c) => sum + c.presupuesto_total, 0),
    ingreso:     ingresosData.reduce((sum, i) => sum + i.ingreso_total, 0),
  }), [campanasTotal, campanasData, ingresosData])

  const donutCampanas = useMemo(() => {
    const conteo: Record<string, number> = {}
    for (const c of campanasData) {
      const label = estadoCampana(c).label
      conteo[label] = (conteo[label] ?? 0) + 1
    }
    return ESTADOS_FILTRO.map((label) => ({ name: label, value: conteo[label] ?? 0, color: ESTADO_COLOR[label] }))
  }, [campanasData])

  const kpisAnunciantes = useMemo(() => ({
    total:   anunciantesTotal,
    activos: anunciantesData.filter((a) => a.activo).length,
  }), [anunciantesTotal, anunciantesData])

  const campanasPorAnunciante = useMemo(() => {
    const conteo: Record<number, number> = {}
    for (const c of campanasData) conteo[c.anunciante_id] = (conteo[c.anunciante_id] ?? 0) + 1
    return conteo
  }, [campanasData])

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Publicidad</h1>
        <ExportPDFButton targetRef={reportRef} fileName="publicidad" title="Publicidad" />
      </div>

      <div className={styles.tabBar} role="tablist" aria-label="Secciones de publicidad" data-pdf-export-ignore="true">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'campanas' ? (
        <>
          <div className={styles.statsRow}>
            <div className={styles.kpiPanel}>
              <div className={styles.kpiRow}>
                <span className={styles.kpiValue}>{kpisCampanas.total}</span>
                <span className={styles.kpiLabel}>Total campañas</span>
              </div>
            </div>
            <div className={styles.kpiPanel}>
              <div className={styles.kpiRow}>
                <span className={`${styles.kpiValue} ${styles.kpiValueOk}`}>{kpisCampanas.activas}</span>
                <span className={styles.kpiLabel}>Activas</span>
              </div>
            </div>
            <div className={styles.kpiPanel}>
              <div className={styles.kpiRow}>
                <span className={styles.kpiValue}>{fmtMoney(kpisCampanas.presupuesto)}</span>
                <span className={styles.kpiLabel}>Presupuesto acumulado</span>
              </div>
            </div>
            <div className={styles.kpiPanel}>
              <div className={styles.kpiRow}>
                <span className={styles.kpiValue}>{fmtMoney(kpisCampanas.ingreso)}</span>
                <span className={styles.kpiLabel}>Ingreso total reconocido</span>
              </div>
            </div>
          </div>

          <div className={styles.chartPanel} style={{ marginBottom: 'var(--space-lg)' }}>
            <p className={styles.panelTitle}>Campañas por estado</p>
            <MiniDonutChart data={donutCampanas} />
          </div>

          <div className={styles.form} data-pdf-export-ignore="true">
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-estado">Estado</label>
              <select id="f-estado" className={styles.select} value={filtroEstadoCampana} onChange={(e) => { setFiltroEstadoCampana(e.target.value); setCampanaPage(1) }}>
                <option value="">Todos</option>
                {ESTADOS_FILTRO.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-tipo">Tipo de anuncio</label>
              <select id="f-tipo" className={styles.select} value={filtroTipoCampana} onChange={(e) => { setFiltroTipoCampana(e.target.value); setCampanaPage(1) }}>
                <option value="">Todos</option>
                <option value="audio">Audio</option>
                <option value="display">Display</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-busqueda">Buscar</label>
              <input id="f-busqueda" className={styles.input} type="text" placeholder="Nombre de campaña…" value={busquedaCampana} onChange={(e) => { setBusquedaCampana(e.target.value); setCampanaPage(1) }} />
            </div>
            <button type="button" className={styles.btnPrimary} onClick={() => setCampanaModal({ mode: 'create' })}>
              + Nueva campaña
            </button>
          </div>

          <div className={styles.tablePanel}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th><th>Nombre</th><th>CPM</th><th>Ingreso</th>
                  <th>Inicio</th><th>Estado</th><th className={styles.actionsCol}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {campanas.isLoading ? (
                  <SkeletonTableRows columns={7} />
                ) : campanasData.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState icon={<Megaphone size={22} aria-hidden="true" />} title="Sin campañas" body={campanasData.length === 0 ? 'Todavía no hay campañas publicitarias registradas.' : 'Prueba con otro filtro.'} /></td></tr>
                ) : campanasData.map((c) => {
                  const est = estadoCampana(c)
                  const finalizada = c.estado_manual === 'finalizada'
                  const pausada = c.estado_manual === 'pausada'
                  const ingreso = ingresosData.find((i) => i.campana_id === c.campana_id)
                  return (
                    <tr key={c.campana_id}>
                      <td>{c.campana_id}</td>
                      <td>
                        {c.nombre}
                        {/* Formato ya no es columna propia (medido: la tabla completa
                            necesitaba 923px en viewports de 1024px, que solo tienen
                            722px — sin ninguna pista visual de que hacía falta
                            scrollear). Se agrega como texto secundario junto al
                            nombre en vez de una 7ª/8ª columna aparte. */}
                        <span className={styles.muted} style={{ textTransform: 'capitalize' }}> · {c.formato}</span>
                      </td>
                      <td>${c.cpm.toFixed(2)}</td>
                      <td>{ingreso ? `$${ingreso.ingreso_total.toFixed(2)}` : '—'}</td>
                      {/* Antes "Inicio"+"Fin" en columnas separadas, luego combinadas
                          en "Vigencia" — seguía sin caber. Solo el inicio en la tabla;
                          el fin sigue disponible en "Ver detalle"/"Editar". */}
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtFechaCorta(c.fecha_inicio)}</td>
                      <td><span className={`${styles.badge} ${est.tone === 'ok' ? styles.badgeOk : est.tone === 'warn' ? styles.badgeWarn : styles.badgeOff}`}>{est.label}</span></td>
                      <td className={styles.actionsCol}>
                        <div className={styles.actions}>
                          <CrudActionButtons
                            onView={() => setCampanaModal({ mode: 'view', campana: c })}
                            onEdit={!finalizada ? () => setCampanaModal({ mode: 'edit', campana: c }) : undefined}
                            // Reusa el slot rojo "terminal" de CrudActionButtons con una
                            // etiqueta propia (mismo patrón que TicketsAdminPage: "Resolver"
                            // en vez de "Eliminar") en vez de un 4º botón de texto aparte —
                            // ahorra el ancho que antes se llevaba "Finalizar" como texto.
                            onDelete={!finalizada ? () => pedirFinalizar(c) : undefined}
                            deleteLabel="Finalizar"
                          />
                          {!finalizada && (
                            <button
                              type="button"
                              className={styles.btnIcon}
                              onClick={pausada ? () => transicion.mutate({ id: c.campana_id, accion: 'reanudar' }) : () => pedirPausar(c)}
                              title={pausada ? 'Reanudar' : 'Pausar'}
                              aria-label={pausada ? 'Reanudar' : 'Pausar'}
                            >
                              {pausada ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {campanasTotalPages > 1 && !campanas.isLoading && (
            <div className={styles.tableFooter} data-pdf-export-ignore="true">
              <button className={styles.btnGhost} type="button" disabled={campanaPage <= 1} onClick={() => setCampanaPage((p) => p - 1)}>
                ← Anterior
              </button>
              <span className={styles.tableFooterText}>Página {campanaPage} / {campanasTotalPages} · {campanasTotal} campañas</span>
              <button className={styles.btnGhost} type="button" disabled={campanaPage >= campanasTotalPages} onClick={() => setCampanaPage((p) => p + 1)}>
                Siguiente →
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className={styles.statsRow}>
            <div className={styles.kpiPanel}>
              <div className={styles.kpiRow}>
                <span className={styles.kpiValue}>{kpisAnunciantes.total}</span>
                <span className={styles.kpiLabel}>Total anunciantes</span>
              </div>
            </div>
            <div className={styles.kpiPanel}>
              <div className={styles.kpiRow}>
                <span className={`${styles.kpiValue} ${styles.kpiValueOk}`}>{kpisAnunciantes.activos}</span>
                <span className={styles.kpiLabel}>Activos</span>
              </div>
            </div>
          </div>

          <div className={styles.actionsRow} data-pdf-export-ignore="true">
            <button type="button" className={styles.btnPrimary} onClick={() => setAnuncianteModal({ mode: 'create' })}>
              + Nuevo anunciante
            </button>
          </div>

          <div className={styles.tablePanel}>
            <table className={styles.table}>
              <thead><tr><th>ID</th><th>Nombre</th><th>Sector</th><th>Campañas</th><th>Estado</th><th className={styles.actionsCol}>Acciones</th></tr></thead>
              <tbody>
                {anunciantes.isLoading ? (
                  <SkeletonTableRows columns={6} />
                ) : anunciantesData.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState icon={<Building2 size={22} aria-hidden="true" />} title="Sin anunciantes" body="Todavía no hay anunciantes registrados." /></td></tr>
                ) : anunciantesData.map((a) => (
                  <tr key={a.anunciante_id}>
                    <td>{a.anunciante_id}</td><td>{a.nombre}</td><td>{a.sector || '—'}</td>
                    <td>{campanasPorAnunciante[a.anunciante_id] ?? 0}</td>
                    <td><span className={`${styles.badge} ${a.activo ? styles.badgeOk : styles.badgeOff}`}>{a.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td className={styles.actionsCol}>
                      {a.activo ? (
                        <button className={styles.btnGhostDanger} onClick={() => pedirDesactivarAnunciante(a)}>Desactivar</button>
                      ) : <span className={styles.muted}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {anunciantesTotalPages > 1 && !anunciantes.isLoading && (
            <div className={styles.tableFooter} data-pdf-export-ignore="true">
              <button className={styles.btnGhost} type="button" disabled={anunciantePage <= 1} onClick={() => setAnunciantePage((p) => p - 1)}>
                ← Anterior
              </button>
              <span className={styles.tableFooterText}>Página {anunciantePage} / {anunciantesTotalPages} · {anunciantesTotal} anunciantes</span>
              <button className={styles.btnGhost} type="button" disabled={anunciantePage >= anunciantesTotalPages} onClick={() => setAnunciantePage((p) => p + 1)}>
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}

      {campanaModal?.mode === 'create' && (
        <CampanaCreateModal
          anunciantesData={anunciantesData}
          pending={crearCampana.isPending}
          onClose={() => setCampanaModal(null)}
          onSave={(vals) => crearCampana.mutate(vals)}
        />
      )}

      {campanaModal?.mode === 'edit' && (
        <CampanaEditModal
          campana={campanaModal.campana}
          pending={guardarCampana.isPending}
          onClose={() => setCampanaModal(null)}
          onSave={(vals) => guardarCampana.mutate({ id: campanaModal.campana.campana_id, ...vals })}
        />
      )}

      {campanaModal?.mode === 'view' && (
        <CampanaViewModal
          campana={campanaModal.campana}
          anunciante={anunciantesData.find((a) => a.anunciante_id === campanaModal.campana.anunciante_id)}
          ingreso={ingresosData.find((i) => i.campana_id === campanaModal.campana.campana_id)}
          onClose={() => setCampanaModal(null)}
        />
      )}

      {anuncianteModal?.mode === 'create' && (
        <AnuncianteCreateModal
          pending={crearAnunciante.isPending}
          onClose={() => setAnuncianteModal(null)}
          onSave={(vals) => crearAnunciante.mutate(vals)}
        />
      )}
    </section>
  )
}

function CampanaCreateModal({ anunciantesData, pending, onClose, onSave }: {
  anunciantesData: Anunciante[]
  pending: boolean
  onClose: () => void
  onSave: (vals: CampanaBody) => void
}) {
  const [anuncianteId, setAnuncianteId] = useState('')
  const [nombre, setNombre]             = useState('')
  const [tipoAnuncio, setTipoAnuncio]   = useState<TipoAnuncio>('audio')
  const [cpm, setCpm]                   = useState('')
  const [presupuesto, setPresupuesto]   = useState('')
  const [fechaInicio, setFechaInicio]   = useState(() => new Date().toISOString().slice(0, 10))
  const [urlDestino, setUrlDestino]     = useState('')

  const urlOk = tipoAnuncio === 'audio' || urlDestino.trim().length > 0
  const valido = !!anuncianteId && nombre.trim().length > 0 && !!cpm && !!presupuesto && urlOk

  return (
    <CrudModal
      isOpen
      wide
      mode="create"
      title="Nueva campaña"
      confirmLabel="Crear campaña"
      loading={pending}
      onClose={onClose}
      onConfirm={() => valido && onSave({
        anunciante_id: Number(anuncianteId), nombre: nombre.trim(), cpm: Number(cpm),
        presupuesto_total: Number(presupuesto), fecha_inicio: fechaInicio,
        tipo_anuncio: tipoAnuncio, url_destino: urlDestino,
      })}
    >
      {/* S17: modal `wide` con preview en vivo — el formulario (7 campos, 2
          columnas) queda a la izquierda de la vista previa del anuncio tal
          como se vería en contexto (formato + anunciante + CPM). */}
      <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
        <label className={styles.fieldLabel} htmlFor="camp-nombre">Nombre</label>
        <input id="camp-nombre" className={styles.input} maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Verano 2026" />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="camp-anunciante">Anunciante</label>
        <select id="camp-anunciante" className={styles.select} value={anuncianteId} onChange={(e) => setAnuncianteId(e.target.value)}>
          <option value="">Selecciona…</option>
          {anunciantesData.map((a) => <option key={a.anunciante_id} value={a.anunciante_id}>{a.nombre}</option>)}
        </select>
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
        <input id="camp-presupuesto" className={styles.input} type="number" step="0.01" min="0.01" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} placeholder="1000" />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="camp-fecha">Fecha de inicio</label>
        <input id="camp-fecha" className={styles.input} type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
      </div>
      {tipoAnuncio === 'display' && (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="camp-url">URL de destino</label>
          <input id="camp-url" className={styles.input} type="url" maxLength={2048} value={urlDestino} onChange={(e) => setUrlDestino(e.target.value)} placeholder="https://anunciante.com/promo" />
        </div>
      )}

      <div className={styles.adPreview} style={{ gridColumn: '1 / -1' }}>
        <p className={styles.adPreviewLabel}>Vista previa</p>
        <div className={styles.adPreviewCard}>
          <span className={styles.adPreviewBadge}>{tipoAnuncio === 'audio' ? 'Audio · entre canciones' : 'Display · banner'}</span>
          <p className={styles.adPreviewNombre}>{nombre.trim() || 'Nombre de la campaña'}</p>
          <p className={styles.adPreviewMeta}>
            {anunciantesData.find((a) => String(a.anunciante_id) === anuncianteId)?.nombre ?? 'Anunciante sin seleccionar'}
            {' · '}
            CPM {cpm ? `$${Number(cpm).toFixed(2)}` : '—'}
          </p>
        </div>
      </div>
    </CrudModal>
  )
}

function AnuncianteCreateModal({ pending, onClose, onSave }: {
  pending: boolean
  onClose: () => void
  onSave: (vals: { nombre: string; sector: string }) => void
}) {
  const [nombre, setNombre] = useState('')
  const [sector, setSector] = useState('')
  const valido = nombre.trim().length > 0

  return (
    <CrudModal
      isOpen
      mode="create"
      title="Nuevo anunciante"
      confirmLabel="Crear anunciante"
      loading={pending}
      onClose={onClose}
      onConfirm={() => valido && onSave({ nombre: nombre.trim(), sector: sector.trim() })}
    >
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="an-nombre">Nombre</label>
        <input id="an-nombre" className={styles.input} maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Acme Corp" />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="an-sector">Sector</label>
        <input id="an-sector" className={styles.input} maxLength={100} value={sector} onChange={(e) => setSector(e.target.value)} placeholder="retail" />
      </div>
    </CrudModal>
  )
}

// Migrado a `CrudModal` compartido (S13-P2) — antes reimplementaba su propio
// `.modalBackdrop`/`.modal`/`.modalActions` (ver `PublicidadAdminPage.module.css`,
// ahora solo usados por sus estilos de campo `.field`/`.input`/`.select`, que
// SÍ siguen siendo propios de esta entidad).
function CampanaEditModal({ campana, pending, onClose, onSave }: {
  campana: Campana
  pending: boolean
  onClose: () => void
  onSave: (vals: { nombre: string; presupuesto_total: number; fecha_inicio: string; fecha_fin: string | null; formato: FormatoCampana }) => void
}) {
  const [nombre, setNombre] = useState(campana.nombre)
  const [presupuesto, setPresupuesto] = useState(String(campana.presupuesto_total))
  const [fechaInicio, setFechaInicio] = useState(campana.fecha_inicio)
  const [fechaFin, setFechaFin] = useState(campana.fecha_fin ?? '')
  const [formato, setFormato] = useState<FormatoCampana>(campana.formato)
  const fechaFinValida = !fechaFin || fechaFin > fechaInicio
  const valido = nombre.trim().length > 0 && Number(presupuesto) > 0 && fechaFinValida

  return (
    <CrudModal
      isOpen
      mode="edit"
      title={`Editar campaña — ${campana.nombre}`}
      loading={pending}
      onClose={onClose}
      onConfirm={() => valido && onSave({ nombre: nombre.trim(), presupuesto_total: Number(presupuesto), fecha_inicio: fechaInicio, fecha_fin: fechaFin || null, formato })}
    >
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="ed-nombre">Nombre</label>
        <input id="ed-nombre" className={styles.input} maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="ed-formato">Formato</label>
        <select id="ed-formato" className={styles.select} value={formato} onChange={(e) => setFormato(e.target.value as FormatoCampana)}>
          <option value="audio">Audio</option>
          <option value="display">Display</option>
          <option value="banner">Banner</option>
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="ed-pres">Presupuesto total</label>
        <input id="ed-pres" className={styles.input} type="number" step="0.01" min="0.01" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="ed-ini">Fecha de inicio</label>
        <input id="ed-ini" className={styles.input} type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="ed-fin">Fecha de fin</label>
        <input id="ed-fin" className={styles.input} type="date" min={fechaInicio} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
        {!fechaFinValida && <p className={styles.modalWarn}>La fecha de fin debe ser posterior a la fecha de inicio.</p>}
      </div>
    </CrudModal>
  )
}

// Ver detalle (S13-P2, brecha cerrada de la auditoría S13-P1: Publicidad
// tenía Insertar/Editar/transiciones pero no Ver detalle). Sin "historial de
// cambios de estado" — pausar/reanudar/finalizar no dejan traza propia por
// campaña hoy (solo auditoría por usuario/acción), así que no se fabrica un
// historial que el sistema no produce todavía.
function CampanaViewModal({ campana, anunciante, ingreso, onClose }: {
  campana: Campana
  anunciante: Anunciante | undefined
  ingreso: IngresoCampana | undefined
  onClose: () => void
}) {
  const est = estadoCampana(campana)
  return (
    <CrudModal isOpen mode="view" title={`Campaña — ${campana.nombre}`} onClose={onClose} onConfirm={onClose}>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Nombre</label>
        <input className={styles.input} value={campana.nombre} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Anunciante</label>
        <input className={styles.input} value={anunciante?.nombre ?? `#${campana.anunciante_id}`} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Formato</label>
        <input className={styles.input} value={campana.formato} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Estado</label>
        <input className={styles.input} value={est.label} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>CPM (USD)</label>
        <input className={styles.input} value={`$${campana.cpm.toFixed(2)}`} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Presupuesto total</label>
        <input className={styles.input} value={`$${campana.presupuesto_total.toFixed(2)}`} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Fecha de inicio</label>
        <input className={styles.input} value={campana.fecha_inicio} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Fecha de fin</label>
        <input className={styles.input} value={campana.fecha_fin ?? 'Indefinida'} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Impresiones completadas</label>
        <input className={styles.input} value={ingreso ? String(ingreso.impresiones) : '0'} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Ingreso real reconocido</label>
        <input className={styles.input} value={`$${(ingreso?.ingreso_total ?? 0).toFixed(2)}`} readOnly />
      </div>
    </CrudModal>
  )
}
