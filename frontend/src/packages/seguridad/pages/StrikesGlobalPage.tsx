import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import { seguridadApi } from '../api/seguridad.api'
import shell from './SeguridadPages.module.css'

function fmtFecha(iso: string) {
  return String(iso).slice(0, 16).replace('T', ' ')
}

const ORIGEN_BADGE_CLS: Record<string, string> = {
  manual:    shell.badgeManual,
  denuncia:  shell.badgeDenuncia,
}

function OrigenBadge({ origen }: { origen: string }) {
  return <span className={`${shell.badge} ${ORIGEN_BADGE_CLS[origen] ?? shell.badgeNeutral}`}>{origen}</span>
}

function opcionesUnicas(valores: string[]): string[] {
  return Array.from(new Set(valores.filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

// Umbral de suspensión automática (`strikes.py::STRIKES_PARA_SUSPENSION`):
// 2 strikes activos ya es "en riesgo" — el tercero dispara la suspensión sola.
const UMBRAL_RIESGO = 2

// Panel de moderación transversal (S12): complementa el historial de strikes
// por usuario (ya visible en la vista 360° de UsuariosAdminPage) con un
// listado global de sanciones activas, para no tener que abrir ficha por
// ficha buscando quién está sancionado ahora mismo.
export function StrikesGlobalPage() {
  useDocumentTitle('Strikes activos')
  const [origen, setOrigen] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'strikes-global'],
    queryFn:  () => seguridadApi.strikesGlobal(),
  })

  const strikes = data?.strikes ?? []
  const origenes = useMemo(() => opcionesUnicas(strikes.map((s) => s.origen_tipo)), [strikes])

  const filtrados = strikes.filter((s) => !origen || s.origen_tipo === origen)

  // KPIs sobre `filtrados` — reflejan el subconjunto que el filtro de origen
  // está mostrando ahora mismo, no el total sin filtrar.
  const stats = useMemo(() => {
    const porUsuario: Record<string, number> = {}
    for (const s of filtrados) porUsuario[s.usuario_id] = (porUsuario[s.usuario_id] ?? 0) + 1
    const usuariosAfectados = Object.keys(porUsuario).length
    const enRiesgo = Object.values(porUsuario).filter((n) => n >= UMBRAL_RIESGO).length
    return { total: filtrados.length, usuariosAfectados, enRiesgo }
  }, [filtrados])

  return (
    <section className={shell.page}>
      <h1 className={shell.heading}>Strikes activos</h1>
      <span className={shell.subtitle}>Sanciones vigentes de todo el sistema (panel de moderación transversal).</span>

      <div className={shell.statsRow}>
        <div className={shell.kpiPanel}>
          <div className={shell.kpiRow}>
            <span className={shell.kpiValue}>{stats.total}</span>
            <span className={shell.kpiLabel}>Total strikes activos</span>
          </div>
        </div>
        <div className={shell.kpiPanel}>
          <div className={shell.kpiRow}>
            <span className={shell.kpiValue}>{stats.usuariosAfectados}</span>
            <span className={shell.kpiLabel}>Usuarios afectados</span>
          </div>
        </div>
        <div className={shell.kpiPanel}>
          <div className={shell.kpiRow}>
            <span className={shell.kpiValue}>{stats.enRiesgo}</span>
            <span className={shell.kpiLabel}>En riesgo ({UMBRAL_RIESGO}+ strikes, umbral de suspensión: 3)</span>
          </div>
        </div>
      </div>

      <div className={shell.form}>
        <div className={shell.field}>
          <label htmlFor="f-origen">Origen</label>
          <select id="f-origen" value={origen} onChange={(e) => setOrigen(e.target.value)}>
            <option value="">Todos</option>
            {origenes.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {isError && (
        <ErrorState message="No se pudieron cargar los strikes (¿sesión de admin_comunidad o superadmin?)." />
      )}

      {!isError && (
        <div className={shell.tableScroll}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Motivo</th>
                <th>Origen</th>
                <th>Emitido por</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonTableRows columns={5} />
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={5} className={shell.empty}>Sin strikes activos.</td></tr>
              ) : (
                filtrados.map((s) => (
                  <tr key={s.strike_id}>
                    <td>
                      <span className={shell.userCell}>
                        <span className={shell.userCellName}>{s.usuario_nombre ?? s.usuario_id}</span>
                        {s.usuario_email && <span className={shell.userCellMeta}>{s.usuario_email}</span>}
                      </span>
                    </td>
                    <td>{s.motivo}</td>
                    <td>
                      <OrigenBadge origen={s.origen_tipo} />
                      {s.origen_id ? ` · ${s.origen_id}` : ''}
                    </td>
                    <td>{s.emitido_por}</td>
                    <td>{fmtFecha(s.created_at)}</td>
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
