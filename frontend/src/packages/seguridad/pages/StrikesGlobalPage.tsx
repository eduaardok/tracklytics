import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
import { seguridadApi } from '../api/seguridad.api'
import shell from './SeguridadPages.module.css'

function fmtFecha(iso: string) {
  return String(iso).slice(0, 16).replace('T', ' ')
}

// Panel de moderación transversal (S12): complementa el historial de strikes
// por usuario (ya visible en la vista 360° de UsuariosAdminPage) con un
// listado global de sanciones activas, para no tener que abrir ficha por
// ficha buscando quién está sancionado ahora mismo.
export function StrikesGlobalPage() {
  useDocumentTitle('Strikes activos')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'strikes-global'],
    queryFn:  () => seguridadApi.strikesGlobal(),
  })

  const strikes = data?.strikes ?? []

  return (
    <section className={shell.page}>
      <h1 className={shell.heading}>Strikes activos</h1>
      <span className={shell.subtitle}>Sanciones vigentes de todo el sistema (panel de moderación transversal).</span>

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
                <tr><td colSpan={5}>Cargando…</td></tr>
              ) : strikes.length === 0 ? (
                <tr><td colSpan={5} className={shell.empty}>Sin strikes activos.</td></tr>
              ) : (
                strikes.map((s) => (
                  <tr key={s.strike_id}>
                    <td>
                      <span className={shell.userCell}>
                        <span className={shell.userCellName}>{s.usuario_nombre ?? s.usuario_id}</span>
                        {s.usuario_email && <span className={shell.userCellMeta}>{s.usuario_email}</span>}
                      </span>
                    </td>
                    <td>{s.motivo}</td>
                    <td>{s.origen_tipo}{s.origen_id ? ` · ${s.origen_id}` : ''}</td>
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
