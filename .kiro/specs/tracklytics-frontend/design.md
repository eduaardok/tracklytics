# Design Document — Tracklytics Frontend

## Overview

The Tracklytics Frontend is a four-page static web application that visualizes music analytics data from the Tracklytics FastAPI backend. It is built with vanilla HTML, CSS, and JavaScript — no frameworks — and uses Plotly.js for all interactive charts.

The application follows a simple multi-page architecture: each HTML page is self-contained, shares a common stylesheet and API client module, and is served as a static file by FastAPI (or any static file server). All data is fetched at runtime from `http://localhost:8000`.

**Pages:**
- `index.html` — Main dashboard: summary metric cards and top-10 charts
- `genres.html` — Genre analysis: sortable table, scatter plot, horizontal bar chart
- `artists.html` — Artist browser: paginated/searchable table, detail panel, bar chart
- `tracks.html` — Track explorer: paginated list with filters, detail panel with radar chart

**Key design constraints:**
- No build step, no bundler, no transpilation — plain ES6 modules loaded via `<script type="module">`
- All API calls go through a single shared `js/api.js` module
- Dark theme applied globally via `css/styles.css`
- Plotly.js loaded from CDN on pages that render charts

---

## Architecture

### High-Level Structure

```
Browser
  │
  ├── index.html / genres.html / artists.html / tracks.html
  │     ├── <link> css/styles.css          (shared theme)
  │     ├── <script> Plotly CDN            (chart pages only)
  │     ├── <script type="module"> js/api.js
  │     └── <script type="module"> js/<page>.js
  │
  └── HTTP fetch() calls
        └── FastAPI REST API  http://localhost:8000
```

### File Structure

```
app/static/
├── index.html
├── genres.html
├── artists.html
├── tracks.html
├── css/
│   └── styles.css
└── js/
    ├── api.js
    ├── index.js
    ├── genres.js
    ├── artists.js
    └── tracks.js
```

### Script Loading Order

Every HTML page loads scripts in this order to ensure `api.js` is available before the page script runs:

```html
<!-- On chart pages only -->
<script src="https://cdn.plot.ly/plotly-latest.min.js"></script>

<!-- Shared API client must come first -->
<script type="module" src="js/api.js"></script>

<!-- Page-specific logic -->
<script type="module" src="js/<page>.js"></script>
```

Because both scripts use `type="module"`, they are deferred by default and execute in order after the DOM is parsed. The page script imports functions from `api.js` using ES6 `import`.

---

## Components and Interfaces

### Shared Shell (HTML + CSS)

Every page includes an identical header and footer structure:

```html
<header class="app-header">
  <span class="brand">Tracklytics</span>
  <nav>
    <a href="index.html" class="nav-link [active]">Dashboard</a>
    <a href="genres.html" class="nav-link [active]">Genres</a>
    <a href="artists.html" class="nav-link [active]">Artists</a>
    <a href="tracks.html" class="nav-link [active]">Tracks</a>
  </nav>
</header>

<footer class="app-footer">
  <span>Tracklytics &copy; <span id="footer-year"></span></span>
</footer>
```

The active link is marked with the `active` class on the anchor matching the current page. The footer year is set by a one-liner in each page script:

```js
document.getElementById('footer-year').textContent = new Date().getFullYear();
```

### Loading State Component

A loading state is a `<div class="loading-state">` containing a spinner element. It is injected into a container before a fetch begins and removed when the fetch resolves or rejects.

```js
function showLoading(container) {
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
}
```

### Error State Component

An error state is a `<div class="error-state">` containing a human-readable message and a dismiss button. It replaces the loading state on fetch failure.

```js
function showError(container, message) {
  container.innerHTML = `
    <div class="error-state">
      <p class="error-message">${message}</p>
      <button class="dismiss-btn" onclick="this.closest('.error-state').remove()">Dismiss</button>
    </div>
  `;
}
```

The dismiss button uses `this.closest('.error-state').remove()` so it removes only the error state element, leaving the container itself in the DOM.

### Detail Panel (Modal)

The detail panel is a full-screen overlay modal used on both `artists.html` and `tracks.html`. It is a single `<div id="detail-panel" class="modal-overlay">` element present in the HTML but hidden by default (`display: none`). It is shown/hidden by toggling a CSS class.

```html
<div id="detail-panel" class="modal-overlay hidden">
  <div class="modal-content">
    <button class="modal-close" id="modal-close-btn">&times;</button>
    <div id="modal-body"><!-- content injected here --></div>
  </div>
</div>
```

