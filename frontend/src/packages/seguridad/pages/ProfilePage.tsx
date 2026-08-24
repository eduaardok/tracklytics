import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUser } from '@shared/lib/session'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
// Import directo, no vía los barrels de `distribucion`/`experiencia`
// (arrastrarían DistribucionAdminPage/TicketsAdminPage —con Recharts— al
// bundle principal; ProfilePage es una ruta B2C eager — ver router.tsx).
import { distribucionApi } from '@packages/distribucion/api/distribucion.api'
import type { Pais } from '@packages/distribucion/types'
import { usePlanActivo } from '@packages/suscripciones'
import { experienciaApi } from '@packages/experiencia/api/experiencia.api'
// Import directo, no vía el barrel `@packages/social` (arrastraría
// ModeracionSocialPage con Recharts al bundle principal — ver router.tsx).
// El componente de preferencias es archivo propio sin Recharts: import directo
// seguro para una ruta eager.
import { socialApi } from '@packages/social/api/social.api'
import { PreferenciasNotificacion } from '@packages/social/components/PreferenciasNotificacion'
import type { MiFamilia } from '@packages/experiencia/types'
import { AlertTriangle, Ban, Bell, Download, Globe, ShieldCheck, Smartphone, User, Users } from 'lucide-react'
import { EmptyState } from '@shared/components/EmptyState'
import { ROL_LABELS, rolesDeUsuario } from '@shared/lib/roles'
import { authApi } from '../api/auth.api'
import { SkeletonLoader } from '@shared/components/SkeletonLoader'
import styles from './ProfilePage.module.css'

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

const ROLE_LABEL: Record<string, string> = {
  user:    'Cliente B2C',
  analyst: 'Cliente B2B',
  admin:   'Staff interno',
}

// S16-P12: el chip de rol del hero no puede decir "Cliente B2C" a un
// superadmin/admin_* de área (su `role` crudo de PocketBase es "user"; el
// rol real viaja en `rolesAdmin` por BRIDGE — mismas tablas que RoleBadge).
function rolDelHero(user: NonNullable<ReturnType<typeof getUser>>): string {
  if (user.esAdmin) {
    const rol = rolesDeUsuario(user)[0]
    return (rol && ROL_LABELS[rol]) || 'Staff interno'
  }
  return ROLE_LABEL[user.role] ?? user.role
}
const FAMILIA_QUERY_KEY = ['experiencia', 'mi-familia']
const SESIONES_QUERY_KEY = ['seguridad', 'mis-sesiones']
const MI_PERFIL_QUERY_KEY = ['seguridad', 'mi-perfil']

