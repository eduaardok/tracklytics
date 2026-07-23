import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
import { seguridadApi } from '../api/seguridad.api'
import shell from './SeguridadPages.module.css'

function fmtFecha(iso: string | null) {
  if (!iso) return '—'
  return String(iso).slice(0, 16).replace('T', ' ')
}

function opcionesUnicas(valores: (string | null | undefined)[]): string[] {
  return Array.from(new Set(valores.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b))
}

// Informe del objetivo táctico "Captación y registro de usuarios" (S12):
// listado enriquecido con canal de adquisición, plan y rol administrativo.
// Los 3 filtros son client-side (el endpoint no pagina ni filtra) — sus
// opciones se derivan del propio dataset ya cargado, no de un catálogo aparte.
export function ReporteUsuariosPage() {
  useDocumentTitle('Reporte de usuarios')
  const [pais, setPais] = useState('')
  const [plan, setPlan] = useState('')
  const [rol, setRol]   = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'reporte-usuarios'],
    queryFn:  () => seguridadApi.usuariosReporte(),
  })

  const usuarios = data?.usuarios ?? []

  const opciones = useMemo(() => ({
    paises: opcionesUnicas(usuarios.map((u) => u.pais)),
    planes: opcionesUnicas(usuarios.map((u) => u.plan_activo)),
    roles:  opcionesUnicas(usuarios.map((u) => u.rol)),
  }), [usuarios])

  const filtrados = usuarios.filter((u) =>
    (!pais || u.pais === pais) &&
    (!plan || u.plan_activo === plan) &&
    (!rol || u.rol === rol),
  )

  return (
    <section className={shell.page}>
      <h1 className={shell.heading}>Reporte de usuarios</h1>
      <span className={shell.subtitle}>
        Captación y registro — canal de adquisición, plan activo y rol administrativo por usuario.
      </span>

      <div className={shell.form}>
        <div className={shell.field}>
          <label htmlFor="f-pais">País</label>
          <select id="f-pais" value={pais} onChange={(e) => setPais(e.target.value)}>
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
                <tr><td colSpan={8}>Cargando…</td></tr>
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
                    <td>{u.estado_cuenta}</td>
                    <td>{fmtFecha(u.ultimo_acceso)}</td>
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
