# Implementation Plan: Tracklytics Frontend

## Overview

Build a four-page static web analytics dashboard using vanilla HTML, CSS, and JavaScript (ES6 modules). The app consumes the Tracklytics FastAPI backend at `http://localhost:8000` and visualizes music data through Plotly.js charts, sortable tables, paginated lists, and modal detail panels. All files live under `app/static/`.

## Tasks

- [x] 1. Set up file structure and shared stylesheet
  - Create the directory tree: `app/static/`, `app/static/css/`, `app/static/js/`
  - Create `app/static/css/styles.css` with all CSS custom properties (design tokens), global reset, dark theme, `.app-header`, `.app-footer`, `.nav-link`, `.nav-link.active`, `.page-content`, `.card`, `.metrics-grid`, `.loading-state`, `.spinner` (with `@keyframes spin`), `.error-state`, `.dismiss-btn`, `.modal-overlay`, `.modal-content`, `.modal-close`, `.pagination`, `.pagination-btn`, and table/form styles
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 7.1, 7.3_

- [x] 2. Implement the shared API client (`js/api.js`)
  - [x] 2.1 Implement `buildQuery`, `apiFetch`, and all exported API functions
    - Write `app/static/js/api.js` as an ES6 module
    - Define `BASE_URL = 'http://localhost:8000'`
    - Implement private `buildQuery(params)` that omits `null`/`undefined` values
    - Implement private `apiFetch(path)` that throws on non-2xx with status + URL in message, returns parsed JSON on 2xx, and propagates network errors
    - Export: `getGenres`, `getAlbums(limit, offset)`, `getAlbum(id)`, `getArtists(limit, offset)`, `getArtist(id)`, `getTracks(limit, offset, minPopularity, explicit)`, `getTrack(id)` (throws synchronously if id is null/undefined), `getGenreTrends(orderBy, limit)`, `getArtistStats(orderBy, limit)`
    - _Requirements: 2.1–2.28_

  - [ ]* 2.2 Write property test for `buildQuery` (Property 1)
    - **Property 1: URL query parameters include only provided arguments**
    - **Validates: Requirements 2.5, 2.6, 2.7, 2.10, 2.11, 2.12, 2.15, 2.16, 2.19, 2.20, 2.21, 2.23, 2.24, 2.25**
    - Use fast-check + Vitest; tag: `// Feature: tracklytics-frontend, Property 1`

  - [ ]* 2.3 Write property test for `apiFetch` non-2xx error (Property 2)
    - **Property 2: Non-2xx HTTP status throws an error containing status code and URL**
    - **Validates: Requirements 1.7, 2.26**
    - Mock `fetch` with statuses 400–599; assert thrown Error message contains status and URL

  - [ ]* 2.4 Write property test for `apiFetch` 2xx JSON parsing (Property 3)
    - **Property 3: 2xx HTTP response returns parsed JSON**
    - **Validates: Requirements 2.27**
    - Mock `fetch` with valid JSON bodies and 2xx statuses; assert deep-equal to `JSON.parse` result