**Open:** Set `display: flex` (or remove `hidden` class), inject content into `#modal-body`.  
**Close:** Add `hidden` class back, clear `#modal-body`.  
**Outside click:** Listen for `click` on `.modal-overlay`; if `event.target === overlay`, close.

### Pagination Controls

Pagination controls are a pair of `<button>` elements rendered below each paginated list:

```html
<div class="pagination">
  <button id="prev-btn" class="pagination-btn">Previous</button>
  <span id="page-info" class="page-info"></span>
  <button id="next-btn" class="pagination-btn">Next</button>
</div>
```

State is tracked in module-level variables `let offset = 0` and `const PAGE_SIZE = 20`. The Previous button is disabled when `offset === 0`. The Next button is disabled when the response array length is less than `PAGE_SIZE`.

---

## Data Models

These are the JavaScript-side shapes of API responses, derived from the FastAPI schemas.

### Genre

```js
// GET /genres
{ genre_id: number, name: string }
```

### GenreTrend

```js
// GET /genre-trends
{
  trend_id: number,
  genre_id: number,
  genre_name: string,
  avg_popularity: number,   // float
  avg_danceability: number, // float
  avg_energy: number,       // float
  avg_valence: number,      // float
  track_count: number       // integer
}
```

### ArtistStat

```js
// GET /artist-stats
{
  stat_id: number,
  artist_id: number,
  artist_name: string,
  avg_popularity: number,  // float
  track_count: number,
  explicit_count: number
}
```

### Artist

```js
// GET /artists
{ artist_id: number, name: string }

// GET /artists/{id}
{
  artist_id: number,
  name: string,
  stats: {
    avg_popularity: number,
    track_count: number,
    explicit_count: number
  } | null
}
```

### Track

```js
// GET /tracks
{
  track_id: string,
  track_name: string,
  album_id: number,
  popularity: number,
  duration_ms: number,
  explicit: boolean
}

// GET /tracks/{id}
{
  track_id: string,
  track_name: string,
  album_id: number,
  popularity: number,
  duration_ms: number,
  explicit: boolean,
  audio_features: {
    danceability: number,
    energy: number,
    speechiness: number,
    acousticness: number,
    instrumentalness: number,
    liveness: number,
    valence: number,
    // ...other fields not used in UI
  } | null
}
```

### Album

```js
// GET /albums
{ album_id: number, name: string }
```

---

## JavaScript Module Design

### `js/api.js` — Shared API Client

The API client is a plain ES6 module. It exports named async functions. All functions share a single `BASE_URL` constant and a private `apiFetch` helper that handles status checking and JSON parsing.

```js
const BASE_URL = 'http://localhost:8000';

async function apiFetch(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${BASE_URL}${path}`);
  }
  return response.json();
}

// URL builder helper — only appends defined, non-null params
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

