import { getSession, logout } from './auth.js';
import { initPlaylists, getPlaylists, createPlaylist, addTrackToPlaylist } from './playlists.js';
import { isFavorite, toggleFavorite } from './favorites.js';
import { addToHistory } from './history.js';

// ── Lucide SVG icons (18×18, stroke currentColor, stroke-width 2) ─────────────
const ICON = {
  house:      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  search:     `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  layoutGrid: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
  music:      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  library:    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>`,
  barChart2:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>`,
  logOut:     `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  creditCard: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  menu:       `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
  x:          `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

// ── Scalable glyph icons (size via inherited font-size, used in cover art / stat cards / empty states) ──
export const GLYPH = {
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  mic:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  disc:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>`,
};

// ── Sidebar ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: '/catalogo/home.html',        label: 'Inicio',        icon: ICON.house },
  { href: '/catalogo/search.html',      label: 'Buscar',         icon: ICON.search },
  { href: '/catalogo/catalog.html',     label: 'Catálogo',       icon: ICON.layoutGrid },
  { href: '/catalogo/genres.html',      label: 'Géneros',        icon: ICON.music },
  { href: '/biblioteca/library.html',   label: 'Mi Biblioteca',  icon: ICON.library },
  { href: '/autenticacion/planes.html', label: 'Mi plan',        icon: ICON.creditCard },
];

const ANALYTICS_SUBS = [
  { href: '/analytics/dashboard.html',    label: 'Dashboard' },
  { href: '/analytics/genres.html',       label: 'Géneros' },
  { href: '/analytics/trends.html',       label: 'Tendencias' },
  { href: '/analytics/artists.html',         label: 'Artistas' },
  { href: '/analytics/compare-artists.html', label: 'Comparar Artistas' },
  { href: '/analytics/benchmark.html',          label: 'Benchmark Género' },
  { href: '/analytics/mercado-vs-tracklytics.html', label: 'Mercado vs. Tracklytics' },
  { href: '/analytics/reporte-diario.html',  label: 'Reporte Diario', adminOnly: true },
  { href: '/analytics/etl.html',             label: 'ETL', adminOnly: true },
  { href: '/analytics/crud.html',         label: 'CRUD', adminOnly: true },
  { href: '/analytics/data-quality.html', label: 'Calidad de Datos', adminOnly: true },
  { href: '/partners/console.html',       label: 'Partners (consola)', adminOnly: true },
];

export function renderSidebar(activePage) {
  const user = getSession();
  const role = user?.role ?? 'user';
  const showAnalytics = role === 'admin' || role === 'analyst';
  const onAnalytics = activePage.startsWith('analytics') || activePage.startsWith('partners');

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

// ── Player state (localStorage) ───────────────────────────────────────────────
// Shape: { track, isPlaying, startedAt, elapsedMs, volume, queue, queueHistory }
// queue: tracks after current (queue[0] = next). queueHistory: tracks before
// current in reverse-chronological order (queueHistory[0] = previous), max 50.
function _savePlayerState(patch) {
  const state = _loadPlayerState();
  localStorage.setItem('tl_player', JSON.stringify({ ...state, ...patch }));
}
function _loadPlayerState() {
  try { return JSON.parse(localStorage.getItem('tl_player') || '{}'); }
  catch { return {}; }
}
function _getVolume() {
  const slider = document.querySelector('.volume-slider');
  if (slider) return Number(slider.value);
  return _loadPlayerState().volume ?? 80;
}

// Only remaining module-level player variable — needed by clearInterval across calls
let progressTimer = null;

const GENRES_COLORS = ['#e91e63','#9c27b0','#3f51b5','#2196f3','#009688',
                       '#4caf50','#ff9800','#ff5722','#795548','#607d8b'];

// ── Player ────────────────────────────────────────────────────────────────────
export function renderPlayer() {
  document.getElementById('player-root').innerHTML = `
    <div class="player-bar">
      <div class="player-track" id="player-track">
        <div class="player-thumb" id="player-thumb">${GLYPH.music}</div>
        <div class="player-meta" id="player-nav" style="cursor:pointer;flex:1;min-width:0;overflow:hidden">
          <div class="player-title" id="player-title">Selecciona una canción</div>
          <div class="player-artist" id="player-artist"></div>
        </div>
        <button class="player-btn player-fav-btn" id="player-fav-btn" title="Favorito" style="flex-shrink:0;font-size:1rem">♥</button>
        <button class="player-btn" id="player-pl-btn" title="Agregar a playlist" style="flex-shrink:0;font-size:1.1rem">⋮</button>
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
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.6"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        <input type="range" class="volume-slider" min="0" max="100" value="80">
        <button class="player-btn" id="queue-btn" title="Cola">☰</button>
      </div>
      <div class="player-queue-panel hidden" id="queue-panel">
        <div class="queue-panel-header">
          <span>Cola de reproducción</span>
          <button class="queue-clear-btn" id="queue-clear">Limpiar</button>
        </div>
        <div id="queue-list"></div>
      </div>
    </div>`;

  document.getElementById('play-btn').addEventListener('click', togglePlay);
  document.getElementById('prev-btn').addEventListener('click', _playPrev);
  document.getElementById('next-btn').addEventListener('click', _playNext);

  document.getElementById('queue-btn').addEventListener('click', () => {
    document.getElementById('queue-panel').classList.toggle('hidden');
    _renderQueuePanel();
  });
  document.getElementById('queue-clear').addEventListener('click', () => {
    _savePlayerState({ queue: [] });
    _renderQueuePanel();
  });

  _initPlaylistModal();
  initPlaylists().catch(() => {});
  _hydratePlayer();
  _initSeek();

  // Sync player state across tabs — storage event only fires for OTHER tabs
  window.addEventListener('storage', e => {
    if (e.key === 'tl_player') _hydratePlayer();
  });
}

// ── Seek (clic + arrastre en la barra de progreso) ───────────────────────────
function _initSeek() {
  const bar = document.getElementById('progress-bar');
  if (!bar) return;

  function frac(e) {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min((e.clientX - r.left) / r.width, 1));
  }

  function applySeek(f) {
    const state   = _loadPlayerState();
    if (!state.track) return;
    const totalMs = state.track.duration_ms || 180000;
    const newMs   = f * totalMs;
    document.getElementById('progress-fill').style.width = `${f * 100}%`;
    document.getElementById('p-current').textContent     = msToTime(newMs);
    if (state.isPlaying) {
      _savePlayerState({ elapsedMs: newMs, startedAt: Date.now() });
      startProgress(totalMs, newMs);
    } else {
      _savePlayerState({ elapsedMs: newMs });
    }
  }

  bar.addEventListener('pointerdown', e => {
    const state = _loadPlayerState();
    if (!state.track) return;
    bar.setPointerCapture(e.pointerId);
    clearInterval(progressTimer);
    const f = frac(e);
    const totalMs = state.track.duration_ms || 180000;
    document.getElementById('progress-fill').style.width = `${f * 100}%`;
    document.getElementById('p-current').textContent     = msToTime(f * totalMs);
    e.preventDefault();
  });

  bar.addEventListener('pointermove', e => {
    if (!bar.hasPointerCapture(e.pointerId)) return;
    const state = _loadPlayerState();
    if (!state.track) return;
    const f = frac(e);
    const totalMs = state.track.duration_ms || 180000;
    document.getElementById('progress-fill').style.width = `${f * 100}%`;
    document.getElementById('p-current').textContent     = msToTime(f * totalMs);
  });

  bar.addEventListener('pointerup',     e => { if (bar.hasPointerCapture(e.pointerId)) applySeek(frac(e)); });
  bar.addEventListener('pointercancel', e => {
    if (!bar.hasPointerCapture(e.pointerId)) return;
    // Drag cancelled — restore to last saved position
    const state = _loadPlayerState();
    if (state.track) {
      const elapsed = (state.elapsedMs || 0) +
        (state.isPlaying && state.startedAt ? Date.now() - state.startedAt : 0);
      const totalMs = state.track.duration_ms || 180000;
      document.getElementById('progress-fill').style.width = `${Math.min(elapsed / totalMs, 1) * 100}%`;
      document.getElementById('p-current').textContent     = msToTime(elapsed);
      if (state.isPlaying) startProgress(totalMs, elapsed);
    }
  });
}

// ── Rehidratación al cargar / cambio de pestaña ───────────────────────────────
function _hydratePlayer() {
  const state = _loadPlayerState();
  if (!state.track) return;

  const track   = state.track;
  const totalMs = track.duration_ms || 180000;

  const elapsed = (state.elapsedMs || 0) +
    (state.isPlaying && state.startedAt ? Date.now() - state.startedAt : 0);

  document.getElementById('player-title').textContent  = track.track_name || track.name || '';
  document.getElementById('player-artist').textContent = track.artist_name || '';
  document.getElementById('p-total').textContent       = msToTime(totalMs);

  window.__trackCache[track.fact_id] = track;

  const favBtn = document.getElementById('player-fav-btn');
  if (favBtn) {
    favBtn.classList.toggle('active', isFavorite(track.fact_id));
    favBtn.onclick = () => {
      const added = toggleFavorite(track);
      favBtn.classList.toggle('active', added);
    };
  }
  const plBtn = document.getElementById('player-pl-btn');
  if (plBtn) {
    plBtn.onclick = () => {
      if (window.__plModal) window.__plModal.open(track.fact_id);
    };
  }
  const navEl = document.getElementById('player-nav');
  if (navEl) {
    navEl.onclick = () => {
      window.location.href = `/catalogo/track.html?fact_id=${track.fact_id}`;
    };
  }

  const slider = document.querySelector('.volume-slider');
  if (slider) slider.value = state.volume ?? 80;

  if (elapsed >= totalMs) {
    _savePlayerState({ isPlaying: false, startedAt: null, elapsedMs: 0 });
    document.getElementById('play-btn').textContent            = '▶';
    document.getElementById('progress-fill').style.width      = '0%';
    document.getElementById('p-current').textContent          = '0:00';
  } else {
    document.getElementById('progress-fill').style.width = `${(elapsed / totalMs) * 100}%`;
    document.getElementById('p-current').textContent     = msToTime(elapsed);
    document.getElementById('play-btn').textContent      = state.isPlaying ? '⏸' : '▶';
    if (state.isPlaying) startProgress(totalMs, elapsed);
  }

  const queuePanel = document.getElementById('queue-panel');
  if (queuePanel && !queuePanel.classList.contains('hidden')) _renderQueuePanel();
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
               onkeydown="if(event.key==='Enter') window.__plModal.createAndAdd().catch(e=>console.error(e))"/>
        <button class="btn btn-primary btn-sm"
                onclick="window.__plModal.createAndAdd().catch(e=>console.error(e))">Crear</button>
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
  // open accepts fact_id (number, from trackRow) or track_id (string, from track.html)
  // Both callers store the matching key in __trackCache before calling open().
  open(id) {
    const track = window.__trackCache[id];
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

  _refresh: async function() {
    const playlists = getPlaylists();
    const listEl    = document.getElementById('modal-list');
    if (!playlists.length) {
      listEl.innerHTML = `<p class="modal-empty">Aún no tienes playlists. Crea una abajo.</p>`;
      return;
    }
    listEl.innerHTML = playlists.map(pl => `
      <div class="modal-pl-item"
           onclick="window.__plModal.addTo('${pl.id}').catch(e=>console.error(e))">
        <div class="modal-pl-info">
          <span class="modal-pl-name">${pl.name}</span>
          <span class="modal-pl-count">${pl.tracks.length} canción${pl.tracks.length !== 1 ? 'es' : ''}</span>
        </div>
        <span class="modal-pl-add">＋</span>
      </div>`).join('');
  },

  addTo: async function(playlistId) {
    const track = this._track;
    if (!track) return;
    const added = addTrackToPlaylist(playlistId, track);
    const pl    = getPlaylists().find(p => p.id === playlistId);
    const fb    = document.getElementById('modal-feedback');
    fb.textContent = added
      ? `✓ Agregado a "${pl?.name}"`
      : `Ya está en "${pl?.name}"`;
    fb.className = 'modal-feedback ' + (added ? 'modal-feedback-ok' : 'modal-feedback-dup');
    this._refresh();
  },

  createAndAdd: async function() {
    const name = document.getElementById('modal-new-name').value.trim();
    if (!name) return;
    const pl = await createPlaylist(name);
    if (this._track) addTrackToPlaylist(pl.id, this._track);
    document.getElementById('modal-new-name').value = '';
    const fb = document.getElementById('modal-feedback');
    fb.textContent = `✓ Playlist "${pl.name}" creada`;
    fb.className   = 'modal-feedback modal-feedback-ok';
    this._refresh();
  },
};

// ── Queue ─────────────────────────────────────────────────────────────────────
export function setQueue(tracks, startIndex = 0) {
  const current = tracks[startIndex];
  const ahead   = tracks.slice(startIndex + 1);
  // Reverse so queueHistory[0] = most recently played
  const behind  = tracks.slice(0, startIndex).reverse();
  playTrack(current);  // async fire-and-forget; its _savePlayerState runs as microtask
  // This _savePlayerState runs synchronously (before playTrack's microtask resumes),
  // so playTrack's subsequent _savePlayerState will spread-merge and preserve these.
  _savePlayerState({ queue: ahead, queueHistory: behind });
}

function _playNext() {
  const state = _loadPlayerState();
  const queue = state.queue ?? [];
  if (!queue.length) {
    clearInterval(progressTimer);
    _savePlayerState({ isPlaying: false, startedAt: null });
    document.getElementById('play-btn').textContent       = '▶';
    document.getElementById('progress-fill').style.width = '100%';
    document.getElementById('p-current').textContent     = msToTime(state.track?.duration_ms || 180000);
    return;
  }
  const nextTrack  = queue[0];
  const history    = state.queueHistory ?? [];
  const newHistory = state.track ? [state.track, ...history].slice(0, 50) : history;
  _savePlayerState({ queue: queue.slice(1), queueHistory: newHistory });
  playTrack(nextTrack);
}

function _playPrev() {
  const state   = _loadPlayerState();
  if (!state.track) return;
  const elapsed = (state.elapsedMs || 0) +
    (state.isPlaying && state.startedAt ? Date.now() - state.startedAt : 0);
  const history = state.queueHistory ?? [];

  if (elapsed > 3000 || !history.length) {
    // Restart current track rather than going back
    clearInterval(progressTimer);
    _savePlayerState({ isPlaying: true, startedAt: Date.now(), elapsedMs: 0 });
    const totalMs = state.track.duration_ms || 180000;
    document.getElementById('p-total').textContent = msToTime(totalMs);
    startProgress(totalMs, 0);
    return;
  }

  const prevTrack = history[0];
  const queue     = state.queue ?? [];
  _savePlayerState({
    queue:        state.track ? [state.track, ...queue] : queue,
    queueHistory: history.slice(1),
  });
  playTrack(prevTrack);
}

function _renderQueuePanel() {
  const queue  = _loadPlayerState().queue ?? [];
  const listEl = document.getElementById('queue-list');
  if (!listEl) return;
  if (!queue.length) {
    listEl.innerHTML = `<p class="queue-empty">La cola está vacía</p>`;
    return;
  }
  listEl.innerHTML = queue.map((t, i) => `
    <div class="queue-item">
      <div class="queue-item-info">
        <div class="queue-item-name">${t.track_name || t.name || '—'}</div>
        <div class="queue-item-artist">${t.artist_name || ''}</div>
      </div>
      <button class="queue-remove-btn" title="Quitar de la cola"
              onclick="window._removeFromQueue(${i})">✕</button>
    </div>`).join('');
}

function _removeFromQueue(index) {
  const state = _loadPlayerState();
  const queue = [...(state.queue ?? [])];
  queue.splice(index, 1);
  _savePlayerState({ queue });
  _renderQueuePanel();
}
// Exposed globally because _renderQueuePanel generates inline onclick strings
window._removeFromQueue = _removeFromQueue;

// ── playTrack ─────────────────────────────────────────────────────────────────
export async function playTrack(track) {
  await addToHistory(track);   // sync fire-and-forget; await is a no-op but explicit

  _savePlayerState({
    track,
    isPlaying:  true,
    startedAt:  Date.now(),
    elapsedMs:  0,
    volume:     _getVolume(),
  });

  document.getElementById('player-title').textContent  = track.track_name || track.name || '';
  document.getElementById('player-artist').textContent = track.artist_name || '';
  document.getElementById('play-btn').textContent      = '⏸';

  window.__trackCache[track.fact_id] = track;

  const favBtn = document.getElementById('player-fav-btn');
  if (favBtn) {
    favBtn.classList.toggle('active', isFavorite(track.fact_id));
    favBtn.onclick = () => {
      const added = toggleFavorite(track);
      favBtn.classList.toggle('active', added);
    };
  }
  const plBtn = document.getElementById('player-pl-btn');
  if (plBtn) {
    plBtn.onclick = () => {
      if (window.__plModal) window.__plModal.open(track.fact_id);
    };
  }
  const navEl = document.getElementById('player-nav');
  if (navEl) {
    navEl.onclick = () => {
      window.location.href = `/catalogo/track.html?fact_id=${track.fact_id}`;
    };
  }

  const totalMs = track.duration_ms || 180000;
  document.getElementById('p-total').textContent = msToTime(totalMs);
  startProgress(totalMs, 0);
}

// ── togglePlay ────────────────────────────────────────────────────────────────
function togglePlay() {
  const state = _loadPlayerState();
  if (!state.track) return;

  const isNowPlaying = !state.isPlaying;
  document.getElementById('play-btn').textContent = isNowPlaying ? '⏸' : '▶';

  if (isNowPlaying) {
    _savePlayerState({ isPlaying: true, startedAt: Date.now() });
    startProgress(state.track.duration_ms || 180000, state.elapsedMs || 0);
  } else {
    const newElapsed = (state.elapsedMs || 0) +
      (state.startedAt ? Date.now() - state.startedAt : 0);
    clearInterval(progressTimer);
    _savePlayerState({ isPlaying: false, startedAt: null, elapsedMs: newElapsed });
  }
}

// ── startProgress ─────────────────────────────────────────────────────────────
function startProgress(totalMs, fromMs = 0) {
  clearInterval(progressTimer);
  let elapsed = fromMs;
  const step  = 500;
  progressTimer = setInterval(() => {
    elapsed += step;
    if (elapsed >= totalMs) {
      clearInterval(progressTimer);
      _playNext();  // advances queue or stops if empty
      return;
    }
    const pct = Math.min((elapsed / totalMs) * 100, 100);
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('p-current').textContent     = msToTime(elapsed);
  }, step);
}

function msToTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Track row ─────────────────────────────────────────────────────────────────
export function trackRow(track, index) {
  const name = track.track_name || track.name || '—';
  // Key by fact_id (number) — __plModal.open and __favToggle receive this same value
  window.__trackCache[track.fact_id] = track;
  return `
    <div class="track-row" data-id="${track.track_id}" onclick="location.href='/catalogo/track.html?fact_id=${track.fact_id}'">
      <div class="track-num">${index + 1}</div>
      <div class="track-info">
        <div class="track-name">${name}</div>
        <div class="track-artist">${track.artist_name || ''}${track.genre_name ? ` · <span class="track-genre">${track.genre_name}</span>` : ''}</div>
      </div>
      <div class="track-duration">${track.duration_ms ? msToTime(track.duration_ms) : '—'}</div>
      <button class="track-queue-btn" title="Añadir a cola"
        onclick="event.stopPropagation(); window.__queueAdd(${track.fact_id}, this)">⊕</button>
      <button class="track-fav-btn${isFavorite(track.fact_id) ? ' active' : ''}" title="Favorito"
        onclick="event.stopPropagation(); window.__favToggle(this, ${track.fact_id})">♥</button>
      <button class="track-menu-btn" title="Agregar a playlist"
        onclick="event.stopPropagation(); window.__plModal.open(${track.fact_id})">⋮</button>
    </div>`;
}

// ── Expose globals for inline onclick ────────────────────────────────────────
window.__playTrack = playTrack;

window.__favToggle = function(btn, factId) {
  const track = window.__trackCache[factId];
  if (!track) return;
  const added = toggleFavorite(track);
  btn.classList.toggle('active', added);
};

window.__queueAdd = function(factId, btn) {
  const track = window.__trackCache[factId];
  if (!track) return;
  const state = _loadPlayerState();
  _savePlayerState({ queue: [...(state.queue ?? []), track] });
  // brief visual feedback on the button
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓';
    btn.style.color = 'var(--accent)';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1200);
  }
  const panel = document.getElementById('queue-panel');
  if (panel && !panel.classList.contains('hidden')) _renderQueuePanel();
};

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

// ── Cover art (gradient placeholder) ─────────────────────────────────────────
export function coverArt(seed = 0, size = 'md', icon = GLYPH.music) {
  const i   = Math.abs(Math.round(seed)) % GENRES_COLORS.length;
  const c1  = GENRES_COLORS[i];
  const c2  = GENRES_COLORS[(i + 3) % GENRES_COLORS.length];
  return `<div class="cover-art cover-art-${size}"
               style="background:linear-gradient(135deg,${c1},${c2})"
               aria-hidden="true">${icon}</div>`;
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function emptyState(icon, title, sub = '', ctaHtml = '') {
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <div class="empty-state-title">${title}</div>
    ${sub    ? `<div class="empty-state-sub">${sub}</div>` : ''}
    ${ctaHtml ? ctaHtml : ''}
  </div>`;
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
export function skeletonRows(n = 5) {
  return Array.from({ length: n },
    () => '<div class="skeleton skeleton-row"></div>').join('');
}
