import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ShieldCheck, Users, KeyRound, ArrowRight } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { SkeletonLoader } from '@shared/components/SkeletonLoader'
import { InfoHint } from '@shared/components/InfoHint'
import { getUser } from '@shared/lib/session'
import { esSuperadmin } from '@shared/lib/roles'
import { seguridadApi } from '../api/seguridad.api'
import { CapabilityChips } from './CapabilityChips'
import shell from './SeguridadPages.module.css'
import styles from './AdminHomePage.module.css'

// Fix QA visual S17 (docs/qa-visual-s17/15-areaswitcher-ausente-admin-finanzas.png):
// esta página pedía el catálogo completo de roles + el dashboard de salud del
// sistema sin importar quién mira, pero ambos endpoints (`/admin/roles-admin*`,
// `/admin/dashboard`) son `require_admin` — exclusivo de superadmin, correcto:
// son datos de TODAS las áreas, no solo la propia. Un admin de área (ej.
// `admin_finanzas`) recibía un 403 real y veía el banner de error rojo. La
// solución no es abrir esos endpoints — sigue siendo información que no le
// compete a un admin de área — sino no pedirlos: se detecta el rol antes de
// elegir qué llamar.
export function AdminHomePage() {
  useDocumentTitle('Seguridad')
  const user = getUser()
  const superadmin = esSuperadmin(user)

  const rolesResumen = useQuery({
    queryKey: ['seguridad', 'roles-admin', 'resumen'],
    queryFn:  () => seguridadApi.rolesAdminResumen(),
    enabled:  superadmin,
  })

  const dashboard = useQuery({
    queryKey: ['seguridad', 'dashboard'],
    queryFn:  () => seguridadApi.dashboard(),
    enabled:  superadmin,
  })

  // `GET /seguridad/mis-roles-admin`: solo pide autenticación, devuelve
  // únicamente el/los rol(es) vigentes de quien llama (mismo shape que el
  // catálogo completo, sin `usuarios_asignados` — eso sí es agregado de
  // todas las áreas).
  const misRoles = useQuery({
    queryKey: ['seguridad', 'mis-roles-admin'],
    queryFn:  () => seguridadApi.misRolesAdmin(),
    enabled:  !superadmin,
  })

  if (!superadmin) {
    const misRolesData = misRoles.data?.data ?? []
    return (
      <section className={shell.page}>
        <h1 className={shell.heading}>Seguridad</h1>
        <span className={shell.subtitle}>Tu rol administrativo y lo que puedes gestionar en esta área.</span>

        {misRoles.isError && (
          <div className={shell.errorBox}>No se pudo cargar tu rol administrativo.</div>
        )}

        {misRoles.isLoading ? (
          <SkeletonLoader count={1} height={110} />
        ) : (
          <div className={styles.roleGrid}>
            {misRolesData.map((r) => (
              <div key={r.rol_admin} className={styles.roleCard}>
                <div className={styles.roleCardHead}>
                  <span className={styles.roleName}>{r.nombre}</span>
                </div>
                <p className={styles.roleDescripcion}>{r.descripcion}</p>
                <CapabilityChips capabilities={r.capabilities} />
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  const rolesData = rolesResumen.data?.data ?? []

  return (
    <section className={shell.page}>
      <h1 className={shell.heading}>Seguridad</h1>
      <span className={shell.subtitle}>
        Roles administrativos por área, salud del sistema y accesos rápidos a la gestión de usuarios.
      </span>

      {/* Salud rápida (reusa GET /admin/dashboard, ya usado en AuditoriaPage). */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={shell.kpiValue}>
            {dashboard.isLoading ? '—' : dashboard.data?.errores_24h ?? '—'}
          </span>
          <span className={shell.kpiLabel}>Errores de sistema (24h)</span>
        </div>
        <div className={styles.statCard}>
          <span className={shell.kpiValue}>
            {dashboard.isLoading ? '—' : dashboard.data?.sesiones_abiertas_total ?? '—'}
          </span>
          <span className={shell.kpiLabel}>Sesiones abiertas ahora</span>
        </div>
        <div className={styles.statCard}>
          <span className={shell.kpiValue}>
            {rolesResumen.isLoading ? '—' : rolesData.reduce((acc, r) => acc + r.usuarios_asignados, 0)}
          </span>
          <span className={shell.kpiLabel}>
            Asignaciones de rol administrativo
            <InfoHint text="Suma de usuarios_asignados de los 6 roles — un mismo usuario con dos roles cuenta dos veces." />
          </span>
        </div>
      </div>

      {/* Accesos directos. */}
      <div className={styles.shortcutRow}>
        <Link to="/seguridad/usuarios" className={styles.shortcut}>
          <Users size={18} aria-hidden="true" />
          <span>
            <strong>Gestionar usuarios y roles</strong>
            <small>Buscar cuentas, asignar/revocar rol administrativo, suspender o reactivar.</small>
          </span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link to="/seguridad/permisos" className={styles.shortcut}>
          <KeyRound size={18} aria-hidden="true" />
          <span>
            <strong>Permisos avanzados</strong>
            <small>Ajuste puntual de un permiso (recurso, acción) para un usuario — excepciones, no el flujo principal.</small>
          </span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {/* Roles administrativos. */}
      <p className={styles.sectionHeading}>
        <ShieldCheck size={16} aria-hidden="true" />
        Roles administrativos por área
      </p>

      {rolesResumen.isError && (
        <div className={shell.errorBox}>No se pudieron cargar los roles administrativos (¿sesión de admin?).</div>
      )}

      {rolesResumen.isLoading ? (
        <SkeletonLoader count={3} height={110} />
      ) : (
        <div className={styles.roleGrid}>
          {rolesData.map((r) => (
            <div key={r.rol_admin} className={styles.roleCard}>
              <div className={styles.roleCardHead}>
                <span className={styles.roleName}>{r.nombre}</span>
                <span className={styles.roleCount}>
                  {r.usuarios_asignados} usuario{r.usuarios_asignados !== 1 ? 's' : ''}
                </span>
              </div>
              <p className={styles.roleDescripcion}>{r.descripcion}</p>
              <CapabilityChips capabilities={r.capabilities} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
