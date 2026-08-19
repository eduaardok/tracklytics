import { useState } from 'react'
import { AlertTriangle, Building2, Check, Sparkles, Zap } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { useInView } from '@shared/hooks/useInView'
import styles from './PartnersLandingPage.module.css'

// Envoltorio de conveniencia sobre useInView (S16 Fase 3.4): agrega la clase
// de revelado solo cuando el elemento entra en viewport, sin repetir el
// `${inView ? styles.revealIn : ''}` en cada sección. `useInView` tiene un
// fallback de 1.5s que fuerza `inView=true` pase lo que pase, así que el
// contenido nunca queda invisible de forma permanente (pestaña oculta,
// render headless) — ver el comentario en useInView.ts.
function useReveal() {
  const { ref, inView } = useInView<HTMLElement>(0.15)
  return { ref, className: inView ? `${styles.reveal} ${styles.revealIn}` : styles.reveal }
}

// Landing pública (sin sesión) para integradores externos — porte de
// app/partners/landing.html (legacy) al retirar `app/` (consolidación a
// React, 2026-07-10). Sigue siendo una herramienta ad-hoc de demo/
// verificación de CU-O12, no documentación de referencia formal de la API
// (ver openspec/specs/partners/spec.md) — el aviso de "no es oferta
// comercial activa" se conserva por el mismo motivo: CU-T03 (alta/gestión
// real de partners) no existe todavía.
export function PartnersLandingPage() {
  useDocumentTitle('Tracklytics for Partners')
  const [apiKey, setApiKey] = useState('')
  const [output, setOutput] = useState('Sin solicitudes enviadas aún.')
  const [sending, setSending] = useState(false)

  async function probar() {
    if (!apiKey.trim()) { setOutput('Ingresa una API key.'); return }
    setSending(true)
    setOutput('Enviando…')
    try {
      const res = await fetch('/partners/v1/tracks?limit=5&page=1', { headers: { 'X-API-Key': apiKey.trim() } })
      const body = await res.json().catch(() => ({}))
      setOutput(`HTTP ${res.status}\n\n${JSON.stringify(body, null, 2)}`)
    } catch (e) {
      setOutput(`Error de red: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSending(false)
    }
  }

  const tiersReveal = useReveal()
  const authReveal   = useReveal()
  const tryReveal    = useReveal()

  return (
    <div className={styles.page}>
      <div className={styles.banner}>
        <AlertTriangle size={14} aria-hidden="true" />
        Esta página es una demostración previa a producción del programa de Partners de Tracklytics — no representa una oferta comercial activa.
      </div>

      <header className={styles.header}>
        <a href="/" className={styles.brand}>
          <img src="/logo.png" alt="" width={32} height={32} />
          <span>Tracklytics <span className={styles.brandSub}>for Partners</span></span>
        </a>
        <a href="/login" className={styles.btnOutline}>Ir a la app →</a>
      </header>

      <div className={styles.hero}>
        <h1>Integra el catálogo de Tracklytics directamente en tu sistema</h1>
        <p>
          Sellos discográficos y distribuidoras pueden consumir nuestro catálogo musical — tracks, artistas,
          álbumes y géneros — de forma programática vía API key, sin fuerza de ventas ni integraciones manuales.
          Tú decides cuánto acceso necesitas según tu tier.
        </p>
      </div>

      <section ref={tiersReveal.ref} className={`${styles.section} ${tiersReveal.className}`}>
        <h2>Tiers de acceso</h2>
        <div className={styles.tierGrid}>
          <div className={styles.tierCard}>
            <div className={styles.tierIcon}><Zap size={18} aria-hidden="true" /></div>
            <h3>Básico</h3>
            <p className={styles.tierDesc}>Catálogo esencial para integraciones simples.</p>
            <ul>
              <li><Check size={14} className={styles.tierCheck} aria-hidden="true" /> Tracks, artistas, álbumes y géneros (lista + detalle)</li>
              <li><Check size={14} className={styles.tierCheck} aria-hidden="true" /> Campos: nombre, artista, género, popularidad</li>
            </ul>
          </div>
          <div className={`${styles.tierCard} ${styles.tierFeatured}`}>
            <span className={styles.tierBadge}>Más popular</span>
            <div className={styles.tierIcon}><Sparkles size={18} aria-hidden="true" /></div>
            <h3>Pro</h3>
            <p className={styles.tierDesc}>Perfil de audio para recomendación y análisis.</p>
            <ul>
              <li><Check size={14} className={styles.tierCheck} aria-hidden="true" /> Todo lo de Básico</li>
              <li><Check size={14} className={styles.tierCheck} aria-hidden="true" /> + duración, danceability, energy, valence, tempo</li>
            </ul>
          </div>
          <div className={styles.tierCard}>
            <div className={styles.tierIcon}><Building2 size={18} aria-hidden="true" /></div>
            <h3>Enterprise</h3>
            <p className={styles.tierDesc}>Acceso completo y exportación masiva.</p>
            <ul>
              <li><Check size={14} className={styles.tierCheck} aria-hidden="true" /> Todo lo de Pro</li>
              <li><Check size={14} className={styles.tierCheck} aria-hidden="true" /> + loudness, speechiness, acousticness, instrumentalness, liveness</li>
              <li><Check size={14} className={styles.tierCheck} aria-hidden="true" /> Endpoint de exportación masiva (<code>/tracks/export</code>)</li>
            </ul>
          </div>
        </div>
      </section>

      <section ref={authReveal.ref} className={`${styles.section} ${authReveal.className}`}>
        <h2>Autenticación</h2>
        <p className={styles.sectionNote}>
          Cada solicitud se autentica con una API key enviada por header — nunca por query string.
        </p>
        <pre className={styles.codeBlock}>{'curl https://api.tracklytics.dev/partners/v1/tracks?limit=10 \\\n  -H "X-API-Key: TU_API_KEY"'}</pre>
      </section>

      <section ref={tryReveal.ref} className={`${styles.section} ${tryReveal.className}`}>
        <h2>Pruébalo ahora</h2>
        <p className={styles.sectionNote}>
          Usa una API key de demo para ver una respuesta real del catálogo (solo lectura, tier básico).
        </p>
        <div className={styles.tryNow}>
          <div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="demo-key">API Key</label>
              <input
                id="demo-key"
                className={styles.input}
                type="text"
                placeholder="Pega tu API key de demo aquí"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <button type="button" className={styles.btnPrimary} disabled={sending} onClick={probar}>
              ▶ Probar GET /partners/v1/tracks
            </button>
          </div>
          <pre className={styles.demoOutput}>{output}</pre>
        </div>
      </section>
    </div>
  )
}
