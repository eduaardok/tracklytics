import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { ThemeProvider } from '@shared/context/ThemeContext'
import { ToastProvider } from '@shared/context/ToastContext'
import { ConfirmProvider } from '@shared/context/ConfirmContext'
import { AdProvider } from '@packages/publicidad'
// `AuthPromptProvider` y `PlayerProvider` NO viven acá (a diferencia de los
// demás providers de este árbol): `AuthPromptProvider` monta un `<Link>` de
// react-router-dom en un portal, y `PlayerContext` llama `useAuthPrompt()`
// (RF de "reproducir sin sesión" — abre el modal de login en vez de dejar
// pasar la reproducción). Ambos necesitan ser descendientes reales del
// Router. Este árbol (`Providers`) envuelve a `<App/>` DESDE AFUERA del
// `<RouterProvider>` (ver `main.tsx`) — cualquier `<Link>` en un portal
// montado acá queda fuera del árbol del Router y revienta con "Cannot
// destructure property 'basename' of ...useContext(...) as it is null"
// (bug real, reproducido: un visitante sin sesión que toca "Reproducir" se
// encontraba con la app caída en blanco — hallazgo del barrido final, S16
// prompt 09). Ambos se montan ahora dentro del árbol de rutas
// (`app/router.tsx`, ruta raíz de layout), donde sí son descendientes del
// Router — y como esa ruta raíz envuelve TODAS las rutas hijas sin
// desmontarse entre ellas, el estado del reproductor se sigue conservando
// igual que antes al navegar.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AdProvider>
              {children}
            </AdProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
