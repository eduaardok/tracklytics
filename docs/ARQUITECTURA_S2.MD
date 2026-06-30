# Tracklytics — Estructura por Paquetes (Orientada a Rendimiento)

## Principios aplicados

| Principio | Decisión |
|-----------|----------|
| Connection pooling | Un cliente ClickHouse reutilizable por worker (singleton) |
| Query caching | Cache en memoria con TTL para queries analíticas pesadas |
| Separación read/write | Queries de lectura (app) vs escritura (ETL) en clientes distintos |
| Rutas absolutas | Todos los imports JS usan rutas desde / para evitar roturas al mover archivos |
| Lazy loading | Los dashboards cargan sección por sección, no todo junto |
| Límites duros | Ningún endpoint devuelve más de 500 registros sin paginación explícita |
| Dependency injection | FastAPI Depends() para inyectar cliente CH validado en cada endpoint |

---

## API — Estructura final

```
api/
├── main.py                        ← App, middleware, include_router, lifespan
│
├── core/
│   ├── __init__.py
│   ├── config.py                  ← Settings desde env vars (pydantic BaseSettings)
│   ├── database.py                ← Singleton CH client + query_rows/query_one
│   │                                 Pool: un cliente por proceso worker
│   │                                 Reconexión automática si cae ClickHouse
│   ├── cache.py                   ← Cache en memoria con TTL (dict + timestamp)
│   │                                 Decorator @cached(ttl=60) para endpoints pesados
│   └── deps.py                    ← FastAPI Depends: get_db(), verify_role()
│                                     verify_role("admin") → 403 si no cumple
│
├── paquetes/
│   │
│   ├── autenticacion/
│   │   ├── __init__.py
│   │   └── router.py              ← GET /app/v1/auth/me (perfil desde PocketBase)
│   │                                 No queries CH — solo proxy a PocketBase
│   │
│   ├── catalogo/
│   │   ├── __init__.py
│   │   ├── router.py              ← /tracks/top, /tracks/search, /tracks/{id}
│   │   │                            /artists/top, /artists/{id}, /artists/search
│   │   │                            /albums/{id}, /albums/search
│   │   │                            /genres, /genres/{id}
│   │   │                            /tracks/by-artist, /by-album, /by-genre
│   │   └── queries.py             ← SQL separado del router (legibilidad + reutilización)
│   │                                 Constantes SQL como strings con {params}
│   │
│   ├── reproduccion/
│   │   ├── __init__.py
│   │   └── router.py              ← POST /app/v1/history (registra en PocketBase)
│   │                                 GET /app/v1/history/{user_id}
│   │                                 No queries CH — solo PocketBase
│   │
│   ├── biblioteca/
│   │   ├── __init__.py
│   │   └── router.py              ← /favorites, /playlists (PocketBase)
│   │                                 No queries CH
│   │
│   ├── analitica/
│   │   ├── __init__.py
│   │   ├── router.py              ← /dashboard/executive, /genres/trends
│   │   │                            /genres/{id}/audio-profile
│   │   │                            /artists/search, /artists/{id}/stats
│   │   │                            Todos usan @cached(ttl=60)
│   │   └── queries.py             ← SQLs de agregación pesada separados
│   │
│   └── gestion_datos/
│       ├── __init__.py
│       ├── router.py              ← /etl/trigger, /etl/logs, /etl/status
│       │                            /dim/{table} CRUD
│       │                            Requiere verify_role("admin")
│       └── queries.py
```

### Por qué este diseño es eficiente

**`core/database.py` — Singleton**
```python
# Un solo cliente por proceso — no abre conexión en cada request
_client: Optional[Client] = None

def get_client() -> Client:
    global _client
    if _client is None or not _client.ping():
        _client = clickhouse_connect.get_client(...)
    return _client
```

**`core/cache.py` — Cache con TTL**
```python
# Evita re-ejecutar JOINs pesados en cada request del dashboard
@cached(ttl=60)  # 60 segundos
def dashboard_executive():
    ...  # query de 5 JOINs sobre 300k+ registros
```

**`core/deps.py` — Dependency injection**
```python
# FastAPI inyecta el cliente validado, no se instancia en cada función
def get_db() -> Client:
    return get_client()

def verify_admin(user: dict = Depends(get_current_user)):
    if user["role"] not in ("admin", "analyst"):
        raise HTTPException(403)
```

**`catalogo/queries.py` — SQL separado**
```python
# SQL como constantes, no mezclado con la lógica del router
TOP_TRACKS_SQL = """
    SELECT ft.track_id, ft.track_name,
           a.name AS artist_name, g.name AS genre_name,
           ft.popularity, ft.duration_ms,
           ft.danceability, ft.energy, ft.valence
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
    JOIN DIM_GENRES g  ON ft.genre_id  = g.genre_id
    ORDER BY ft.popularity DESC
    LIMIT {limit:UInt32}
"""
```

---

## Frontend — Estructura final

