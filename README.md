# Tracklytics

> Plataforma web de analítica musical e inteligencia de negocio sobre datos de Spotify.

Tracklytics procesa más de 114.000 registros musicales mediante un pipeline ETL en Python, los almacena en PostgreSQL con un modelo relacional de 11 tablas, expone los datos a través de una API REST con FastAPI y los visualiza en dashboards interactivos con Plotly.js.

---

## Tabla de contenidos

- [Demo](#demo)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Requisitos](#requisitos)
- [Instalación y ejecución](#instalación-y-ejecución)
- [Pipeline ETL](#pipeline-etl)
- [API REST](#api-rest)
- [Frontend](#frontend)
- [Modelo de datos](#modelo-de-datos)
- [Tests](#tests)

---

## Demo

| Página | Descripción |
|---|---|
| `/` — Dashboard | Métricas globales + Top 10 géneros y artistas |
| `/genres.html` | Tabla ordenable + scatter Energy vs Danceability |
| `/artists.html` | Tabla paginada con búsqueda + modal de detalle |
| `/tracks.html` | Filtros por popularidad y explicit + radar de audio features |
| `/admin.html` | Ejecutar el ETL desde el navegador + historial de ejecuciones |

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Lenguaje | Python 3.11+ |
| API | FastAPI + Uvicorn |
| Base de datos | PostgreSQL |
| ORM / queries | SQLAlchemy + psycopg2 |
| ETL | Pandas |
| Frontend | HTML + CSS + JavaScript (ES Modules) |
| Gráficos | Plotly.js (CDN) |
| Contenedores | Docker + Docker Compose |
| Testing JS | Vitest |

---

## Estructura del proyecto

```
tracklytics/
├── app/
│   ├── main.py                  # API REST (FastAPI)
│   └── static/                  # Frontend web
│       ├── css/styles.css
│       ├── index.html            # Dashboard
│       ├── genres.html
│       ├── artists.html
│       ├── tracks.html
│       ├── admin.html            # Panel de administración / ETL
│       └── js/
│           ├── api.js            # Cliente HTTP centralizado
│           ├── index.js
│           ├── genres.js
│           ├── artists.js
│           ├── tracks.js
│           ├── admin.js
│           └── tests/
├── database/
│   └── schema.sql               # Schema PostgreSQL completo
├── dataset/
│   └── spotify.csv              # Dataset fuente (no incluido en el repo)
├── docs/                        # Documentación técnica
├── etl/
│   └── main.py                  # Pipeline ETL
├── docker-compose.yml
├── requirements.txt
└── README.md
```

---

## Requisitos

- Python 3.11+
- Docker y Docker Compose
- Node.js 18+ (solo para correr los tests de JS)

---

## Instalación y ejecución

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/tracklytics.git
cd tracklytics
```

### 2. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
DATABASE_URL=postgresql://postgres:postgresqlAdmin19@localhost:5432/tracklytics
DATASET_PATH=dataset/spotify.csv
```

### 3. Levantar la base de datos

```bash
docker compose up -d
```

Esto levanta PostgreSQL en el puerto 5432.

### 4. Crear el schema

```bash
psql -h localhost -U postgres -d tracklytics -f database/schema.sql
```

O desde cualquier cliente PostgreSQL, ejecuta el contenido de `database/schema.sql`.

### 5. Instalar dependencias Python

```bash
pip install -r requirements.txt
```

### 6. Ejecutar el ETL

```bash
python etl/main.py
```

El pipeline lee `dataset/spotify.csv`, valida y transforma los datos, y los carga en PostgreSQL. Al finalizar registra el resultado en `etl_logs`.

> El dataset no está incluido en el repositorio por su tamaño. Descárgalo desde [Kaggle — Spotify Tracks Dataset](https://www.kaggle.com/datasets/maharshipandya/-spotify-tracks-dataset) y colócalo en `dataset/spotify.csv`.

### 7. Iniciar la API

```bash
uvicorn app.main:app --reload
```

La API queda disponible en `http://localhost:8000`.  
El frontend se sirve desde `http://localhost:8000/`.  
La documentación Swagger está en `http://localhost:8000/docs`.

---

## Pipeline ETL

El pipeline se ejecuta desde `etl/main.py` y sigue tres fases:

**Fase 1 — Extracción**
- Lee el CSV con Pandas
- Elimina la columna residual `Unnamed: 0`
- Descarta registros con nulos en campos críticos (`artists`, `album_name`, `track_name`)

**Fase 2 — Transformación y validación**
- Valida rangos: `popularity` (0–100), columnas de audio (0.0–1.0), `mode` (0 o 1), `musical_key` (0–11), `time_signature` (1, 3, 4, 5)
- Separa artistas múltiples del campo `artists` (separador `;`)
- Construye 10 DataFrames independientes listos para carga
- Calcula agregados para `genre_trends` y `artist_stats`

**Fase 3 — Carga**
- Inserta en orden respetando las dependencias de claves foráneas
- Estrategia idempotente: `INSERT ... ON CONFLICT DO NOTHING` para entidades maestras
- `genre_trends` y `artist_stats` usan `ON CONFLICT DO UPDATE` para reflejar recálculos
- Registra el resultado en `etl_logs`

**Resultados de la ejecución (Mayo 2026)**

| Métrica | Valor |
|---|---|
| Filas leídas | 114.000 |
| Registros válidos | 113.836 |
| Registros insertados | 607.209 |
| Tablas cargadas | 10 |

El ETL también puede ejecutarse desde el navegador en la página **Admin** (`/admin.html`).

---

## API REST

Base URL: `http://localhost:8000`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de la API y la base de datos |
| GET | `/counts` | Totales globales (tracks, artists, albums, genres) |
| GET | `/genres` | Lista todos los géneros |
| GET | `/albums` | Álbumes paginados |
| GET | `/albums/{id}` | Álbum + sus tracks |
| GET | `/artists` | Artistas paginados, búsqueda por `search` |
| GET | `/artists/{id}` | Artista + sus estadísticas |
| GET | `/tracks` | Tracks paginados, filtros `min_popularity` y `explicit` |
| GET | `/tracks/{id}` | Track + audio features |
| GET | `/genre-trends` | Métricas por género, ordenable por `order_by` |
| GET | `/artist-stats` | Métricas por artista, ordenable por `order_by` |
| POST | `/admin/run-etl` | Ejecuta el pipeline ETL completo |
| GET | `/admin/etl-logs` | Historial de ejecuciones ETL |

Documentación interactiva completa: `http://localhost:8000/docs`

---

## Frontend

Cuatro páginas de análisis más un panel de administración, todas con tema oscuro y gráficos Plotly.js interactivos.

**Dashboard** (`index.html`)
- Tarjetas con totales: tracks, artistas, álbumes, géneros
- Gráfico de barras: Top 10 géneros por popularidad promedio
- Gráfico de barras: Top 10 artistas por popularidad promedio

**Géneros** (`genres.html`)
- Tabla completa de los 114 géneros con métricas, ordenable por cualquier columna
- Scatter plot: Energy vs Danceability por género
- Barras: Top 20 géneros por cantidad de tracks

**Artistas** (`artists.html`)
- Tabla paginada con búsqueda en tiempo real
- Modal de detalle con estadísticas del artista
- Barras: Top 15 artistas por cantidad de tracks

**Tracks** (`tracks.html`)
- Tabla paginada con filtro por popularidad mínima y contenido explícito
- Modal de detalle con radar chart de las 7 características de audio

**Admin** (`admin.html`)
- Botón para ejecutar el ETL desde el navegador
- Panel de resultado con métricas de la ejecución
- Historial completo de ejecuciones con estado y timestamps

---

## Modelo de datos

11 tablas en PostgreSQL (10 del negocio + 1 de infraestructura):

```
genres       → genre_trends   (1:1 agregado)
artists      → artist_stats   (1:1 agregado)
albums       → tracks         (1:N)
tracks       → audio_features (1:1)
tracks  ↔  artists   (N:M vía track_artists)
tracks  ↔  genres    (N:M vía track_genres)
albums  ↔  artists   (N:M vía album_artists)
etl_logs               (infraestructura, sin FK)
```

El schema completo con constraints, índices y comentarios está en `database/schema.sql`.

---

## Tests

### Tests de JavaScript (Vitest)

```bash
cd app/static
npm install
npm test
```

Cubre: `buildQuery` (api.js), `formatDuration` (tracks.js), `scaleMarkerSizes` (genres.js).