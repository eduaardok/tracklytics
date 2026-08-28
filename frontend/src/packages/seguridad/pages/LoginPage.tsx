import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { isAuthenticated } from '@shared/lib/session'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage, esErrorDeRed } from '@shared/lib/api-client'
import { landingPostLogin } from '@shared/lib/roles'
import { resolverDestinoPostAuth } from '@packages/suscripciones/api/suscripciones.api'
import { ThemeToggle } from '@shared/components/ThemeToggle'
import { usePlayer, type PlayableTrack } from '@shared/context/PlayerContext'
import { authApi } from '../api/auth.api'
import { AuthHero, AuthBrand } from './AuthHero'
import styles from './AuthPages.module.css'

type Modo = 'login' | 'recuperar' | 'restablecer'

// Acceso rápido de demo (S16 prompt 09) — SOLO para agilizar la grabación de
// los videos, no es un patrón de producción: la contraseña de estas cuentas
// demo es pública (`docs/CUENTAS_DEMO.md`, `seed_cuentas_demo.py`,
// `SUPERADMIN_DEMO_PASSWORD` con default `Demo12345!`), así que exponerla acá
// no agrega ningún riesgo nuevo — ya es de conocimiento público en el repo.
// Colapsado por defecto (oculto hasta que alguien lo abre a propósito).
//
// Curada (S17, seguimiento de "que se vea el porcentaje"): de las 10 cuentas
// que sigue sembrando `seed_cuentas_demo.py`, acá solo quedan las que cuentan
// una historia distinta de PRODUCTO frente a un visitante (B2C, artista,
// sello, cliente B2B, superadmin) — no las 5 cuentas `admin_*` de área
// (finanzas/contenido/comunidad/datos/comercial), que son granularidad de
// RBAC interno (útiles para QA de permisos, no para una demo de producto) y
// siguen existiendo y logueables a mano con la misma contraseña si hace falta
// mostrar ese detalle.
const DEMO_PASSWORD = 'Demo12345!'
const CUENTAS_DEMO: { email: string; label: string }[] = [
  { email: 'usuario@demo.tracklytics.com',      label: 'Usuario (B2C)' },
  { email: 'artista_demo@demo.tracklytics.com', label: 'Artista' },
  { email: 'sello_demo@demo.tracklytics.com',   label: 'Sello discográfico' },
  { email: 'analyst@demo.tracklytics.com',      label: 'Cliente B2B' },
  { email: 'superadmin@demo.tracklytics.com',   label: 'Superadmin' },
]

