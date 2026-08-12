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
import { socialApi } from '@packages/social/api/social.api'
import type { MiFamilia } from '@packages/experiencia/types'
import { authApi } from '../api/auth.api'
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

const FAMILIA_QUERY_KEY = ['experiencia', 'mi-familia']
const SESIONES_QUERY_KEY = ['seguridad', 'mis-sesiones']
const MI_PERFIL_QUERY_KEY = ['seguridad', 'mi-perfil']

function fmtDateTime(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
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
      <h1 className={styles.heading}>Mi perfil</h1>

      <dl className={styles.kv}>
        <dt className={styles.kvLabel}>Email</dt>
        <dd className={styles.kvValue}>{user.email}</dd>

        <dt className={styles.kvLabel}>Tipo de cuenta</dt>
        <dd className={styles.kvValue}>{ROLE_LABEL[user.role] ?? user.role}</dd>

        <dt className={styles.kvLabel}>Miembro desde</dt>
        <dd className={styles.kvValue}>{fmtDate(user.created)}</dd>

        {user.pais && (
          <>
            <dt className={styles.kvLabel}>País</dt>
            <dd className={styles.kvValue}>{user.pais}</dd>
          </>
        )}
      </dl>

      <div className={styles.actions}>
        <button type="button" className={styles.btnGhost} onClick={() => setEditando((v) => !v)}>
          {editando ? 'Cancelar' : 'Editar perfil'}
        </button>
        <button type="button" className={styles.btnGhost} onClick={() => setCambiandoPassword((v) => !v)}>
          {cambiandoPassword ? 'Cancelar' : 'Cambiar contraseña'}
        </button>
        <Link to="/facturacion" className={styles.btnGhost}>Ver mis facturas</Link>
      </div>

      {cambiandoPassword && (
        <form className={styles.editForm} onSubmit={handleCambiarPassword} noValidate>
          <h2 className={styles.sectionTitle}>Cambiar contraseña</h2>
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
        <form className={styles.editForm} onSubmit={handleGuardar} noValidate>
          <h2 className={styles.sectionTitle}>Editar perfil</h2>
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

      <div className={styles.familiaSection}>
        <h2 className={styles.sectionTitle}>Mis sesiones</h2>
        <p className={styles.note}>Dispositivos donde tienes una sesión abierta ahora mismo.</p>

        {sesionesQuery.isLoading ? (
          <p className={styles.kvValue}>Cargando…</p>
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
                    {esActual && <span className={styles.note}> (este dispositivo)</span>}
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

      <div className={styles.familiaSection}>
        <h2 className={styles.sectionTitle}>Perfil público</h2>
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
        <div className={styles.familiaSection}>
          <h2 className={styles.sectionTitle}>Plan familiar</h2>

          {familiaQuery.isLoading ? (
            <p className={styles.kvValue}>Cargando…</p>
          ) : !familia?.suscripcion_id ? (
            <>
              <p className={styles.note}>Comparte tu plan Premium con hasta 5 personas.</p>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={crearFamilia.isPending}
                onClick={() => crearFamilia.mutate()}
              >
                {crearFamilia.isPending ? 'Creando…' : 'Crear plan familiar'}
              </button>
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

      <div className={styles.familiaSection}>
        <h2 className={styles.sectionTitle}>Mis datos personales</h2>
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

      <div className={styles.dangerZone}>
        <h2 className={styles.sectionTitle}>Dar de baja mi cuenta</h2>
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
    <div className={styles.familiaSection}>
      <h2 className={styles.sectionTitle}>Usuarios bloqueados</h2>
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
