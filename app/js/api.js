const API_BASE = '/api';
const PB_BASE  = 'http://localhost:8090';

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
    throw new Error(msg);
  }
  return res.json();
}

// ── PocketBase Auth ──────────────────────────────────────────────────────────
export async function pbLogin(email, password) {
  const res = await fetch(`${PB_BASE}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Credenciales inválidas');
  }
  return res.json();
}

export async function pbGetUser(userId, token) {
  const res = await fetch(`${PB_BASE}/api/collections/users/records/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function pbRegister(email, password, name, role = 'user') {
  const res = await fetch(`${PB_BASE}/api/collections/users/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, passwordConfirm: password, name, role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Error al registrar usuario');
  }
  return res.json();
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
