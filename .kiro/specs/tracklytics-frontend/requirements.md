# Requirements Document

## Introduction

Tracklytics Frontend is a multi-page web analytics dashboard that consumes the existing Tracklytics FastAPI REST API (running at `http://localhost:8000`) and presents music analytics data through interactive charts, tables, and detail views. The application is built with pure HTML, CSS, and JavaScript — no frameworks — and uses Plotly.js for data visualizations. It covers four pages: a main dashboard, a genre analysis page, an artist analysis page, and a track explorer page. The visual theme is dark with Spotify-green accents.

---

## Glossary

- **App**: The Tracklytics Frontend web application as a whole.
- **API**: The Tracklytics FastAPI REST backend running at `http://localhost:8000`.
- **Page**: Any of the four HTML files (`index.html`, `genres.html`, `artists.html`, `tracks.html`).
- **Dashboard**: The main landing page (`index.html`) that shows high-level summary metrics and top-10 charts.
- **Metric_Card**: A UI component that displays a single aggregate number (e.g., total tracks).
- **Chart**: A Plotly.js-rendered interactive visualization embedded in a page.
- **Genre_Table**: The sortable HTML table on `genres.html` that lists all genres with their metrics.
- **Artist_Table**: The paginated, searchable HTML table on `artists.html`.
- **Track_List**: The paginated list of tracks on `tracks.html`.
- **Detail_Panel**: A modal overlay that shows full details for a selected artist or track.
- **Radar_Chart**: A Plotly.js radar/spider chart showing the seven normalized Audio_Features of a selected track.
- **Audio_Features**: The seven normalized (0.0–1.0) audio attributes returned by `GET /tracks/{id}`: danceability, energy, speechiness, acousticness, instrumentalness, liveness, and valence.
- **Pagination**: The mechanism of fetching data in pages using `?limit=N&offset=M` query parameters.
- **Loading_State**: A visible spinner or skeleton placeholder element shown while an API request is in flight.
- **Error_State**: A visible failure message shown when an API request fails or returns a non-2xx HTTP status.
- **Dark_Theme**: The color scheme applied globally: background `#0f0f0f`, card surfaces `#1a1a1a`, accent color `#1db954`.
- **Dismiss_Button**: A visible button that removes an Error_State message from the UI when clicked.

---

## Requirements

### Requirement 1: Shared Application Shell

**User Story:** As a data analyst, I want a consistent navigation header and footer on every page, so that I can move between sections of the application without losing context.

#### Acceptance Criteria

1. THE App SHALL render a header on every Page containing the "Tracklytics" brand name and navigation links to all four Pages (`index.html`, `genres.html`, `artists.html`, `tracks.html`); each navigation link SHALL be a clickable anchor element with the correct `href` pointing to the target page, and the link corresponding to the currently active Page SHALL be visually distinguished from the other links (e.g., different color or underline).
2. THE App SHALL render a footer on every Page containing the "Tracklytics" brand name and the current copyright year as a four-digit number.
3. THE App SHALL apply the Dark_Theme globally via a shared `css/styles.css` stylesheet loaded on every Page.
4. THE App SHALL load Plotly.js exclusively from the CDN URL `https://cdn.plot.ly/plotly-latest.min.js` on every Page that renders a Chart.
5. WHILE the viewport width is between 320px and 2560px, THE App SHALL render without overlapping UI elements; horizontal scrollbars are permitted provided no UI elements overlap.
6. WHEN an API request starts, THE App SHALL display a Loading_State indicator in the relevant section; the Loading_State SHALL be a visible, non-empty element present in the DOM from the moment the request is initiated until a response is received.
7. WHEN an API request returns a non-2xx HTTP status or a network-level failure occurs, THE App SHALL replace the Loading_State in the relevant section with an Error_State message that includes a human-readable description of the failure and a Dismiss_Button.
8. WHEN the user clicks the Dismiss_Button on an Error_State message, THE App SHALL remove that Error_State message from the DOM, leaving the section empty with no Loading_State or prior content displayed.

