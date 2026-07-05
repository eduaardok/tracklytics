import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { isAuthenticated } from '@shared/lib/session'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { resolverDestinoPostAuth } from '@packages/suscripciones'
import { authApi } from '../api/auth.api'
import { AuthHero } from './AuthHero'
import styles from './AuthPages.module.css'

export function LoginPage() {
  useDocumentTitle('Iniciar sesión')
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated()) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const usuario = await authApi.login(email, password)
      const destino = await resolverDestinoPostAuth(usuario.role)
      if (destino.onboarding) {
        // B2B sin plan activo: onboarding manda siempre, sin importar a dónde
        // intentaba llegar el usuario (mismo criterio que el legacy).
        navigate(`${destino.path}?onboarding=1`, { replace: true })
      } else {
        const from = (location.state as { from?: { pathname: string; search: string } } | null)?.from
        navigate(from ? `${from.pathname}${from.search}` : destino.path, { replace: true })
      }
    } catch {
      setError('Correo o contraseña incorrectos')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.split}>
      <AuthHero />

      <div className={styles.formPanel}>
        <div className={styles.card}>
          <h1 className={styles.cardTitle}>Iniciar sesión</h1>

          {error && <div className={styles.bannerError} role="alert">{error}</div>}

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                className={styles.input}
                type="email"
                placeholder="tu@email.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="password">Contraseña</label>
              <input
                id="password"
                className={styles.input}
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className={styles.submit} disabled={submitting}>
              {submitting ? 'Ingresando…' : 'Entrar'}
            </button>
          </form>

          <p className={styles.footer}>
            ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
