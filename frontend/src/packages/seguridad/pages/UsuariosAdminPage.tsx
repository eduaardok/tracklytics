import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { SkeletonLoader, SkeletonTableRows } from '@shared/components/SkeletonLoader'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { InfoHint } from '@shared/components/InfoHint'
import { seguridadApi } from '../api/seguridad.api'
import type { EstadoCuenta, UsuarioAdmin } from '../types'
import { CapabilityChips } from './CapabilityChips'
import shell from './SeguridadPages.module.css'
import styles from './UsuariosAdminPage.module.css'

const ROLES = ['user', 'analyst', 'admin']
const ESTADOS: EstadoCuenta[] = ['activa', 'suspendido', 'eliminado']
const PAGE_SIZE = 15

const ESTADO_CLS: Record<EstadoCuenta, string> = {
  activa:     styles.badgeActiva,
  suspendido: styles.badgeSuspendido,
  eliminado:  styles.badgeEliminado,
}

function EstadoBadge({ estado }: { estado: EstadoCuenta }) {
  return <span className={`${styles.badge} ${ESTADO_CLS[estado]}`}>{estado}</span>
}

export function UsuariosAdminPage() {
  useDocumentTitle('Usuarios')
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const reportRef = useRef<HTMLElement>(null)

  const [rol, setRol]         = useState('')
  const [estado, setEstado]   = useState('')
  const [page, setPage]       = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nuevoRol, setNuevoRol] = useState('')

  const listado = useQuery({
    queryKey: ['seguridad', 'usuarios', rol, estado, page],
    queryFn:  () => seguridadApi.usuarios({ rol, estado, page, limit: PAGE_SIZE }),
  })

  const catalogoRoles = useQuery({
    queryKey: ['seguridad', 'roles-admin'],
    queryFn:  () => seguridadApi.rolesAdmin(),
  })

  const detalle = useQuery({
    queryKey: ['seguridad', 'usuario-360', selectedId],
    queryFn:  () => seguridadApi.usuario360(selectedId as string),
    enabled:  !!selectedId,
  })

  // Los strikes llegan dentro de la vista 360°; el `?? []` cubre una respuesta
  // de backend anterior al change p2-descubrimiento-comunidad.
  const strikes = detalle.data?.strikes ?? []
  const strikesActivos = strikes.filter((s) => s.activo === 1).length

  function invalidarUsuario() {
    queryClient.invalidateQueries({ queryKey: ['seguridad', 'usuario-360', selectedId] })
    queryClient.invalidateQueries({ queryKey: ['seguridad', 'usuarios'] })
  }

  const asignarRol = useMutation({
    mutationFn: (rolAdmin: string) => seguridadApi.asignarRolAdmin(selectedId as string, rolAdmin),
    onSuccess:  () => { setNuevoRol(''); invalidarUsuario(); toast.success('Rol administrativo asignado') },
    onError:    (err) => toast.error(apiErrorMessage(err, 'No se pudo asignar el rol.')),
  })

  const revocarRol = useMutation({
    mutationFn: (rolAdmin: string) => seguridadApi.revocarRolAdmin(selectedId as string, rolAdmin),
    onSuccess:  () => { invalidarUsuario(); toast.success('Rol administrativo revocado') },
    onError:    (err) => toast.error(apiErrorMessage(err, 'No se pudo revocar el rol.')),
  })

  const suspender = useMutation({
    mutationFn: () => seguridadApi.suspenderUsuario(selectedId as string),
    onSuccess:  () => { invalidarUsuario(); toast.success('Cuenta suspendida') },
    onError:    (err) => toast.error(apiErrorMessage(err, 'No se pudo suspender la cuenta.')),
  })

  // Fix S17 (auditoría, sección 3.3): "Suspender cuenta" disparaba sin
  // confirmación — mismo patrón que `SesionesActivasPage.tsx` ("Cerrar
  // sesión").
  async function handleSuspender() {
    const nombre = d?.perfil.nombre || d?.perfil.email || 'esta cuenta'
    const ok = await confirm(
      `${nombre} perderá acceso a la plataforma de inmediato. Podrás reactivarla después.`,
      { title: 'Suspender cuenta', confirmLabel: 'Suspender cuenta', danger: true },
    )
    if (ok) suspender.mutate()
  }

  const reactivar = useMutation({
    mutationFn: () => seguridadApi.reactivarUsuario(selectedId as string),
    onSuccess:  () => { invalidarUsuario(); toast.success('Cuenta reactivada') },
    onError:    (err) => toast.error(apiErrorMessage(err, 'No se pudo reactivar la cuenta.')),
  })

  const usuarios: UsuarioAdmin[] = listado.data?.data ?? []
  const total = listado.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rolesCatalogo = catalogoRoles.data?.data ?? []
  const d = detalle.data
  // Roles del catálogo que el usuario aún no tiene, para el selector de asignación.
  const rolesDisponibles = rolesCatalogo.filter(
    (r) => !(d?.roles_admin ?? []).some((asig) => asig.rol_admin === r.rol_admin),
  )
  // Detalle del rol resaltado en el <select> (Task 2, S17): antes de confirmar
  // "Asignar" el admin necesita ver qué áreas cubre ese rol — el <select>
  // original solo mostraba `nombre`, descartando `capabilities`/`descripcion`
  // que ya trae el catálogo (GET /admin/roles-admin).
  const rolResaltado = rolesCatalogo.find((r) => r.rol_admin === nuevoRol)
  // Para el InfoHint de los chips YA asignados: cada rol del catálogo, por id.
  const catalogoPorId = new Map(rolesCatalogo.map((r) => [r.rol_admin, r]))

  return (
    <section className={shell.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={shell.heading}>Usuarios</h1>
        <ExportPDFButton targetRef={reportRef} fileName="usuarios-admin" title="Usuarios" />
      </div>
      <span className={shell.subtitle}>Gestión de cuentas, roles administrativos y estado de acceso.</span>

      <div className={styles.layout}>
        {/* ── Columna izquierda: filtros + listado ── */}
        <div>
          <div className={shell.form} data-pdf-export-ignore="true">
            <div className={shell.field}>
              <label htmlFor="f-rol">Rol</label>
              <select id="f-rol" value={rol} onChange={(e) => { setRol(e.target.value); setPage(1) }}>
                <option value="">Todos</option>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className={shell.field}>
              <label htmlFor="f-estado">Estado</label>
              <select id="f-estado" value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1) }}>
                <option value="">Todos</option>
                {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {listado.isError && (
            <div className={shell.errorBox}>No se pudieron cargar los usuarios (¿sesión de superadmin?).</div>
          )}

          <div className={shell.tableScroll}>
            <table className={shell.table}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Registro</th>
                </tr>
              </thead>
              <tbody>
                {listado.isLoading ? (
                  <SkeletonTableRows columns={5} />
                ) : usuarios.length === 0 ? (
                  <tr><td colSpan={5} className={shell.empty}>Sin usuarios que coincidan con el filtro.</td></tr>
                ) : (
                  usuarios.map((u) => (
                    <tr
                      key={u.usuario_id}
                      className={`${styles.clickableRow} ${u.usuario_id === selectedId ? styles.rowSelected : ''}`}
                      onClick={() => setSelectedId(u.usuario_id)}
                    >
                      <td>{u.nombre || '—'}</td>
                      <td>{u.email}</td>
                      <td>{u.rol}</td>
                      <td><EstadoBadge estado={u.estado_cuenta} /></td>
                      <td>{u.fecha_registro?.slice(0, 10) ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={shell.form} style={{ marginTop: 'var(--space-md)', alignItems: 'center' }} data-pdf-export-ignore="true">
              <button className={styles.ghostBtn} type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Anterior
              </button>
              <span className={shell.subtitle} style={{ margin: 0 }}>Página {page} / {totalPages} · {total} usuarios</span>
              <button className={styles.ghostBtn} type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente →
              </button>
            </div>
          )}
        </div>

        {/* ── Columna derecha: vista 360° ── */}
        {!selectedId ? (
          <div className={styles.detailEmpty}>Selecciona un usuario para ver su detalle 360°.</div>
        ) : detalle.isLoading || !d ? (
          /* S16-P11: "Cargando detalle…" plano -> panel shimmer con la altura
             aproximada del detalle 360° para que el layout no salte. */
          <div className={styles.detail}><SkeletonLoader count={6} height={16} /></div>
        ) : (
          <div className={styles.detail}>
            <div className={styles.detailHead}>
              <span className={styles.detailName}>{d.perfil.nombre || '(sin nombre)'}</span>
              <span className={styles.detailEmail}>{d.perfil.email}</span>
              <div className={styles.detailMetaRow}>
                <EstadoBadge estado={d.perfil.estado_cuenta} />
                <span className={styles.rolChip}>{d.perfil.rol}</span>
                <span className={styles.miniMuted}>{d.perfil.pais || 'país n/d'}</span>
              </div>
            </div>

            {/* Estado de cuenta */}
            <div className={styles.actionRow} data-pdf-export-ignore="true">
              {d.perfil.estado_cuenta === 'activa' ? (
                <button className={styles.dangerBtn} type="button" disabled={suspender.isPending}
                        onClick={handleSuspender}>
                  Suspender cuenta
                </button>
              ) : d.perfil.estado_cuenta === 'suspendido' ? (
                <button className={styles.ghostBtn} type="button" disabled={reactivar.isPending}
                        onClick={() => reactivar.mutate()}>
                  Reactivar cuenta
                </button>
              ) : (
                <span className={styles.miniMuted}>Cuenta dada de baja (irreversible).</span>
              )}
            </div>

            {/* Roles administrativos */}
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Roles administrativos</span>
              <div className={styles.chipRow}>
                {d.roles_admin.length === 0 && <span className={styles.miniMuted}>Sin roles asignados.</span>}
                {d.roles_admin.map((r) => {
                  const info = catalogoPorId.get(r.rol_admin)
                  return (
                    <span key={r.rol_admin} className={styles.rolChip}>
                      {r.nombre ?? r.rol_admin}
                      {/* Qué cubre este rol ya asignado, sin ocupar espacio permanente
                          (Task 2.3): decisión — un InfoHint discreto alcanza acá, un
                          panel siempre visible por cada chip ya asignado saturaría la
                          vista 360° (que además muestra suscripción/strikes/etc. debajo). */}
                      {info && (
                        <InfoHint text={`${info.descripcion} — Áreas: ${info.capabilities.join(', ')}`} />
                      )}
                      <button className={styles.rolChipRevoke} type="button" title="Revocar"
                              aria-label={`Revocar ${r.rol_admin}`} disabled={revocarRol.isPending}
                              onClick={() => revocarRol.mutate(r.rol_admin)}>×</button>
                    </span>
                  )
                })}
              </div>
              <div className={styles.actionRow} style={{ marginTop: 'var(--space-xs)' }} data-pdf-export-ignore="true">
                <div className={shell.field}>
                  <label htmlFor="nuevo-rol">Asignar rol</label>
                  <select id="nuevo-rol" value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)}
                          disabled={rolesDisponibles.length === 0}>
                    <option value="">Selecciona…</option>
                    {rolesDisponibles.map((r) => <option key={r.rol_admin} value={r.rol_admin}>{r.nombre}</option>)}
                  </select>
                </div>
                <button className={shell.button} type="button" disabled={!nuevoRol || asignarRol.isPending}
                        onClick={() => asignarRol.mutate(nuevoRol)}>
                  Asignar
                </button>
              </div>
              {/* Qué cubrirá el rol resaltado ANTES de confirmar "Asignar" (Task 2.1,
                  S17) — visible por defecto en cuanto se elige una opción, no detrás
                  de un tooltip: es justo la información que decide si asignar o no. */}
              {rolResaltado && (
                <div className={styles.rolPreview}>
                  <p className={styles.rolPreviewDescripcion}>{rolResaltado.descripcion}</p>
                  <CapabilityChips capabilities={rolResaltado.capabilities} />
                </div>
              )}
            </div>

            {/* Suscripción + último login */}
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Cuenta</span>
              <div className={styles.miniRow}>
                <span className={styles.miniMuted}>Suscripción activa</span>
                <span>{d.suscripcion_activa
                  ? `${(d.suscripcion_activa.tipo_plan as string) ?? 'sí'} · ${(d.suscripcion_activa.estado as string) ?? ''}`
                  : '—'}</span>
              </div>
              <div className={styles.miniRow}>
                <span className={styles.miniMuted}>Último acceso</span>
                <span>{d.ultimo_login ? String(d.ultimo_login).slice(0, 16).replace('T', ' ') : '—'}</span>
              </div>
              <div className={styles.miniRow}>
                <span className={styles.miniMuted}>Sesiones activas</span>
                <span>{d.sesiones_activas.length}</span>
              </div>
              <div className={styles.miniRow}>
                <span className={styles.miniMuted}>Permisos vigentes</span>
                <span>{d.permisos.length}</span>
              </div>
            </div>

            {/* Historial de sanciones (change p2-descubrimiento-comunidad):
                el contexto de por qué una cuenta está suspendida es lo primero
                que necesita un moderador al abrir la ficha. */}
            <div className={styles.section}>
              <span className={styles.sectionTitle}>
                Strikes
                {strikesActivos > 0 && (
                  <span className={`${styles.badge} ${styles.badgeSuspendido}`}>
                    {strikesActivos} activo{strikesActivos !== 1 ? 's' : ''}
                  </span>
                )}
              </span>
              {strikes.length === 0 ? (
                <span className={styles.miniMuted}>Sin sanciones registradas.</span>
              ) : (
                strikes.map((s) => (
                  <div key={s.strike_id} className={styles.miniRow}>
                    <span className={styles.miniMuted}>
                      {String(s.created_at).slice(0, 10)} · {s.origen_tipo}
                    </span>
                    <span className={s.activo === 1 ? undefined : styles.miniMuted}>
                      {s.motivo}{s.activo === 1 ? '' : ' (revocado)'}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Transacciones recientes */}
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Transacciones recientes</span>
              {d.transacciones.length === 0 ? (
                <span className={styles.miniMuted}>Sin transacciones.</span>
              ) : (
                d.transacciones.slice(0, 5).map((t) => (
                  <div key={t.transaccion_id} className={styles.miniRow}>
                    <span className={styles.miniMuted}>{String(t.fecha).slice(0, 10)} · {t.estado}</span>
                    <span>{t.monto} {t.moneda}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