```
app/
├── index.html                     ← Redirect: sin sesión → /autenticacion/login.html
│                                    con sesión → /catalogo/home.html
├── css/
│   ├── main.css                   ← Variables, layout, componentes base
│   └── analytics.css              ← Overrides para páginas analíticas
├── img/
│   └── logo.png
│
├── js/                            ← Módulos compartidos (rutas absolutas siempre)
│   ├── auth.js                    ← Sesión, roles, guards
│   ├── api.js                     ← apiFetch + namespaces Tracks/Artists/etc.
│   └── components.js              ← renderSidebar, renderPlayer, trackRow
│
├── autenticacion/
│   ├── login.html                 ← import desde '/js/auth.js' (ruta absoluta)
│   ├── register.html
│   └── profile.html
│
├── catalogo/
│   ├── home.html
│   ├── search.html
│   ├── catalog.html
│   ├── artist.html
│   ├── album.html
│   ├── track.html
│   └── genres.html
│
├── biblioteca/
│   └── library.html
│
└── analitica/
    ├── dashboard.html             ← Carga KPIs primero, luego gráficas (lazy)
    ├── genres.html
    ├── artists.html
    ├── etl.html
    └── crud.html
```

### Por qué este diseño es eficiente

**Rutas absolutas en JS — evita roturas**
```javascript
// MAL — se rompe si el archivo está en subcarpeta
import { requireAuth } from '../js/auth.js';

// BIEN — funciona desde cualquier nivel de carpeta
import { requireAuth } from '/js/auth.js';
```

**Lazy loading en dashboards — no bloquea el render**
```javascript
// MAL — espera todo antes de mostrar algo
const [kpis, genres, artists] = await Promise.all([...]);
renderAll(kpis, genres, artists);

// BIEN — muestra KPIs inmediatamente, gráficas después
const kpis = await fetchKPIs();
renderKPIs(kpis);                    // visible al instante
fetchGenreCharts().then(renderCharts); // no bloquea
```

**api.js — un solo apiFetch con manejo de errores centralizado**
```javascript
// Todos los namespaces (Tracks, Artists, etc.) pasan por aquí
// Un solo lugar para manejar 401, 403, 500
async function apiFetch(path, opts = {}) {
    const res = await fetch('/api' + path, { ... });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
```

---

## ETL — Estructura final (Bronze / Silver / Gold)

```
etl/
├── etl_Dockerfile
├── requirements.txt
│
├── bronze/                        ← CAPA BRONZE: extracción fiel sin transformar
│   ├── __init__.py
│   └── extract.py                 ← Conecta a PocketBase, pagina los registros,
│                                    guarda Parquet crudo en /app/parquet_stage/bronze/
│                                    Schema: columnas originales del CSV sin modificar
│
├── silver/                        ← CAPA SILVER: limpieza y normalización
│   ├── __init__.py
│   ├── clean.py                   ← Elimina nulos críticos, normaliza tipos,
│   │                                 deduplica por (track_id, genre), 
│   │                                 split artistas por ";"
│   ├── validate.py                ← Reglas de calidad: rangos 0-1, BPM > 0,
│   │                                 popularidad 0-100, duración > 0
│   └── to_staging.py              ← Carga STG_RAW_TRACKS en ClickHouse
│                                    Guarda Parquet limpio en parquet_stage/silver/
│
├── gold/                          ← CAPA GOLD: modelo dimensional
│   ├── __init__.py
│   ├── load_dims.py               ← Upsert en 11 tablas DIM
│   ├── load_facts.py              ← INSERT en FACT_TRACKS con FKs resueltos
│   │                                 Idempotencia: verifica ETL_BATCH_CONTROL
│   ├── generate_synthetic.py      ← +100k registros sintéticos por semana
│   │                                 seed = week_number * 42 (reproducible)
│   └── log_run.py                 ← Escribe en ETL_LOGS (duración, registros, status)
│
├── dags/
│   └── tracklytics_etl.py         ← DAG Airflow: bronze → silver → gold
│                                    Tasks separadas por capa, dependencias explícitas
│
└── utils/
    ├── clickhouse_client.py       ← Cliente CH reutilizable (mismo patrón singleton)
    └── pocketbase_client.py       ← Paginación automática de PocketBase
```

### Por qué este diseño es eficiente

**Parquet por capa — reanudar sin reejecutar todo**
```
parquet_stage/
├── bronze/week_1_raw.parquet      ← Si silver falla, no hay que re-extraer
├── silver/week_1_clean.parquet    ← Si gold falla, no hay que re-limpiar
└── (gold no tiene Parquet — va directo a ClickHouse)
```

**DAG con dependencias explícitas**
```
extract_bronze >> clean_silver >> load_gold >> generate_synthetic >> log_run
```
Si cualquier tarea falla, Airflow reintenta solo esa — no el pipeline completo.

**Idempotencia en gold**
```python
# Antes de insertar, verifica si la semana ya fue cargada
if week_already_loaded(week_number):
    logger.info(f"Semana {week_number} ya cargada, skipping")
    return
```

---

## Comparación: estructura anterior vs nueva

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| Organización API | Por tipo (routers/) | Por paquete funcional |
| Conexión CH | Nueva por request | Singleton reutilizable |
| Queries analíticas | Sin caché | Cache TTL 60s |
| SQL | Mezclado en router | Separado en queries.py |
| Auth en endpoints | Sin middleware | Depends(verify_role) |
| Imports JS | Rutas relativas (../js/) | Rutas absolutas (/js/) |
| Carga dashboards | Todo junto bloqueante | Lazy por secciones |
| ETL organización | Scripts planos | Capas bronze/silver/gold |
| ETL recuperación | Reinicio completo | Reinicio por capa |