function fmtDateTime(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

// Iniciales para el avatar del hero (máx. 2 letras, como los avatares de
// iniciales de cualquier app sin foto de perfil).
function iniciales(nombre: string | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'U'
  return partes.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}

// Editar perfil (nombre + país) y plan familiar en autoservicio (CU-O51/52/53)
// — antes esta página era de solo lectura porque `PATCH /perfil` y los
// endpoints self-service de familia no existían; el cambio 2026-07-09 los
// agregó pero solo se conectó desde app/autenticacion/profile.html (legacy),
// nunca desde aquí (auditoría de consolidación a React).
export function ProfilePage() {
  useDocumentTitle('Mi perfil')
  const user = getUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { tipoPlan } = usePlanActivo()

  const [descargando, setDescargando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre]     = useState(user?.name ?? '')
  const [pais, setPais]         = useState(user?.pais ?? '')
  const [paises, setPaises]     = useState<Pais[]>([])
  const [email, setEmailNuevo]  = useState('')

  const [cambiandoPassword, setCambiandoPassword] = useState(false)
  const [passwordActual, setPasswordActual]       = useState('')
  const [passwordNueva, setPasswordNueva]         = useState('')
  const [passwordConfirmar, setPasswordConfirmar] = useState('')
  const [passwordMismatch, setPasswordMismatch]   = useState(false)

  useEffect(() => {
    distribucionApi.paisesPublico().then((res) => setPaises(res.data ?? [])).catch(() => setPaises([]))
  }, [])

  const guardarPerfil = useMutation({
    mutationFn: () => authApi.actualizarPerfil({ nombre: nombre.trim(), pais: pais || undefined }),
    onSuccess:  () => {
      setEditando(false)
      toast.success('Perfil actualizado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar el perfil.')),
  })

  const cambiarPassword = useMutation({
    mutationFn: () => authApi.cambiarPassword({ passwordActual, passwordNueva, passwordNuevaConfirmar: passwordConfirmar }),
    onSuccess: () => {
      // No colapsa el formulario aquí: hacerlo desmontaría el mensaje de
      // éxito en el mismo update, así que nunca llegaba a verse (encontrado
      // en verificación con Playwright) — el usuario lo cierra manualmente.
      setPasswordActual('')
      setPasswordNueva('')
      setPasswordConfirmar('')
      toast.success('Contraseña actualizada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cambiar la contraseña.')),
  })

  function handleCambiarPassword(e: FormEvent) {
    e.preventDefault()
    if (!passwordActual || passwordNueva.length < 8 || passwordConfirmar.length < 8) {
      setPasswordMismatch(false)
      toast.error('Completa la contraseña actual y una nueva de al menos 8 caracteres.')
      return
    }
    if (passwordNueva !== passwordConfirmar) {
      setPasswordMismatch(true)
      return
    }
    setPasswordMismatch(false)
    cambiarPassword.mutate()
  }

  const familiaQuery = useQuery({
    queryKey: FAMILIA_QUERY_KEY,
    queryFn:  () => experienciaApi.miPlanFamiliar(),
    enabled:  tipoPlan === 'premium',
  })
  const familia: MiFamilia | null = familiaQuery.data ?? null

  const crearFamilia = useMutation({
    mutationFn: () => experienciaApi.crearMiPlanFamiliar(),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: FAMILIA_QUERY_KEY })
      toast.success('Plan familiar creado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear el plan familiar.')),
  })

  const agregarMiembro = useMutation({
    mutationFn: () => experienciaApi.agregarMiMiembro(email.trim()),
    onSuccess: () => {
      setEmailNuevo('')
      queryClient.invalidateQueries({ queryKey: FAMILIA_QUERY_KEY })
      toast.success('Miembro agregado al plan familiar')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo agregar el miembro.')),
  })

  const quitarMiembro = useMutation({
    mutationFn: (usuarioId: string) => experienciaApi.quitarMiMiembro(usuarioId),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: FAMILIA_QUERY_KEY })
      toast.success('Miembro quitado del plan familiar')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo quitar al miembro.')),
  })

  const sesionesQuery = useQuery({
    queryKey: SESIONES_QUERY_KEY,
    queryFn:  () => authApi.misSesiones(),
  })
  const miDispositivoId = authApi.miDispositivoId()

  const cerrarSesion = useMutation({
    mutationFn: (sesionId: string) => authApi.cerrarSesionRemota(sesionId),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: SESIONES_QUERY_KEY })
      toast.success('Sesión cerrada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cerrar la sesión.')),
  })

  // FASE 2 (Prompt 10): cierre masivo, preserva la sesión actual.
  const cerrarOtrasSesiones = useMutation({
    mutationFn: () => authApi.cerrarOtrasSesiones(),
    onSuccess:  (res) => {
      queryClient.invalidateQueries({ queryKey: SESIONES_QUERY_KEY })
      toast.success(res.sesiones_cerradas > 0 ? `${res.sesiones_cerradas} sesión(es) cerrada(s)` : 'No había otras sesiones abiertas')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudieron cerrar las demás sesiones.')),
  })

  // Perfiles públicos/privados (S10 ronda 2): `perfil_publico` no vive en
  // SessionUser (exclusivo de DIM_USUARIO) — necesita su propia consulta,
  // no se puede leer de `getUser()` como nombre/país/rol.
  const miPerfilQuery = useQuery({
    queryKey: MI_PERFIL_QUERY_KEY,
    queryFn:  () => authApi.miPerfil(),
  })

  const toggleVisibilidad = useMutation({
    mutationFn: (perfilPublico: boolean) => authApi.actualizarPerfil({ perfilPublico }),
    onSuccess: (_res, perfilPublico) => {
      queryClient.invalidateQueries({ queryKey: MI_PERFIL_QUERY_KEY })
      toast.success(perfilPublico ? 'Tu perfil ahora es público' : 'Tu perfil ahora es privado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cambiar la visibilidad de tu perfil.')),
  })

  // Baja de cuenta propia (change roles-gestion-usuarios): irreversible —
  // invalida sesiones, cancela la suscripción activa y bloquea el login
  // posterior. Tras la respuesta se limpia la sesión local y se redirige.
  const darDeBaja = useMutation({
    mutationFn: () => authApi.bajaCuenta(),
    onSuccess:  () => {
      toast.success('Tu cuenta ha sido dada de baja')
      navigate('/login', { replace: true })
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo dar de baja la cuenta.')),
  })

  async function handleDarDeBaja() {
    // Confirmación doble: la primera advierte, la segunda pide confirmación
    // explícita de una acción irreversible.
    const paso1 = await confirm('¿Estás seguro de que quieres dar de baja tu cuenta?', {
      danger: true, confirmLabel: 'Continuar',
    })
    if (!paso1) return
    const paso2 = await confirm(
      'Esta acción es IRREVERSIBLE: perderás el acceso, se cerrarán tus sesiones y se cancelará tu suscripción. ¿Confirmas la baja definitiva?',
      { danger: true, confirmLabel: 'Sí, dar de baja' },
    )
    if (paso2) darDeBaja.mutate()
  }

  // Descarga de datos personales (change p2-descubrimiento-comunidad). El JSON
  // se materializa como blob y se descarga desde el cliente: el endpoint es
  // autenticado por header, así que un <a href> directo no serviría.
  async function handleDescargarDatos() {
    setDescargando(true)
    try {
      const datos = await authApi.misDatos()
      const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tracklytics-mis-datos-${datos.generado_en.slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Descarga lista')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudieron descargar tus datos.'))
    } finally {
      setDescargando(false)
    }
  }

  if (!user) return null

  function handleGuardar(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    guardarPerfil.mutate()
  }

  function handleAgregarMiembro(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    agregarMiembro.mutate()
  }

  return (
    <section className={styles.page}>
      {/* Hero de identidad (S16-P8): avatar de iniciales, badges de rol/plan
          y las stats del viejo <dl> comprimidas a un vistazo. */}
      <header className={styles.hero}>
        <span className={styles.avatar} aria-hidden="true">{iniciales(user.name)}</span>
        <div className={styles.heroId}>
          <h1 className={styles.heroNombre}>{user.name || 'Usuario'}</h1>
          <span className={styles.heroEmail}>{user.email}</span>
          <div className={styles.chipsRow}>
            <span className={styles.rolChip}>{rolDelHero(user)}</span>
            {/* El staff no tiene plan (acceso completo sin pagar) — mostrar
                "Plan free"/"Plan admin" sería un residuo del flujo B2C. */}
            {!user.esAdmin && <span className={styles.planChip}>Plan {tipoPlan}</span>}
          </div>
        </div>
        <div className={styles.heroStats}>
          <span className={styles.statTile}>
            <span className={styles.statValor}>{fmtDate(user.created)}</span>
            <span className={styles.statEtiqueta}>Miembro desde</span>
          </span>
          {user.pais && (
            <span className={styles.statTile}>
              <span className={styles.statValor}>{user.pais}</span>
              <span className={styles.statEtiqueta}>País</span>
            </span>
          )}
        </div>
      </header>

      <div className={styles.actions} style={{ animationDelay: '60ms' }}>
        <button type="button" className={styles.btnGhost} onClick={() => setEditando((v) => !v)}>
          {editando ? 'Cancelar' : 'Editar perfil'}
        </button>
        <button type="button" className={styles.btnGhost} onClick={() => setCambiandoPassword((v) => !v)}>
          {cambiandoPassword ? 'Cancelar' : 'Cambiar contraseña'}
        </button>
        <Link to="/suscripciones?tab=facturacion" className={styles.btnGhost}>Ver mis facturas</Link>
      </div>

      {cambiandoPassword && (
        <form className={styles.editForm} style={{ animationDelay: '80ms' }} onSubmit={handleCambiarPassword} noValidate>
          <h2 className={styles.sectionTitle}><ShieldCheck size={17} aria-hidden="true" /> Cambiar contraseña</h2>
          {cambiarPassword.isError && (
            <p className={styles.formError} role="alert">
              {apiErrorMessage(cambiarPassword.error, 'No se pudo cambiar la contraseña.')}
            </p>
          )}
          {passwordMismatch && (
            <p className={styles.formError} role="alert">Las contraseñas nuevas no coinciden.</p>
          )}
          {cambiarPassword.isSuccess && <p className={styles.formOk}>Contraseña actualizada.</p>}

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="pw-actual">Contraseña actual</label>
            <input
              id="pw-actual"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={passwordActual}
              onChange={(e) => setPasswordActual(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="pw-nueva">Contraseña nueva</label>
            <input
              id="pw-nueva"
              className={styles.input}
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={passwordNueva}
              onChange={(e) => { setPasswordNueva(e.target.value); setPasswordMismatch(false) }}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="pw-confirmar">Confirmar contraseña nueva</label>
            <input
              id="pw-confirmar"
              className={styles.input}
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={passwordConfirmar}
              onChange={(e) => { setPasswordConfirmar(e.target.value); setPasswordMismatch(false) }}
              required
            />
          </div>

          <button type="submit" className={styles.btnPrimary} disabled={cambiarPassword.isPending}>
            {cambiarPassword.isPending ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      )}

      {editando && (
        <form className={styles.editForm} style={{ animationDelay: '80ms' }} onSubmit={handleGuardar} noValidate>
          <h2 className={styles.sectionTitle}><User size={17} aria-hidden="true" /> Editar perfil</h2>
          {guardarPerfil.isError && (
            <p className={styles.formError} role="alert">No se pudo actualizar el perfil.</p>
          )}
          {guardarPerfil.isSuccess && <p className={styles.formOk}>Perfil actualizado.</p>}

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="edit-nombre">Nombre</label>
            <input
              id="edit-nombre"
              className={styles.input}
              type="text"
              maxLength={150}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="edit-pais">País</label>
            <select
              id="edit-pais"
              className={styles.input}
              value={pais}
              onChange={(e) => setPais(e.target.value)}
            >
              <option value="">Selecciona tu país…</option>
              {paises.map((p) => (
                <option key={p.pais_id} value={p.codigo_iso}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <button type="submit" className={styles.btnPrimary} disabled={guardarPerfil.isPending}>
            {guardarPerfil.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      )}

      <div className={styles.familiaSection} style={{ animationDelay: '120ms' }}>
        <h2 className={styles.sectionTitle}><Smartphone size={17} aria-hidden="true" /> Mis sesiones</h2>
        <p className={styles.note}>Dispositivos donde tienes una sesión abierta ahora mismo.</p>

        {(sesionesQuery.data?.data ?? []).length > 1 && (
          <button
            type="button"
            className={styles.btnGhost}
            disabled={cerrarOtrasSesiones.isPending}
            onClick={async () => {
              const ok = await confirm(
                'Se cerrarán todas tus sesiones abiertas en otros dispositivos. Este dispositivo no se verá afectado.',
                { confirmLabel: 'Cerrar todas las demás' },
              )
              if (ok) cerrarOtrasSesiones.mutate()
            }}
          >
            Cerrar todas las demás sesiones
          </button>
        )}

        {sesionesQuery.isLoading ? (
          <SkeletonLoader count={1} height={12} />
        ) : sesionesQuery.isError ? (
          <p className={styles.formError}>No se pudieron cargar tus sesiones.</p>
        ) : (
          <div className={styles.familiaMiembros}>
            {(sesionesQuery.data?.data ?? []).map((s) => {
              const esActual = s.dispositivo_id === miDispositivoId
              return (
                <div key={s.sesion_id} className={styles.familiaMiembroRow}>
                  <span>
                    {s.tipo ?? 'Dispositivo'} · {s.os ?? 'SO desconocido'} · {fmtDateTime(s.fecha_inicio)}
                    {esActual && <span className={styles.badgeEsteDispositivo}>Este dispositivo</span>}
                  </span>
                  {!esActual && (
                    <button
                      type="button"
                      className={styles.btnGhost}
                      disabled={cerrarSesion.isPending}
                      onClick={async () => {
                        const ok = await confirm('¿Cerrar esta sesión en el otro dispositivo?', { confirmLabel: 'Cerrar sesión' })
                        if (ok) cerrarSesion.mutate(s.sesion_id)
                      }}
                    >
                      Cerrar sesión
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {cerrarSesion.isError && <p className={styles.formError}>No se pudo cerrar esa sesión.</p>}
      </div>

      <div className={styles.familiaSection} style={{ animationDelay: '160ms' }}>
        <h2 className={styles.sectionTitle}><Globe size={17} aria-hidden="true" /> Perfil público</h2>
        <p className={styles.note}>
          {miPerfilQuery.data?.perfil_publico
            ? 'Tu perfil es visible para cualquiera, con tus playlists marcadas como públicas.'
            : 'Tu perfil es privado — solo tú puedes verlo.'}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={toggleVisibilidad.isPending || miPerfilQuery.isLoading}
            onClick={() => toggleVisibilidad.mutate(!miPerfilQuery.data?.perfil_publico)}
          >
            {miPerfilQuery.data?.perfil_publico ? 'Hacer privado' : 'Hacer público'}
          </button>
          <Link to={`/usuarios/${user.id}`} className={styles.btnGhost}>Ver mi perfil público</Link>
        </div>
      </div>

      {tipoPlan === 'premium' && (
        <div className={styles.familiaSection} style={{ animationDelay: '200ms' }}>
          <h2 className={styles.sectionTitle}><Users size={17} aria-hidden="true" /> Plan familiar</h2>

          {familiaQuery.isLoading ? (
            <SkeletonLoader count={1} height={12} />
          ) : !familia?.suscripcion_id ? (
            <>
              <EmptyState
                icon={<Users size={28} />}
                title="Todavía no tienes un plan familiar"
                body="Comparte tu plan Premium con hasta 5 personas y todas disfrutan de la experiencia sin anuncios."
                actionLabel={crearFamilia.isPending ? 'Creando…' : 'Crear plan familiar'}
                onAction={() => { if (!crearFamilia.isPending) crearFamilia.mutate() }}
              />
              {crearFamilia.isError && <p className={styles.formError}>No se pudo crear el plan familiar.</p>}
            </>
          ) : (
            <>
              <p className={styles.note}>{familia.total}/{familia.limite} miembros</p>

              <div className={styles.familiaMiembros}>
                {familia.data.map((m) => (
                  <div key={m.usuario_id} className={styles.familiaMiembroRow}>
                    <span>
                      {m.nombre || m.usuario_id}
                      {!!m.es_titular && <span className={styles.note}> (titular)</span>}
                    </span>
                    {familia.es_titular && !m.es_titular && (
                      <button
                        type="button"
                        className={styles.btnGhost}
                        disabled={quitarMiembro.isPending}
                        onClick={async () => {
                          const ok = await confirm('¿Quitar a este miembro del plan familiar?', { danger: true, confirmLabel: 'Quitar' })
                          if (ok) quitarMiembro.mutate(m.usuario_id)
                        }}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {familia.es_titular ? (
                <form className={styles.familiaAddForm} onSubmit={handleAgregarMiembro} noValidate>
                  <input
                    className={styles.input}
                    type="email"
                    placeholder="Correo del nuevo miembro"
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmailNuevo(e.target.value)}
                  />
                  <button type="submit" className={styles.btnPrimary} disabled={agregarMiembro.isPending}>
                    {agregarMiembro.isPending ? 'Agregando…' : 'Agregar'}
                  </button>
                </form>
              ) : (
                <p className={styles.note}>Solo el titular puede agregar o quitar miembros.</p>
              )}
              {agregarMiembro.isError && <p className={styles.formError}>No se pudo agregar el miembro.</p>}
            </>
          )}
        </div>
      )}

      {/* Usuarios bloqueados y descarga de datos (change
          p2-descubrimiento-comunidad): ambos son control del usuario sobre su
          propia cuenta, así que van justo antes de la zona de baja. */}
      <UsuariosBloqueadosSection />

      {/* Preferencias de notificación como sección de cuenta (S16-P10): el
          mismo ajuste vivía solo dentro del panel de la campanita — un ajuste
          persistente pertenece al perfil. Componente compartido con la
          campana: cambiar un switch en cualquiera de los dos lugares se
          refleja en el otro (misma query key). */}
      <div className={styles.familiaSection} style={{ animationDelay: '230ms' }}>
        <h2 className={styles.sectionTitle}><Bell size={17} aria-hidden="true" /> Notificaciones</h2>
        <p className={styles.note}>
          Elige qué quieres que te avisemos. Puedes volver a activarlos cuando quieras.
        </p>
        <PreferenciasNotificacion />
      </div>

      <div className={styles.familiaSection} style={{ animationDelay: '240ms' }}>
        <h2 className={styles.sectionTitle}><Download size={17} aria-hidden="true" /> Mis datos personales</h2>
        <p className={styles.note}>
          Descarga un archivo con todo lo que Tracklytics guarda sobre ti: perfil,
          pagos, favoritos, playlists, historial, comentarios y denuncias.
        </p>
        <button
          type="button"
          className={styles.btnGhost}
          disabled={descargando}
          onClick={handleDescargarDatos}
        >
          {descargando ? 'Preparando…' : 'Descargar mis datos'}
        </button>
      </div>

      {/* Una cuenta con capacidad administrativa (superadmin o cualquiera de
          los 6 roles de área) no puede darse de baja a sí misma — el backend
          ya lo rechaza con 403 (`POST /perfil/baja`), esto solo evita
          ofrecer una acción que siempre va a fallar y que además borraría el
          acceso administrativo de quien la ve por accidente. */}
      {!user.esAdmin && (
        <div className={styles.dangerZone} style={{ animationDelay: '280ms' }}>
          <h2 className={styles.sectionTitle}><AlertTriangle size={17} aria-hidden="true" /> Dar de baja mi cuenta</h2>
          <p className={styles.note}>
            Perderás el acceso, se cerrarán todas tus sesiones y se cancelará tu suscripción activa.
            Esta acción es irreversible.
          </p>
          <button
            type="button"
            className={styles.btnDanger}
            disabled={darDeBaja.isPending}
            onClick={handleDarDeBaja}
          >
            {darDeBaja.isPending ? 'Procesando…' : 'Dar de baja mi cuenta'}
          </button>
        </div>
      )}
    </section>
  )
}

/**
 * Lista de usuarios bloqueados con opción de desbloquear (change
 * p2-descubrimiento-comunidad).
 *
 * La sección se oculta por completo cuando no hay nadie bloqueado: un apartado
 * permanentemente vacío en el perfil solo añade ruido a una página que ya es
 * larga.
 */
function UsuariosBloqueadosSection() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const bloqueados = useQuery({
    queryKey: ['social', 'mis-bloqueados'],
    queryFn:  () => socialApi.misBloqueados(),
  })

  const desbloquear = useMutation({
    mutationFn: (usuarioId: string) => socialApi.desbloquear(usuarioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social'] })
      toast.success('Usuario desbloqueado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo desbloquear al usuario.')),
  })

  const lista = bloqueados.data?.data ?? []
  if (lista.length === 0) return null

  return (
    <div className={styles.familiaSection} style={{ animationDelay: '220ms' }}>
      <h2 className={styles.sectionTitle}><Ban size={17} aria-hidden="true" /> Usuarios bloqueados</h2>
      <p className={styles.note}>
        No ves sus comentarios y no pueden responder a los tuyos.
      </p>
      <div className={styles.familiaMiembros}>
        {lista.map((u) => (
          <div key={u.usuario_id} className={styles.familiaMiembroRow}>
            <span>{u.nombre || `Usuario ${u.usuario_id.slice(0, 6)}`}</span>
            <button
              type="button"
              className={styles.btnGhost}
              disabled={desbloquear.isPending}
              onClick={() => desbloquear.mutate(u.usuario_id)}
            >
              Desbloquear
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
