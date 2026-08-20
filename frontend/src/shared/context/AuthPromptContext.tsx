import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
// Import solo de tipo — `PlayableTrack` vive en PlayerContext, que a su vez
// importa `useAuthPrompt` de este módulo; al ser `import type` se borra en
// tiempo de compilación y no crea un ciclo real en el bundle.
import type { PlayableTrack } from '@shared/context/PlayerContext'
import styles from './AuthPromptContext.module.css'

type AuthPromptFn = (message?: string, track?: PlayableTrack) => void

const AuthPromptContext = createContext<AuthPromptFn | null>(null)

const MENSAJE_DEFAULT = 'Necesitas una cuenta para hacer esto.'

// Reemplaza el toast "Inicia sesión gratis para..." (S16 — auditoría de
// revisores) en las acciones protegidas que un visitante sin sesión puede
// alcanzar desde una página pública (reproducir, iniciar radio): un toast
// desaparece solo a los pocos segundos sin dar ninguna acción — este modal
// da un CTA directo a login/registro, con la ruta actual para volver
// después de autenticarse (mismo `state.from` que ya usa `RequireAuth`).
// Mismo patrón arquitectónico que `ConfirmContext` (provider + portal +
// hook), pero sin `Promise<boolean>`: no hay una decisión que devolver,
// solo un modal que se abre y se cierra.
export function AuthPromptProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [message, setMessage] = useState<string | null>(null)
  // Track que se intentaba reproducir cuando se abrió el modal (si lo hay) —
  // viaja como `state.playIntent` a login/register para poder retomar la
  // reproducción después de autenticarse, mismo patrón que `state.from` de
  // `RequireAuth`.
  const [track, setTrack] = useState<PlayableTrack | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const prompt = useCallback<AuthPromptFn>((msg, trackArg) => {
    setMessage(msg ?? MENSAJE_DEFAULT)
    setTrack(trackArg ?? null)
  }, [])

  const close = useCallback(() => setMessage(null), [])

  useEffect(() => {
    if (!message) return
    closeBtnRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [message, close])

  return (
    <AuthPromptContext.Provider value={prompt}>
      {children}
      {message && createPortal(
        <div className={styles.backdrop} onMouseDown={close}>
          <div
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-label="Inicia sesión para continuar"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className={styles.title}>Inicia sesión para continuar</p>
            <p className={styles.message}>{message}</p>
            <div className={styles.actions}>
              <button ref={closeBtnRef} type="button" className={styles.cancelBtn} onClick={close}>
                Ahora no
              </button>
              <Link
                to="/register"
                className={styles.registerBtn}
                onClick={close}
                state={{ from: location, playIntent: track ?? undefined }}
              >
                Registrarme
              </Link>
              <Link
                to="/login"
                className={styles.loginBtn}
                onClick={close}
                state={{ from: location, playIntent: track ?? undefined }}
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </AuthPromptContext.Provider>
  )
}

export function useAuthPrompt(): AuthPromptFn {
  const ctx = useContext(AuthPromptContext)
  if (!ctx) throw new Error('useAuthPrompt() debe usarse dentro de <AuthPromptProvider>')
  return ctx
}
