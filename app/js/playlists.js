const KEY = 'tl_playlists';

export function getPlaylists() {
  return JSON.parse(localStorage.getItem(KEY) || '[]');
}

function save(playlists) {
  localStorage.setItem(KEY, JSON.stringify(playlists));
}

export function createPlaylist(name) {
  const all = getPlaylists();
  const pl = { id: String(Date.now()), name: name.trim(), tracks: [] };
  all.push(pl);
  save(all);
  return pl;
}

export function addTrackToPlaylist(playlistId, track) {
  const all = getPlaylists();
  const pl = all.find(p => p.id === playlistId);
  if (!pl || pl.tracks.some(t => t.track_id === track.track_id)) return false;
  pl.tracks.push(track);
  save(all);
  return true;
}

export function removeTrackFromPlaylist(playlistId, trackId) {
  const all = getPlaylists();
  const pl = all.find(p => p.id === playlistId);
  if (pl) {
    pl.tracks = pl.tracks.filter(t => t.track_id !== trackId);
    save(all);
  }
}

export function deletePlaylist(playlistId) {
  save(getPlaylists().filter(p => p.id !== playlistId));
}
