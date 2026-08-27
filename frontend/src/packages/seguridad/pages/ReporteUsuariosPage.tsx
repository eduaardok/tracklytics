import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { seguridadApi } from '../api/seguridad.api'
import type { EstadoCuenta } from '../types'
import shell from './SeguridadPages.module.css'

function fmtFecha(iso: string | null) {
  if (!iso) return '—'
  return String(iso).slice(0, 16).replace('T', ' ')
}

function opcionesUnicas(valores: (string | null | undefined)[]): string[] {
  return Array.from(new Set(valores.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b))
}

// `eliminado` (baja de cuenta) se mapea a `badgeBlocked` (naranja), no a
// `badgeSuspend` (rojo, reservado a `suspendido`) — son dos estados distintos
// de `EstadoCuenta` (seguridad/types.ts).
const ESTADO_BADGE_CLS: Record<EstadoCuenta, string> = {
  activa:     shell.badgeActive,
  suspendido: shell.badgeSuspend,
  eliminado:  shell.badgeBlocked,
}

function EstadoBadge({ estado }: { estado: EstadoCuenta }) {
  return <span className={`${shell.badge} ${ESTADO_BADGE_CLS[estado] ?? shell.badgeNeutral}`}>{estado}</span>
}

const PAGE_SIZE = 50

