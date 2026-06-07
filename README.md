# Tracklytics v2

[![ClickHouse](https://img.shields.io/badge/ClickHouse-24.3-FFCC01?style=for-the-badge&logo=clickhouse&logoColor=black)](https://clickhouse.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Airflow](https://img.shields.io/badge/Airflow-2.9-017CEE?style=for-the-badge&logo=apacheairflow&logoColor=white)](https://airflow.apache.org)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![PocketBase](https://img.shields.io/badge/PocketBase-Auth-B8DBE4?style=for-the-badge&logo=pocketbase&logoColor=black)](https://pocketbase.io)

![Records](https://img.shields.io/badge/Registros-313.550-8B5CF6?style=for-the-badge)
![Tables](https://img.shields.io/badge/Tablas_ClickHouse-15-8B5CF6?style=for-the-badge)
![Services](https://img.shields.io/badge/Servicios_Docker-8-8B5CF6?style=for-the-badge)
![Progress](https://img.shields.io/badge/Avance-25%25_P1_Completada-22c55e?style=for-the-badge)

> Plataforma de analítica musical e inteligencia de negocio sobre datos de Spotify,
> construida con ClickHouse, Airflow, FastAPI y un frontend interactivo con Plotly.js.
> Incluye una app musical tipo Spotify para usuarios finales con sistema de roles.

Tracklytics v2 procesa 313.550 registros reales de Spotify más datos sintéticos semanales
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
| Analítica | HTML + JavaScript + Plotly.js |
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
| Analítica — Dashboard | http://localhost:8081/analitica/dashboard.html | analyst / admin |
| Analítica — ETL | http://localhost:8081/analitica/etl.html | admin |
| Analítica — CRUD | http://localhost:8081/analitica/crud.html | admin |
| API REST + Swagger | http://localhost:8000/docs | - |
| Airflow UI | http://localhost:8080 | admin |
| PocketBase Admin | http://localhost:8090/_/ | admin |

Credenciales Airflow: `admin` / valor de `AIRFLOW_PASSWORD` en `.env` (por defecto `tracklytics2026`)

---

## Sistema de roles

| Rol | App musical | Analítica Tracklytics |
|-----|-------------|----------------------|
| `user` | ✅ Acceso completo | ❌ Bloqueado |
| `analyst` | ✅ Acceso completo | ✅ Dashboards y análisis |
| `admin` | ✅ Acceso completo | ✅ Todo + ETL + CRUD |

El rol `admin` solo se asigna desde PocketBase Admin (`http://localhost:8090/_/`).
Los roles `user` y `analyst` se seleccionan durante el registro en la app.

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
│   │   └── gestion_datos/       # ETL, CRUD dimensiones
│   ├── api_Dockerfile
│   └── requirements.txt
├── app/                         # App musical tipo Spotify (puerto 8081)
│   ├── autenticacion/           # login.html, register.html, profile.html
│   ├── catalogo/                # home.html, search.html, catalog.html, artist.html...
│   ├── biblioteca/              # library.html
│   ├── analitica/               # dashboard.html, genres.html, artists.html, etl.html, crud.html
│   ├── js/                      # auth.js, api.js, components.js
│   ├── css/                     # main.css, analytics.css
│   ├── img/                     # logo.png
│   ├── Dockerfile
│   └── nginx.conf
├── dataset/
│   └── spotify.csv              # Dataset fuente (113.550 registros)
├── docs/
│   ├── PLAN.md                  # Plan maestro del proyecto (4 presentaciones)
│   └── ARQUITECTURA.md          # Estructura por paquetes y decisiones técnicas
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
- **Cache TTL 60s** — los endpoints analíticos pesados (dashboard ejecutivo, trends de géneros) usan caché en memoria para evitar re-ejecutar JOINs sobre 300k+ registros en cada request.
- **Rutas absolutas en JS** — todos los imports usan `/js/auth.js` en lugar de `../js/auth.js` para que funcionen desde cualquier subcarpeta del frontend.
- **Idempotencia ETL** — `ETL_BATCH_CONTROL` verifica si una semana ya fue cargada antes de insertar, evitando duplicados en recargas.