export function getArtists(limit, offset) {
  return apiFetch(`/artists${buildQuery({ limit, offset })}`);
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
```

**Error propagation:** `apiFetch` throws on non-2xx responses with a message containing the status code and URL. Network errors from `fetch()` propagate naturally (no try/catch in `apiFetch`). Callers are responsible for catching errors and rendering error states.

### `js/index.js` — Dashboard Page

Responsibilities:
1. Set footer year
2. Fetch and render four metric cards (parallel `Promise.all` per card group)
3. Fetch and render top-10 genres bar chart
4. Fetch and render top-10 artists bar chart

Each metric card fetch is independent. All four can run in parallel. Chart fetches are also independent and run in parallel with metric fetches.

```
Page load
  ├── fetchMetrics() — parallel:
  │     ├── getGenreTrends('avg_popularity', 114) → sum track_count
  │     ├── getArtistStats('avg_popularity', 1000) → count items
  │     ├── getAlbums(1, 0) → count items (or total field)
  │     └── getGenres() → count items
  ├── fetchGenresChart() — getGenreTrends('avg_popularity', 10) → bar chart
  └── fetchArtistsChart() — getArtistStats('avg_popularity', 10) → bar chart
```

### `js/genres.js` — Genre Analysis Page

Responsibilities:
1. Set footer year
2. Fetch all genre trends (limit=114) — used for both the table and scatter plot
3. Render Genre_Table with default sort (avg_popularity desc)
4. Render scatter plot from same data (no second fetch)
5. Fetch top-20 genres by track count — render horizontal bar chart
6. Handle sort selector change (client-side re-sort, no fetch)

State:
```js
let allGenres = [];       // full dataset from GET /genre-trends?limit=114
let currentSort = 'avg_popularity';
```

### `js/artists.js` — Artist Analysis Page

Responsibilities:
1. Set footer year
2. Fetch and render artist list (paginated)
3. Handle Previous/Next pagination
4. Handle search input (client-side filter on current page data)
5. Handle "View Details" click → fetch artist detail → show modal
6. Handle modal close (button + outside click)
7. Fetch and render top-15 artists by track count bar chart

State:
```js
let offset = 0;
const PAGE_SIZE = 20;
let currentArtists = [];  // current page data for client-side search
```

### `js/tracks.js` — Track Explorer Page

Responsibilities:
1. Set footer year
2. Fetch and render track list (paginated, with filters)
3. Handle Previous/Next pagination
4. Handle min popularity slider (on `input` event for display, on `change`/`mouseup` for fetch)
5. Handle explicit checkbox (on `change` for fetch)
6. Handle track row click → fetch track detail → show modal with radar chart
7. Handle modal close (button + outside click)
8. Dismiss open modal when filter changes

State:
```js
let offset = 0;
const PAGE_SIZE = 20;
let minPopularity = 0;
let explicitOnly = false;
```

---

## CSS Architecture and Theming

### Design Tokens (CSS Custom Properties)

All theme values are defined as CSS custom properties on `:root`:

```css
:root {
  --bg-primary:    #0f0f0f;
  --bg-surface:    #1a1a1a;
  --bg-surface-2:  #242424;
  --accent:        #1db954;
  --accent-hover:  #1ed760;
  --text-primary:  #ffffff;
  --text-secondary:#b3b3b3;
  --text-muted:    #6b6b6b;
  --border:        #2a2a2a;
  --error:         #e53e3e;
  --radius:        8px;
  --radius-sm:     4px;
  --shadow:        0 4px 16px rgba(0,0,0,0.4);
}
```

### Layout

The app uses a single-column layout with a sticky header. Page content is wrapped in a `<main class="page-content">` container with `max-width: 1400px` and `margin: 0 auto` for centering.

Charts and tables are placed inside `.card` elements (background `var(--bg-surface)`, border-radius `var(--radius)`, padding `1.5rem`).

A two-column grid is used on the dashboard for metric cards:

```css
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}
```

### Responsive Behavior

The layout uses `auto-fit` grids and `flex-wrap` so it adapts from 320px to 2560px without explicit breakpoints. Tables use `overflow-x: auto` on their wrapper to allow horizontal scrolling on narrow viewports without overlapping other elements.

### Spinner

The loading spinner is a pure CSS animation:

```css
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--bg-surface-2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### Active Navigation Link

The active nav link is identified by comparing `window.location.pathname` to each link's `href` in the page script, then adding the `active` class:

```js
document.querySelectorAll('.nav-link').forEach(link => {
  if (link.getAttribute('href') === window.location.pathname.split('/').pop()) {
    link.classList.add('active');
  }
});
```

---

## State Management Patterns

Each page script manages its own local state using module-level variables. There is no shared global state between pages (each page is a full navigation).

### Loading / Error / Content State Machine

Each data section follows a three-state pattern:

```
IDLE → LOADING → SUCCESS (render content)
                └→ ERROR (render error state with dismiss)
```

The pattern is implemented as a consistent async function:

```js
async function loadSection(container, fetchFn, renderFn) {
  showLoading(container);
  try {
    const data = await fetchFn();
    container.innerHTML = '';
    renderFn(container, data);
  } catch (err) {
    showError(container, err.message);
  }
}
```

### Pagination State

Pagination state is two variables: `offset` (current page start) and `PAGE_SIZE` (constant 20). After each fetch:

- If `data.length < PAGE_SIZE` → disable Next button
- If `offset === 0` → disable Previous button

When a filter changes, `offset` is reset to `0` before the next fetch.

### Filter State (tracks.js)

Filter state is held in module-level variables. The fetch function always reads the current state of all filters when building the request URL:

```js
function fetchTracks() {
  const params = {
    limit: PAGE_SIZE,
    offset,
    minPopularity: minPopularity > 0 ? minPopularity : undefined,
    explicit: explicitOnly ? true : undefined
  };
  // ...
}
```

---

## Plotly.js Chart Configuration Patterns

All charts use a consistent dark theme configuration. A shared `PLOTLY_LAYOUT_BASE` object is defined at the top of each page script that uses charts:

