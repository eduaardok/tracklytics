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
4. **Airflow**, **API** y **Frontend** quedan disponibles.

> **Nota:** En la primera ejecución espera ~5–7 minutos a que `pb-init` termine antes de lanzar el ETL.
> Puedes monitorear con: `docker logs tracklytics_pb_init -f`

### 4. Ejecutar el ETL desde el navegador

Abre `http://localhost/pages/etl.html`, selecciona el número de semana y pulsa
**Cargar hasta semana N**. La página monitorea el estado del DAG en tiempo real.

### Reset completo

Si necesitas partir de cero (borrar todos los datos):

```bash
docker compose down -v
docker compose up -d
```

Los volúmenes se recrean solos. No es necesario ningún paso manual adicional.

---

## URLs de acceso

| Servicio | URL |
|---|---|
| Frontend (Dashboard) | http://localhost |
| API REST + Swagger | http://localhost:8000/docs |
| Airflow UI | http://localhost:8080 |
| PocketBase Admin | http://localhost:8090/_/ |

Credenciales Airflow: `admin` / valor de `AIRFLOW_PASSWORD` en `.env` (por defecto `tracklytics2026`)

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
2. **Extraer** desde PocketBase → JSON → Parquet (descarga paralela con 10 workers)
3. **Cargar staging** → STG_RAW_TRACKS en ClickHouse
4. **Poblar dimensiones** (DIM_DATE para semanas 1..N)
5. **Poblar hechos** (vectorizado con pandas/numpy, sin bucles Python):
   - Semana 1: 113.550 registros reales
   - Semanas 2..N: +100.000 registros sintéticos/semana (seed = semana × 42)
6. **Registrar** resultado en ETL_LOGS
7. **Limpiar** staging y Parquet

| Semanas | Registros totales | Tiempo aprox. |
|---------|-------------------|---------------|
| 1       | 113.550           | ~35 s         |
| 2       | 213.550           | ~1.2 min      |
| 4       | 413.550           | ~1.5 min      |
| 16      | 1.613.550         | ~5 min        |

Los datos sintéticos se generan deterministamente (misma seed → mismo resultado), lo que garantiza reproducibilidad entre ejecuciones.
