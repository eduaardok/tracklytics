import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { ThemeProvider } from '@shared/context/ThemeContext'
import { PlayerProvider } from '@shared/context/PlayerContext'
import { ToastProvider } from '@shared/context/ToastContext'
import { ConfirmProvider } from '@shared/context/ConfirmContext'
import { AdProvider } from '@packages/publicidad'

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
            <PlayerProvider>
              <AdProvider>
                {children}
              </AdProvider>
            </PlayerProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
