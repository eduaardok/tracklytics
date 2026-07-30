import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { UserPicker, type UserSearchResult } from '@shared/components/UserPicker'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import { EmptyState } from '@shared/components/EmptyState'
import { seguridadApi } from '../api/seguridad.api'
import type { Permiso } from '../types'
import styles from './SeguridadPages.module.css'

export function PermisosPage() {
  useDocumentTitle('Permisos')
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null)
  const [recurso, setRecurso]       = useState('')
  const [accion, setAccion]         = useState('')
  const [permitido, setPermitido]   = useState(true)

  const queryClient = useQueryClient()
  const toast = useToast()
  const buscado = selectedUser?.usuario_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'permisos', buscado],
    queryFn:  () => seguridadApi.permisos(buscado),
    enabled:  buscado.length > 0,
  })

  // Catálogo de recursos/acciones conocidos (`_RECURSOS_CONOCIDOS`/
  // `_ACCIONES_CONOCIDAS` en el backend) — reemplaza los inputs de texto
  // libre de abajo, que antes permitían crear permisos con typos que nunca
  // matcheaban ningún `PERMISO_VIGENTE_UNO` real.
  const catalogo = useQuery({
    queryKey: ['seguridad', 'permisos', 'catalogo'],
    queryFn:  () => seguridadApi.catalogoPermisos(),
  })
  const recursos = catalogo.data?.recursos ?? []
  const acciones = catalogo.data?.acciones ?? []

  const asignar = useMutation({
    mutationFn: () => seguridadApi.asignarPermiso({ usuario_id: buscado, recurso, accion, permitido }),
    onSuccess: () => {
      setRecurso('')
      setAccion('')
      queryClient.invalidateQueries({ queryKey: ['seguridad', 'permisos', buscado] })
      toast.success(permitido ? 'Permiso otorgado' : 'Permiso revocado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar el permiso.')),
  })

  const permisos: Permiso[] = data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Permisos</h1>

      <div className={styles.form}>
        <UserPicker
          label="Usuario"
          selected={selectedUser}
          onSelect={setSelectedUser}
          onClear={() => setSelectedUser(null)}
        />
      </div>

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
                <SkeletonTableRows columns={5} />
              ) : permisos.length === 0 ? (
                <tr><td colSpan={5}><EmptyState icon="( ∅ )" title="Sin permisos vigentes para este usuario." /></td></tr>
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
          onSubmit={(e) => {
            e.preventDefault()
            if (!recurso.trim() || !accion.trim()) {
              toast.error('Completa recurso y acción.')
              return
            }
            asignar.mutate()
          }}
          noValidate
        >
          <div className={styles.field}>
            <label htmlFor="recurso">Recurso</label>
            <select
              id="recurso"
              value={recurso}
              onChange={(e) => setRecurso(e.target.value)}
              required
              disabled={catalogo.isLoading}
            >
              <option value="" disabled>Selecciona…</option>
              {recursos.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="accion">Acción</label>
            <select
              id="accion"
              value={accion}
              onChange={(e) => setAccion(e.target.value)}
              required
              disabled={catalogo.isLoading}
            >
              <option value="" disabled>Selecciona…</option>
              {acciones.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="permitido">Acceso</label>
            <select
              id="permitido"
              value={permitido ? 'otorgar' : 'revocar'}
              onChange={(e) => setPermitido(e.target.value === 'otorgar')}
            >
              <option value="otorgar">Otorgar acceso</option>
              <option value="revocar">Revocar acceso</option>
            </select>
          </div>
          <button className={styles.button} type="submit" disabled={asignar.isPending}>
            {permitido ? 'Otorgar' : 'Revocar'}
          </button>
        </form>
      )}
    </section>
  )
}
