// ── PocketBase direct client (no import from api.js to avoid circular deps) ──
const PB_BASE = 'http://localhost:8090';

function _pbToken() { return localStorage.getItem('pb_token'); }
function _userId()  { return localStorage.getItem('pb_user_id'); }

async function _pbFetch(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${_pbToken()}`,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${PB_BASE}${path}`, opts);
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`PB ${method} ${path}: ${res.status}`);
  return res.json();
}

// FastAPI proxy for loading track data (avoids importing api.js)
async function _apiFetch(path) {
  const token = localStorage.getItem('pb_token');
  const res = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`API GET ${path}: ${res.status}`);
  return res.json();
}

// ── In-memory cache ───────────────────────────────────────────────────────────
// Each entry: { id: string, name: string, tracks: Track[] }
// `tracks` keeps full track objects so library.html can render pl.tracks.length
// and pl.tracks.map() without changes.
let _cache = [];

// ── Init (async — call once before any render) ────────────────────────────────
export async function initPlaylists() {
  try {
    const res       = await _pbFetch('GET', '/api/collections/playlists/records?page=1&perPage=200');
    const playlists = res.items ?? [];

    _cache = await Promise.all(playlists.map(async pl => {
      const filter  = encodeURIComponent(`playlist="${pl.id}"`);
      const ptRes   = await _pbFetch('GET',
        `/api/collections/playlist_tracks/records?filter=${filter}&page=1&perPage=200&sort=position`);
      const ptItems = ptRes.items ?? [];

      // Load full track data for each fact_id (needed by library.html renderTrackRow)
      const tracks = (await Promise.all(
        ptItems.map(pt =>
          _apiFetch(`/app/v1/tracks/fact/${pt.fact_id}`).catch(() => null)
        )
      )).filter(Boolean);

      return { id: pl.id, name: pl.name, tracks };
    }));
  } catch (e) {
    console.warn('[playlists] initPlaylists falló:', e);
  }
}

// ── getPlaylists — sync (library.html and components.js call without await) ──
export function getPlaylists() {
  return [..._cache];
}

// ── createPlaylist — async: aguarda el ID real de PocketBase antes de retornar ─
export async function createPlaylist(name) {
  // Gate: plan Free → máx 3 playlists
  try {
    const res  = await _apiFetch('/app/v1/suscripciones/activa');
    const plan = res?.data?.tipo_plan ?? 'free';
    if (plan === 'free') {
      const real = _cache.filter(p => !p.id.startsWith('temp_'));
      if (real.length >= 3) {
        throw new Error('Plan Free: límite de 3 playlists alcanzado. Actualiza a Premium para crear más.');
      }
    }
  } catch (e) {
    if (e.message.startsWith('Plan Free')) throw e;
    // Si falla la consulta de plan, permitir continuar
  }

  const tempId = `temp_${Date.now()}`;
  const newPl  = { id: tempId, name: name.trim(), tracks: [] };
  _cache.push(newPl);

  try {
    const res = await _pbFetch('POST', '/api/collections/playlists/records', {
      name: name.trim(),
      user: _userId(),
    });
    const pl = _cache.find(p => p.id === tempId);
    if (pl) pl.id = res.id;
  } catch (e) {
    console.error(e);
  }

  return newPl;
}

// ── addTrackToPlaylist — sync optimistic + fire-and-forget ───────────────────
// Must be sync: components.js uses `const added = addTrackToPlaylist(...)` and
// immediately updates the UI from the return value, then calls getPlaylists().
export function addTrackToPlaylist(playlistId, track) {
  const pl = _cache.find(p => p.id === playlistId);
  if (!pl) return false;
  if (pl.tracks.some(t => t.fact_id === track.fact_id)) return false;

  pl.tracks.push(track);

  const position = pl.tracks.length;
  _pbFetch('POST', '/api/collections/playlist_tracks/records', {
    playlist: playlistId,
    fact_id:  track.fact_id,
    position,
  }).catch(console.error);

  return true;
}

// ── removeTrackFromPlaylist — sync optimistic + fire-and-forget ───────────────
// Caller: library.html handleRemoveTrack(playlistId, track.track_id)
export function removeTrackFromPlaylist(playlistId, trackId) {
  const pl = _cache.find(p => p.id === playlistId);
  if (!pl) return;

  const track  = pl.tracks.find(t => t.track_id === trackId);
  const factId = track?.fact_id;
  pl.tracks    = pl.tracks.filter(t => t.track_id !== trackId);

  if (factId != null) {
    const filter = encodeURIComponent(`playlist="${playlistId}"&&fact_id=${factId}`);
    _pbFetch('GET', `/api/collections/playlist_tracks/records?filter=${filter}&page=1&perPage=1`)
      .then(res => {
        const item = res?.items?.[0];
        if (item) return _pbFetch('DELETE', `/api/collections/playlist_tracks/records/${item.id}`);
      })
      .catch(console.error);
  }
}

// ── deletePlaylist — sync optimistic + fire-and-forget ───────────────────────
export function deletePlaylist(playlistId) {
  _cache = _cache.filter(p => p.id !== playlistId);
  _pbFetch('DELETE', `/api/collections/playlists/records/${playlistId}`).catch(console.error);
}

// ── renamePlaylist — sync optimistic + fire-and-forget ───────────────────────
export function renamePlaylist(playlistId, newName) {
  const name = newName.trim();
  if (!name) return false;

  const pl = _cache.find(p => p.id === playlistId);
  if (!pl) return false;

  pl.name = name;
  _pbFetch('PATCH', `/api/collections/playlists/records/${playlistId}`, { name }).catch(console.error);
  return true;
}
