import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared':   resolve(__dirname, 'src/shared'),
      '@packages': resolve(__dirname, 'src/packages'),
      '@app':      resolve(__dirname, 'src/app'),
    },
  },
  server: {
    proxy: {
      '/app/v1': { target: 'http://localhost:8000', changeOrigin: true },
      // Rutas montadas en la raíz del backend (sin prefijo /app/v1): el router
      // legacy de `analitica` (/dashboard/executive), la base de `gestion_datos`
      // (/health, /etl/*, /data-quality, /facts, /dim/*) y `partners`
      // (/partners/v1/*, prefijo propio distinto de /app/v1). Sin esto, estas
      // rutas caían en el fallback SPA de Vite (200 + index.html en vez de
      // JSON) — bug real confirmado en vivo antes de este bloque, no solo
      // necesario para partners/ingesta nuevos.
      '/dashboard':     { target: 'http://localhost:8000', changeOrigin: true },
      '/health':        { target: 'http://localhost:8000', changeOrigin: true },
      '/etl':           { target: 'http://localhost:8000', changeOrigin: true },
      '/data-quality':  { target: 'http://localhost:8000', changeOrigin: true },
      '/facts':         { target: 'http://localhost:8000', changeOrigin: true },
      '/dim':           { target: 'http://localhost:8000', changeOrigin: true },
      '/partners/v1':   { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
