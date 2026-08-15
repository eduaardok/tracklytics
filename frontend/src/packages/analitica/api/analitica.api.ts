import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import { getAuthHeaders } from '@shared/lib/session'
import type { Genre } from '@packages/catalogo'
import type {
  ArtistSearchResult, TrackSearchResult,
  EngagementByArtist, EngagementByFact, DesempenoRelativo,
  DashboardData,
  GenreAudioProfile, ArtistasComparacion, ArtistaBenchmark,
  TendenciaSemana, ReporteDiario,
  AdquisicionCanal, DisponibilidadComponente,
  ChurnMensual, FunnelConversion, PnlConsolidado, MrrArr,
  ProyeccionGenero, ProyeccionArtista, BscResumen, BscAnalisisInteligente,
  BenchmarkInforme, BenchmarkResultado,
} from '../types'

// /dashboard/executive lives on the legacy router with no /app/v1 prefix.
// Derive the API root by stripping /app/v1 from the configured base URL.
const _base = import.meta.env.VITE_API_URL ?? '/app/v1'
const _root = _base.replace(/\/app\/v1\/?$/, '')

async function rawGet<T>(absolutePath: string): Promise<T> {
  const res = await fetch(absolutePath, { headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

export const analiticaApi = {
  // ── Dashboard ────────────────────────────────────────────────────────────────
  dashboard: () =>
    rawGet<DashboardData>(`${_root}/dashboard/executive`),

  // Sonda de acceso para RequireSuscripcionActiva: golpea el mismo endpoint
  // gateado por `require_b2b_panel_access` en el backend (admin bypassa,
  // analyst requiere suscripción activa, cualquier otro rol 403) y devuelve
  // solo el status HTTP — el guard reacciona al código real, no reimplementa
  // la regla de negocio en el cliente (spec.md, "Acceso a paneles analíticos
  // condicionado a suscripción activa").
  checkAccesoAnalitica: async (): Promise<number> => {
    const res = await fetch(`${_base}/analitica/dashboard`, { headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } })
    return res.status
  },

  // ── Artist search (analitica v1 router) ─────────────────────────────────────
  artistsSearch: (nombre: string, limit = 8) =>
    apiClient.get<{ data: ArtistSearchResult[]; total: number; limit: number }>(
      `/analitica/artistas/search?nombre=${encodeURIComponent(nombre)}&limit=${limit}`,
    ),

  // ── Track search (catalog router, same /app/v1 base) ─────────────────────────
  tracksSearch: (q: string, limit = 8) =>
    apiClient.get<{ data: TrackSearchResult[]; total: number }>(
      `/tracks/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),

  // ── Engagement ───────────────────────────────────────────────────────────────
  engagementByArtist: (artistId: number) =>
    apiClient.get<EngagementByArtist>(`/analitica/engagement?artist_id=${artistId}`),

  engagementByFact: (factId: number) =>
    apiClient.get<EngagementByFact>(`/analitica/engagement?fact_id=${factId}`),

  desempenoRelativo: (factId: number) =>
    apiClient.get<DesempenoRelativo>(`/analitica/desempeno-relativo?fact_id=${factId}`),

  // ── Paneles predictivos Enterprise (CU-O92/CU-O93) ──────────────────────────
  generoProyeccion: (generoId: number) =>
    apiClient.get<ProyeccionGenero>(`/analitica/generos/${generoId}/proyeccion`),

  artistaProyeccion: (artistId: number) =>
    apiClient.get<ProyeccionArtista>(`/analitica/artistas/${artistId}/proyeccion`),

  // ── Perfil de audio por género ───────────────────────────────────────────────
  // No existe un endpoint de listado de géneros en `analitica` — se reusa el
  // mismo `/genres` del router `catalogo` que ya alimenta el filtro de
  // CatalogPage, en vez de duplicar esa data o inventar un endpoint nuevo.
  generos: () =>
    apiClient.get<ApiResponse<Genre>>('/genres'),

  generoPerfil: (generoId: number) =>
    apiClient.get<GenreAudioProfile>(`/analitica/generos/${generoId}/perfil`),

  // ── Comparación y benchmark de artistas ─────────────────────────────────────
  artistasComparar: (artistaA: number, artistaB: number) =>
    apiClient.get<ArtistasComparacion>(`/analitica/artistas/comparar?artista_a=${artistaA}&artista_b=${artistaB}`),

  artistaBenchmark: (artistId: number) =>
    apiClient.get<ArtistaBenchmark>(`/analitica/artistas/${artistId}/benchmark`),

  // ── Tendencias semanales ─────────────────────────────────────────────────────
  tendencias: (semanaDesde?: number, semanaHasta?: number) => {
    const params = new URLSearchParams()
    if (semanaDesde != null) params.set('semana_desde', String(semanaDesde))
    if (semanaHasta != null) params.set('semana_hasta', String(semanaHasta))
    const qs = params.toString()
    return apiClient.get<{ data: TendenciaSemana[] }>(`/analitica/tendencias${qs ? `?${qs}` : ''}`)
  },

  // ── Reporte diario operativo (solo staff/admin — `require_staff` en backend) ──
  reporteDiario: (fecha?: string) =>
    apiClient.get<ReporteDiario>(`/analitica/reporte-diario${fecha ? `?fecha=${fecha}` : ''}`),

  // ── Adquisición de usuarios por canal (CU-O54) ──────────────────────────────
  adquisicion: () =>
    apiClient.get<{ data: AdquisicionCanal[] }>('/analitica/adquisicion'),

  // ── Disponibilidad de infraestructura por componente (CU-O55) ──────────────
  disponibilidad: () =>
    apiClient.get<{ data: DisponibilidadComponente[] }>('/analitica/disponibilidad'),

  // ── Churn mensual, funnel de conversión y P&L (monetizacion-retencion-
  // mejoras, solo staff/admin — `require_staff` en backend) ──────────────────
  churn: (desde: string, hasta: string, porMotivo = false) =>
    apiClient.get<ChurnMensual>(
      `/analitica/churn?desde=${desde}&hasta=${hasta}${porMotivo ? '&por_motivo=true' : ''}`,
    ),

  funnelConversion: (desde: string, hasta: string) =>
    apiClient.get<FunnelConversion>(`/analitica/funnel-conversion?desde=${desde}&hasta=${hasta}`),

  pnl: (desde: string, hasta: string) =>
    apiClient.get<PnlConsolidado>(`/analitica/pnl?desde=${desde}&hasta=${hasta}`),

  // ── MRR/ARR (modelo-financiero-simulacion, solo staff/admin) ────────────────
  mrrArr: (desde: string, hasta: string) =>
    apiClient.get<MrrArr>(`/analitica/mrr-arr?desde=${desde}&hasta=${hasta}`),

  // ── Balanced Scorecard estratégico (S16, Prompt 05, solo staff/admin) ──────
  bsc: () =>
    apiClient.get<BscResumen>('/analitica/bsc/resumen'),

  bscAnalisisInteligente: () =>
    apiClient.get<BscAnalisisInteligente>('/analitica/bsc/analisis-inteligente'),

  // ── Benchmark SQL directo vs. Gold (S16-P2, solo staff/admin) ──────────────
  // `benchmarkEjecutar` es deliberadamente bajo demanda (POST, nunca en un
  // useQuery automático): la versión SQL directa escanea millones de filas
  // de FACT_ENGAGEMENT_USUARIO/FACT_TRACKS y se repite 3 veces en el
  // backend — no algo para disparar en cada carga de página.
  benchmarkInformes: () =>
    apiClient.get<{ data: BenchmarkInforme[] }>('/analitica/benchmark-sql/informes'),

  benchmarkEjecutar: (informeId: string) =>
    apiClient.post<BenchmarkResultado>(`/analitica/benchmark-sql/${informeId}/ejecutar`, {}),
}
