const KEY = 'tl_favorites';

export function getFavorites() {
  return JSON.parse(localStorage.getItem(KEY) || '[]');
}

function save(favs) {
  localStorage.setItem(KEY, JSON.stringify(favs));
}

export function isFavorite(trackId) {
  return getFavorites().some(t => t.track_id === trackId);
}

export function toggleFavorite(track) {
  const all = getFavorites();
  const idx = all.findIndex(t => t.track_id === track.track_id);
  if (idx !== -1) {
    all.splice(idx, 1);
    save(all);
    return false;
  }
  all.push(track);
  save(all);
  return true;
}