- [x] 3. Implement shared HTML shell and utility helpers
  - [x] 3.1 Create the four HTML page skeletons
    - Write `app/static/index.html`, `genres.html`, `artists.html`, `tracks.html`
    - Each page: `<link rel="stylesheet" href="css/styles.css">`, header with brand + nav links (active class on current page), `<main class="page-content">`, footer with brand + `<span id="footer-year">`, `<script type="module" src="js/api.js">` before `<script type="module" src="js/<page>.js">`
    - Chart pages (`index.html`, `genres.html`, `artists.html`, `tracks.html`) include Plotly CDN script before module scripts
    - _Requirements: 1.1, 1.2, 1.4, 7.2, 7.4, 7.5, 7.6, 7.7_

  - [x] 3.2 Implement shared UI helpers (`showLoading`, `showError`, `formatDuration`)
    - Add `showLoading(container)` and `showError(container, message)` as module-level helpers in each page script (or a shared utility pattern)
    - Implement `formatDuration(ms)` in `tracks.js`: `minutes = Math.floor(ms / 60000)`, `seconds = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')`
    - Implement active nav link detection in each page script using `window.location.pathname`
    - Implement footer year: `document.getElementById('footer-year').textContent = new Date().getFullYear()`
    - _Requirements: 1.1, 1.2, 1.6, 1.7, 1.8, 6.14_

  - [ ]* 3.3 Write property test for `formatDuration` (Property 4)
    - **Property 4: Duration formatting is correct for all non-negative durations**
    - **Validates: Requirements 6.14**
    - Use fast-check to generate non-negative integers; assert `M:SS` format with correct values

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement the Main Dashboard (`index.html` + `js/index.js`)
  - [x] 5.1 Build dashboard HTML structure and metric cards
    - Add four `.metric-card` elements inside a `.metrics-grid` in `index.html`
    - Add two chart container `<div>` elements for genres and artists bar charts
    - _Requirements: 3.1, 3.4, 3.7_

  - [x] 5.2 Implement metric card data fetching and rendering in `js/index.js`
    - Fetch all four metrics in parallel using `Promise.allSettled` or individual try/catch blocks
    - Total Tracks: `getGenreTrends(undefined, 114)` → sum `track_count`
    - Total Artists: `getArtistStats(undefined, 1000)` → count items
    - Total Albums: `getAlbums(1, 0)` → `total` field or item count
    - Total Genres: `getGenres()` → count items
    - Show `showLoading` before each fetch; on success render whole number; on failure `showError` inside card
    - _Requirements: 3.1, 3.4, 3.5, 3.6_

  - [ ]* 5.3 Write property test for metric card total tracks computation (Property 10)
    - **Property 10: Metric card total tracks equals sum of track counts**
    - **Validates: Requirements 3.1**
    - Use fast-check to generate arrays of genre trend objects; assert sum equals computed metric

  - [x] 5.4 Implement top-10 charts in `js/index.js`
    - Define `PLOTLY_LAYOUT_BASE` with dark theme config
    - Fetch `getGenreTrends('avg_popularity', 10)` → render vertical bar chart (genre names x-axis, avg_popularity y-axis)
    - Fetch `getArtistStats('avg_popularity', 10)` → render vertical bar chart (artist names x-axis, avg_popularity y-axis)
    - Show `showLoading` before each fetch; on success `Plotly.newPlot`; on failure `showError`
    - _Requirements: 3.2, 3.3, 3.7, 3.8, 3.9_

  - [ ]* 5.5 Write property test for chart data array mapping (Property 11)
    - **Property 11: Chart data arrays correctly map API response fields**
    - **Validates: Requirements 3.2, 3.3, 5.11**
    - Use fast-check to generate arrays of genre/artist stat objects; assert labels and values arrays match field order

