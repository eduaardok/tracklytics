import { apiFetch, getDeviceId } from './api.js';

// ── In-memory cache ───────────────────────────────────────────────────────────
let _histCache = [];

// ── Init (async — call once before any render) ────────────────────────────────
export async function initHistory(limit = 50) {
  try {
    const res  = await apiFetch(`/app/v1/biblioteca/historial?limit=${limit}`);
    _histCache = res.data ?? [];
  } catch (e) {
    console.warn('[history] initHistory falló:', e);
  }
}

// ── addToHistory — fire-and-forget (components.js does not await or use return value) ──
// `dispositivo_id` habilita el evento de reproducción enriquecido
// (RF-EXP-001, capability `experiencia`) — sin él, ese insert se omite (ver
// api/paquetes/biblioteca/router.py::add_historial), pero el registro de
// historial de siempre sigue funcionando igual.
export function addToHistory(track, impresionId = null) {
  if (!track?.fact_id) return;
  const body = { dispositivo_id: getDeviceId() };
  if (impresionId != null) body.impresion_id = impresionId;
  apiFetch(`/app/v1/biblioteca/historial/${track.fact_id}`, {
    method: 'POST',
    body: JSON.stringify(body),
  }).catch(() => {});
}

// ── getHistory — sync (library.html calls without await) ─────────────────────
export function getHistory(limit = 50) {
  return _histCache.slice(0, limit);
}
