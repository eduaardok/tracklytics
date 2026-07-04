import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { seguridadApi } from '../api/seguridad.api'
import type { Permiso } from '../types'
import styles from './SeguridadPages.module.css'

export function PermisosPage() {
  const [usuarioId, setUsuarioId]   = useState('')
  const [buscado, setBuscado]       = useState('')
  const [recurso, setRecurso]       = useState('')
  const [accion, setAccion]         = useState('')
  const [permitido, setPermitido]   = useState(true)

  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'permisos', buscado],
    queryFn:  () => seguridadApi.permisos(buscado),
    enabled:  buscado.length > 0,
  })

  const asignar = useMutation({
    mutationFn: () => seguridadApi.asignarPermiso({ usuario_id: buscado, recurso, accion, permitido }),
    onSuccess: () => {
      setRecurso('')
      setAccion('')
      queryClient.invalidateQueries({ queryKey: ['seguridad', 'permisos', buscado] })
    },
  })

  const permisos: Permiso[] = data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Permisos</h1>
      <span className={styles.subtitle}>// gestión de permisos granulares por usuario (CU-O17)</span>

      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); setBuscado(usuarioId.trim()) }}>
        <div className={styles.field}>
          <label htmlFor="usuario_id">usuario_id</label>
          <input
            id="usuario_id"
            type="text"
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
            placeholder="id de PocketBase"
          />
        </div>
        <button className={styles.button} type="submit">Buscar</button>
      </form>

      {isError && <div className={styles.errorBox}>No se pudieron cargar los permisos (¿sesión de admin?).</div>}

      {buscado && !isError && (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Recurso</th>
                <th>Acción</th>
                <th>Vigente</th>
                <th>Fecha</th>
                <th>Asignado por</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5}>Cargando…</td></tr>
              ) : permisos.length === 0 ? (
                <tr><td colSpan={5} className={styles.empty}>Sin permisos vigentes para este usuario.</td></tr>
              ) : (
                permisos.map((p) => (
                  <tr key={`${p.recurso}-${p.accion}`}>
                    <td>{p.recurso}</td>
                    <td>{p.accion}</td>
                    <td className={p.permitido ? styles.badgeOk : styles.badgeDenied}>
                      {p.permitido ? 'sí' : 'no'}
                    </td>
                    <td>{p.fecha_asignacion}</td>
                    <td>{p.asignado_por}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {buscado && (
        <form
          className={styles.form}
          style={{ marginTop: 'var(--space-lg)' }}
          onSubmit={(e) => { e.preventDefault(); asignar.mutate() }}
        >
          <div className={styles.field}>
            <label htmlFor="recurso">recurso</label>
            <input id="recurso" type="text" value={recurso} onChange={(e) => setRecurso(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="accion">acción</label>
            <input id="accion" type="text" value={accion} onChange={(e) => setAccion(e.target.value)} required />
          </div>
          <div className={`${styles.field} ${styles.checkboxField}`}>
            <input
              id="permitido"
              type="checkbox"
              checked={permitido}
              onChange={(e) => setPermitido(e.target.checked)}
            />
            <label htmlFor="permitido">permitido</label>
          </div>
          <button className={styles.button} type="submit" disabled={asignar.isPending}>
            {permitido ? 'Otorgar' : 'Revocar'}
          </button>
        </form>
      )}
    </section>
  )
}
