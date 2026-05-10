# Tracklytics — Estado del Proyecto

> **Última actualización:** Mayo 2026 | **Sprint actual:** 3 → 4

---

## Completado
- Dataset analizado
- Profiling realizado
- Modelo relacional definido
- Schema PostgreSQL validado
- 11 tablas creadas (10 del dataset + etl_logs)
- Repositorio Git inicializado
- Pipeline ETL implementado y ejecutado exitosamente
- Dataset completo cargado en PostgreSQL
- API REST implementada con FastAPI
- Endpoints básicos y analíticos funcionando
- Documentación Swagger disponible en /docs
- **Frontend web implementado con HTML + CSS + JavaScript (Sprint 3)**
- **Dashboards interactivos con Plotly (Sprint 3)**
- **Frontend servido como archivos estáticos desde FastAPI**

## Pendiente
- README.md público del proyecto
- Documentación empresarial
- Tests de integración
- Optimización de queries y performance

## Decisiones Técnicas
- PostgreSQL como DBMS
- ETL en Python con SQLAlchemy + psycopg2
- `genre_trends` y `artist_stats` como tablas analíticas precalculadas (DD-09)
- `audio_features` separada de `tracks` para normalización explícita (DD-10)
- `track_name` y `albums.name` definidos como `TEXT` — el dataset contiene nombres que superan los 500 caracteres
- Contadores ETL casteados a `int` nativo de Python para compatibilidad con psycopg2
- ETL idempotente con `INSERT ... ON CONFLICT DO NOTHING` (DD-07)
- `genre_trends` y `artist_stats` usan `ON CONFLICT DO UPDATE` para reflejar recálculos al re-ejecutar
- API REST en un solo archivo `app/main.py` con FastAPI
- CORS habilitado para consumo desde el frontend local
- Paginación con `limit` y `offset` en todos los listados
- Filtros opcionales en `/tracks`: `min_popularity`, `explicit`
- Búsqueda por nombre en `/artists`: parámetro `search` (ILIKE)
- Ordenamiento dinámico en `/genre-trends` y `/artist-stats`
- Frontend como archivos estáticos en `app/static/` (HTML + CSS + JS vanilla)
- Gráficos con Plotly.js (CDN) — tema oscuro consistente en todas las páginas
- JS organizado en módulos ES (`type="module"`): `api.js` centraliza todas las llamadas HTTP
- Tests unitarios de JS con Vitest (`app/static/package.json`)

## Resultados ETL — Ejecución Mayo 2026

| Métrica | Valor |
|---|---|
| Filas leídas del CSV | 114.000 |
| Descartados por nulos críticos | 1 |
| Rechazados por validaciones de rango | 163 |
| Filas válidas procesadas | 113.836 |
| Registros insertados en total | 607.209 |
| Status final | ✅ success |

### Registros insertados por tabla

| Tabla | Filas |
|---|---|
| `genres` | 114 |
| `artists` | 29.793 |
| `albums` | 46.529 |
| `tracks` | 89.578 |
| `audio_features` | 89.578 |
| `track_artists` | 123.066 |
| `track_genres` | 113.386 |
| `album_artists` | 85.258 |
| `genre_trends` | 114 |
| `artist_stats` | 29.793 |
| **Total** | **607.209** |

## Endpoints API REST

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de la API y la base de datos |
| GET | `/genres` | Todos los géneros |
| GET | `/albums` | Álbumes paginados |
| GET | `/albums/{id}` | Álbum + sus tracks |
| GET | `/artists` | Artistas paginados, búsqueda por nombre (`search`) |
| GET | `/artists/{id}` | Artista + sus stats |
| GET | `/tracks` | Tracks paginados, filtros opcionales |
| GET | `/tracks/{id}` | Track + audio features |
| GET | `/genre-trends` | Métricas por género, ordenable |
| GET | `/artist-stats` | Métricas por artista, ordenable |
| GET | `/counts` | Totales globales (tracks, artists, albums, genres) |

## Frontend Web — Sprint 3

### Páginas implementadas

| Página | Archivo | Descripción |
|---|---|---|
| Dashboard | `index.html` | Métricas globales + Top 10 géneros y artistas (barras) |
| Géneros | `genres.html` | Tabla ordenable + scatter Energy vs Danceability + Top 20 por track count |
| Artistas | `artists.html` | Tabla paginada con búsqueda + Top 15 por track count + modal de detalle |
| Tracks | `tracks.html` | Tabla paginada + filtros (popularidad, explicit) + modal con radar chart de audio features |

### Módulos JavaScript

| Archivo | Responsabilidad |
|---|---|
| `js/api.js` | Cliente HTTP centralizado — todas las llamadas a la API REST |
| `js/index.js` | Lógica del dashboard (métricas y gráficos principales) |
| `js/genres.js` | Tabla de géneros y gráficos de análisis de géneros |
| `js/artists.js` | Tabla + búsqueda + paginación + modal de detalle de artistas |
| `js/tracks.js` | Tabla + filtros + paginación + modal con radar chart de audio features |

### Tests JS (Vitest)
- `tests/api.buildQuery.test.js` — función `buildQuery` de `api.js`
- `tests/formatDuration.test.js` — función `formatDuration` de `tracks.js`
- `tests/scaleMarkerSizes.test.js` — función de escalado de markers en scatter

## Estructura Real del Repositorio

```
TRACKLYTICS/
├── app/
│   ├── main.py                  # API REST — FastAPI
│   └── static/                  # Frontend web
│       ├── css/styles.css        # Estilos globales (tema oscuro)
│       ├── index.html            # Dashboard
│       ├── genres.html           # Análisis de géneros
│       ├── artists.html          # Análisis de artistas
│       ├── tracks.html           # Explorador de tracks
│       ├── js/
│       │   ├── api.js            # Cliente HTTP centralizado
│       │   ├── index.js          # Lógica del dashboard
│       │   ├── genres.js         # Lógica de géneros
│       │   ├── artists.js        # Lógica de artistas
│       │   ├── tracks.js         # Lógica de tracks
│       │   └── tests/            # Tests unitarios Vitest
│       ├── package.json
│       └── vitest.config.js
├── dataset/spotify.csv
├── docker-compose.yml
├── database/schema.sql
├── docs/
├── etl/main.py
├── requirements.txt
└── README.md
```

## Próximo Paso
Sprint 4 — Integración general, optimización, testing y presentación final.