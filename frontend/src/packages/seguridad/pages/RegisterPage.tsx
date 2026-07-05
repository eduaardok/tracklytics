import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { isAuthenticated } from '@shared/lib/session'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { resolverDestinoPostAuth } from '@packages/suscripciones'
import { authApi, type RolAutoRegistrable } from '../api/auth.api'
import { AuthHero } from './AuthHero'
import styles from './AuthPages.module.css'

export function RegisterPage() {
  useDocumentTitle('Crear cuenta')
  const navigate = useNavigate()
  const [nombre, setNombre]     = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [pais, setPais]         = useState('')
  const [rol, setRol]           = useState<RolAutoRegistrable>('user')
  const [error, setError]       = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated()) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const usuario = await authApi.registro(email, password, nombre, rol, pais)
      const destino = await resolverDestinoPostAuth(usuario.role)
      navigate(destino.onboarding ? `${destino.path}?onboarding=1` : destino.path, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.split}>
      <AuthHero />

      <div className={styles.formPanel}>
        <div className={styles.card}>
          <h1 className={styles.cardTitle}>Crear cuenta</h1>

          {error && <div className={styles.bannerError} role="alert">{error}</div>}

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="nombre">Nombre</label>
              <input
                id="nombre"
                className={styles.input}
                type="text"
                placeholder="Tu nombre"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

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
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="pais">País</label>
              <input
                id="pais"
                className={styles.input}
                type="text"
                placeholder="Tu país"
                autoComplete="country-name"
                value={pais}
                onChange={(e) => setPais(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Tipo de cuenta</span>
              <div className={styles.roleGrid}>
                <label className={styles.roleOption}>
                  <input
                    className={styles.roleInput}
                    type="radio"
                    name="role"
                    value="user"
                    checked={rol === 'user'}
                    onChange={() => setRol('user')}
                  />
                  <span className={styles.roleCard}>
                    <span className={styles.roleTitle}>Usuario</span>
                    <span className={styles.roleTag}>PERSONAL · B2C</span>
                  </span>
                </label>
                <label className={styles.roleOption}>
                  <input
                    className={styles.roleInput}
                    type="radio"
                    name="role"
                    value="analyst"
                    checked={rol === 'analyst'}
                    onChange={() => setRol('analyst')}
                  />
                  <span className={styles.roleCard}>
                    <span className={styles.roleTitle}>Cliente empresarial</span>
                    <span className={styles.roleTag}>EMPRESARIAL · B2B</span>
                  </span>
                </label>
              </div>
            </div>

            <button type="submit" className={styles.submit} disabled={submitting}>
              {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
          </form>

          <p className={styles.footer}>
            ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