```js
const PLOTLY_LAYOUT_BASE = {
  paper_bgcolor: '#1a1a1a',
  plot_bgcolor:  '#1a1a1a',
  font:          { color: '#ffffff', family: 'system-ui, sans-serif' },
  margin:        { t: 40, r: 20, b: 80, l: 60 },
  xaxis:         { gridcolor: '#2a2a2a', tickfont: { color: '#b3b3b3' } },
  yaxis:         { gridcolor: '#2a2a2a', tickfont: { color: '#b3b3b3' } },
};
```

### Vertical Bar Chart (Dashboard, Artists)

```js
function renderBarChart(container, labels, values, title) {
  const trace = {
    type: 'bar',
    x: labels,
    y: values,
    marker: { color: '#1db954' }
  };
  const layout = {
    ...PLOTLY_LAYOUT_BASE,
    title: { text: title, font: { color: '#ffffff' } },
  };
  Plotly.newPlot(container, [trace], layout, { responsive: true, displayModeBar: false });
}
```

### Horizontal Bar Chart (Genres — top 20 by track count)

```js
const trace = {
  type: 'bar',
  orientation: 'h',
  x: values,   // track_count
  y: labels,   // genre_name
  marker: { color: '#1db954' }
};
```

### Scatter Plot (Genres — energy vs danceability)

Marker size is scaled linearly from the `track_count` range to [6, 30] px:

```js
function scaleMarkerSizes(trackCounts) {
  const min = Math.min(...trackCounts);
  const max = Math.max(...trackCounts);
  const range = max - min || 1;
  return trackCounts.map(c => 6 + ((c - min) / range) * 24);
}

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
```

### Radar Chart (Track Detail — audio features)

The seven audio features are scaled by multiplying by 100 and rounding:

```js
const AUDIO_FEATURE_KEYS = [
  'danceability', 'energy', 'speechiness',
  'acousticness', 'instrumentalness', 'liveness', 'valence'
];

function renderRadarChart(container, audioFeatures) {
  const values = AUDIO_FEATURE_KEYS.map(k => Math.round(audioFeatures[k] * 100));
  const trace = {
    type: 'scatterpolar',
    r: [...values, values[0]],  // close the polygon
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
```

---

## Duration Formatting

The `formatDuration(ms)` utility function is defined in each page script that displays duration (tracks.js). It is a pure function:

```js
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
```

Equivalently: `minutes = Math.floor(ms / 60000)`, `seconds = Math.floor((ms % 60000) / 1000)`.

---

## Error Handling

### API Layer (`api.js`)

- Non-2xx response → throws `Error` with message `"HTTP {status} — {url}"`
- Network failure → `fetch()` rejects; error propagates to caller
- `getTrack(null/undefined)` → throws synchronously before any network call

### Page Layer

Each page script wraps all fetch calls in try/catch. On catch, `showError(container, err.message)` is called. The error message from `api.js` includes the HTTP status and URL, giving the user actionable information.

### Dismiss Behavior

The dismiss button removes only the `.error-state` element from the DOM. The container element itself remains, leaving the section empty. This satisfies the requirement that dismissing an error on a metric card does not remove the card.

---

## Testing Strategy

This feature is a pure frontend application built with vanilla HTML/CSS/JS. The testing approach uses:

1. **Unit tests** for pure utility functions (duration formatting, URL building, marker size scaling, audio feature scaling)
2. **Property-based tests** for functions with universal correctness properties across a wide input space
3. **Example-based tests** for UI interactions, loading/error state transitions, and integration behaviors
4. **Smoke tests** for file structure and configuration checks

