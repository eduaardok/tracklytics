import { getSession, logout } from './auth.js';
import { getPlaylists, createPlaylist, addTrackToPlaylist } from './playlists.js';

// ── Lucide SVG icons (18×18, stroke currentColor, stroke-width 2) ─────────────
const ICON = {
  house:      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  search:     `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  layoutGrid: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
  music:      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  library:    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>`,
  barChart2:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>`,
  logOut:     `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  menu:       `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
  x:          `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

// ── Sidebar ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: '/catalogo/home.html',      label: 'Inicio',        icon: ICON.house },
  { href: '/catalogo/search.html',    label: 'Buscar',         icon: ICON.search },
  { href: '/catalogo/catalog.html',   label: 'Catálogo',       icon: ICON.layoutGrid },
  { href: '/catalogo/genres.html',    label: 'Géneros',        icon: ICON.music },
  { href: '/biblioteca/library.html', label: 'Mi Biblioteca',  icon: ICON.library },
];

const ANALYTICS_SUBS = [
  { href: '/analytics/dashboard.html',    label: 'Dashboard' },
  { href: '/analytics/genres.html',       label: 'Géneros' },
  { href: '/analytics/trends.html',       label: 'Tendencias' },
  { href: '/analytics/artists.html',         label: 'Artistas' },
  { href: '/analytics/compare-artists.html', label: 'Comparar Artistas' },
  { href: '/analytics/etl.html',             label: 'ETL' },
  { href: '/analytics/crud.html',         label: 'CRUD' },
  { href: '/analytics/data-quality.html', label: 'Calidad de Datos', adminOnly: true },
];

export function renderSidebar(activePage) {
  const user = getSession();
  const role = user?.role ?? 'user';
  const showAnalytics = role === 'admin' || role === 'analyst';
  const onAnalytics = activePage.startsWith('analytics');

  const analyticsHtml = showAnalytics ? `
    <a href="/analytics/dashboard.html" class="nav-link ${onAnalytics ? 'active' : ''}">
      ${ICON.barChart2}
      <span class="nav-text">Analítica</span>
    </a>
    ${onAnalytics ? ANALYTICS_SUBS.filter(s => !s.adminOnly || role === 'admin').map(s => `
      <a href="${s.href}" class="nav-link" style="padding-left:2.25rem;font-size:.82rem">
        <span class="nav-text">${s.label}</span>
      </a>`).join('') : ''}
  ` : '';

  const html = `
    <nav class="sidebar" id="main-sidebar">
      <div class="sidebar-header">
        <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar">
          ${ICON.menu}
        </button>
        <div class="sidebar-brand sidebar-logo">
          <img src="/img/logo.png" alt="Tracklytics" class="logo-img"
               onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
          <span class="logo-fallback" style="display:none">
            <span class="logo-t">T</span><span class="logo-rest">racklytics</span>
          </span>
        </div>
      </div>
      <div class="nav-section">
        ${NAV_ITEMS.map(l => `
          <a href="${l.href}" class="nav-link ${'/' + activePage === l.href ? 'active' : ''}">
            ${l.icon}
            <span class="nav-text">${l.label}</span>
          </a>`).join('')}
        ${analyticsHtml}
      </div>
      <div class="sidebar-footer">
        <div class="sidebar-user" id="user-menu">
          <div class="user-avatar">${(user?.name?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}</div>
          <span class="nav-text user-name">${user?.name || user?.email || 'Usuario'}</span>
        </div>
        <button class="sidebar-logout nav-text" id="sidebar-logout" title="Cerrar sesión">
          ${ICON.logOut}
        </button>
      </div>
    </nav>`;

  document.getElementById('sidebar-root').innerHTML = html;

  const sidebar = document.getElementById('main-sidebar');
  const main    = document.querySelector('.main-content');
  const btn     = document.getElementById('sidebar-toggle');

  const collapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  sidebar.style.transition = 'none';
  if (main) main.style.transition = 'none';
  if (collapsed) {
    sidebar.classList.add('collapsed');
    main?.classList.add('sidebar-collapsed');
    btn.innerHTML = ICON.x;
  }
  requestAnimationFrame(() => {
    sidebar.style.transition = '';
    if (main) main.style.transition = '';
  });

  btn.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    main?.classList.toggle('sidebar-collapsed', isCollapsed);
    localStorage.setItem('sidebar_collapsed', isCollapsed);
    btn.innerHTML = isCollapsed ? ICON.x : ICON.menu;
  });

  document.getElementById('user-menu').addEventListener('click', () => {
    window.location.href = '/autenticacion/profile.html';
  });

  document.getElementById('sidebar-logout').addEventListener('click', (e) => {
    e.stopPropagation();
    logout();
  });
}

