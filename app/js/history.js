import { apiFetch } from './api.js';

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
export function addToHistory(track) {
  if (!track?.fact_id) return;
  apiFetch(`/app/v1/biblioteca/historial/${track.fact_id}`, { method: 'POST' }).catch(() => {});
}

// ── getHistory — sync (library.html calls without await) ─────────────────────
export function getHistory(limit = 50) {
  return _histCache.slice(0, limit);
}
