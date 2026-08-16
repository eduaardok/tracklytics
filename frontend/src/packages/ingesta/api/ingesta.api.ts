import { apiClient } from '@shared/lib/api-client'
import { getAuthHeaders } from '@shared/lib/session'
import { resumirErroresValidacion, type ValidationErrorItem } from '@shared/lib/validationErrors'
import type {
  EjecucionIngestaRequest, EjecucionTrigger, EjecucionEstado,
  CargasHistorial, DataQuality, DimListResponse, DimRow, FactsListResponse,
  RecalificacionTrigger, RecalificacionEstado, EtlMuestra, EtlDistribucion,
} from '../types'

// `/app/v1/ingesta/*` funciona con `apiClient` normal (mismo prefijo, mismo
// bearer de sesión). Pero `/data-quality`, `/dim/*` y `/facts` viven en la
// raíz del backend (`api/paquetes/gestion_datos/router.py`, router base sin
// prefijo) — mismo problema que `/dashboard/executive` en `analitica.api.ts`,
// resuelto ahí con un `_root` derivado quitando `/app/v1` de la base
// configurada. Reusa exactamente ese patrón, pero SÍ inyecta el bearer de
// sesión (a diferencia de `partners`, esto es 100% admin-only vía
// `require_lead_data_engineer`, no una API pública por key).
const _base = import.meta.env.VITE_API_URL ?? '/app/v1'
const _root = _base.replace(/\/app\/v1\/?$/, '')

export class IngestaApiError extends Error {
  status: number
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

async function rawRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${_root}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    ...init,
  })
  if (!res.ok) {
    // Antes: `body?.detail ?? fallback` sin chequear el tipo — un 422 de
    // Pydantic manda `detail` como array de `{loc, msg, type}` (truthy, así
    // que el `??` nunca caía al fallback), y `super(detail)` de `Error`
    // coacciona ese array a texto tipo "[object Object],[object Object]"
    // (auditoría S16, el peor caso encontrado). Mismo mapeo a español que
    // `api-client.ts` usa para el resto del proyecto.
    const body: { detail?: string | ValidationErrorItem[] } | null = await res.json().catch(() => null)
    let detail: string
    if (typeof body?.detail === 'string') detail = body.detail
    else if (Array.isArray(body?.detail)) detail = resumirErroresValidacion(body.detail)
    else detail = `API ${res.status}: ${res.statusText}`
    throw new IngestaApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const ingestaApi = {
  // ── RF-ING-001/002/005/006 (bajo /app/v1/ingesta) ─────────────────────────────
  // `trigger` usa `rawRequest` (no `apiClient.post`) a propósito: los 409 de
  // idempotencia (RN-ING-001, semana ya cargada) y de concurrencia (ejecución
  // ya en curso en Airflow) traen el mensaje real en `detail` — con
  // `apiClient` ese texto se pierde (solo arma `API 409: Conflict` genérico),
  // y es justo la información que el checkbox "forzar recarga" necesita mostrar.
  trigger: (body: EjecucionIngestaRequest) =>
    rawRequest<EjecucionTrigger>('/app/v1/ingesta/ejecuciones', {
      method: 'POST',
      body:   JSON.stringify(body),
    }),

  estadoEjecucion: (ejecucionId: string) =>
    apiClient.get<EjecucionEstado>(`/ingesta/ejecuciones/${ejecucionId}`),

  cargas: (page = 1, limit = 20) =>
    apiClient.get<CargasHistorial>(`/ingesta/cargas?page=${page}&limit=${limit}`),

  // Muestra/distribución de una semana ya cargada — inspección visual de lo
  // que efectivamente produjo un modo synthetic_mode dado.
  etlMuestra: (weekNumber?: number, limit = 200) =>
    apiClient.get<EtlMuestra>(
      `/ingesta/etl/muestra?limit=${limit}${weekNumber !== undefined ? `&week_number=${weekNumber}` : ''}`,
    ),

  etlDistribucion: (weekNumber?: number) =>
    apiClient.get<EtlDistribucion>(
      `/ingesta/etl/distribucion${weekNumber !== undefined ? `?week_number=${weekNumber}` : ''}`,
    ),

  // CU-O79 — mismo criterio de `rawRequest` que `trigger`: el 409 de
  // "recalificación ya en curso" trae el mensaje real en `detail`.
  dispararRecalificacion: () =>
    rawRequest<RecalificacionTrigger>('/app/v1/ingesta/recalificacion', { method: 'POST' }),

  estadoRecalificacion: (ejecucionId: string) =>
    apiClient.get<RecalificacionEstado>(`/ingesta/recalificacion/${ejecucionId}`),

  // ── Data quality (root-mounted) ───────────────────────────────────────────────
  dataQuality: () => rawRequest<DataQuality>('/data-quality'),

  // ── CRUD genérico de dimensiones (root-mounted) ───────────────────────────────
  dimList: (table: string, page = 1, limit = 50, search = '') =>
    rawRequest<DimListResponse>(
      `/dim/${table}?page=${page}&limit=${limit}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`,
    ),

  dimGet: (table: string, recordId: number) =>
    rawRequest<DimRow>(`/dim/${table}/${recordId}`),

  dimCreate: (table: string, data: Record<string, unknown>) =>
    rawRequest<{ message: string; data: DimRow }>(`/dim/${table}`, {
      method: 'POST',
      body:   JSON.stringify({ data }),
    }),

  dimUpdate: (table: string, recordId: number, data: Record<string, unknown>) =>
    rawRequest<{ message: string; id: number }>(`/dim/${table}/${recordId}`, {
      method: 'PUT',
      body:   JSON.stringify({ data }),
    }),

  // RN-ING-004: `confirmar=true` solo se manda en el segundo intento, tras que
  // el primero devuelva 409 con el conteo de referencias en FACT_TRACKS.
  dimDelete: (table: string, recordId: number, confirmar = false) =>
    rawRequest<void>(`/dim/${table}/${recordId}${confirmar ? '?confirmar=true' : ''}`, {
      method: 'DELETE',
    }),

  // ── FACT_TRACKS de solo lectura (root-mounted) ────────────────────────────────
  factsList: (page = 1, limit = 50, search = '') =>
    rawRequest<FactsListResponse>(
      `/facts?page=${page}&limit=${limit}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`,
    ),
}
