import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import { EmptyState } from '@shared/components/EmptyState'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { useConfirm } from '@shared/context/ConfirmContext'
import { useToast } from '@shared/context/ToastContext'
import { apiErrorMessage } from '@shared/lib/api-client'
import { getUser } from '@shared/lib/session'
import { authApi } from '../api/auth.api'
import { seguridadApi } from '../api/seguridad.api'
import shell from './SeguridadPages.module.css'

function fmtFecha(iso: string) {
  return String(iso).slice(0, 16).replace('T', ' ')
}

function fmtDuracion(segundos: number): string {
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${segundos}s`
}

function opcionesUnicas(valores: (string | null | undefined)[]): string[] {
  return Array.from(new Set(valores.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b))
}

// Obj 30 / OT-30 (S13-P2): única brecha total detectada en la auditoría de
// S13-P1 — antes solo existía un conteo agregado (AuditoriaPage) y el detalle
// por usuario individual (usuario_360, UsuariosAdminPage). Mismo patrón de
// las demás páginas de "Reportes" (filtros client-side sobre un dataset ya
// cargado, sin paginación server-side — el volumen de sesiones abiertas no
// lo justifica, igual que AbTestsPage).
export function SesionesActivasPage() {
  useDocumentTitle('Sesiones activas')
  const reportRef = useRef<HTMLElement>(null)
  const [busqueda, setBusqueda] = useState('')
  const [rol, setRol]           = useState('')
  const [desde, setDesde]       = useState('')
  const [hasta, setHasta]       = useState('')
  const confirm      = useConfirm()
  const toast        = useToast()
  const queryClient   = useQueryClient()
  const propioUsuarioId = getUser()?.id

  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'sesiones-activas'],
    queryFn:  () => seguridadApi.sesionesActivas(),
    refetchInterval: 30_000,
  })

  const sesiones = data?.sesiones ?? []
  // Bug real detectado (2 ago 2026): el backend limita `sesiones` a 200 filas
  // (`limit`, ver router.py), pero el KPI usaba `filtradas.length` como si
  // fuera el total — con más de 200 sesiones abiertas (caso real: 314
  // huérfanas de pruebas QA), cerrar una no bajaba el número: otra ocupaba el
  // cupo liberado en el siguiente refetch. `total` viene del backend sin ese
  // límite (`SESIONES_ABIERTAS_TOTAL`); se usa para el KPI cuando no hay
  // filtros activos, y se avisa si la lista cargada quedó truncada.
  const totalReal = data?.total ?? sesiones.length
  const hayFiltrosActivos = !!(busqueda.trim() || rol || desde || hasta)
  const listaTruncada = sesiones.length < totalReal

  // Cierre remoto (S13-P5, AUDITORIA_S13.md §4e.1) — reusa el mismo
  // endpoint que "Mis sesiones" (`authApi.cerrarSesionRemota`); el backend
  // ahora deja pasar a un admin cerrando la sesión de un tercero
  // (`cerrar_sesion_remota`, seguridad/router.py).
  const cerrarSesion = useMutation({
    mutationFn: (sesionId: string) => authApi.cerrarSesionRemota(sesionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seguridad', 'sesiones-activas'] })
      toast.success('Sesión cerrada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cerrar la sesión.')),
  })

  async function handleCerrarSesion(s: { sesion_id: string; nombre: string | null; email: string | null }) {
    const ok = await confirm(
      '¿Cerrar esta sesión? El usuario será desconectado inmediatamente.',
      { title: s.nombre || s.email || 'Cerrar sesión', confirmLabel: 'Cerrar sesión', danger: true },
    )
    if (ok) cerrarSesion.mutate(s.sesion_id)
  }

  const roles = useMemo(() => opcionesUnicas(sesiones.map((s) => s.rol)), [sesiones])

  const filtradas = sesiones.filter((s) => {
    const q = busqueda.trim().toLowerCase()
    const coincideBusqueda = !q
      || (s.nombre ?? '').toLowerCase().includes(q)
      || (s.email ?? '').toLowerCase().includes(q)
    const coincideRol   = !rol || s.rol === rol
    const coincideDesde = !desde || s.fecha_inicio >= desde
    const coincideHasta = !hasta || s.fecha_inicio <= `${hasta}T23:59:59`
    return coincideBusqueda && coincideRol && coincideDesde && coincideHasta
  })

  return (
    <section className={shell.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={shell.heading}>Sesiones activas</h1>
        <ExportPDFButton targetRef={reportRef} fileName="sesiones-activas" title="Sesiones activas" />
      </div>
      <span className={shell.subtitle}>
        Sesiones abiertas ahora mismo en todo el sistema — usuario, dispositivo e inicio.
      </span>

      <div className={shell.statsRow}>
        <div className={shell.kpiPanel}>
          <div className={shell.kpiRow}>
            <span className={shell.kpiValue}>{hayFiltrosActivos ? filtradas.length : totalReal}</span>
            <span className={shell.kpiLabel}>Sesiones abiertas</span>
          </div>
          {listaTruncada && (
            <span className={shell.kpiLabel}>Mostrando {sesiones.length} de {totalReal}</span>
          )}
        </div>
        <div className={shell.kpiPanel}>
          <div className={shell.kpiRow}>
            <span className={shell.kpiValue}>{new Set(filtradas.map((s) => s.usuario_id)).size}</span>
            <span className={shell.kpiLabel}>Usuarios únicos {listaTruncada ? '(en la página cargada)' : ''}</span>
          </div>
        </div>
      </div>

      <div className={shell.form} data-pdf-export-ignore="true">
        <div className={shell.field}>
          <label htmlFor="f-busqueda">Usuario</label>
          <input
            id="f-busqueda"
            type="text"
            placeholder="Nombre o correo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className={shell.field}>
          <label htmlFor="f-rol">Rol</label>
          <select id="f-rol" value={rol} onChange={(e) => setRol(e.target.value)}>
            <option value="">Todos</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className={shell.field}>
          <label htmlFor="f-desde">Inicio desde</label>
          <input id="f-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className={shell.field}>
          <label htmlFor="f-hasta">Inicio hasta</label>
          <input id="f-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      {isError && (
        <ErrorState message="No se pudieron cargar las sesiones activas (¿sesión de superadmin?)." />
      )}

      {!isError && (
        <div className={shell.tableScroll}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Dispositivo</th>
                <th>Inicio</th>
                <th>Duración</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonTableRows columns={6} />
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon="( ∅ )"
                      title="Sin sesiones abiertas"
                      body={sesiones.length === 0 ? 'No hay sesiones activas en este momento.' : 'Prueba con otro filtro.'}
                    />
                  </td>
                </tr>
              ) : (
                filtradas.map((s) => (
                  <tr key={s.sesion_id}>
                    <td>
                      <div className={shell.userCell}>
                        <span className={shell.userCellName}>{s.nombre || '—'}</span>
                        <span className={shell.userCellMeta}>{s.email || '—'}</span>
                      </div>
                    </td>
                    <td>{s.rol}</td>
                    <td>{s.dispositivo_tipo || '—'} · {s.dispositivo_os || '—'}</td>
                    <td>{fmtFecha(s.fecha_inicio)}</td>
                    <td>{fmtDuracion(s.duracion_segundos)}</td>
                    <td>
                      {/* No se ofrece cerrar la propia sesión desde este panel
                          (efecto sorpresa: te desconectarías a ti mismo del
                          admin de sesiones) — para eso ya existe "Cerrar sesión"
                          en el menú de usuario. */}
                      {s.usuario_id !== propioUsuarioId && (
                        <button
                          type="button"
                          className={shell.btnIconDanger}
                          disabled={cerrarSesion.isPending}
                          onClick={() => handleCerrarSesion(s)}
                        >
                          <LogOut size={14} aria-hidden="true" />
                          Cerrar
                        </button>
                      )}
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