- [x] 6. Implement the Genre Analysis Page (`genres.html` + `js/genres.js`)
  - [x] 6.1 Build genre page HTML structure
    - Add sort selector `<select>` with five options (avg_popularity, avg_energy, avg_danceability, avg_valence, track_count) defaulting to avg_popularity
    - Add `<table>` for Genre_Table with columns: genre name, avg popularity, avg energy, avg danceability, avg valence, track count
    - Add two chart container `<div>` elements: scatter plot and horizontal bar chart
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [x] 6.2 Implement genre data fetching, table rendering, and sort in `js/genres.js`
    - Fetch `getGenreTrends(undefined, 114)` once; store in `allGenres`
    - Render Genre_Table rows sorted by `avg_popularity` descending by default; format numeric columns to two decimal places
    - On sort selector change, re-sort `allGenres` client-side (no new fetch) and re-render rows in descending order
    - Show `showLoading` in table container and scatter plot container while fetching; `showError` on failure
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.8_

  - [ ]* 6.3 Write property test for genre table sort (Property 7)
    - **Property 7: Genre table sort produces descending order for any column**
    - **Validates: Requirements 4.1, 4.3**
    - Use fast-check to generate genre trend arrays and column names; assert non-ascending order

  - [x] 6.4 Implement scatter plot and horizontal bar chart in `js/genres.js`
    - Scatter plot: reuse `allGenres` data (no second fetch); x = avg_danceability, y = avg_energy, marker size scaled via `scaleMarkerSizes` to [6, 30] px
    - Implement `scaleMarkerSizes(trackCounts)` using linear interpolation: `6 + ((c - min) / (max - min || 1)) * 24`
    - Horizontal bar chart: fetch `getGenreTrends('track_count', 20)` → orientation `'h'`, x = track_count, y = genre_name
    - Show `showLoading` / `showError` for horizontal bar chart container
    - _Requirements: 4.4, 4.5, 4.7, 4.9_

  - [ ]* 6.5 Write property test for marker size scaling (Property 6)
    - **Property 6: Marker size scaling maps track counts to [6, 30] px**
    - **Validates: Requirements 4.4**
    - Use fast-check to generate non-empty arrays of non-negative counts; assert all values in [6, 30], min maps to 6, max maps to 30

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement the Artist Analysis Page (`artists.html` + `js/artists.js`)
  - [x] 8.1 Build artist page HTML structure
    - Add search `<input>` for client-side filtering
    - Add `<table>` for Artist_Table with columns: artist name, "View Details" button
    - Add `.pagination` div with Previous/Next buttons and page info span
    - Add `<div id="detail-panel" class="modal-overlay hidden">` with `.modal-content`, close button, and `#modal-body`
    - Add chart container `<div>` for top-15 artists bar chart
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 5.11_

  - [x] 8.2 Implement artist list fetching, pagination, and search in `js/artists.js`
    - Module-level state: `let offset = 0`, `const PAGE_SIZE = 20`, `let currentArtists = []`
    - Fetch `getArtists(PAGE_SIZE, offset)` on load and on pagination clicks; store response in `currentArtists`
    - Render table rows; disable Previous when `offset === 0`, disable Next when `data.length < PAGE_SIZE`
    - Search input: filter `currentArtists` by name (case-insensitive) on `input` event; show "No artists found" when no matches
    - Show `showLoading` / `showError` in Artist_Table container
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.12, 5.13_

  - [ ]* 8.3 Write property test for pagination disabled states (Property 8)
    - **Property 8: Pagination disabled states are correct for any offset and response size**
    - **Validates: Requirements 5.3, 5.4, 6.3, 6.4**
    - Use fast-check to generate offset values and response array lengths; assert Previous/Next disabled states

  - [ ]* 8.4 Write property test for artist search filter (Property 9)
    - **Property 9: Artist search filter returns only matching rows**
    - **Validates: Requirements 5.5, 5.6**
    - Use fast-check to generate artist arrays and search strings; assert filtered result contains exactly matching artists

  - [x] 8.5 Implement artist detail panel in `js/artists.js`
    - On "View Details" click: show modal, `showLoading` in `#modal-body`, fetch `getArtist(id)`, render name + avg_popularity (2 dp) + track_count + explicit_count
    - Close on close button click; close on overlay click (`event.target === overlay`); `showError` in modal body on fetch failure
    - _Requirements: 5.7, 5.8, 5.9, 5.10, 5.14, 5.15_

  - [x] 8.6 Implement top-15 artists bar chart in `js/artists.js`
    - Fetch `getArtistStats('track_count', 15)` → vertical bar chart, artist names x-axis, track_count y-axis
    - Show `showLoading` / `showError` in chart container
    - _Requirements: 5.11, 5.16, 5.17_