---

### Requirement 2: Shared API Client Module

**User Story:** As a developer, I want all API calls centralized in a single JavaScript module, so that the base URL and fetch logic are maintained in one place and reused across all pages.

#### Acceptance Criteria

1. THE App SHALL provide a `js/api.js` module that defines all functions used to fetch data from the API.
2. THE `js/api.js` module SHALL use `http://localhost:8000` as the base URL for all outgoing requests.
3. THE `js/api.js` module SHALL expose a `getGenres()` function that calls `GET /genres`.
4. THE `js/api.js` module SHALL expose a `getAlbums(limit, offset)` function that calls `GET /albums`.
5. WHEN `limit` is provided to `getAlbums`, THE module SHALL append `limit` as a query parameter to the request URL.
6. WHEN `offset` is provided to `getAlbums`, THE module SHALL append `offset` as a query parameter to the request URL.
7. WHEN `limit` or `offset` are omitted from `getAlbums`, THE module SHALL not include the omitted parameter in the request URL.
8. THE `js/api.js` module SHALL expose a `getAlbum(id)` function that calls `GET /albums/{id}`.
9. THE `js/api.js` module SHALL expose a `getArtists(limit, offset)` function that calls `GET /artists`.
10. WHEN `limit` is provided to `getArtists`, THE module SHALL append `limit` as a query parameter to the request URL.
11. WHEN `offset` is provided to `getArtists`, THE module SHALL append `offset` as a query parameter to the request URL.
12. WHEN `limit` or `offset` are omitted from `getArtists`, THE module SHALL not include the omitted parameter in the request URL.
13. THE `js/api.js` module SHALL expose a `getArtist(id)` function that calls `GET /artists/{id}`.
14. THE `js/api.js` module SHALL expose a `getTracks(limit, offset, minPopularity, explicit)` function that calls `GET /tracks`.
15. WHEN any of `limit`, `offset`, `minPopularity`, or `explicit` are provided to `getTracks`, THE module SHALL append each provided parameter as a query parameter to the request URL.
16. WHEN any of `limit`, `offset`, `minPopularity`, or `explicit` are omitted from `getTracks`, THE module SHALL not include the omitted parameter in the request URL.
17. THE `js/api.js` module SHALL expose a `getTrack(id)` function that calls `GET /tracks/{id}`; IF `id` is null or undefined, THE module SHALL throw an Error before making any network request.
18. THE `js/api.js` module SHALL expose a `getGenreTrends(orderBy, limit)` function that calls `GET /genre-trends`.
19. WHEN `orderBy` is provided to `getGenreTrends`, THE module SHALL append `order_by` as a query parameter to the request URL.
20. WHEN `limit` is provided to `getGenreTrends`, THE module SHALL append `limit` as a query parameter to the request URL.
21. WHEN `orderBy` or `limit` are omitted from `getGenreTrends`, THE module SHALL not include the omitted parameter in the request URL.
22. THE `js/api.js` module SHALL expose a `getArtistStats(orderBy, limit)` function that calls `GET /artist-stats`.
23. WHEN `orderBy` is provided to `getArtistStats`, THE module SHALL append `order_by` as a query parameter to the request URL.
24. WHEN `limit` is provided to `getArtistStats`, THE module SHALL append `limit` as a query parameter to the request URL.
25. WHEN `orderBy` or `limit` are omitted from `getArtistStats`, THE module SHALL not include the omitted parameter in the request URL.
26. WHEN a fetch call returns a non-2xx HTTP status, THE `js/api.js` module SHALL throw an Error whose message includes the HTTP status code and the requested URL.
27. WHEN a fetch call returns a 2xx HTTP status, THE `js/api.js` module SHALL return the response body parsed as JSON; IF the response body is not valid JSON, THE module SHALL propagate the parse error to the caller.
28. WHEN a network-level failure occurs before a response is received (e.g., connection refused, DNS failure), THE `js/api.js` module SHALL propagate the thrown error to the caller without catching or suppressing it.

