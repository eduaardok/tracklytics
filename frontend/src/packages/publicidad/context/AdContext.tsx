import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { publicidadApi } from '../api/publicidad.api'
import styles from './AdContext.module.css'

const DURACION_MIN_MS = 5000

type AdContextValue = {
  // Se llama antes de reproducir un track. Si el usuario es free y hay una
  // campaña elegible, bloquea con un anuncio real (mínimo 5s antes de poder
  // cerrarlo) y solo resuelve `true` cuando termina — el llamador debe
  // esperar esta promesa antes de arrancar la reproducción real (CU-O67).
  pedirImpresion: () => Promise<void>
}

const AdContext = createContext<AdContextValue | null>(null)

export function AdProvider({ children }: { children: ReactNode }) {
  const [activa, setActiva] = useState<{ impresionId: string; anuncianteLabel: string } | null>(null)
  const [puedeCerrar, setPuedeCerrar] = useState(false)
  const resolverRef = useRef<(() => void) | null>(null)

  const pedirImpresion = useCallback(async () => {
    let res
    try {
      res = await publicidadApi.impresion()
    } catch {
      return // Un fallo de red al pedir el anuncio no debe bloquear la reproducción.
    }
    if (!res.campana || !res.impresion_id) return

    const impresionId = res.impresion_id
    setPuedeCerrar(false)
    setActiva({ impresionId, anuncianteLabel: `Anuncio · CPM $${res.campana.cpm.toFixed(2)}` })

    await new Promise<void>((resolve) => {
      resolverRef.current = resolve
      setTimeout(() => setPuedeCerrar(true), DURACION_MIN_MS)
    })
  }, [])

  function cerrar() {
    if (!activa || !puedeCerrar) return
    publicidadApi.completarImpresion(activa.impresionId).catch(() => {
      // El ingreso real ya se intentó reconocer server-side; un fallo de red
      // aquí no debe bloquear al usuario de seguir escuchando.
    })
    setActiva(null)
    resolverRef.current?.()
    resolverRef.current = null
  }

  return (
    <AdContext.Provider value={{ pedirImpresion }}>
      {children}
      {activa && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Anuncio">
          <div className={styles.card}>
            <span className={styles.badge}>Publicidad</span>
            <p className={styles.label}>{activa.anuncianteLabel}</p>
            <p className={styles.note}>
              Tracklytics Free se financia con anuncios reales — pasa a Premium para escuchar sin interrupciones.
            </p>
            <button
              type="button"
              className={styles.btnClose}
              disabled={!puedeCerrar}
              onClick={cerrar}
            >
              {puedeCerrar ? 'Continuar escuchando' : 'Espera unos segundos…'}
            </button>
          </div>
        </div>
      )}
    </AdContext.Provider>
  )
}

export function useAd(): AdContextValue {
  const ctx = useContext(AdContext)
  if (!ctx) throw new Error('useAd debe usarse dentro de <AdProvider>')
  return ctx
}