// ── Player ────────────────────────────────────────────────────────────────────
let currentTrack = null;
let isPlaying    = false;
let progressTimer = null;
let progress = 0;

const GENRES_COLORS = ['#e91e63','#9c27b0','#3f51b5','#2196f3','#009688',
                       '#4caf50','#ff9800','#ff5722','#795548','#607d8b'];

export function renderPlayer() {
  document.getElementById('player-root').innerHTML = `
    <div class="player-bar">
      <div class="player-track" id="player-track">
        <div class="player-thumb" id="player-thumb">🎵</div>
        <div class="player-meta">
          <div class="player-title" id="player-title">Selecciona una canción</div>
          <div class="player-artist" id="player-artist"></div>
        </div>
      </div>
      <div class="player-controls">
        <div class="player-buttons">
          <button class="player-btn" id="prev-btn" title="Anterior">⏮</button>
          <button class="player-btn play-btn" id="play-btn" title="Reproducir">▶</button>
          <button class="player-btn" id="next-btn" title="Siguiente">⏭</button>
        </div>
        <div class="player-progress">
          <span class="progress-time" id="p-current">0:00</span>
          <div class="progress-bar" id="progress-bar">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
          <span class="progress-time" id="p-total">0:00</span>
        </div>
      </div>
      <div class="player-volume">
        <span>🔊</span>
        <input type="range" class="volume-slider" min="0" max="100" value="80">
      </div>
    </div>`;

  document.getElementById('play-btn').addEventListener('click', togglePlay);

  _initPlaylistModal();
}

// ── Playlist modal ────────────────────────────────────────────────────────────
window.__trackCache = window.__trackCache || {};