---

### Requirement 3: Main Dashboard (`index.html`)

**User Story:** As a data analyst, I want a summary dashboard showing key metrics and top-10 charts, so that I can get an immediate overview of the dataset.

#### Acceptance Criteria

1. WHEN `index.html` loads, THE Dashboard SHALL display four Metric_Cards with the following values:
   - **Total Tracks**: the sum of `track_count` across all results from `GET /genre-trends?limit=114` (note: this is an approximation because tracks can belong to multiple genres).
   - **Total Artists**: the count of items returned by `GET /artist-stats?limit=1000`.
   - **Total Albums**: the value of the `total` field from `GET /albums?limit=1`, or the count of items if no `total` field is present.
   - **Total Genres**: the count of items returned by `GET /genres`.
2. WHEN `index.html` loads, THE Dashboard SHALL fetch `GET /genre-trends?order_by=avg_popularity&limit=10` and render a vertical bar Chart showing the top 10 genres by average popularity, with genre names on the x-axis and average popularity values on the y-axis.
3. WHEN `index.html` loads, THE Dashboard SHALL fetch `GET /artist-stats?order_by=avg_popularity&limit=10` and render a vertical bar Chart showing the top 10 artists by average popularity, with artist names on the x-axis and average popularity values on the y-axis.
4. WHEN a Metric_Card fetch begins, THE Dashboard SHALL immediately display a Loading_State placeholder inside that card.
5. WHEN a Metric_Card fetch succeeds, THE Dashboard SHALL replace the Loading_State with the computed numeric value displayed as a whole number with no decimal places.
6. IF a Metric_Card fetch fails, THEN THE Dashboard SHALL display an Error_State message inside that card; the card SHALL remain visible until the page is refreshed, and the Error_State message may be dismissed via the Dismiss_Button without removing the card itself.
7. WHEN a Chart fetch begins, THE Dashboard SHALL immediately display a Loading_State in the chart container.
8. WHEN a Chart fetch succeeds, THE Dashboard SHALL replace the Loading_State with the rendered Plotly Chart.
9. IF a Chart fetch fails, THEN THE Dashboard SHALL display an Error_State message in the chart container; the container SHALL remain visible until the page is refreshed, and the Error_State message may be dismissed via the Dismiss_Button without removing the container itself.

---

### Requirement 4: Genre Analysis Page (`genres.html`)

**User Story:** As a data analyst, I want to explore all genres with their metrics in a sortable table and visualize energy vs. danceability relationships, so that I can identify genre characteristics and patterns.

#### Acceptance Criteria

1. WHEN `genres.html` loads, THE Genre_Table SHALL fetch `GET /genre-trends?limit=114` and display one row per genre with the following columns: genre name, avg popularity (two decimal places), avg energy (two decimal places), avg danceability (two decimal places), avg valence (two decimal places), and track count; rows SHALL be sorted by avg popularity descending by default.
2. THE Genre_Table SHALL include a sort selector with one option for each of the five metric columns: avg popularity, avg energy, avg danceability, avg valence, and track count; the sort selector SHALL default to "avg popularity" on page load.
3. WHEN the user selects a sort option, THE Genre_Table SHALL re-sort the existing rows client-side in descending order by the selected column without making a new API request.
4. WHEN `genres.html` loads and genre data has been fetched, THE App SHALL render a scatter plot Chart reusing the data already fetched in AC1 (no additional API request), where each point represents one genre, the x-axis represents avg danceability, the y-axis represents avg energy, and the marker size is proportional to track_count within a range of 6px to 30px.
5. WHEN `genres.html` loads, THE App SHALL fetch `GET /genre-trends?order_by=track_count&limit=20` and render a horizontal bar Chart showing the top 20 genres by track count, with genre names on the y-axis and track count on the x-axis.
6. WHILE the `GET /genre-trends?limit=114` fetch is in flight, THE App SHALL display a Loading_State indicator in the Genre_Table container and in the scatter plot Chart container.
7. WHILE the `GET /genre-trends?order_by=track_count&limit=20` fetch is in flight, THE App SHALL display a Loading_State indicator in the horizontal bar Chart container.
8. IF the `GET /genre-trends?limit=114` fetch fails, THEN THE App SHALL display an Error_State message in the Genre_Table container and in the scatter plot Chart container.
9. IF the `GET /genre-trends?order_by=track_count&limit=20` fetch fails, THEN THE App SHALL display an Error_State message in the horizontal bar Chart container.

