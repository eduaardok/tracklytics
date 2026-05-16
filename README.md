# Tracklytics v2

> Plataforma de analítica musical e inteligencia de negocio sobre datos de Spotify,
> construida con ClickHouse, Airflow, FastAPI y un frontend interactivo con Plotly.js.

Tracklytics v2 procesa 113.550 registros reales de Spotify más datos sintéticos semanales
generados deterministamente, los almacena en un modelo dimensional columnar en ClickHouse,
orquesta las cargas con Apache Airflow y los expone mediante una API REST y dashboards
interactivos servidos por Nginx.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Fuente de datos | PocketBase (113.550 registros Spotify) |
| Staging | Parquet (vía PyArrow) |
| Base de datos | ClickHouse 24.3 (MergeTree) |
| Orquestación ETL | Apache Airflow 2.9 |
| API REST | FastAPI + Uvicorn (Python 3.11) |
| Frontend | HTML + CSS + JavaScript + Plotly.js |
| Servidor web | Nginx (reverse proxy) |
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
POCKETBASE_URL=http://localhost:8090
POCKETBASE_EMAIL=admin@tracklytics.com
POCKETBASE_PASSWORD=tracklytics2026
POCKETBASE_COLLECTION=spotify_tracks

# ClickHouse
CLICKHOUSE_DB=tracklytics
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=

# Airflow
AIRFLOW_USER=admin
AIRFLOW_PASSWORD=tracklytics2026
AIRFLOW_SECRET_KEY=tracklytics2026
AIRFLOW_DAG_ID=tracklytics_etl
```

### 3. Levantar PocketBase

```bash
docker compose up pocketbase -d
```

Espera ~10 segundos a que arranque. PocketBase queda en `http://localhost:8090`.

### 4. Cargar el dataset en PocketBase (solo la primera vez)

```bash
pip install -r requirements.txt
python load_pocketbase.py
```

Crea la colección `spotify_tracks` e importa los 113.550 registros desde `dataset/spotify.csv`.
Este paso tarda varios minutos dependiendo del hardware.

### 5. Inicializar el schema de ClickHouse (solo la primera vez)

```bash
docker compose up clickhouse -d
# Espera a que ClickHouse esté healthy (~20 seg)
python init_clickhouse.py
```

Crea todas las tablas del modelo dimensional (DIM_*, FACT_TRACKS, STG_RAW_TRACKS, ETL_LOGS, ETL_BATCH_CONTROL).

### 6. Levantar todos los servicios

```bash
docker compose up -d
```

Levanta: PocketBase, ClickHouse, ETL runner, API, Airflow y Frontend.
Airflow tarda ~2 minutos en inicializarse completamente.

### 7. Ejecutar el ETL desde el navegador

Abre `http://localhost/pages/etl.html`, selecciona el número de semana y pulsa
**Cargar hasta semana N**. La página monitorea el estado del DAG en tiempo real.

---

## URLs de acceso

| Servicio | URL |
|---|---|
| Frontend (Dashboard) | http://localhost |
| API REST + Swagger | http://localhost:8000/docs |
| Airflow UI | http://localhost:8080 |
| PocketBase Admin | http://localhost:8090/_/ |

Credenciales Airflow: `admin` / `tracklytics2026`

---

## Estructura del proyecto

```
tracklytics/
├── api/
│   ├── main.py              # API REST (FastAPI)
│   ├── api_Dockerfile
│   └── requirements.txt
├── dataset/
│   └── spotify.csv          # Dataset fuente (113.550 registros)
├── docs/
│   ├── DIMENSIONAL_MODEL.md # Schema completo de ClickHouse
│   └── EMPRESA_TRACKLYTICS.md
├── etl/
│   ├── dags/
│   │   └── etl_dag.py       # DAG de Airflow (ETL completo)
│   ├── synthetic.py         # Generador de datos sintéticos
│   ├── main.py              # Runner directo (legacy)
│   └── etl_Dockerfile
├── frontend/
│   ├── index.html           # Dashboard ejecutivo
│   ├── pages/
│   │   ├── genres.html      # Análisis de géneros
│   │   ├── artists.html     # Perfil de artistas
│   │   ├── etl.html         # Panel ETL con monitoreo en vivo
│   │   └── crud.html        # CRUD de dimensiones
│   ├── css/styles.css
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
├── init_clickhouse.py       # Inicialización del schema ClickHouse
├── load_pocketbase.py       # Carga inicial del dataset en PocketBase
├── requirements.txt
└── .env                     # Variables de entorno (no versionado)
```

---

## Modelo de datos

15 tablas en ClickHouse:

```
PocketBase ──► STG_RAW_TRACKS (staging temporal)
                      │
                      ▼
         ┌────────────────────────┐
         │       FACT_TRACKS      │
         │   (~114k–1.6M filas)   │
         └──────────┬─────────────┘
                    │ FK
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   DIM_GENRES  DIM_ARTISTS  DIM_ALBUMS
   DIM_DATE    DIM_MUSICAL_KEY
   DIM_MODE    DIM_TIME_SIGNATURE
   DIM_EXPLICIT_TYPE
   DIM_POPULARITY_RANGE
   DIM_TEMPO_RANGE
   DIM_ENERGY_LEVEL

ETL_LOGS           (historial de ejecuciones)
ETL_BATCH_CONTROL  (control de idempotencia)
```

El schema completo con DDL está en `docs/DIMENSIONAL_MODEL.md`.

---

## Pipeline ETL

Cada ejecución reemplaza todos los datos (no acumulativo):

1. **Truncar** FACT_TRACKS y ETL_BATCH_CONTROL
2. **Extraer** desde PocketBase → Parquet
3. **Cargar staging** → STG_RAW_TRACKS en ClickHouse
4. **Poblar dimensiones** (DIM_DATE para semanas 1..N)
5. **Poblar hechos**:
   - Semana 1: 113.550 registros reales
   - Semanas 2..N: +100.000 registros sintéticos/semana (seed = semana × 42)
6. **Registrar** resultado en ETL_LOGS
7. **Limpiar** staging y Parquet

Al finalizar la semana 16: ~1.6M filas en FACT_TRACKS.