**Property-based testing library:** [fast-check](https://github.com/dubzzz/fast-check) (JavaScript, runs in Node.js with any test runner)

**Test runner:** [Vitest](https://vitest.dev/) — zero-config, ESM-native, compatible with fast-check

**Minimum iterations per property test:** 100 (fast-check default is 100 runs)

**Tag format:** `// Feature: tracklytics-frontend, Property {N}: {property_text}`

### Unit / Property Test Scope

The following functions are pure and fully testable without a browser:

| Function | Location | Test Type |
|---|---|---|
| `buildQuery(params)` | api.js | Property |
| `apiFetch` error handling | api.js | Property |
| `formatDuration(ms)` | tracks.js | Property |
| `scaleMarkerSizes(counts)` | genres.js | Property |
| Audio feature scaling (`Math.round(v * 100)`) | tracks.js | Property |
| Genre table sort | genres.js | Property |
| Pagination button disabled state | artists.js, tracks.js | Property |
| Artist search filter | artists.js | Property |
| Metric card computation (sum of track_count) | index.js | Property |
| Chart data mapping (labels/values arrays) | index.js, genres.js, artists.js | Property |

### Integration / Example Test Scope

- Loading state appears before fetch resolves (mock fetch)
- Error state appears on non-2xx response (mock fetch)
- Dismiss button removes error state element
- Detail panel opens on row click, closes on button/outside click
- Filter change dismisses open detail panel
- Pagination Previous/Next button clicks update offset and re-fetch

### Smoke Test Scope

- All required files exist at correct paths
- Each HTML page links `css/styles.css`
- Chart pages include Plotly CDN script tag
- `api.js` exports all required functions

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: URL query parameters include only provided arguments

*For any* combination of parameter values passed to `buildQuery`, the resulting query string SHALL contain a key-value pair for every parameter that is not `null` or `undefined`, and SHALL NOT contain any key for a parameter that is `null` or `undefined`.

**Validates: Requirements 2.5, 2.6, 2.7, 2.10, 2.11, 2.12, 2.15, 2.16, 2.19, 2.20, 2.21, 2.23, 2.24, 2.25**

---

### Property 2: Non-2xx HTTP status throws an error containing status code and URL

*For any* HTTP status code in the range 400–599, when `apiFetch` receives a response with that status, it SHALL throw an `Error` whose message contains both the numeric status code and the request URL as substrings.

**Validates: Requirements 1.7, 2.26**

---

### Property 3: 2xx HTTP response returns parsed JSON

*For any* valid JSON string as a response body paired with a 2xx status code, `apiFetch` SHALL return a value that deep-equals the result of `JSON.parse` applied to that string.

**Validates: Requirements 2.27**

---

### Property 4: Duration formatting is correct for all non-negative durations

*For any* non-negative integer `ms`, `formatDuration(ms)` SHALL return a string of the form `"M:SS"` where `M = Math.floor(ms / 60000)` and `SS = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')`.

**Validates: Requirements 6.14**

---

### Property 5: Audio feature scaling rounds to nearest integer in [0, 100]

*For any* audio feature value `v` in the range [0.0, 1.0], the scaled value used in the radar chart SHALL equal `Math.round(v * 100)` and SHALL be an integer in the range [0, 100].

**Validates: Requirements 6.9**

---

### Property 6: Marker size scaling maps track counts to [6, 30] px

*For any* non-empty array of non-negative track counts, `scaleMarkerSizes` SHALL return an array of the same length where every value is in the range [6, 30], the minimum input maps to 6, and the maximum input maps to 30.

**Validates: Requirements 4.4**

---

### Property 7: Genre table sort produces descending order for any column

*For any* non-empty array of genre trend objects and any valid sort column (`avg_popularity`, `avg_energy`, `avg_danceability`, `avg_valence`, `track_count`), the sorted array SHALL be in non-ascending order by that column (i.e., `sorted[i][col] >= sorted[i+1][col]` for all consecutive pairs).

**Validates: Requirements 4.1, 4.3**

---

### Property 8: Pagination disabled states are correct for any offset and response size

*For any* offset value of 0, the Previous pagination control SHALL be disabled. *For any* response array whose length is less than `PAGE_SIZE` (20), the Next pagination control SHALL be disabled. *For any* offset greater than 0 and response array of length equal to `PAGE_SIZE`, both controls SHALL be enabled.

**Validates: Requirements 5.3, 5.4, 6.3, 6.4**

---

### Property 9: Artist search filter returns only matching rows

*For any* non-empty array of artist objects and any non-empty search string, the filtered result SHALL contain only artists whose `name` includes the search string (case-insensitive), and SHALL contain all artists from the original array whose name matches.

**Validates: Requirements 5.5, 5.6**

---

### Property 10: Metric card total tracks equals sum of track counts

*For any* non-empty array of genre trend objects, the computed "Total Tracks" metric SHALL equal the arithmetic sum of all `track_count` values in the array.

**Validates: Requirements 3.1**

---

### Property 11: Chart data arrays correctly map API response fields

*For any* non-empty array of genre trend or artist stat objects, the labels array passed to the chart SHALL equal the array of `genre_name` / `artist_name` values in the same order, and the values array SHALL equal the array of the corresponding metric field values in the same order.

**Validates: Requirements 3.2, 3.3, 5.11**

---

### Property 12: Filter offset reset on any filter change

*For any* non-zero offset value and any change to a filter parameter (minPopularity or explicit), the offset used in the subsequent fetch request SHALL be 0.

**Validates: Requirements 6.7**