---

### Requirement 5: Artist Analysis Page (`artists.html`)

**User Story:** As a data analyst, I want to browse artists with search and pagination, view individual artist details, and see a top-15 chart, so that I can analyze artist performance.

#### Acceptance Criteria

1. WHEN `artists.html` loads, THE Artist_Table SHALL fetch `GET /artists?limit=20&offset=0` and display rows with two columns: artist name and a "View Details" button.
2. THE Artist_Table SHALL support Pagination with 20 artists per page using `?limit=20&offset=N` increments.
3. THE App SHALL render a "Previous" control that is disabled when offset equals 0.
4. THE App SHALL render a "Next" control that is disabled when the current page response contains fewer than 20 items.
5. THE Artist_Table SHALL include a text search input that filters the displayed rows by artist name client-side without making a new API request.
6. WHEN the search input contains a value and no rows match that value, THE App SHALL display the message "No artists found" in the table body.
7. WHEN the user clicks the "View Details" button on an artist row, THE App SHALL fetch `GET /artists/{id}` and display a Detail_Panel showing: artist name, avg popularity rounded to two decimal places, total track count, and explicit track count.
8. WHEN a Detail_Panel is open, THE App SHALL provide a visible close button.
9. WHEN the user clicks the close button on an open Detail_Panel, THE App SHALL dismiss the Detail_Panel.
10. WHEN a Detail_Panel is open and the user clicks outside the Detail_Panel area, THE App SHALL dismiss the Detail_Panel.
11. WHEN `artists.html` loads, THE App SHALL fetch `GET /artist-stats?order_by=track_count&limit=15` and render a vertical bar Chart showing the top 15 artists by track count, with artist names on the x-axis and track count on the y-axis.
12. WHILE artist list data is loading, THE App SHALL display a Loading_State in the Artist_Table container.
13. IF artist list data fails to load, THEN THE App SHALL display an Error_State message in the Artist_Table container.
14. WHILE Detail_Panel data is loading, THE App SHALL display a Loading_State inside the Detail_Panel.
15. IF Detail_Panel data fails to load, THEN THE App SHALL display an Error_State message inside the Detail_Panel.
16. WHILE Chart data is loading, THE App SHALL display a Loading_State in the Chart container.
17. IF Chart data fails to load, THEN THE App SHALL display an Error_State message in the Chart container.

---

### Requirement 6: Track Explorer Page (`tracks.html`)

**User Story:** As a music curator, I want to browse tracks with filters and view detailed audio feature profiles, so that I can discover tracks matching specific characteristics.

#### Acceptance Criteria

