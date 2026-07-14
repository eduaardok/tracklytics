import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { isAuthenticated } from '@shared/lib/session'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { resolverDestinoPostAuth } from '@packages/suscripciones'
// Import directo, no vía el barrel `@packages/distribucion` (arrastraría
// DistribucionAdminPage —con Recharts— al bundle principal, RegisterPage es
// una ruta pública eager — ver comentario equivalente en router.tsx).
import { distribucionApi } from '@packages/distribucion/api/distribucion.api'
import type { Pais } from '@packages/distribucion/types'
import { authApi } from '../api/auth.api'
import { AuthHero } from './AuthHero'
import styles from './AuthPages.module.css'

// "Artista" no es un rol de backend propio (`ROLES_AUTO_REGISTRABLES` sigue
// siendo user/analyst) — es intención de UI: crea una cuenta `user` normal
// y, al terminar, entra directo al flujo ya existente de solicitud de
// cuenta de artista (`/creadores`, aprobación de admin), con el nombre
// precargado. Mismo criterio que Spotify for Artists: primero existe la
// cuenta de oyente, el perfil de artista se reclama/gestiona aparte.
type TipoCuenta = 'user' | 'analyst' | 'artista'

export function RegisterPage() {
  useDocumentTitle('Crear cuenta')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [nombre, setNombre]     = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [pais, setPais]         = useState('')
  const [paises, setPaises]     = useState<Pais[]>([])
  // Preselecciona "Artista" cuando se llega desde el enlace correspondiente
  // en `/acerca-de` (`?tipo=artista`).
  const [tipoCuenta, setTipoCuenta] = useState<TipoCuenta>(
    searchParams.get('tipo') === 'artista' ? 'artista' : 'user',
  )
  const [error, setError]       = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Catálogo público (sin sesión) — antes el país se guardaba como texto
  // libre y casi nunca resolvía contra DIM_PAIS (RF-DIS-007/CU-O41).
  useEffect(() => {
    distribucionApi.paisesPublico().then((res) => setPaises(res.data ?? [])).catch(() => setPaises([]))
  }, [])

  if (isAuthenticated()) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || !email.trim() || !password) {
      setError('Completa nombre, correo y contraseña.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const rolEnvio = tipoCuenta === 'analyst' ? 'analyst' : 'user'
      const usuario = await authApi.registro(email, password, nombre, rolEnvio, pais)
      if (tipoCuenta === 'artista') {
        navigate(`/creadores?onboarding=artista&nombre=${encodeURIComponent(nombre.trim())}`, { replace: true })
        return
      }
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

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
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
              <select
                id="pais"
                className={styles.input}
                autoComplete="country"
                value={pais}
                onChange={(e) => setPais(e.target.value)}
              >
                <option value="">Selecciona tu país</option>
                {paises.map((p) => (
                  <option key={p.pais_id} value={p.codigo_iso}>{p.nombre}</option>
                ))}
              </select>
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
                    checked={tipoCuenta === 'user'}
                    onChange={() => setTipoCuenta('user')}
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
                    checked={tipoCuenta === 'analyst'}
                    onChange={() => setTipoCuenta('analyst')}
                  />
                  <span className={styles.roleCard}>
                    <span className={styles.roleTitle}>Cliente empresarial</span>
                    <span className={styles.roleTag}>EMPRESARIAL · B2B</span>
                  </span>
                </label>
                <label className={`${styles.roleOption} ${styles.roleOptionWide}`}>
                  <input
                    className={styles.roleInput}
                    type="radio"
                    name="role"
                    value="artista"
                    checked={tipoCuenta === 'artista'}
                    onChange={() => setTipoCuenta('artista')}
                  />
                  <span className={styles.roleCard}>
                    <span className={styles.roleTitle}>Artista</span>
                    <span className={styles.roleTag}>CREA TU CUENTA Y RECLAMA TU PERFIL DE ARTISTA</span>
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
          <p className={styles.footer}>
            ¿Eres sello, productora o distribuidora? <Link to="/acerca-de">Conoce tus opciones</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
