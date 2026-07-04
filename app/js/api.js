import { showToast } from './toast.js';

const API_BASE = '/api';

export async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('pb_token');
  const res = await fetch(API_BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = err.detail;
    const msg = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map(e => e.msg || JSON.stringify(e)).join('; ')
        : `HTTP ${res.status}`;
    // 403 siempre es un rechazo de autorización (rol/tier/suscripción) — se
    // notifica aquí, una sola vez por llamada, para que ningún consumidor de
    // apiFetch (favoritos, historial, etc.) tenga que repetir este manejo.
    if (res.status === 403) showToast(msg, 'warning');
    throw new Error(msg);
  }
  return res.json();
}

// ── Autenticación (capability `seguridad`) ──────────────────────────────────
// El frontend ya no llama a PocketBase directo: pasa por FastAPI
// (/app/v1/seguridad/auth/*), que además deja rastro en ClickHouse
// (DIM_USUARIO, DIM_DISPOSITIVO, FACT_SESION) sin cambiar el token que el
// resto de la API sigue validando (ver design.md de la capability).

// dispositivo_id persistente por navegador (design.md, "DIM_DISPOSITIVO
// identificado por un id de dispositivo generado en cliente").
export function getDeviceId() {
  let id = localStorage.getItem('dispositivo_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('dispositivo_id', id);
  }
  return id;
}

async function authFetch(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const msg = typeof detail === 'string' ? detail : 'Error de autenticación';
    throw new Error(msg);
  }
  return res.json();
}

export async function pbLogin(email, password) {
  return authFetch('/app/v1/seguridad/auth/login', {
    email, password, dispositivo_id: getDeviceId(), tipo: 'web', app_version: 'web-1.0',
  });
}

export async function pbRegister(email, password, name, role = 'user', pais = '') {
  return authFetch('/app/v1/seguridad/auth/registro', { email, password, nombre: name, pais, rol: role });
}

export async function pbLogout() {
  const token = localStorage.getItem('pb_token');
  if (!token) return;
  await fetch(`${API_BASE}/app/v1/seguridad/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ dispositivo_id: getDeviceId() }),
  }).catch(() => {});
}

// ── App endpoints (FastAPI /app/v1) ─────────────────────────────────────────
export const Tracks = {
  top:       (limit = 20)             => apiFetch(`/app/v1/tracks/top?limit=${limit}`),
  search:    (q, limit = 20, offset = 0, genre = '') =>
    apiFetch(`/app/v1/tracks/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}&genre=${encodeURIComponent(genre)}`),
  get:       (id)                     => apiFetch(`/app/v1/tracks/${id}`),
  getByFact: (factId)                 => apiFetch(`/app/v1/tracks/fact/${factId}`),
  byArtist:  (artistId, limit = 20)   => apiFetch(`/app/v1/tracks/by-artist/${artistId}?limit=${limit}`),
  byAlbum:   (albumId,  limit = 20)   => apiFetch(`/app/v1/tracks/by-album/${albumId}?limit=${limit}`),
  byGenre:   (genreId,  limit = 20)   => apiFetch(`/app/v1/tracks/by-genre/${genreId}?limit=${limit}`),
};

export const Artists = {
  top:    (limit = 20)  => apiFetch(`/app/v1/artists/top?limit=${limit}`),
  get:    (id)          => apiFetch(`/app/v1/artists/${id}`),
  search: (q, limit=20) => apiFetch(`/app/v1/artists/search?q=${encodeURIComponent(q)}&limit=${limit}`),
};

export const Albums = {
  get:    (id)          => apiFetch(`/app/v1/albums/${id}`),
  search: (q, limit=20) => apiFetch(`/app/v1/albums/search?q=${encodeURIComponent(q)}&limit=${limit}`),
};

export const Genres = {
  list:   ()   => apiFetch(`/app/v1/genres`),
  get:    (id) => apiFetch(`/app/v1/genres/${id}`),
};

export const Suscripciones = {
  planes:    ()                       => apiFetch(`/app/v1/suscripciones/planes`),
  activa:    ()                       => apiFetch(`/app/v1/suscripciones/activa`),
  confirmar: (plan_id, metodo_pago)   => apiFetch(`/app/v1/suscripciones`, {
    method: 'POST',
    body: JSON.stringify({ plan_id, metodo_pago }),
  }),
  cancelar:  (id)                     => apiFetch(`/app/v1/suscripciones/${id}/cancelar`, { method: 'POST' }),
};

// Cached plan tier for the current session — reset on page load
let _planTierCache = null;
export async function getPlanTier() {
  if (_planTierCache) return _planTierCache;
  try {
    const res = await Suscripciones.activa();
    _planTierCache = res?.data?.tipo_plan ?? 'free';
  } catch { _planTierCache = 'free'; }
  return _planTierCache;
}