- [x] 9. Implement the Track Explorer Page (`tracks.html` + `js/tracks.js`)
  - [x] 9.1 Build track page HTML structure
    - Add range slider input labeled "Min Popularity" (0–100)
    - Add checkbox labeled "Explicit only"
    - Add `<table>` for Track_List with columns: track name, album name, popularity, duration (mm:ss)
    - Add `.pagination` div with Previous/Next buttons
    - Add `<div id="detail-panel" class="modal-overlay hidden">` with `.modal-content`, close button, and `#modal-body`
    - _Requirements: 6.1, 6.2, 6.5, 6.6, 6.8_

  - [x] 9.2 Implement track list fetching, pagination, and filters in `js/tracks.js`
    - Module-level state: `let offset = 0`, `const PAGE_SIZE = 20`, `let minPopularity = 0`, `let explicitOnly = false`
    - Implement `fetchTracks()` that reads all state variables and calls `getTracks(PAGE_SIZE, offset, minPopularity > 0 ? minPopularity : undefined, explicitOnly ? true : undefined)`
    - Render rows with `formatDuration(duration_ms)` for duration column
    - Disable Previous when `offset === 0`; disable Next when `data.length < PAGE_SIZE`
    - Slider: update display on `input` event; on `change`/`mouseup` reset `offset = 0` and call `fetchTracks()`
    - Checkbox: on `change` reset `offset = 0` and call `fetchTracks()`
    - If Detail_Panel is open when filter changes, dismiss it before re-fetching
    - Show `showLoading` / `showError` in Track_List container
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.13, 6.15, 6.16_

  - [ ]* 9.3 Write property test for `formatDuration` (already covered in 3.3 — skip if already written)
    - _Requirements: 6.14_

  - [ ]* 9.4 Write property test for filter offset reset (Property 12)
    - **Property 12: Filter offset reset on any filter change**
    - **Validates: Requirements 6.7**
    - Use fast-check to generate non-zero offsets and filter changes; assert offset is 0 in subsequent fetch call

  - [x] 9.5 Implement track detail panel with radar chart in `js/tracks.js`
    - On track row click: show modal, `showLoading` in `#modal-body`, fetch `getTrack(id)`
    - Render: track name, album name, popularity, `formatDuration(duration_ms)`, explicit as "Yes"/"No"
    - If `audio_features` present: render Radar_Chart using `scatterpolar` trace with values `Math.round(v * 100)` for all seven features, closed polygon, dark theme layout
    - If `audio_features` absent: display "Audio features not available"
    - Close on close button; close on overlay click; `showError` in modal body on failure
    - _Requirements: 6.8, 6.9, 6.10, 6.11, 6.12, 6.17, 6.18_

  - [ ]* 9.6 Write property test for audio feature scaling (Property 5)
    - **Property 5: Audio feature scaling rounds to nearest integer in [0, 100]**
    - **Validates: Requirements 6.9**
    - Use fast-check to generate floats in [0.0, 1.0]; assert `Math.round(v * 100)` is integer in [0, 100]

- [x] 10. Set up Vitest and fast-check test infrastructure
  - Initialize `package.json` under `app/static/` (or project root) with `vitest` and `fast-check` as dev dependencies
  - Create `vitest.config.js` with ESM support
  - Ensure all property test files (from tasks 2.2–2.4, 3.3, 5.3, 5.5, 6.3, 6.5, 8.3, 8.4, 9.4, 9.6) can be discovered and run with `vitest --run`
  - _Requirements: 7.4 (test infrastructure supports the JS module pattern)_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design
- Unit tests validate specific examples and edge cases
- The design uses no build step — all JS is plain ES6 modules loaded via `<script type="module">`
- Test infrastructure (task 10) can be set up at any point before running the optional test tasks

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["2.1", "3.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.3", "5.1", "6.1", "8.1", "9.1"] },
    { "id": 3, "tasks": ["5.2", "5.4", "6.2", "6.4", "8.2", "8.5", "8.6", "9.2", "9.5"] },
    { "id": 4, "tasks": ["5.3", "5.5", "6.3", "6.5", "8.3", "8.4", "9.4", "9.6"] }
  ]
}
```
