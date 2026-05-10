import { getTracks, getTrack } from './api.js';

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

function showLoading(container) {
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
}

function showError(container, message) {
  container.innerHTML = `
    <div class="error-state">
      <p class="error-message">${message}</p>
      <button class="dismiss-btn" onclick="this.closest('.error-state').remove()">Dismiss</button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

export function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// ---------------------------------------------------------------------------
// Footer year
// ---------------------------------------------------------------------------

document.getElementById('footer-year').textContent = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Active nav link
// ---------------------------------------------------------------------------

document.querySelectorAll('.nav-link').forEach(link => {
  if (link.getAttribute('href') === window.location.pathname.split('/').pop()) {
    link.classList.add('active');
  }
});

// ---------------------------------------------------------------------------
// Page state
// ---------------------------------------------------------------------------

let offset = 0;
const PAGE_SIZE = 20;
let minPopularity = 0;
let explicitOnly = false;

// ---------------------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------------------

function isModalOpen() {
  return !document.getElementById('detail-panel').classList.contains('hidden');
}

function closeModal() {
  document.getElementById('detail-panel').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

// ---------------------------------------------------------------------------
// Track table rendering
// ---------------------------------------------------------------------------

function renderTrackTable(tracks) {
  const container = document.getElementById('track-list-container');
  if (tracks.length === 0) {
    container.innerHTML = '<p class="no-results">No tracks found</p>';
    return;
  }
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Track Name</th>
        <th>Album</th>
        <th>Popularity</th>
        <th>Duration</th>
      </tr>
    </thead>
    <tbody>
      ${tracks.map(t => `
        <tr data-id="${t.track_id}" style="cursor:pointer;">
          <td>${t.track_name}</td>
          <td>${t.album_id}</td>
          <td>${t.popularity}</td>
          <td>${formatDuration(t.duration_ms)}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  container.innerHTML = '';
  container.appendChild(table);
  // Attach click handlers for track rows
  container.querySelectorAll('tbody tr').forEach(row => {
    row.addEventListener('click', () => openTrackDetail(row.dataset.id));
  });
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function updatePagination(dataLength) {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const pageInfo = document.getElementById('page-info');
  prevBtn.disabled = offset === 0;
  nextBtn.disabled = dataLength < PAGE_SIZE;
  pageInfo.textContent = `Page ${Math.floor(offset / PAGE_SIZE) + 1}`;
}

// ---------------------------------------------------------------------------
// Fetch tracks
// ---------------------------------------------------------------------------

async function fetchTracks() {
  const container = document.getElementById('track-list-container');
  showLoading(container);
  try {
    const data = await getTracks(
      PAGE_SIZE,
      offset,
      minPopularity > 0 ? minPopularity : undefined,
      explicitOnly ? true : undefined
    );
    renderTrackTable(data);
    updatePagination(data.length);
  } catch (err) {
    showError(container, err.message);
  }
}

// ---------------------------------------------------------------------------
// Pagination button handlers
// ---------------------------------------------------------------------------

document.getElementById('prev-btn').addEventListener('click', () => {
  offset = Math.max(0, offset - PAGE_SIZE);
  fetchTracks();
});

document.getElementById('next-btn').addEventListener('click', () => {
  offset += PAGE_SIZE;
  fetchTracks();
});

// ---------------------------------------------------------------------------
// Popularity slider — update display on input, fetch on change
// ---------------------------------------------------------------------------

const slider = document.getElementById('popularity-slider');
const sliderDisplay = document.getElementById('popularity-value');

slider.addEventListener('input', () => {
  sliderDisplay.textContent = slider.value;
});

slider.addEventListener('change', () => {
  if (isModalOpen()) closeModal();
  minPopularity = parseInt(slider.value, 10);
  offset = 0;
  fetchTracks();
});

// ---------------------------------------------------------------------------
// Explicit checkbox
// ---------------------------------------------------------------------------

document.getElementById('explicit-checkbox').addEventListener('change', (e) => {
  if (isModalOpen()) closeModal();
  explicitOnly = e.target.checked;
  offset = 0;
  fetchTracks();
});

// ---------------------------------------------------------------------------
// Audio feature keys and Plotly layout base
// ---------------------------------------------------------------------------

const AUDIO_FEATURE_KEYS = [
  'danceability', 'energy', 'speechiness',
  'acousticness', 'instrumentalness', 'liveness', 'valence'
];

const PLOTLY_LAYOUT_BASE = {
  paper_bgcolor: '#1a1a1a',
  plot_bgcolor:  '#1a1a1a',
  font:          { color: '#ffffff', family: 'system-ui, sans-serif' },
  margin:        { t: 40, r: 20, b: 40, l: 40 },
};

// ---------------------------------------------------------------------------
// Modal open
// ---------------------------------------------------------------------------

function openModal() {
  document.getElementById('detail-panel').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Radar chart rendering
// ---------------------------------------------------------------------------

function renderRadarChart(container, audioFeatures) {
  const values = AUDIO_FEATURE_KEYS.map(k => Math.round(audioFeatures[k] * 100));
  const trace = {
    type: 'scatterpolar',
    r: [...values, values[0]],
    theta: [...AUDIO_FEATURE_KEYS, AUDIO_FEATURE_KEYS[0]],
    fill: 'toself',
    fillcolor: 'rgba(29, 185, 84, 0.2)',
    line: { color: '#1db954' }
  };
  const layout = {
    ...PLOTLY_LAYOUT_BASE,
    polar: {
      bgcolor: '#1a1a1a',
      radialaxis: { visible: true, range: [0, 100], gridcolor: '#2a2a2a' },
      angularaxis: { gridcolor: '#2a2a2a' }
    }
  };
  Plotly.newPlot(container, [trace], layout, { responsive: true, displayModeBar: false });
}

// ---------------------------------------------------------------------------
// Track detail panel
// ---------------------------------------------------------------------------

async function openTrackDetail(id) {
  const modalBody = document.getElementById('modal-body');
  openModal();
  showLoading(modalBody);
  try {
    const track = await getTrack(id);
    modalBody.innerHTML = `
      <h2 style="margin-bottom: 1rem; color: var(--text-primary);">${track.track_name}</h2>
      <div class="detail-field">
        <span class="detail-field-label">Album</span>
        <span class="detail-field-value">${track.album_id}</span>
      </div>
      <div class="detail-field">
        <span class="detail-field-label">Popularity</span>
        <span class="detail-field-value">${track.popularity}</span>
      </div>
      <div class="detail-field">
        <span class="detail-field-label">Duration</span>
        <span class="detail-field-value">${formatDuration(track.duration_ms)}</span>
      </div>
      <div class="detail-field">
        <span class="detail-field-label">Explicit</span>
        <span class="detail-field-value">${track.explicit ? 'Yes' : 'No'}</span>
      </div>
      <div id="radar-chart-container" style="margin-top: 1.5rem;"></div>
    `;
    if (track.audio_features) {
      renderRadarChart(document.getElementById('radar-chart-container'), track.audio_features);
    } else {
      document.getElementById('radar-chart-container').innerHTML =
        '<p class="text-muted" style="text-align:center; padding: 1rem;">Audio features not available</p>';
    }
  } catch (err) {
    showError(modalBody, err.message);
  }
}

// Close button
document.getElementById('modal-close-btn').addEventListener('click', closeModal);

// Outside click closes modal
document.getElementById('detail-panel').addEventListener('click', (e) => {
  if (e.target === document.getElementById('detail-panel')) {
    closeModal();
  }
});

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

fetchTracks();
