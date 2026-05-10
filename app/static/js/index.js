import { getGenreTrends, getArtistStats, getCounts } from './api.js';

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
// Metric cards
// ---------------------------------------------------------------------------

async function loadMetrics() {
  const tracksContainer = document.getElementById('metric-total-tracks-value');
  const artistsContainer = document.getElementById('metric-total-artists-value');
  const albumsContainer = document.getElementById('metric-total-albums-value');
  const genresContainer = document.getElementById('metric-total-genres-value');

  showLoading(tracksContainer);
  showLoading(artistsContainer);
  showLoading(albumsContainer);
  showLoading(genresContainer);

  try {
    const counts = await getCounts();
    tracksContainer.innerHTML  = `<span class="card-value">${counts.total_tracks.toLocaleString()}</span>`;
    artistsContainer.innerHTML = `<span class="card-value">${counts.total_artists.toLocaleString()}</span>`;
    albumsContainer.innerHTML  = `<span class="card-value">${counts.total_albums.toLocaleString()}</span>`;
    genresContainer.innerHTML  = `<span class="card-value">${counts.total_genres.toLocaleString()}</span>`;
  } catch (err) {
    showError(tracksContainer, err.message);
    showError(artistsContainer, err.message);
    showError(albumsContainer, err.message);
    showError(genresContainer, err.message);
  }
}

loadMetrics();

// ---------------------------------------------------------------------------
// Plotly dark theme base layout
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
// Top-10 genres bar chart
// ---------------------------------------------------------------------------

async function loadGenresChart() {
  const container = document.getElementById('chart-genres');
  showLoading(container);
  try {
    const data = await getGenreTrends('avg_popularity', 10);
    container.innerHTML = '';
    const trace = {
      type: 'bar',
      x: data.map(g => g.genre_name),
      y: data.map(g => g.avg_popularity),
      marker: { color: '#1db954' }
    };
    const layout = {
      ...PLOTLY_LAYOUT_BASE,
      title: { text: 'Top 10 Genres by Avg Popularity', font: { color: '#ffffff' } }
    };
    Plotly.newPlot(container, [trace], layout, { responsive: true, displayModeBar: false });
  } catch (err) {
    showError(container, err.message);
  }
}

// ---------------------------------------------------------------------------
// Top-10 artists bar chart
// ---------------------------------------------------------------------------

async function loadArtistsChart() {
  const container = document.getElementById('chart-artists');
  showLoading(container);
  try {
    const data = await getArtistStats('avg_popularity', 10);
    container.innerHTML = '';
    const trace = {
      type: 'bar',
      x: data.map(a => a.artist_name),
      y: data.map(a => a.avg_popularity),
      marker: { color: '#1db954' }
    };
    const layout = {
      ...PLOTLY_LAYOUT_BASE,
      title: { text: 'Top 10 Artists by Avg Popularity', font: { color: '#ffffff' } }
    };
    Plotly.newPlot(container, [trace], layout, { responsive: true, displayModeBar: false });
  } catch (err) {
    showError(container, err.message);
  }
}

loadGenresChart();
loadArtistsChart();
