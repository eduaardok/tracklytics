import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Providers } from '@app/providers'
import { ErrorBoundary } from '@shared/components/ErrorBoundary'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <App />
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
)
