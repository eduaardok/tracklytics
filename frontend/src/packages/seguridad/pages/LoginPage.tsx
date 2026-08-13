import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { isAuthenticated } from '@shared/lib/session'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { landingPostLogin } from '@shared/lib/roles'
import { resolverDestinoPostAuth } from '@packages/suscripciones'
import { authApi } from '../api/auth.api'
import { AuthHero } from './AuthHero'
import styles from './AuthPages.module.css'

type Modo = 'login' | 'recuperar' | 'restablecer'

export function LoginPage() {
  useDocumentTitle('Iniciar sesión')
  const navigate = useNavigate()
  const location = useLocation()
  const [modo, setModo]         = useState<Modo>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken]           = useState('')
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [info, setInfo]         = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated()) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Completa correo y contraseña.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const usuario = await authApi.login(email, password)
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
        const from = (location.state as { from?: { pathname: string; search: string } } | null)?.from
        navigate(from ? `${from.pathname}${from.search}` : (landingRol ?? destino.path), { replace: true })
      }
    } catch (err) {
      // Muestra el detalle del backend cuando lo hay: lockout (429) y cuenta
      // suspendida/dada de baja (403) traen un mensaje específico; el resto cae
      // al genérico de credenciales.
      setError(apiErrorMessage(err, 'Correo o contraseña incorrectos'))
      setSubmitting(false)
    }
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
    <div className={styles.split}>
      <AuthHero />

      <div className={styles.formPanel}>
        <div className={styles.card}>
          <h1 className={styles.cardTitle}>
            {modo === 'login' ? 'Iniciar sesión'
              : modo === 'recuperar' ? 'Recuperar contraseña'
              : 'Restablecer contraseña'}
          </h1>

          {error && <div className={styles.bannerError} role="alert">{error}</div>}
          {info && <div className={styles.bannerInfo} role="status">{info}</div>}

          {modo === 'login' && (
            <>
              <form className={styles.form} onSubmit={handleSubmit} noValidate>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="email">Correo electrónico</label>
                  <input id="email" className={styles.input} type="email" maxLength={254} placeholder="tu@email.com"
                         autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
              <p className={styles.footer}>
                <Link to="/">Explorar el catálogo sin iniciar sesión</Link>
              </p>
              <p className={styles.footer}>
                <Link to="/acerca-de">Acerca de Tracklytics</Link>
              </p>
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
      </div>
    </div>
  )
}