// Informe del objetivo táctico "Captación y registro de usuarios" (S12):
// listado enriquecido con canal de adquisición, plan y rol administrativo.
//
// Fix S17 (auditoría de navegación/UX, sección 3.2): el endpoint traía los
// 13,109 usuarios reales sin límite en una sola respuesta, y esta página
// paginaba/filtraba 100% client-side sobre ese payload completo. `pais` y
// `estado` ahora filtran server-side (mismo patrón page/limit que
// `UsuariosAdminPage.tsx`); las opciones de país vienen de
// `paises_disponibles` (todo el universo real), no del dataset cargado.
// `rol` y `plan` (este último no vive en ClickHouse, se resuelve desde
// PocketBase) siguen filtrando solo dentro de la página actual — acotarlos
// correctamente a nivel servidor exigiría tocar el modelo de datos, fuera
// de alcance de este fix de paginación.
export function ReporteUsuariosPage() {
  useDocumentTitle('Reporte de usuarios')
  const reportRef = useRef<HTMLElement>(null)
  const [page, setPage]     = useState(1)
  const [pais, setPais]     = useState('')
  const [plan, setPlan]     = useState('')
  const [rol, setRol]       = useState('')
  const [estado, setEstado] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'reporte-usuarios', page, pais, estado],
    queryFn:  () => seguridadApi.usuariosReporte(page, PAGE_SIZE, pais || undefined, estado || undefined),
  })

  const usuarios = data?.usuarios ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const opciones = useMemo(() => ({
    paises: data?.paises_disponibles ?? [],
    planes: opcionesUnicas(usuarios.map((u) => u.plan_activo)),
    roles:  opcionesUnicas(usuarios.map((u) => u.rol)),
    estados: ['activa', 'suspendido', 'eliminado'],
  }), [usuarios, data?.paises_disponibles])

  // `rol`/`plan`: filtro dentro de la página actual (ver comentario arriba).
  const filtrados = usuarios.filter((u) =>
    (!plan || u.plan_activo === plan) &&
    (!rol || u.rol === rol),
  )

  // Las tarjetas KPI reflejan la página actual (filtrada por rol/plan), no
  // el total real — `total` (arriba) es el conteo real server-side.
  const stats = useMemo(() => {
    const porPlan: Record<string, number> = {}
    for (const u of filtrados) porPlan[u.plan_activo] = (porPlan[u.plan_activo] ?? 0) + 1
    return {
      porPlan,
      paisesUnicos:   new Set(filtrados.map((u) => u.pais).filter(Boolean)).size,
      adminsActivos:  filtrados.filter((u) => u.rol !== 'usuario').length,
    }
  }, [filtrados])

  return (
    <section className={shell.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={shell.heading}>Reporte de usuarios</h1>
        <ExportPDFButton targetRef={reportRef} fileName="reporte-usuarios" title="Reporte de usuarios" />
      </div>
      <span className={shell.subtitle}>
        Captación y registro — canal de adquisición, plan activo y rol administrativo por usuario.
      </span>

      <div className={shell.statsRow}>
        <div className={shell.kpiPanel}>
          <div className={shell.kpiRow}>
            <span className={shell.kpiValue}>{total}</span>
            <span className={shell.kpiLabel}>Total usuarios (real, sin filtrar por rol/plan)</span>
          </div>
        </div>
        <div className={shell.kpiPanel}>
          <span className={shell.kpiLabel}>Distribución por plan</span>
          <div className={shell.chipRow}>
            {Object.keys(stats.porPlan).length === 0 ? (
              <span className={shell.kpiLabel}>—</span>
            ) : (
              Object.entries(stats.porPlan).map(([p, n]) => (
                <span key={p} className={`${shell.badge} ${shell.badgeNeutral}`}>{p}: {n}</span>
              ))
            )}
          </div>
        </div>
        <div className={shell.kpiPanel}>
          <div className={shell.kpiRow}>
            <span className={shell.kpiValue}>{stats.paisesUnicos}</span>
            <span className={shell.kpiLabel}>Países únicos</span>
          </div>
        </div>
        <div className={shell.kpiPanel}>
          <div className={shell.kpiRow}>
            <span className={shell.kpiValue}>{stats.adminsActivos}</span>
            <span className={shell.kpiLabel}>Admins activos</span>
          </div>
        </div>
      </div>

      <div className={shell.form} data-pdf-export-ignore="true">
        <div className={shell.field}>
          <label htmlFor="f-pais">País</label>
          <select id="f-pais" value={pais} onChange={(e) => { setPais(e.target.value); setPage(1) }}>
            <option value="">Todos</option>
            {opciones.paises.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className={shell.field}>
          <label htmlFor="f-plan">Plan</label>
          <select id="f-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">Todos</option>
            {opciones.planes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className={shell.field}>
          <label htmlFor="f-rol">Rol</label>
          <select id="f-rol" value={rol} onChange={(e) => setRol(e.target.value)}>
            <option value="">Todos</option>
            {opciones.roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className={shell.field}>
          <label htmlFor="f-estado">Estado</label>
          <select id="f-estado" value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1) }}>
            <option value="">Todos</option>
            {opciones.estados.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      {isError && (
        <ErrorState message="No se pudo cargar el reporte de usuarios (¿sesión de superadmin?)." />
      )}

      {!isError && (
        <div className={shell.tableScroll}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>País</th>
                <th>Canal</th>
                <th>Plan</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Último acceso</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonTableRows columns={8} />
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={8} className={shell.empty}>Sin usuarios que coincidan con el filtro.</td></tr>
              ) : (
                filtrados.map((u) => (
                  <tr key={u.usuario_id}>
                    <td>{u.nombre || '—'}</td>
                    <td>{u.email}</td>
                    <td>{u.pais || '—'}</td>
                    <td>{u.canal_adquisicion}</td>
                    <td>{u.plan_activo}</td>
                    <td>{u.rol}</td>
                    <td><EstadoBadge estado={u.estado_cuenta} /></td>
                    <td>{fmtFecha(u.ultimo_acceso)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isError && totalPages > 1 && (
        <div className={shell.form} style={{ marginTop: 'var(--space-md)', alignItems: 'center' }} data-pdf-export-ignore="true">
          <button className={shell.ghostBtn} type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </button>
          <span className={shell.subtitle} style={{ margin: 0 }}>Página {page} / {totalPages} · {total} usuarios</span>
          <button className={shell.ghostBtn} type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </button>
        </div>
      )}
    </section>
  )
}
