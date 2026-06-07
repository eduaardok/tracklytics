# Tracklytics

[![ClickHouse](https://img.shields.io/badge/ClickHouse-24.3-FFCC01?style=for-the-badge&logo=clickhouse&logoColor=black)](https://clickhouse.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Airflow](https://img.shields.io/badge/Airflow-2.9-017CEE?style=for-the-badge&logo=apacheairflow&logoColor=white)](https://airflow.apache.org)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![PocketBase](https://img.shields.io/badge/PocketBase-Auth-B8DBE4?style=for-the-badge&logo=pocketbase&logoColor=black)](https://pocketbase.io)

![Records](https://img.shields.io/badge/Registros-513.550-8B5CF6?style=for-the-badge)
![Tables](https://img.shields.io/badge/Tablas_ClickHouse-15-8B5CF6?style=for-the-badge)
![Services](https://img.shields.io/badge/Servicios_Docker-8-8B5CF6?style=for-the-badge)
![Progress](https://img.shields.io/badge/Avance(S5)-25%-22c55e?style=for-the-badge)

> Plataforma de analítica musical e inteligencia de negocio sobre datos de Spotify,
> construida con ClickHouse, Airflow, FastAPI y un frontend interactivo con Plotly.js.
> Incluye una app musical tipo Spotify para usuarios finales con sistema de roles.

Tracklytics procesa 113.550 registros reales de Spotify más datos sintéticos semanales
generados deterministamente, los almacena en un modelo dimensional columnar en ClickHouse,
orquesta las cargas con Apache Airflow y los expone mediante una API REST, dashboards
analíticos interactivos y una app musical completa servidos por Nginx.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Fuente de datos | PocketBase (113.550 registros Spotify) |
| Staging | Parquet (vía PyArrow) |
| Base de datos | ClickHouse 24.3 (MergeTree) |
| Orquestación ETL | Apache Airflow 2.9 |
| API REST | FastAPI + Uvicorn (Python 3.11) |
| App musical | HTML + CSS + JavaScript (puerto 8081) |
| UI Framework | Bootstrap 5 (local, sin CDN) |
| Visualización | Plotly.js (gráficos analíticos interactivos) |
| Íconos | Lucide SVG (inline, sin dependencias) |
| Tipografía | Plus Jakarta Sans + Inter |
| Servidor web | Nginx (reverse proxy) |
| Auth | PocketBase JWT (roles: user / analyst / admin) |
| Contenedores | Docker + Docker Compose |

---

## Requisitos previos

- **Docker Desktop** (incluye Docker Compose) — única dependencia obligatoria
- Python 3.11+ — solo para los scripts de inicialización (`load_pocketbase.py`, `init_clickhouse.py`)

---

## Instalación paso a paso

### 1. Clonar el repositorio

```bash
git clone https://github.com/eduaardok/tracklytics.git
cd tracklytics
```

### 2. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# PocketBase
POCKETBASE_URL=http://pocketbase:8090
POCKETBASE_EMAIL=admin@tracklytics.com
POCKETBASE_PASSWORD=cambia_esto_en_produccion
POCKETBASE_COLLECTION=spotify_tracks

# ClickHouse
CLICKHOUSE_DB=tracklytics
CLICKHOUSE_USER=tracklytics_user
CLICKHOUSE_PASSWORD=cambia_esto_en_produccion

# Airflow
AIRFLOW_USER=admin
AIRFLOW_PASSWORD=tracklytics2026
AIRFLOW_SECRET_KEY=tracklytics_secret_key_2026
AIRFLOW_DAG_ID=tracklytics_etl

# ETL
WEEK_NUMBER=1
```

### 3. Levantar todos los servicios

```bash
docker compose up -d
```

Docker Compose levanta automáticamente todos los servicios en el orden correcto:

1. **PocketBase** y **ClickHouse** arrancan primero.
2. **pb-init** crea la colección `spotify_tracks` y carga los 113.550 registros desde el CSV (tarda ~5 min).
3. **init-db** crea el schema dimensional en ClickHouse.
4. **Airflow**, **API**, **Frontend analítico** y **App musical** quedan disponibles.

> **Nota:** En la primera ejecución espera ~5–7 minutos a que `pb-init` termine antes de lanzar el ETL.
> Puedes monitorear con: `docker logs tracklytics_pb_init -f`

### 4. Ejecutar el ETL desde el navegador

Abre `http://localhost:8081/analitica/etl.html` (requiere rol admin), selecciona el número
de semana y pulsa **Disparar ETL**. La página monitorea el estado del DAG en tiempo real.

### Reset completo

Si necesitas partir de cero (borrar todos los datos):

```bash
docker compose down -v
docker compose up -d
```

Los volúmenes se recrean solos. No es necesario ningún paso manual adicional.

---

## URLs de acceso

| Servicio | URL | Acceso |
|---|---|---|
| App musical (Tracklytics) | http://localhost:8081 | Todos los roles |
| Analítica — Dashboard | http://localhost:8081/analytics/dashboard.html | analyst / admin |
| Analítica — Géneros | http://localhost:8081/analytics/genres.html | analyst / admin |
| Analítica — Artistas | http://localhost:8081/analytics/artists.html | analyst / admin |
| Analítica — Tendencias | http://localhost:8081/analytics/trends.html | analyst / admin |
| Analítica — Comparar Artistas | http://localhost:8081/analytics/compare-artists.html | analyst / admin |
| Analítica — ETL | http://localhost:8081/analytics/etl.html | admin |
| Analítica — CRUD | http://localhost:8081/analytics/crud.html | admin |
| Analítica — Calidad de Datos | http://localhost:8081/analytics/data-quality.html | admin |
| API REST + Swagger | http://localhost:8000/docs | - |
| Airflow UI | http://localhost:8080 | admin |
| PocketBase Admin | http://localhost:8090/_/ | admin |

Credenciales Airflow: `admin` / valor de `AIRFLOW_PASSWORD` en `.env` (por defecto `tracklytics2026`)

---

## Sistema de roles

| Rol | App musical | Analítica | ETL + CRUD + Calidad de Datos |
|-----|-------------|-----------|-------------------------------|
| `user` | ✅ Acceso completo | ❌ Bloqueado | ❌ Bloqueado |
| `analyst` | ✅ Acceso completo | ✅ Dashboards y análisis | ❌ Bloqueado |
| `admin` | ✅ Acceso completo | ✅ Todo | ✅ Acceso completo |

El rol `admin` solo se asigna desde PocketBase Admin (`http://localhost:8090/_/`).
Los roles `user` y `analyst` se seleccionan durante el registro en la app.

---

## Funcionalidades por módulo

### App musical (todos los roles)
- Catálogo navegable con búsqueda en tiempo real (debounce 400ms) y filtro por los 114 géneros
- Páginas de detalle de track con 7 atributos de audio (danceability, energy, valence, acousticness, speechiness, instrumentalness, liveness)
- Perfil de artista con estadísticas agregadas desde ClickHouse
- Detalle de álbum con tracklist — cada canción muestra su género, permitiendo identificar la misma canción en múltiples géneros (relación N:M resuelta via `fact_id`)
- Reproductor de audio simulado con barra de progreso
- Favoritos con botón ♥ (localStorage)
- Historial de reproducción con tiempo relativo (localStorage, máx. 50 entradas)
- Playlists: crear, añadir/quitar tracks, eliminar (localStorage)

### Analítica (analyst / admin)
- **Dashboard ejecutivo** — 6 KPIs globales, bubble chart géneros, radar del top género, top 10 géneros y artistas por Plotly.js con caché TTL 60s
- **Géneros** — tabla de 114 géneros con métricas, radar de audio por género, scatter popularidad vs energía
- **Artistas** — búsqueda, perfil con benchmark vs promedio del género
- **Comparar Artistas A vs B** — radar doble de 7 ejes de audio, tabla comparativa con ganador resaltado por métrica
- **Tendencias Temporales** — serie temporal semana a semana (DIM_DATE × FACT_TRACKS), eje Y dual (popularidad 0-100 / energía y danceability 0-1), selector de métricas

### Gestión de datos (admin)
- **Panel ETL** — disparo del DAG de Airflow con polling de las 5 tasks en tiempo real, historial de ejecuciones con métricas (leídos / insertados / rechazados / duración)
- **CRUD dimensional** — gestión completa de las 11 tablas DIM, FACT_TRACKS en modo solo lectura
- **Calidad de Datos** — proporción reales vs sintéticos con gráfico de dona, tasa de rechazo ETL, detalle de la última carga

---

## Estructura del proyecto

```
tracklytics/
├── api/
│   ├── main.py                  # App FastAPI — include routers
│   ├── core/
│   │   ├── config.py            # Variables de entorno
│   │   ├── database.py          # Cliente ClickHouse (threading.local)
│   │   ├── cache.py             # Cache en memoria con TTL
│   │   └── deps.py              # FastAPI dependencies
│   ├── paquetes/
│   │   ├── catalogo/            # Endpoints app musical
│   │   ├── analitica/           # Endpoints dashboards (cache TTL 60s)
│   │   └── gestion_datos/       # ETL, CRUD dimensiones, calidad de datos
│   ├── api_Dockerfile
│   └── requirements.txt
├── app/                         # App musical tipo Spotify (puerto 8081)
│   ├── autenticacion/           # login.html, register.html, profile.html
│   ├── catalogo/                # home.html, search.html, catalog.html, artist.html...
│   ├── biblioteca/              # library.html (favoritos, historial, playlists)
│   ├── analytics/               # dashboard.html, genres.html, artists.html,
│   │                            # trends.html, compare-artists.html,
│   │                            # etl.html, crud.html, data-quality.html
│   ├── js/                      # auth.js, api.js, components.js,
│   │                            # favorites.js, history.js, playlists.js
│   ├── css/                     # main.css, analytics.css
│   ├── img/                     # logo.png
│   ├── Dockerfile
│   └── nginx.conf
├── dataset/
│   └── spotify.csv              # Dataset fuente (113.550 registros)
├── docs/
│   ├── PLAN.md                  # Plan maestro del proyecto (4 presentaciones)
│   ├── ARQUITECTURA.md          # Estructura por paquetes y decisiones técnicas
│   └── PENDIENTES.md            # Mejoras futuras documentadas
├── etl/
│   ├── bronze/                  # Extracción cruda desde PocketBase → Parquet
│   ├── silver/                  # Limpieza, validación y normalización
│   ├── gold/                    # Carga dimensional en ClickHouse + sintéticos
│   ├── utils/                   # clickhouse_client.py, pocketbase_client.py
│   ├── dags/
│   │   └── tracklytics_etl.py   # DAG Airflow: bronze→silver→gold→synthetic→log
│   └── etl_Dockerfile
├── frontend/                    # Dashboard analítico legacy (puerto 80)
├── docker-compose.yml
└── .env                         # Variables de entorno (no versionado)
```

---

## Modelo de datos

15 tablas en ClickHouse organizadas en esquema estrella:

```
PocketBase ──► Bronze (Parquet crudo)
                   │
                   ▼
            Silver (STG_RAW_TRACKS — limpieza y validación)
                   │
                   ▼
         ┌─────────────────────────┐
         │       FACT_TRACKS       │
         │   (~313k–1.6M filas)    │
         │   MergeTree             │
         │   ORDER BY (genre_id,   │
         │             artist_id)  │
         └──────────┬──────────────┘
                    │ FK lógicas
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
   DIM_GENRES   DIM_ARTISTS     DIM_ALBUMS
   DIM_DATE     DIM_MUSICAL_KEY
   DIM_MODE     DIM_TIME_SIGNATURE
   DIM_EXPLICIT_TYPE
   DIM_POPULARITY_RANGE
   DIM_TEMPO_RANGE
   DIM_ENERGY_LEVEL

ETL_LOGS           (historial de ejecuciones)
ETL_BATCH_CONTROL  (control de idempotencia)
```

> **Nota sobre duplicados en tracklist:** el dataset de Spotify asigna múltiples géneros
> a una misma canción. En FACT_TRACKS esto se representa con una fila por combinación
> `track_id × genre_id`. La navegación usa `fact_id` (PK único) para cargar la fila
> exacta con su género correcto.

---

## Pipeline ETL — Capas Bronze / Silver / Gold

| Capa | Origen | Destino | Descripción |
|------|--------|---------|-------------|
| **Bronze** | PocketBase API | Parquet crudo | Extracción fiel sin transformaciones |
| **Silver** | Parquet Bronze | STG_RAW_TRACKS | Limpieza, dedup, validación de rangos |
| **Gold** | STG_RAW_TRACKS | FACT_TRACKS + DIMs | Modelo dimensional + datos sintéticos |

El DAG de Airflow ejecuta las tasks en secuencia:
```
task_bronze → task_silver → task_gold → task_synthetic → task_log
```

| Semanas | Registros totales | Tiempo aprox. |
|---------|-------------------|---------------|
| 1       | 113.550           | ~35 s         |
| 2       | 213.550           | ~1.2 min      |
| 4       | 413.550           | ~1.5 min      |
| 16      | 1.613.550         | ~5 min        |

Los datos sintéticos se generan deterministamente (seed = semana × 42).

---

## Decisiones técnicas clave

- **threading.local para ClickHouse** — cada thread de Uvicorn tiene su propio cliente para evitar errores de consultas concurrentes.
- **Cache TTL 60s** — los endpoints analíticos pesados (dashboard ejecutivo, trends de géneros, tendencias semanales) usan caché en memoria para evitar re-ejecutar JOINs sobre 500k+ registros en cada request.
- **Rutas absolutas en JS** — todos los imports usan `/js/auth.js` en lugar de `../js/auth.js` para que funcionen desde cualquier subcarpeta del frontend.
- **Idempotencia ETL** — `ETL_BATCH_CONTROL` verifica si una semana ya fue cargada antes de insertar, evitando duplicados en recargas.
- **fact_id para navegación** — la navegación al detalle de una canción usa `fact_id` (PK único de FACT_TRACKS) en vez de `track_id` (no único) para resolver correctamente la relación N:M entre tracks y géneros.
- **Bootstrap 5 local** — servido desde `app/libs/` para garantizar funcionamiento offline durante presentaciones, sin depender de CDN.
- **Tema oscuro violeta** — identidad visual con `#8B5CF6` como color primario, sidebar colapsable con íconos Lucide SVG inline, tipografía Plus Jakarta Sans + Inter.