1. WHEN `tracks.html` loads, THE Track_List SHALL fetch `GET /tracks?limit=20&offset=0` and display 20 tracks per page with the following columns: track name, album name, popularity (0–100), and duration formatted as mm:ss.
2. THE App SHALL render "Previous" and "Next" pagination controls.
3. IF offset equals 0, THEN THE App SHALL disable the "Previous" control.
4. IF the current page response contains fewer than 20 tracks, THEN THE App SHALL disable the "Next" control.
5. THE App SHALL provide a range slider labeled "Min Popularity" with a range of 0 to 100 that filters tracks by minimum popularity; WHEN the user releases the slider, THE Track_List SHALL re-fetch tracks using the current `min_popularity` value combined with all other active filters in a single request.
6. THE App SHALL provide a checkbox labeled "Explicit only" that filters tracks by explicit content; WHEN the checkbox state changes, THE Track_List SHALL re-fetch tracks using the `explicit=true` query parameter combined with all other active filters in a single request.
7. WHEN the user changes any filter value, THE Track_List SHALL reset offset to 0 before fetching.
8. WHEN the user clicks on a track row, THE App SHALL fetch `GET /tracks/{id}` and display a Detail_Panel showing: track name, album name, popularity, duration formatted as mm:ss, and explicit status displayed as "Yes" or "No".
9. WHEN the Detail_Panel for a track is displayed and the `GET /tracks/{id}` response includes Audio_Features, THE App SHALL render a Radar_Chart inside the Detail_Panel showing the seven Audio_Features (danceability, energy, speechiness, acousticness, instrumentalness, liveness, valence) on a scale of 0–100; each value SHALL be multiplied by 100 and rounded to the nearest whole number before plotting.
10. WHEN the Detail_Panel for a track is displayed and the `GET /tracks/{id}` response does not include Audio_Features, THE App SHALL display the message "Audio features not available" in place of the Radar_Chart.
11. WHEN a Detail_Panel is open, THE App SHALL provide a visible close button; WHEN the user clicks the close button, THE App SHALL dismiss the Detail_Panel.
12. WHEN a Detail_Panel is open and the user clicks outside the modal area, THE App SHALL dismiss the Detail_Panel.
13. WHEN a filter value changes while a Detail_Panel is open, THE App SHALL dismiss the Detail_Panel before re-fetching the track list.
14. THE App SHALL convert `duration_ms` to mm:ss format wherever duration is displayed; the minutes value SHALL be the integer quotient of `duration_ms` divided by 60000; the seconds value SHALL be the integer remainder of `duration_ms` divided by 60000 then divided by 1000, zero-padded to two digits (e.g., 185000 ms → "3:05").
15. WHILE track list data is loading, THE App SHALL display a Loading_State in the Track_List container.
16. IF track list data fails to load, THEN THE App SHALL display an Error_State message in the Track_List container.
17. WHILE Detail_Panel data is loading, THE App SHALL display a Loading_State inside the Detail_Panel.
18. IF Detail_Panel data fails to load, THEN THE App SHALL display an Error_State message inside the Detail_Panel.

---

### Requirement 7: File Structure and Asset Organization

**User Story:** As a developer, I want all frontend files organized in a predictable directory structure, so that the project is maintainable and assets are easy to locate.

#### Acceptance Criteria

1. THE App SHALL place all static files under `app/static/`.
2. THE App SHALL place all HTML pages directly under `app/static/` as: `index.html`, `genres.html`, `artists.html`, `tracks.html`.
3. THE App SHALL place all CSS files under `app/static/css/` with a single shared stylesheet at `app/static/css/styles.css`.
4. THE App SHALL place all JavaScript files under `app/static/js/` with the following files present: `api.js`, `index.js`, `genres.js`, `artists.js`, `tracks.js`.
5. THE App SHALL load `css/styles.css` from every HTML page using the relative path `css/styles.css`.
6. THE App SHALL include a `<script>` tag for `js/api.js` that appears before the `<script>` tag for the page-specific script in the HTML source of all four pages (`index.html`, `genres.html`, `artists.html`, `tracks.html`).
7. THE App SHALL load the page-specific JS file from its corresponding HTML page using the relative path `js/<page>.js`: `index.html` loads `js/index.js`, `genres.html` loads `js/genres.js`, `artists.html` loads `js/artists.js`, `tracks.html` loads `js/tracks.js`.