function _initPlaylistModal() {
  if (document.getElementById('playlist-modal')) return;

  const el = document.createElement('div');
  el.id = 'playlist-modal';
  el.className = 'modal-overlay hidden';
  el.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <div class="modal-header">
        <span class="modal-title">Agregar a playlist</span>
        <button class="modal-close" onclick="window.__plModal.close()" aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-track-info" id="modal-track-info"></div>
      <div id="modal-list"></div>
      <div class="modal-new-playlist">
        <input id="modal-new-name" type="text" placeholder="Nueva playlist…" maxlength="60"
               onkeydown="if(event.key==='Enter') window.__plModal.createAndAdd()"/>
        <button class="btn btn-primary btn-sm" onclick="window.__plModal.createAndAdd()">Crear</button>
      </div>
      <div id="modal-feedback" class="modal-feedback"></div>
    </div>`;

  el.addEventListener('click', e => { if (e.target === el) window.__plModal.close(); });
  document.body.appendChild(el);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') window.__plModal?.close();
  });
}

window.__plModal = {
  open(trackId) {
    const track = window.__trackCache[trackId];
    if (!track) return;
    window.__plModal._track = track;

    const trackName = track.track_name || track.name || '—';
    const artist    = track.artist_name || '';
    document.getElementById('modal-track-info').innerHTML =
      `<strong>${trackName}</strong>${artist ? `<span class="text-muted"> — ${artist}</span>` : ''}`;
    document.getElementById('modal-new-name').value = '';
    document.getElementById('modal-feedback').textContent = '';
    this._refresh();
    document.getElementById('playlist-modal').classList.remove('hidden');
    document.getElementById('modal-new-name').focus();
  },

  close() {
    document.getElementById('playlist-modal')?.classList.add('hidden');
    this._track = null;
  },

  _refresh() {
    const playlists = getPlaylists();
    const listEl = document.getElementById('modal-list');
    if (!playlists.length) {
      listEl.innerHTML = `<p class="modal-empty">Aún no tienes playlists. Crea una abajo.</p>`;
      return;
    }
    listEl.innerHTML = playlists.map(pl => `
      <div class="modal-pl-item" onclick="window.__plModal.addTo('${pl.id}')">
        <div class="modal-pl-info">
          <span class="modal-pl-name">${pl.name}</span>
          <span class="modal-pl-count">${pl.tracks.length} canción${pl.tracks.length !== 1 ? 'es' : ''}</span>
        </div>
        <span class="modal-pl-add">＋</span>
      </div>`).join('');
  },

  addTo(playlistId) {
    const track = this._track;
    if (!track) return;
    const added = addTrackToPlaylist(playlistId, track);
    const pl = getPlaylists().find(p => p.id === playlistId);
    const fb = document.getElementById('modal-feedback');
    fb.textContent = added
      ? `✓ Agregado a "${pl?.name}"`
      : `Ya está en "${pl?.name}"`;
    fb.className = 'modal-feedback ' + (added ? 'modal-feedback-ok' : 'modal-feedback-dup');
    this._refresh();
  },

  createAndAdd() {
    const name = document.getElementById('modal-new-name').value.trim();
    if (!name) return;
    const pl = createPlaylist(name);
    if (this._track) addTrackToPlaylist(pl.id, this._track);
    document.getElementById('modal-new-name').value = '';
    const fb = document.getElementById('modal-feedback');
    fb.textContent = `✓ Playlist "${pl.name}" creada`;
    fb.className = 'modal-feedback modal-feedback-ok';
    this._refresh();
  },
};

export function playTrack(track) {
  currentTrack = track;
  isPlaying = true;
  progress = 0;

  document.getElementById('player-title').textContent  = track.track_name || track.name || '';
  document.getElementById('player-artist').textContent = track.artist_name || '';
  document.getElementById('player-thumb').textContent  = '🎵';
  document.getElementById('play-btn').textContent = '⏸';

  const totalMs = track.duration_ms || 180000;
  document.getElementById('p-total').textContent = msToTime(totalMs);
  startProgress(totalMs);
}

function togglePlay() {
  if (!currentTrack) return;
  isPlaying = !isPlaying;
  document.getElementById('play-btn').textContent = isPlaying ? '⏸' : '▶';
  if (isPlaying) startProgress(currentTrack.duration_ms || 180000);
  else clearInterval(progressTimer);
}

function startProgress(totalMs) {
  clearInterval(progressTimer);
  const step = 500;
  progressTimer = setInterval(() => {
    progress += step;
    if (progress >= totalMs) {
      progress = 0;
      clearInterval(progressTimer);
      isPlaying = false;
      document.getElementById('play-btn').textContent = '▶';
    }
    const pct = (progress / totalMs) * 100;
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('p-current').textContent = msToTime(progress);
  }, step);
}

function msToTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Track row ─────────────────────────────────────────────────────────────────
export function trackRow(track, index) {
  const name = track.track_name || track.name || '—';
  window.__trackCache[track.track_id] = track;
  return `
    <div class="track-row" data-id="${track.track_id}" onclick="location.href='/catalogo/track.html?id=${track.track_id}'">
      <div class="track-num">${index + 1}</div>
      <div class="track-info">
        <div class="track-name">${name}</div>
        <div class="track-artist">${track.artist_name || ''}</div>
      </div>
      <div class="track-duration">${track.duration_ms ? msToTime(track.duration_ms) : '—'}</div>
      <button class="track-menu-btn" title="Agregar a playlist"
        onclick="event.stopPropagation(); window.__plModal.open('${track.track_id}')">⋮</button>
    </div>`;
}

// ── Expose play globally for inline onclick ───────────────────────────────────
window.__playTrack = playTrack;

// ── Loading spinner ───────────────────────────────────────────────────────────
export function spinner() {
  return '<div class="loading-center"><div class="spinner"></div></div>';
}

// ── Alert ─────────────────────────────────────────────────────────────────────
export function alert(msg, type = 'error') {
  return `<div class="alert alert-${type}">${msg}</div>`;
}

// ── Genre colors ──────────────────────────────────────────────────────────────
export function genreColor(index) {
  return GENRES_COLORS[index % GENRES_COLORS.length];
}
