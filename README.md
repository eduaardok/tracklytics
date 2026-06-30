# Tracklytics

[![ClickHouse](https://img.shields.io/badge/ClickHouse-24.3-FFCC01?style=for-the-badge&logo=clickhouse&logoColor=black)](https://clickhouse.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Airflow](https://img.shields.io/badge/Airflow-2.9-017CEE?style=for-the-badge&logo=apacheairflow&logoColor=white)](https://airflow.apache.org)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![PocketBase](https://img.shields.io/badge/PocketBase-Auth-B8DBE4?style=for-the-badge&logo=pocketbase&logoColor=black)](https://pocketbase.io)

![Records](https://img.shields.io/badge/Registros-900.000+-8B5CF6?style=for-the-badge)
![Tables](https://img.shields.io/badge/Tablas_ClickHouse-18-8B5CF6?style=for-the-badge)
![Services](https://img.shields.io/badge/Servicios_Docker-5-8B5CF6?style=for-the-badge)
![Progress](https://img.shields.io/badge/Avance_S9-QA%20%2B%20rendimiento%20%2B%20seek-22c55e?style=for-the-badge)

> Plataforma de analítica musical e inteligencia de negocio sobre datos de Spotify,
> construida con ClickHouse, Airflow, FastAPI y un frontend interactivo con Plotly.js.
> Incluye una app musical tipo Spotify para usuarios finales con sistema de roles.

Tracklytics procesa un dataset base de 113.550 registros reales de Spotify más datos sintéticos
semanales acumulados (913.550 registros confirmados en S8), los almacena en un modelo dimensional
columnar en ClickHouse, orquesta las cargas con Apache Airflow y los expone mediante una API REST,
dashboards analíticos interactivos, una app musical completa y una API de catálogo para partners
externos, servidos por Nginx.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Fuente de datos | PocketBase — dataset base `spotify_tracks` (113.550 registros) + `playlists` / `playlist_tracks` / `suscripciones` / `partners` |
| Staging | Parquet (vía PyArrow) |
| Base de datos | ClickHouse 24.3 (MergeTree) — catálogo (`FACT_TRACKS`) + engagement (`FACT_ENGAGEMENT_USUARIO`) + log de partners (`LOG_LLAMADAS_PARTNER`) |
| Orquestación ETL | Apache Airflow 2.9 |
| API REST | FastAPI + Uvicorn (Python 3.11) — incluye API de partners autenticada por API key |
| App musical | HTML + CSS + JavaScript (puerto 8081, único frontend del proyecto) |
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
2. **pb-init** crea las colecciones `spotify_tracks`, `playlists`, `playlist_tracks`, `suscripciones` y `partners` en PocketBase y carga los 113.550 registros desde el CSV (tarda ~5 min).
3. **init-db** crea el schema dimensional en ClickHouse (18 tablas), incluyendo `FACT_ENGAGEMENT_USUARIO` y `LOG_LLAMADAS_PARTNER`.
4. **Airflow**, **API** y **App musical** quedan disponibles. No hay un frontend separado: `app/` (puerto 8081) es la única interfaz web del proyecto.

> **Nota:** En la primera ejecución espera ~5–7 minutos a que `pb-init` termine antes de lanzar el ETL.
> Puedes monitorear con: `docker logs tracklytics_pb_init -f`

### 4. Ejecutar el ETL desde el navegador

Abre `http://localhost:8081/analytics/etl.html` (requiere rol admin), selecciona el número
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
| Analítica — Dashboard | http://localhost:8081/analytics/dashboard.html | analyst / admin (suscripción B2B activa) |
| Analítica — Géneros | http://localhost:8081/analytics/genres.html | analyst / admin |
| Analítica — Artistas | http://localhost:8081/analytics/artists.html | analyst / admin |
| Analítica — Comparar Artistas | http://localhost:8081/analytics/compare-artists.html | analyst / admin |
| Analítica — Benchmark de Género | http://localhost:8081/analytics/benchmark.html | analyst / admin |
| Analítica — Tendencias | http://localhost:8081/analytics/trends.html | analyst / admin |
| Analítica — Mercado vs. Tracklytics | http://localhost:8081/analytics/mercado-vs-tracklytics.html | analyst / admin |
| Analítica — Reporte Diario | http://localhost:8081/analytics/reporte-diario.html | admin únicamente |
| Gestión de Datos — ETL | http://localhost:8081/analytics/etl.html | admin únicamente |
| Gestión de Datos — CRUD | http://localhost:8081/analytics/crud.html | admin únicamente |
| Gestión de Datos — Calidad de Datos | http://localhost:8081/analytics/data-quality.html | admin únicamente |
| Partners — Consola de pruebas | http://localhost:8081/partners/console.html | admin únicamente (API key, no sesión) |
| Partners — Landing de demo | http://localhost:8081/partners/landing.html | pública, sin login |
| API REST + Swagger | http://localhost:8000/docs | - |
| Airflow UI | http://localhost:8080 | admin |
| PocketBase Admin | http://localhost:8090/_/ | admin |

Credenciales Airflow: `admin` / valor de `AIRFLOW_PASSWORD` en `.env` (por defecto `tracklytics2026`)

> **Nota:** hasta S7 existió un segundo frontend legado en el puerto 80 (`frontend/`,
> sin autenticación). Se eliminó en S8 por generar confusión real durante pruebas
> manuales — `app/` (8081) es ahora la única interfaz web del proyecto.

---

## Sistema de roles

| Rol | App musical / Biblioteca | Analítica | ETL + CRUD + Calidad de Datos |
|-----|-------------|-----------|-------------------------------|
| `user` (B2C) | ✅ Acceso completo | ❌ Bloqueado | ❌ Bloqueado |
| `analyst` (B2B) | ❌ Biblioteca personal bloqueada (RN-CAT-004) | ✅ Requiere suscripción B2B activa | ❌ Bloqueado |
| `admin` (staff) | ✅ Acceso completo | ✅ Exento de suscripción | ✅ Acceso completo |

El rol `admin` solo se asigna desde PocketBase Admin (`http://localhost:8090/_/`).
Los roles `user` y `analyst` se seleccionan durante el registro en la app.

La API de **partners** (`/partners/v1/*`) usa un esquema de autenticación completamente
distinto: no hay sesión de PocketBase ni rol — cada solicitud se autentica con una
API key por header (`X-API-Key`), resuelta contra la colección `partners`.

---

## Funcionalidades por módulo

### App musical (todos los roles)
- Catálogo navegable con búsqueda en tiempo real (debounce 400ms) y filtro por los 114 géneros
- Páginas de detalle de track con 7 atributos de audio (danceability, energy, valence, acousticness, speechiness, instrumentalness, liveness)
- Perfil de artista con estadísticas agregadas desde ClickHouse
- Detalle de álbum con tracklist — cada canción muestra su género, permitiendo identificar la misma canción en múltiples géneros (relación N:M resuelta via `fact_id`)
- Reproductor persistente entre páginas: estado completo en `localStorage` (`tl_player`), rehidratación automática al navegar, sincronización entre pestañas; barra de progreso navegable (clic + arrastre con Pointer Events API) con knob visual
- Cola de reproducción: botón ⊕ en cada canción, panel de cola, prev/next con regla de 3 s (reiniciar vs. ir atrás)
- Secciones "Continuar escuchando" (últimas 6 reproducidas) y "Para ti" (géneros de favoritos) en home
- Cover art por gradiente en artistas, álbumes, géneros y playlists; heroes con gradiente en páginas de detalle
- Empty states ilustrados (ícono + texto + CTA) y skeletons animados de carga en toda la app
- Stat cards de actividad (♥ favoritos / 🕐 escuchadas / 🎵 playlists) en Biblioteca y Perfil
- Favoritos con botón ♥ — persistidos en ClickHouse (`FACT_ENGAGEMENT_USUARIO`) vía `POST /biblioteca/favoritos`
- Historial de reproducción con tiempo relativo — persistido en ClickHouse vía `POST /biblioteca/historial`
- Playlists: crear, añadir/quitar tracks, eliminar — almacenadas en PocketBase (`playlists` / `playlist_tracks`)
- Gestión de suscripción: planes free/premium (B2C) o básico/pro/enterprise (B2B), confirmar y cancelar, consulta del plan activo — `app/autenticacion/planes.html`, vía `api/paquetes/suscripciones/`

### Analítica (analyst / admin, requiere suscripción B2B activa)
- **Dashboard ejecutivo** — 6 KPIs globales, bubble chart géneros, radar del top género, top 10 géneros y artistas por Plotly.js con caché TTL 60s
- **Géneros** — tabla de 114 géneros con métricas, radar de audio por género, scatter popularidad vs energía
- **Artistas** — búsqueda, perfil con benchmark vs promedio del género
- **Comparar Artistas A vs B** — radar doble de 7 ejes de audio, tabla comparativa con ganador resaltado por métrica
- **Benchmark de Género** — un artista contra el promedio de su género predominante, sin exclusión de outliers
- **Tendencias Temporales** — serie temporal semana a semana (DIM_DATE × FACT_TRACKS), eje Y dual (popularidad 0-100 / energía y danceability 0-1), selector de métricas
- **Mercado vs. Tracklytics** — `engagement_score` (0-100, calculado on-the-fly desde `FACT_ENGAGEMENT_USUARIO`) contra popularidad, con mensaje explícito cuando no hay interacciones suficientes
- **Reporte Diario** (admin únicamente) — ingestas y actividad de engagement del día corriente; exportación a PDF vía `window.print()` con layout limpio (`@media print`)
- Bloqueo de acceso sin suscripción activa: toast + redirect a Planes (sin duplicarse, deduplicado por página)

### Gestión de datos (admin únicamente)
- **Panel ETL** — disparo del DAG de Airflow vía `POST /app/v1/ingesta/ejecuciones`, idempotencia por período (rechaza recargas duplicadas sin `forzar_recarga`), guard de concurrencia con `asyncio.Lock`, polling en tiempo real por etapa, historial con tasa de rechazo y bandera "requiere revisión" (>1%)
- **CRUD dimensional** — gestión completa de las 11 tablas DIM, FACT_TRACKS en modo solo lectura (sin ningún endpoint de escritura), confirmación explícita antes de eliminar una dimensión referenciada
- **Calidad de Datos** — proporción reales vs sintéticos con gráfico de dona, tasa de rechazo ETL, detalle de la última carga

### Partners — API de catálogo para integradores externos (CU-O12)
- API de solo lectura (`/partners/v1/*`) autenticada por API key (header `X-API-Key`, nunca query string), segmentada por tier (básico/pro/enterprise) — campos de audio progresivamente más completos por tier, exportación masiva exclusiva de enterprise
- Cada llamada (exitosa o rechazada) se registra en `LOG_LLAMADAS_PARTNER` (ClickHouse) con partner, endpoint, tier, resultado y duración
- **Consola de pruebas** (`app/partners/console.html`, admin) — probar cualquier endpoint pegando una API key, sin curl
- **Landing de demo** (`app/partners/landing.html`, pública) — explica tiers y autenticación a un partner externo, con prueba en vivo embebida; marcada explícitamente como demo previa a producción

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
│   │   ├── catalogo/            # Endpoints app musical (tracks, artistas, álbumes, géneros)
│   │   ├── biblioteca/          # Endpoints engagement (favoritos, historial, playlists)
│   │   ├── suscripciones/       # Endpoints planes, confirmar, activa, cancelar
│   │   ├── analitica/           # Endpoints dashboards (cache TTL 60s) + deps.py (gating B2B)
│   │   ├── gestion_datos/       # ETL, CRUD dimensiones, calidad de datos (capability `ingesta`)
│   │   └── partners/            # API key auth, tiers, queries.py, router.py, logging_mw.py
│   ├── api_Dockerfile
│   └── requirements.txt
├── app/                         # App musical tipo Spotify — único frontend del proyecto (puerto 8081)
│   ├── autenticacion/           # login.html, register.html, profile.html, planes.html
│   ├── catalogo/                # home.html, search.html, catalog.html, artist.html...
│   ├── biblioteca/              # library.html (favoritos, historial, playlists)
│   ├── analytics/               # dashboard.html, genres.html, artists.html, trends.html,
│   │                            # compare-artists.html, benchmark.html,
│   │                            # mercado-vs-tracklytics.html, reporte-diario.html,
│   │                            # etl.html, crud.html, data-quality.html
│   ├── partners/                # console.html (consola admin), landing.html (demo pública)
│   ├── js/                      # auth.js, api.js, components.js, toast.js,
│   │                            # favorites.js, history.js, playlists.js
│   ├── css/                     # main.css, analytics.css
│   ├── img/                     # logo.png
│   ├── Dockerfile
│   └── nginx.conf
├── dataset/
│   └── spotify.csv              # Dataset fuente (113.550 registros)
├── docs/
│   ├── BITACORA_S6.md, BITACORA_S7.md, BITACORA_S8.md, BITACORA_S9.md  # Bitácoras semanales
│   ├── ARQUITECTURA.MD          # Estructura por paquetes propuesta (histórico, ver nota en el archivo)
│   └── PENDIENTES.md            # Pendientes vigentes, deuda técnica y mejoras futuras
├── etl/
│   ├── bronze/                  # Extracción cruda desde PocketBase → Parquet
│   ├── silver/                  # Limpieza, validación y normalización
│   ├── gold/                    # Carga dimensional en ClickHouse + sintéticos
│   ├── utils/                   # clickhouse_client.py, pocketbase_client.py
│   ├── dags/
│   │   ├── tracklytics_etl.py          # DAG principal: bronze→silver→gold→synthetic→log
│   │   │                                # (+ task_log_failure, ONE_FAILED, desde S8)
│   │   └── engagement_referencia.py    # DAG engagement: eventos sintéticos correlacionados con popularity
│   └── etl_Dockerfile
├── openspec/                    # Spec Driven Development — constitución, specs y archivo de changes
│   ├── config.yaml              # Constitución del proyecto (stack, reglas RT-01..RT-06, modelos de datos)
│   ├── specs/                   # Specs principales vigentes: catalogo, suscripciones, analitica, ingesta, partners
│   └── changes/archive/         # Changes ya implementados y archivados (histórico, con design.md/tasks.md)
├── docker-compose.yml
└── .env                         # Variables de entorno (no versionado)
```

---

## Modelo de datos

18 tablas en ClickHouse organizadas en esquema estrella:

```
PocketBase ──► Bronze (Parquet crudo)
                   │
                   ▼
            Silver (STG_RAW_TRACKS — limpieza y validación)
                   │
                   ▼
         ┌─────────────────────────┐
         │       FACT_TRACKS       │
         │  (~313k–1.6M filas)     │
         │  MergeTree              │
         │  ORDER BY (genre_id,    │
         │            artist_id)   │
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

FACT_ENGAGEMENT_USUARIO  (favoritos, historial y reproducción por usuario)
   engagement_id   UUID
   user_id         String    — id de PocketBase
   fact_id         UInt64    — FK a FACT_TRACKS
   event_type      Enum8     — 'favorito_add' | 'favorito_remove' | 'reproduccion'
   event_timestamp DateTime
   is_synthetic    UInt8     — 1 = generado por engagement_referencia DAG
   source          String    — 'app' | 'referencia'
   MergeTree ORDER BY (user_id, event_timestamp)

LOG_LLAMADAS_PARTNER  (log operativo de la API de partners, distinto de FACT_INTEGRACION_PARTNER)
   log_id        UUID
   partner_id    String
   api_key_used  String
   endpoint      String
   tier_usado    String
   resultado     Enum8  — 'success' | 'auth_rejected' | 'tier_rejected' | 'error'
   registros     UInt32
   duracion_ms   Float32
   MergeTree ORDER BY (partner_id, timestamp)

ETL_LOGS           (historial de ejecuciones)
ETL_BATCH_CONTROL  (control de idempotencia)
```

**PocketBase — colecciones:**

| Colección | Campos | Uso |
|---|---|---|
| `spotify_tracks` | *(existente)* | Dataset base de catálogo |
| `playlists` | `id`, `user` (→ users), `name`, `created` | Playlists de usuario |
| `playlist_tracks` | `id`, `playlist` (→ playlists), `fact_id`, `position`, `created` | Canciones en playlists |
| `suscripciones` | `id`, `usuario_o_cliente` (→ users), `tipo_plan`, `monto`, `moneda`, `estado`, `created` | Suscripción activa/cancelada de Usuario B2C o Cliente B2B |
| `partners` | `id`, `nombre`, `api_key`, `tier`, `estado`, `fecha_expiracion`, `created` | Directorio de partners/API keys — admin-only, sustrato mínimo hasta que exista CU-T03 |

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

El DAG principal (`tracklytics_etl`) ejecuta las tasks en secuencia:
```
task_bronze → task_silver → task_gold → task_synthetic → task_log
```

El DAG secundario (`engagement_referencia`) genera eventos de engagement sintéticos correlacionados
con la popularidad de las canciones: cuanta más popularidad tiene un track, más eventos de
`reproduccion` y `favorito_add` se insertan en `FACT_ENGAGEMENT_USUARIO`. Se ejecuta independientemente
del ETL principal y sirve para poblar datos de demostración coherentes.

| Semanas | Registros totales | Tiempo aprox. |
|---------|-------------------|---------------|
| 1       | 113.550           | ~35 s         |
| 2       | 213.550           | ~1.2 min      |
| 4       | 413.550           | ~1.5 min      |
| 6       | ~613.550          | ~1.8 min      |
| 16      | 1.613.550         | ~5 min        |

Los datos sintéticos se generan deterministamente (seed = semana × 42).

---

## Metodología de desarrollo

Desde la semana 7 (S7), las nuevas capabilities del módulo operativo de Tracklytics se especifican
con **Spec Driven Development** usando [OpenSpec](https://github.com/Fission-AI/OpenSpec) antes de
escribir código.

**Flujo de trabajo:**

1. **Constitución del proyecto** (`openspec/config.yaml`) — stack obligatorio, reglas del docente
   (RT-01 a RT-06), modelo de datos técnico y de negocio, estándares de calidad ISO 25010.
2. **Propuesta de capability** (`/opsx:propose`) — qué cambia y por qué, en `proposal.md`.
3. **Especificación formal** (`specs/<capability>/spec.md`) — requisitos, escenarios WHEN/THEN,
   criterios de aceptación y tabla de trazabilidad de 5 niveles (empresarial → departamento →
   paquete → caso de uso → historia de usuario).
4. **Diseño técnico** (`design.md`) — en qué base de datos vive cada entidad (PocketBase vs
   ClickHouse) y por qué, con alternativas descartadas.
5. **Implementación** (`/opsx:apply`) — desarrollo guiado por un checklist verificable (`tasks.md`).
6. **Archivado** (`/opsx:archive`) — la capability implementada se mueve de `openspec/changes/` a
   `openspec/changes/archive/YYYY-MM-DD-<capability>/`, y su spec principal queda sincronizada en
   `openspec/specs/<capability>/spec.md`.

**Las 5 capabilities del módulo operativo** — mapeadas a los 16 casos de uso operativos
(CU-O01–CU-O16) de la especificación de negocio — quedaron **implementadas, verificadas
end-to-end y archivadas al cierre de S8**:

| Capability | Casos de uso | Estado |
|---|---|---|
| `catalogo` | CU-O01–CU-O05 | Implementada (reconciliada con el código real existente) — S7 |
| `suscripciones` | CU-O06 | Implementada desde cero — S7 |
| `analitica` | CU-O07–CU-O11, CU-O16 | Implementada y archivada — S8 |
| `ingesta` | CU-O13–CU-O15 | Implementada y archivada — S8 |
| `partners` | CU-O12 | Implementada y archivada — S8 |

---

## Historial de sprints

| Sprint | Foco principal | Entregables clave |
|--------|---------------|-------------------|
| S1 | Infraestructura base | Docker Compose, PocketBase, ClickHouse schema, ETL Bronze/Silver/Gold |
| S2 | API + Dashboard analítico | FastAPI, endpoints catálogo/analítica, Dashboard ejecutivo con Plotly.js |
| S3 | App musical base | Login/registro, catálogo navegable, búsqueda, página track/artista/álbum |
| S4 | Roles y analítica avanzada | Comparar artistas (CU-23), tendencias temporales (CU-24), calidad de datos (CU-25) |
| S5 | Engagement de usuario | `fact_id` routing, favoritos ♥ persistidos en ClickHouse, historial, género visible en tracklist |
| S6 | UX completa + reproductor | Ver detalle abajo |
| S7 | Spec Driven Development (OpenSpec) | Ver detalle abajo |
| S8 | Implementación de `analitica`/`ingesta`/`partners` + correcciones UX | Ver detalle abajo |

### S6 — detalle

**Backend:**
- `FACT_ENGAGEMENT_USUARIO` — nueva tabla MergeTree en ClickHouse para favoritos, historial y reproducción, con `ORDER BY (user_id, event_timestamp)`
- PocketBase: colecciones `playlists` y `playlist_tracks` para playlists de usuario
- 5 nuevos endpoints FastAPI en `api/paquetes/biblioteca/`: `GET/POST /favoritos`, `GET/POST /historial`, `GET/DELETE /playlists`
- DAG `engagement_referencia` — genera eventos sintéticos correlacionados con popularidad de canciones

**Frontend (Bloques A–F):**
- Reproductor persistente: estado completo en `localStorage` (`tl_player`), rehidratación al navegar
- Cola de reproducción: botón ⊕ en cada canción, panel de cola above player bar, prev/next con regla de 3 s
- Cover art por gradiente (degradado CSS de dos colores del paleta de géneros) en toda la app
- Heroes con gradiente en páginas de detalle (artista, álbum, track, género)
- Secciones "Continuar escuchando" y "Para ti" en home, alimentadas por historial y favoritos
- Stat cards de actividad (♥ / 🕐 / 🎵) en Biblioteca y Perfil
- Empty states ilustrados y skeletons animados de carga en todos los listados
- Login rediseñado como split-screen con panel hero (features) + formulario

### S7 — detalle

**Especificación (OpenSpec):**
- Constitución técnica del proyecto formalizada en `openspec/config.yaml`: stack obligatorio, reglas del docente (RT-01 a RT-06), modelo de datos técnico y de negocio, estándares ISO 25010
- 5 capabilities del módulo operativo especificadas con trazabilidad de 5 niveles (empresarial → departamento → paquete → CU-O → historia de usuario): `catalogo`, `suscripciones`, `analitica`, `partners`, `ingesta`

**Conciliación e implementación — `catalogo`:**
- Detectado y documentado en `design.md`: favoritos e historial se escriben de forma síncrona y directa desde FastAPI a ClickHouse (`FACT_ENGAGEMENT_USUARIO`), no vía PocketBase como asumía el diseño original — registrado como excepción consciente al patrón batch del catálogo (sigue cumpliendo RT-01: el movimiento de datos ocurre desde Python)
- Gating B2B/analyst en los 5 endpoints de `/app/v1/biblioteca` vía la dependencia `require_b2c_user` (`api/core/deps.py`)
- Paginación real (`limit`/`offset` + `total`) en `GET /app/v1/tracks/search`, reemplazando el límite fijo anterior
- Filtro de género agregado a la UI de búsqueda (`app/catalogo/search.html`)
- Rename de playlist (PocketBase + UI en `app/biblioteca/library.html`)

**Implementación desde cero — `suscripciones`:**
- Colección PocketBase `suscripciones` (`usuario_o_cliente`, `tipo_plan`, `monto`, `moneda`, `estado`, `created`)
- 5 endpoints FastAPI en `api/paquetes/suscripciones/`: `GET /planes`, `POST /` (confirmar), `GET /activa`, `POST /{id}/cancelar`
- Dependencia `require_active_subscription` reutilizable, consumida (sin redefinirse) por la capability `analitica`
- Vista de planes y "mi plan" en el frontend (`app/autenticacion/planes.html`)

**Verificación:**
- `catalogo` y `suscripciones` verificadas end-to-end con requests reales contra los endpoints en ejecución (no solo revisión de código), incluyendo casos de error y aislamiento entre usuarios

**Pendiente de implementación al cierre de S7:**
- `analitica`, `partners` e `ingesta` quedan especificadas y aprobadas en OpenSpec — implementadas en S8 (ver detalle abajo)

### S8 — detalle

**Cierre del ciclo OpenSpec — implementación de las 3 capabilities pendientes:**
- `analitica` (CU-O07–CU-O11, CU-O16): dashboard ejecutivo, perfil de audio por género, comparación y benchmark de artistas, tendencias temporales, `engagement_score` e índice "Mercado vs. Tracklytics", reporte diario (staff). Gating B2B reutiliza `suscripciones` sin redefinir lógica.
- `ingesta` (CU-O13–CU-O15): `POST/GET /app/v1/ingesta/ejecuciones` dispara y monitorea el DAG vía Airflow (nunca síncrono), idempotencia contra `ETL_BATCH_CONTROL`, guard de concurrencia con `asyncio.Lock` (corrigió una condición de carrera real encontrada en verificación), historial con tasa de rechazo, `task_log_failure` nueva en la DAG para auditar también el camino de fallo.
- `partners` (CU-O12): API de catálogo autenticada por API key, segmentada por tier, con log de llamadas en `LOG_LLAMADAS_PARTNER`. Requirió crear manualmente la colección PocketBase `partners` (CU-T03 no existe aún).
- Las 5 capabilities del módulo operativo quedaron archivadas en `openspec/changes/archive/` con sus specs sincronizadas en `openspec/specs/`.

**Hallazgo y corrección — frontend duplicado:**
- Se encontró que `frontend/` (puerto 80) era un segundo frontend legado sin autenticación, coexistiendo con `app/` (puerto 8081, el real) desde hacía varios sprints — causaba errores 401 confusos al probar ETL/CRUD porque ese frontend nunca enviaba token. Se eliminó por completo; `app/` es ahora la única interfaz web.

**Correcciones de UX encontradas en pruebas manuales:**
- Sidebar: el nombre de usuario se cortaba detrás del botón de logout (CSS sin `min-width:0`/ellipsis) — corregido.
- Nuevo sistema de toast (`app/js/toast.js`) conectado a `apiFetch`: los 403 de biblioteca ahora muestran feedback visible, no solo en consola.
- `planes.html`: corregido bug donde cancelar la suscripción mostraba "Plan activo: undefined / Invalid Date" (mal manejo de `{data: null}`); agregado estado "Ya tienes este plan"; descripciones de planes ya no se truncan.
- Páginas de analítica: el bloqueo por falta de suscripción redirigía sin mostrar mensaje, y dos cargas en paralelo (p. ej. dashboard) disparaban el toast dos veces — corregido con un guard de deduplicación por página.
- `ETL`/`CRUD` no estaban marcados como exclusivos de `admin` en el menú lateral, aunque el backend ya los bloqueaba para `analyst` — corregido.

**Nuevo — UI de partners:**
- Consola de pruebas interna (`app/partners/console.html`, admin) y landing de demo pública (`app/partners/landing.html`), documentadas en `openspec/specs/partners/spec.md` como herramientas de verificación/demo distintas de la documentación interactiva formal (que sigue fuera de alcance).

**Pendiente:** reproducción de audio real (explorado, sin implementar — ver `docs/PENDIENTES.md`).

---

## Decisiones técnicas clave

- **threading.local para ClickHouse** — cada thread de Uvicorn tiene su propio cliente para evitar errores de consultas concurrentes.
- **Cache TTL 60s** — los endpoints analíticos pesados (dashboard ejecutivo, trends de géneros, tendencias semanales) usan caché en memoria para evitar re-ejecutar JOINs sobre 500k+ registros en cada request.
- **Rutas absolutas en JS** — todos los imports usan `/js/auth.js` en lugar de `../js/auth.js` para que funcionen desde cualquier subcarpeta del frontend.
- **Idempotencia ETL** — `ETL_BATCH_CONTROL` verifica si una semana ya fue cargada antes de insertar, evitando duplicados en recargas.
- **fact_id para navegación** — la navegación al detalle de una canción usa `fact_id` (PK único de FACT_TRACKS) en vez de `track_id` (no único) para resolver correctamente la relación N:M entre tracks y géneros.
- **Tema oscuro violeta, CSS propio sin framework** — identidad visual con `#8B5CF6` como color primario, sidebar colapsable con íconos Lucide SVG inline, tipografía Plus Jakarta Sans + Inter. `app/` usa `main.css`/`analytics.css` propios (no Bootstrap) — el `frontend/` legado (eliminado en S8) sí dependía de Bootstrap, `app/` nunca lo necesitó.
- **Estado del reproductor en localStorage** — `tl_player` persiste `{ track, isPlaying, startedAt, elapsedMs, volume, queue, queueHistory }` entre páginas; `playTrack()` guarda `startedAt: Date.now()`; la rehidratación recalcula el elapsed sin `setInterval` acumulado.
- **Un solo frontend (`app/`, puerto 8081)** — hasta S7 coexistía con un segundo frontend legado sin autenticación en el puerto 80; se eliminó en S8 tras causar confusión real en pruebas (errores 401 que en realidad eran "estás en el frontend equivocado").
- **Toast desacoplado de `api.js`/`components.js`** (`app/js/toast.js`) — módulo sin dependencias propias para evitar un ciclo de imports (`components.js → favorites.js → api.js → components.js`); ambos lo importan sin acoplarse entre sí.
- **Gating por capability, no centralizado** — cada paquete (`analitica`, `gestion_datos`, `partners`) define su propia dependencia de autorización en su propio `deps.py`, reutilizando solo `get_current_user` (sí central, en `core/deps.py`).