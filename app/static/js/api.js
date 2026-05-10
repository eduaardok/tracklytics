const BASE_URL = 'http://localhost:8000';

async function apiFetch(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${BASE_URL}${path}`);
  }
  return response.json();
}

function buildQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      qs.append(key, value);
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export function getGenres() {
  return apiFetch('/genres');
}

export function getAlbums(limit, offset) {
  return apiFetch(`/albums${buildQuery({ limit, offset })}`);
}

export function getAlbum(id) {
  return apiFetch(`/albums/${id}`);
}

export function getArtists(limit, offset, search) {
  return apiFetch(`/artists${buildQuery({ limit, offset, search })}`);
}

export function getArtist(id) {
  return apiFetch(`/artists/${id}`);
}

export function getTracks(limit, offset, minPopularity, explicit) {
  return apiFetch(`/tracks${buildQuery({
    limit,
    offset,
    min_popularity: minPopularity,
    explicit
  })}`);
}

export function getTrack(id) {
  if (id === null || id === undefined) {
    throw new Error('getTrack: id must not be null or undefined');
  }
  return apiFetch(`/tracks/${id}`);
}

export function getGenreTrends(orderBy, limit) {
  return apiFetch(`/genre-trends${buildQuery({ order_by: orderBy, limit })}`);
}

export function getArtistStats(orderBy, limit) {
  return apiFetch(`/artist-stats${buildQuery({ order_by: orderBy, limit })}`);
}

export function getCounts() {
  return apiFetch('/counts');
}

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

export function runEtl() {
  return apiFetch('/admin/run-etl', { method: 'POST' });
}

export function getEtlLogs(limit = 20) {
  return apiFetch(`/admin/etl-logs${buildQuery({ limit })}`);
}