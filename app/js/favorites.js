import { apiFetch } from './api.js';

// ── In-memory cache ───────────────────────────────────────────────────────────
let _favSet    = new Set();  // Set<number> of fact_ids currently active
let _favTracks = [];         // full track objects (for getFavorites())

// ── Init (async — call once before any render) ────────────────────────────────
export async function initFavorites() {
  try {
    const res  = await apiFetch('/app/v1/biblioteca/favoritos');
    _favTracks = res.data ?? [];
    _favSet    = new Set(_favTracks.map(t => t.fact_id));
  } catch (e) {
    console.warn('[favorites] initFavorites falló:', e);
  }
}

// ── isFavorite — sync (for renderTrackRow compatibility) ─────────────────────
// Accepts fact_id (number) or track_id (string) for backward compatibility
// with components.js which calls isFavorite(track.track_id).
export function isFavorite(arg) {
  if (typeof arg === 'number') return _favSet.has(arg);
  return _favTracks.some(t => t.track_id === arg);
}

// ── toggleFavorite — sync optimistic update + fire-and-forget API ─────────────
// Must remain synchronous: components.js uses `const added = toggleFavorite(track)`
// and immediately updates the UI from the return value.
export function toggleFavorite(track) {
  const fid = track.fact_id;
  if (fid == null) return false;

  if (_favSet.has(fid)) {
    _favSet.delete(fid);
    _favTracks = _favTracks.filter(t => t.fact_id !== fid);
    apiFetch(`/app/v1/biblioteca/favoritos/${fid}`, { method: 'DELETE' }).catch(console.error);
    return false;
  }

  _favSet.add(fid);
  _favTracks.push(track);
  apiFetch(`/app/v1/biblioteca/favoritos/${fid}`, { method: 'POST' }).catch(console.error);
  return true;
}

// ── getFavorites — sync (library.html calls without await) ───────────────────
export function getFavorites() {
  return [..._favTracks];
}