type LoginState = { from?: { pathname: string; search: string }; playIntent?: PlayableTrack }

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { play } = usePlayer()
  const { from, playIntent } = (location.state as LoginState | null) ?? {}
  useDocumentTitle(playIntent ? 'Inicia sesión para reproducir' : 'Iniciar sesión')
  const [modo, setModo]         = useState<Modo>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken]           = useState('')
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [info, setInfo]         = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [quickLoginOpen, setQuickLoginOpen] = useState(false)

  if (isAuthenticated()) return <Navigate to="/" replace />

  async function performLogin(emailValue: string, passwordValue: string) {
    setError(null)
    setSubmitting(true)
    try {
      const usuario = await authApi.login(emailValue, passwordValue)
      // Retoma la reproducción que se interrumpió por falta de sesión
      // (rediseño de login contextual) — el `playIntent` viaja desde el
      // modal de `AuthPromptContext`, ver PlayerContext.tsx `play()`. Se
      // dispara antes de navegar, sesión ya establecida por `authApi.login`
      // (`setSession` corre de forma síncrona antes de que la promesa
      // resuelva), así que `play()` no vuelve a chocar con el gate de
      // autenticación.
      if (playIntent) play(playIntent)
      const destino = await resolverDestinoPostAuth(usuario.role)
      if (destino.onboarding) {
        // B2B sin plan activo: onboarding manda siempre, sin importar a dónde
        // intentaba llegar el usuario (mismo criterio que el legacy) — ni
        // siquiera una cuenta admin/analyst con landing propia se salta esto,
        // no aplica de todos modos (solo 'user'/'analyst' entran acá con
        // onboarding=true, ver resolverDestinoPostAuth).
        navigate(`${destino.path}?onboarding=1`, { replace: true })
      } else {
        // Landing por rol (Fase 4.2, S14-FINAL): admin/analyst YA resueltos
        // (sin onboarding pendiente) aterrizan en su panel principal en vez
        // del catálogo B2C genérico que devuelve `resolverDestinoPostAuth`
        // por defecto para cualquier rol staff.
        const landingRol = landingPostLogin(usuario)
        navigate(from ? `${from.pathname}${from.search}` : (landingRol ?? destino.path), { replace: true })
      }
    } catch (err) {
      // Un fallo de RED (el navegador no pudo ni siquiera contactar al
      // servidor) es distinto de credenciales inválidas — antes ambos casos
      // mostraban el mismo "Correo o contraseña incorrectos", lo que hacía
      // parecer un problema de login cuando en realidad era de conectividad
      // (ej. entrando desde otro dispositivo en la LAN que no alcanza el
      // backend). Se distingue primero para no enmascararlo.
      if (esErrorDeRed(err)) {
        setError('No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.')
      } else {
        // Muestra el detalle del backend cuando lo hay: lockout (429) y cuenta
        // suspendida/dada de baja (403) traen un mensaje específico; el resto cae
        // al genérico de credenciales.
        setError(apiErrorMessage(err, 'Correo o contraseña incorrectos'))
      }
      setSubmitting(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Completa correo y contraseña.')
      return
    }
    await performLogin(email, password)
  }

  function handleQuickLogin(demoEmail: string) {
    setEmail(demoEmail)
    setPassword(DEMO_PASSWORD)
    void performLogin(demoEmail, DEMO_PASSWORD)
  }

  async function handleRecuperar(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Ingresa tu correo.'); return }
    setError(null); setInfo(null); setSubmitting(true)
    try {
      const resp = await authApi.recuperarPassword(email)
      // Entorno de demostración: no hay envío real de correo, así que el
      // token viaja en la propia respuesta (cuando el email existe) y se
      // precarga acá — mismo criterio que el banner de verificación de
      // email. Antes este flujo generaba el token en el backend pero nunca
      // lo mostraba en ningún lado, dejándolo imposible de completar.
      if (resp.token_recuperacion) {
        setToken(resp.token_recuperacion)
        setInfo(`${resp.mensaje} — entorno de demostración: no se envía correo real, tu token ya quedó cargado abajo.`)
      } else {
        setInfo(resp.mensaje)
      }
      setModo('restablecer')
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo procesar la solicitud.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRestablecer(e: FormEvent) {
    e.preventDefault()
    if (!token.trim() || nuevaPassword.length < 8) {
      setError('Ingresa el token y una contraseña de al menos 8 caracteres.'); return
    }
    setError(null); setSubmitting(true)
    try {
      await authApi.restablecerPassword(token.trim(), nuevaPassword)
      setInfo('Contraseña actualizada. Ya puedes iniciar sesión.')
      setModo('login'); setPassword(''); setToken(''); setNuevaPassword('')
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo restablecer la contraseña.'))
    } finally {
      setSubmitting(false)
    }
  }

  function volverALogin() {
    setModo('login'); setError(null); setInfo(null)
  }

  return (
    <div className={styles.page}>
      <div className={styles.themeToggleSlot}>
        <ThemeToggle />
      </div>
      <AuthHero />

      <div className={styles.centerCol}>
        <AuthBrand />

        <div className={styles.card}>
          <h1 className={styles.cardTitle}>
            {modo === 'recuperar' ? 'Recuperar contraseña'
              : modo === 'restablecer' ? 'Restablecer contraseña'
              // Título contextual (rediseño de login): con intención de
              // reproducción se nombra la acción real que trajo al usuario
              // acá en vez del genérico "Iniciar sesión".
              : playIntent ? 'Inicia sesión para reproducir' : 'Iniciar sesión'}
          </h1>
          {modo === 'login' && playIntent && (
            <p className={styles.cardSubtitle}>Guarda tus favoritos, crea playlists y sigue a tus artistas.</p>
          )}

          {error && <div className={styles.bannerError} role="alert">{error}</div>}
          {info && <div className={styles.bannerInfo} role="status">{info}</div>}

          {modo === 'login' && (
            <>
              <form className={styles.form} onSubmit={handleSubmit} noValidate>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="email">Correo electrónico</label>
                  <input id="email" className={styles.input} type="email" maxLength={254} placeholder="tu@email.com"
                         autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                         required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="password">Contraseña</label>
                  <input id="password" className={styles.input} type="password" maxLength={128} placeholder="••••••••"
                         autoComplete="current-password" required value={password}
                         onChange={(e) => setPassword(e.target.value)} />
                </div>
                <button type="submit" className={styles.submit} disabled={submitting}>
                  {submitting ? 'Ingresando…' : 'Entrar'}
                </button>
              </form>
              <p className={styles.footer}>
                <button type="button" className={styles.linkButton}
                        onClick={() => { setModo('recuperar'); setError(null); setInfo(null) }}>
                  ¿Olvidaste tu contraseña?
                </button>
              </p>
              <p className={styles.footer}>
                ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
              </p>
              <Link to="/" className={styles.exploreLink}>
                Explorar el catálogo sin iniciar sesión
                <ChevronRight size={16} aria-hidden="true" />
              </Link>

              {/* Acceso rápido de demo — SOLO para agilizar la grabación de
                  los videos (operativo/táctico/estratégico), nunca un patrón
                  de producción. Colapsado por defecto. */}
              <button
                type="button"
                className={styles.quickLoginToggle}
                onClick={() => setQuickLoginOpen((v) => !v)}
                aria-expanded={quickLoginOpen}
              >
                <Zap size={13} aria-hidden="true" />
                Acceso rápido (demo)
                <ChevronDown size={13} aria-hidden="true" className={quickLoginOpen ? styles.quickLoginChevronOpen : ''} />
              </button>
              {quickLoginOpen && (
                <div className={styles.quickLoginPanel}>
                  {CUENTAS_DEMO.map((c) => (
                    <button
                      key={c.email}
                      type="button"
                      className={styles.quickLoginBtn}
                      disabled={submitting}
                      onClick={() => handleQuickLogin(c.email)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {modo === 'recuperar' && (
            <>
              <form className={styles.form} onSubmit={handleRecuperar} noValidate>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="rec-email">Correo electrónico</label>
                  <input id="rec-email" className={styles.input} type="email" maxLength={254} placeholder="tu@email.com"
                         autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <button type="submit" className={styles.submit} disabled={submitting}>
                  {submitting ? 'Enviando…' : 'Enviar instrucciones'}
                </button>
              </form>
              <p className={styles.footer}>
                ¿Ya tienes un token?{' '}
                <button type="button" className={styles.linkButton} onClick={() => { setModo('restablecer'); setError(null) }}>
                  Restablecer
                </button>
              </p>
              <p className={styles.footer}>
                <button type="button" className={styles.linkButton} onClick={volverALogin}>← Volver</button>
              </p>
            </>
          )}

          {modo === 'restablecer' && (
            <>
              <form className={styles.form} onSubmit={handleRestablecer} noValidate>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="rec-token">Token de recuperación</label>
                  <input id="rec-token" className={styles.input} type="text" maxLength={100} placeholder="token recibido"
                         required value={token} onChange={(e) => setToken(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="rec-pass">Nueva contraseña</label>
                  <input id="rec-pass" className={styles.input} type="password" placeholder="mínimo 8 caracteres"
                         autoComplete="new-password" minLength={8} maxLength={128} required value={nuevaPassword}
                         onChange={(e) => setNuevaPassword(e.target.value)} />
                </div>
                <button type="submit" className={styles.submit} disabled={submitting}>
                  {submitting ? 'Guardando…' : 'Cambiar contraseña'}
                </button>
              </form>
              <p className={styles.footer}>
                <button type="button" className={styles.linkButton} onClick={volverALogin}>← Volver</button>
              </p>
            </>
          )}
        </div>

        <p className={styles.formContext}>Explora millones de tracks antes de iniciar sesión.</p>
      </div>

      <footer className={styles.pageFooter}>
        <Link to="/acerca-de">Acerca de Tracklytics</Link>
      </footer>
    </div>
  )
}
