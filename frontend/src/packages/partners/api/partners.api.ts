import type { PartnerEndpoint, PartnerProbeResult } from '../types'

// `/partners/v1/*` se autentica con `X-API-Key` (api/paquetes/partners/deps.py
// `require_partner`) — NUNCA con la sesión del admin logueado en la consola.
// Deliberadamente no se usa `apiClient`/`getAuthHeaders` (shared/lib): esta
// consola prueba la API exactamente como la vería un partner externo real, sin
// mezclar el token de sesión del staff. Root-mounted (no /app/v1) — ver el fix
// de proxy en vite.config.ts/nginx.conf.
const PARTNERS_BASE = '/partners/v1'

export const ENDPOINTS: PartnerEndpoint[] = [
  { id: 'tracks',        method: 'GET', label: 'Listar tracks',        minTier: 'basico',     buildPath: (p) => `/tracks?page=${p.page || 1}&limit=${p.limit || 20}` },
  { id: 'tracksExport',  method: 'GET', label: 'Exportar tracks',      minTier: 'enterprise', buildPath: (p) => `/tracks/export?page=${p.page || 1}&limit=${p.limit || 500}` },
  { id: 'trackDetail',   method: 'GET', label: 'Detalle de track',     minTier: 'basico',     buildPath: (p) => `/tracks/${p.id || 1}` },
  { id: 'artistas',      method: 'GET', label: 'Listar artistas',      minTier: 'basico',     buildPath: (p) => `/artistas?page=${p.page || 1}&limit=${p.limit || 20}` },
  { id: 'artistaDetail', method: 'GET', label: 'Detalle de artista',   minTier: 'basico',     buildPath: (p) => `/artistas/${p.id || 1}` },
  { id: 'albumes',       method: 'GET', label: 'Listar álbumes',       minTier: 'basico',     buildPath: (p) => `/albumes?page=${p.page || 1}&limit=${p.limit || 20}` },
  { id: 'albumDetail',   method: 'GET', label: 'Detalle de álbum',     minTier: 'basico',     buildPath: (p) => `/albumes/${p.id || 1}` },
  { id: 'generos',       method: 'GET', label: 'Listar géneros',       minTier: 'basico',     buildPath: (p) => `/generos?page=${p.page || 1}&limit=${p.limit || 50}` },
  { id: 'generoDetail',  method: 'GET', label: 'Detalle de género',    minTier: 'basico',     buildPath: (p) => `/generos/${p.id || 1}` },
]

export const partnersApi = {
  probe: async (apiKey: string, path: string): Promise<PartnerProbeResult> => {
    const start = performance.now()
    try {
      const res  = await fetch(`${PARTNERS_BASE}${path}`, { headers: { 'X-API-Key': apiKey } })
      const ms   = Math.round(performance.now() - start)
      const body = await res.json().catch(() => null)
      return { status: res.status, ok: res.ok, ms, body }
    } catch {
      const ms = Math.round(performance.now() - start)
      return { status: 0, ok: false, ms, body: { detail: 'No se pudo contactar la API (red/CORS).' } }
    }
  },
}
