import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
}

// Guarda de último recurso para TODO el árbol (montado en `main.tsx`). Antes
// no existía ningún ErrorBoundary en la app: si cualquier componente lanzaba
// durante el render — incluido un chunk lazy que renderice algo con bug tras
// una navegación — React desmontaba el árbol entero y la app quedaba en
// blanco sin fallback (hallazgo del repaso S17). Cualquier error visible aquí
// sigue siendo un bug real que arreglar, pero la demo nunca más se "cuelga"
// en una pantalla vacía sin explicación.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className={styles.wrap} role="alert">
          <h1 className={styles.title}>Algo salió mal.</h1>
          <p className={styles.body}>
            Ocurrió un error inesperado al renderizar esta pantalla. Recarga la
            aplicación para continuar.
          </p>
          <button type="button" className={styles.reload} onClick={() => window.location.reload()}>
            Recargar
          </button>
        </main>
      )
    }
    return this.props.children
  }
}