import { getArtists, getArtist, getArtistStats } from './api.js';

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
let currentArtists = [];
let searchQuery = '';

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

function renderArtistTable(artists) {
  const container = document.getElementById('artist-table-container');
  if (artists.length === 0) {
    container.innerHTML = '<p class="no-results">No artists found</p>';
    return;
  }
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Artist Name</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${artists.map(a => `
        <tr>
          <td>${a.name}</td>
          <td><button class="btn view-details-btn" data-id="${a.artist_id}">View Details</button></td>
        </tr>
      `).join('')}
    </tbody>
  `;
  container.innerHTML = '';
  container.appendChild(table);
  // Attach click handlers for "View Details" buttons
  container.querySelectorAll('.view-details-btn').forEach(btn => {
    btn.addEventListener('click', () => openArtistDetail(btn.dataset.id));
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
// Fetch artists
// ---------------------------------------------------------------------------

async function fetchArtists() {
  const container = document.getElementById('artist-table-container');
  showLoading(container);
  try {
    const data = await getArtists(PAGE_SIZE, offset, searchQuery || undefined);
    currentArtists = data;
    renderArtistTable(currentArtists);
    updatePagination(data.length);
  } catch (err) {
    showError(container, err.message);
  }
}

// ---------------------------------------------------------------------------
// Pagination event listeners
// ---------------------------------------------------------------------------

document.getElementById('prev-btn').addEventListener('click', () => {
  offset = Math.max(0, offset - PAGE_SIZE);
  fetchArtists();
});

document.getElementById('next-btn').addEventListener('click', () => {
  offset += PAGE_SIZE;
  fetchArtists();
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

let searchTimeout = null;

document.getElementById('artist-search').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    searchQuery = e.target.value.trim();
    offset = 0; // reset to first page on new search
    fetchArtists();
  }, 300);
});

// ---------------------------------------------------------------------------
// Artist detail panel
// ---------------------------------------------------------------------------

function openModal() {
  const overlay = document.getElementById('detail-panel');
  overlay.classList.remove('hidden');
}

function closeModal() {
  const overlay = document.getElementById('detail-panel');
  overlay.classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

async function openArtistDetail(id) {
  const modalBody = document.getElementById('modal-body');
  openModal();
  showLoading(modalBody);
  try {
    const artist = await getArtist(id);
    const stats = artist.stats || {};
    modalBody.innerHTML = `
      <h2 style="margin-bottom: 1rem; color: var(--text-primary);">${artist.name}</h2>
      <div class="detail-field">
        <span class="detail-field-label">Avg Popularity</span>
        <span class="detail-field-value">${stats.avg_popularity != null ? stats.avg_popularity.toFixed(2) : 'N/A'}</span>
      </div>
      <div class="detail-field">
        <span class="detail-field-label">Total Tracks</span>
        <span class="detail-field-value">${stats.track_count ?? 'N/A'}</span>
      </div>
      <div class="detail-field">
        <span class="detail-field-label">Explicit Tracks</span>
        <span class="detail-field-value">${stats.explicit_count ?? 'N/A'}</span>
      </div>
    `;
  } catch (err) {
    showError(modalBody, err.message);
  }
}

// Close button
document.getElementById('modal-close-btn').addEventListener('click', closeModal);

// Outside click — close only when clicking the overlay backdrop itself
document.getElementById('detail-panel').addEventListener('click', (e) => {
  if (e.target === document.getElementById('detail-panel')) {
    closeModal();
  }
});

// ---------------------------------------------------------------------------
// Chart configuration
// ---------------------------------------------------------------------------

const PLOTLY_LAYOUT_BASE = {
  paper_bgcolor: '#1a1a1a',
  plot_bgcolor:  '#1a1a1a',
  font:          { color: '#ffffff', family: 'system-ui, sans-serif' },
  margin:        { t: 40, r: 20, b: 80, l: 60 },
  xaxis:         { gridcolor: '#2a2a2a', tickfont: { color: '#b3b3b3' } },
  yaxis:         { gridcolor: '#2a2a2a', tickfont: { color: '#b3b3b3' } },
};

// ---------------------------------------------------------------------------
// Top-15 artists bar chart
// ---------------------------------------------------------------------------

async function loadArtistsChart() {
  const container = document.getElementById('chart-artists');
  showLoading(container);
  try {
    const data = await getArtistStats('track_count', 15);
    container.innerHTML = '';
    const trace = {
      type: 'bar',
      x: data.map(a => a.artist_name),
      y: data.map(a => a.track_count),
      marker: { color: '#1db954' }
    };
    const layout = {
      ...PLOTLY_LAYOUT_BASE,
      title: { text: 'Top 15 Artists by Track Count', font: { color: '#ffffff' } }
    };
    Plotly.newPlot(container, [trace], layout, { responsive: true, displayModeBar: false });
  } catch (err) {
    showError(container, err.message);
  }
}

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

fetchArtists();
loadArtistsChart();
