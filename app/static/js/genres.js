import { getGenreTrends } from './api.js';

// ---------------------------------------------------------------------------
// Plotly layout base (dark theme)
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
// State
// ---------------------------------------------------------------------------

let allGenres = [];
let currentSort = 'avg_popularity';

// ---------------------------------------------------------------------------
// Genre table rendering
// ---------------------------------------------------------------------------

function renderGenreTable(genres, sortKey) {
  const sorted = [...genres].sort((a, b) => b[sortKey] - a[sortKey]);
  const container = document.getElementById('genre-table-container');
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Genre</th>
        <th>Avg Popularity</th>
        <th>Avg Energy</th>
        <th>Avg Danceability</th>
        <th>Avg Valence</th>
        <th>Track Count</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map(g => `
        <tr>
          <td>${g.genre_name}</td>
          <td>${g.avg_popularity.toFixed(2)}</td>
          <td>${g.avg_energy.toFixed(2)}</td>
          <td>${g.avg_danceability.toFixed(2)}</td>
          <td>${g.avg_valence.toFixed(2)}</td>
          <td>${g.track_count}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  container.innerHTML = '';
  container.appendChild(table);
}

// ---------------------------------------------------------------------------
// Scatter plot
// ---------------------------------------------------------------------------

function scaleMarkerSizes(trackCounts) {
  const min = Math.min(...trackCounts);
  const max = Math.max(...trackCounts);
  const range = max - min || 1;
  return trackCounts.map(c => 6 + ((c - min) / range) * 24);
}

function renderScatterPlot(genres) {
  const container = document.getElementById('chart-scatter');
  container.innerHTML = '';
  const trace = {
    type: 'scatter',
    mode: 'markers',
    x: genres.map(g => g.avg_danceability),
    y: genres.map(g => g.avg_energy),
    text: genres.map(g => g.genre_name),
    marker: {
      size: scaleMarkerSizes(genres.map(g => g.track_count)),
      color: '#1db954',
      opacity: 0.7
    }
  };
  const layout = {
    ...PLOTLY_LAYOUT_BASE,
    title: { text: 'Energy vs Danceability by Genre', font: { color: '#ffffff' } },
    xaxis: { ...PLOTLY_LAYOUT_BASE.xaxis, title: { text: 'Avg Danceability', font: { color: '#b3b3b3' } } },
    yaxis: { ...PLOTLY_LAYOUT_BASE.yaxis, title: { text: 'Avg Energy', font: { color: '#b3b3b3' } } },
  };
  Plotly.newPlot(container, [trace], layout, { responsive: true, displayModeBar: false });
}

// ---------------------------------------------------------------------------
// Horizontal bar chart — top 20 genres by track count
// ---------------------------------------------------------------------------

async function loadTopGenresChart() {
  const container = document.getElementById('chart-top-genres');
  showLoading(container);
  try {
    const data = await getGenreTrends('track_count', 20);
    container.innerHTML = '';
    const trace = {
      type: 'bar',
      orientation: 'h',
      x: data.map(g => g.track_count),
      y: data.map(g => g.genre_name),
      marker: { color: '#1db954' }
    };
    const layout = {
      ...PLOTLY_LAYOUT_BASE,
      title: { text: 'Top 20 Genres by Track Count', font: { color: '#ffffff' } },
      margin: { t: 40, r: 20, b: 60, l: 160 },
    };
    Plotly.newPlot(container, [trace], layout, { responsive: true, displayModeBar: false });
  } catch (err) {
    showError(container, err.message);
  }
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadGenreData() {
  const tableContainer = document.getElementById('genre-table-container');
  const scatterContainer = document.getElementById('chart-scatter');
  showLoading(tableContainer);
  showLoading(scatterContainer);
  try {
    allGenres = await getGenreTrends(undefined, 114);
    renderGenreTable(allGenres, currentSort);
    renderScatterPlot(allGenres);
  } catch (err) {
    showError(tableContainer, err.message);
    showError(scatterContainer, err.message);
  }
}

// ---------------------------------------------------------------------------
// Sort selector
// ---------------------------------------------------------------------------

document.getElementById('sort-select').addEventListener('change', (e) => {
  currentSort = e.target.value;
  renderGenreTable(allGenres, currentSort);
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

loadGenreData();
loadTopGenresChart();
