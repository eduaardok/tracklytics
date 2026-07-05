# Tracklytics

[![ClickHouse](https://img.shields.io/badge/ClickHouse-24.3-FFCC01?style=for-the-badge&logo=clickhouse&logoColor=black)](https://clickhouse.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Airflow](https://img.shields.io/badge/Airflow-2.9-017CEE?style=for-the-badge&logo=apacheairflow&logoColor=white)](https://airflow.apache.org)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![PocketBase](https://img.shields.io/badge/PocketBase-Auth-B8DBE4?style=for-the-badge&logo=pocketbase&logoColor=black)](https://pocketbase.io)

![Records](https://img.shields.io/badge/Registros-900.000+-8B5CF6?style=for-the-badge)
![Tables](https://img.shields.io/badge/Tablas_ClickHouse-52-8B5CF6?style=for-the-badge)
![Capabilities](https://img.shields.io/badge/Capabilities_OpenSpec-11-8B5CF6?style=for-the-badge)
![Progress](https://img.shields.io/badge/Avance-refactor%20completo%20%2B%20migración%20React-22c55e?style=for-the-badge)

> Plataforma de analítica musical e inteligencia de negocio sobre datos de Spotify,
> construida con ClickHouse, Airflow, FastAPI y un frontend React + TypeScript.
> Incluye una app musical tipo Spotify completa (catálogo, biblioteca, reproducción real,
> suscripciones, pagos, creadores, social, distribución) con sistema de roles y 11
> capabilities especificadas con Spec Driven Development (OpenSpec).

Tracklytics procesa un dataset base de 113.550 registros reales de Spotify más datos
sintéticos semanales acumulados (913.551 registros confirmados hoy en `FACT_TRACKS`, tras
corregir un incidente de duplicación — ver `docs/decisiones-refactorizacion.md` §20), los
almacena en un modelo dimensional columnar en ClickHouse (52 tablas físicas), orquesta las
cargas con Apache Airflow (3 DAGs independientes: catálogo, playlists y modelo de negocio) y los
expone mediante una API REST (FastAPI), un frontend React containerizado con dashboards
analíticos interactivos (Recharts), reproducción de audio real (YouTube) con fallback simulado y
watchdog anti-silencio, portadas reales (iTunes + Deezer, con cache persistente) y una API de
catálogo para partners externos.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Fuente de datos | PocketBase — dataset base `spotify_tracks` (113.550 registros) + 5 colecciones más: `users`, `playlists`, `playlist_tracks`, `suscripciones`, `partners` |
| Staging | Parquet (vía PyArrow) |
| Base de datos | ClickHouse 24.3 (MergeTree) — 52 tablas físicas en esquema estrella (verificado con `system.tables`), incluyendo capabilities transaccionales (`seguridad`, `facturacion`) implementadas en columnar por decisión pedagógica deliberada del docente |
| Orquestación ETL | Apache Airflow 2.9 — DAG principal (`tracklytics_etl`) + 2 DAGs independientes (`playlists_sync`, `modelo_negocio_sync`) |
| API REST | FastAPI + Uvicorn (Python 3.11) — 11 paquetes (uno por capability), incluye API de partners autenticada por API key |
| Frontend | React 18 + TypeScript + Vite — reemplaza por completo al frontend vanilla para el camino de usuario real (`frontend/`), containerizado (servicio `frontend-react`, build multi-stage Vite+Nginx) |
| Visualización | Recharts (dashboards de `analitica`, componentes nativos de React sobre los tokens de diseño) |
| Audio real | YouTube IFrame Player API (búsqueda por texto desde el cliente, sin API key) con reproducción simulada (Web Audio API nativa) como fallback cuando no hay resultado, conexión, o cuando YouTube se queda en silencio sin disparar error (watchdog de 4.5s tras `onReady`) |
| Portadas reales | iTunes Search API + Deezer Search API (orden de intento distinto por entidad, sin API key en ninguna) — cache persistente en disco (`etl/gold/portadas_cache.json`) sobrevive a `docker compose down -v`; reemplazo visual local si ninguna fuente resuelve |
| Sistema de diseño | Tokens propios en oklch (`frontend/src/index.css`), definidos una vez y aplicados incrementalmente por capability — ver `PRODUCT.md` |
| Servidor web | Nginx (reverse proxy en ambos frontends: `frontend-react` vigente y `app/` legado) |
| Auth | PocketBase JWT (roles: `user` / `analyst` / `admin`) |
| Contenedores | Docker + Docker Compose (7 servicios: PocketBase, ClickHouse, Airflow, API, frontend React, frontend legado, más los jobs de init) |

> **Nota — frontend legado (`app/`) todavía en el repo:** el frontend vanilla HTML/CSS/JS que
> sirve `docker-compose.yml` en el puerto 8081 es el que existía antes de esta refactorización.
> Toda la funcionalidad de usuario real (catálogo, biblioteca, reproducción, suscripciones,
> facturación, creadores, social, distribución, analítica, seguridad, ingesta, partners) ya está
> migrada a `frontend/` (React), que es el frontend vigente y **ya tiene su propio servicio en
> `docker-compose.yml`** (`frontend-react`, puerto 8082). `app/` sigue existiendo y sigue siendo
> levantado por Docker Compose para no romper nada que dependa de él, aunque ya no es el camino
> de usuario real; retirarlo definitivamente queda como pendiente de limpieza, no bloqueante.

---

## Requisitos previos

- **Docker Desktop** (incluye Docker Compose) — para todo el stack (API, ClickHouse, Airflow, PocketBase, frontend React, frontend legado); `docker compose up -d` es suficiente para levantarlo todo
- **Node.js 18+** — opcional, solo si prefieres correr el frontend React en modo desarrollo (`npm run dev`, hot reload) en vez del servicio containerizado
- Python 3.11+ — solo para scripts de inicialización/migración sueltos (`init_clickhouse.py`, `pb_init.py`, `scripts/`)

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

### 3. Levantar todo el stack (API, ClickHouse, Airflow, PocketBase, frontend React, frontend legado)

```bash
docker compose up -d
```

Docker Compose levanta automáticamente todos los servicios en el orden correcto:

1. **PocketBase** y **ClickHouse** arrancan primero.
2. **pb-init** crea las colecciones necesarias en PocketBase y carga los 113.550 registros
   desde el CSV (tarda ~5 min).
3. **init-db** crea el schema dimensional en ClickHouse (52 tablas).
4. **Airflow**, **API**, el **frontend React** (`frontend-react`, puerto 8082, el vigente) y el
   **frontend legado** (`app/`, puerto 8081) quedan disponibles.

> **Nota:** en la primera ejecución espera ~5–7 minutos a que `pb-init` termine antes de lanzar
> el ETL. Puedes monitorear con: `docker logs tracklytics_pb_init -f`

### 4. (Opcional) Frontend React en modo desarrollo

El paso 3 ya deja el frontend vigente corriendo en `http://localhost:8082` (build de producción
servido por Nginx). Para desarrollo con hot reload:

```bash
cd frontend
npm install
npm run dev
```

Por defecto queda disponible en `http://localhost:5173` (Vite proxea `/app/v1/*` y las rutas
root-mounted del backend hacia `http://localhost:8000`, ver `frontend/vite.config.ts`). Para un
build de producción local: `npm run build && npm run preview`.

### 5. Ejecutar el ETL

Desde el frontend React: `/seguridad/ingesta` (requiere rol `admin`) — dispara el DAG y
monitorea el estado en tiempo real, mismo flujo que el frontend legado.

### Reset completo

Si necesitas partir de cero (borrar todos los datos):

```bash
docker compose down -v
docker compose up -d
```

Los volúmenes se recrean solos. No es necesario ningún paso manual adicional.

---

## URLs de acceso

### Frontend React (vigente — http://localhost:8082, o `npm run dev` en :5173 para desarrollo)

| Ruta | Acceso |
|---|---|
| `/` — Catálogo | Pública |
| `/catalogo/track/:factId`, `/catalogo/artista/:artistaId`, `/catalogo/album/:albumId` | Pública |
| `/biblioteca` — Favoritos, playlists, historial | Requiere sesión |
| `/perfil` — Datos de cuenta (solo lectura) | Requiere sesión |
| `/suscripciones` — Planes y plan activo | Requiere sesión |
| `/facturacion` — Métodos de pago e invoices | Requiere sesión |
| `/creadores` — Cuenta de artista y subida de tracks | Requiere sesión |
| `/social`, `/social/artista/:id`, `/social/track/:id` | Requiere sesión |
| `/distribucion/disponibilidad` — Consulta de restricción geográfica (licencias/mercado) | Requiere sesión |
| `/soporte` — Tickets de soporte | Requiere sesión |
| `/analitica/*` — Dashboard, engagement, géneros, comparación, benchmark, tendencias, playlists top, adquisición de usuarios, disponibilidad de infraestructura | `analyst`/`admin` con suscripción B2B activa |
| `/analitica/reporte-diario` | `admin` únicamente |
| `/seguridad/*` — Permisos, auditoría, errores, moderación (social/creadores/distribucion/facturacion), soporte, plan familiar, partners (consola), ingesta (ETL/CRUD/calidad de datos) | `admin` únicamente |
| `/login`, `/register` | Pública |

> `/analitica/disponibilidad` (uptime de infraestructura) y `/distribucion/disponibilidad`
> (restricción geográfica de reproducción) son vistas distintas con nombres parecidos —
> conceptos de negocio no relacionados, ver `docs/decisiones-refactorizacion.md`.

### Backend y servicios

| Servicio | URL | Acceso |
|---|---|---|
| API REST + Swagger | http://localhost:8000/docs | - |
| Frontend React (vigente, containerizado) | http://localhost:8082 | Según ruta, ver arriba |
| Frontend legado (histórico, no el vigente) | http://localhost:8081 | Todos los roles |
| Airflow UI | http://localhost:8080 | admin |
| PocketBase Admin | http://localhost:8090/_/ | admin |

Credenciales Airflow: `admin` / valor de `AIRFLOW_PASSWORD` en `.env` (por defecto `tracklytics2026`)

---

## Sistema de roles

| Rol | Catálogo / Biblioteca | Analítica | Admin (seguridad, ingesta, moderación) |
|-----|-------------|-----------|-------------------------------|
| `user` (B2C) | ✅ Acceso completo | ❌ Bloqueado | ❌ Bloqueado |
| `analyst` (B2B) | ❌ Biblioteca personal bloqueada | ✅ Requiere suscripción B2B activa | ❌ Bloqueado |
| `admin` (staff) | ✅ Acceso completo | ✅ Exento de suscripción | ✅ Acceso completo |

El rol `admin` solo se asigna desde PocketBase Admin (`http://localhost:8090/_/`).
Los roles `user` y `analyst` se seleccionan durante el registro.

La API de **partners** (`/partners/v1/*`) usa un esquema de autenticación completamente
distinto: no hay sesión de PocketBase ni rol — cada solicitud se autentica con una
API key por header (`X-API-Key`), resuelta contra la colección `partners`, segmentada por tier
(básico/pro/enterprise).

---

## Capabilities (11, todas especificadas con OpenSpec y archivadas)

| Capability | Casos de uso | Tablas ClickHouse nuevas |
|---|---|---|
| `catalogo` | Navegación, búsqueda, detalle de track/artista/álbum, favoritos, playlists, historial | *(existente)* |
| `suscripciones` | Planes B2C/B2B, confirmar, consultar activa, cancelar | *(existente)* |
| `analitica` | Dashboards ejecutivos, perfil de audio por género, comparación/benchmark de artistas, tendencias, reporte diario | *(existente)* |
| `partners` | API de catálogo para integradores externos, autenticada por API key | *(existente)* |
| `ingesta` (paquete `gestion_datos`) | Disparo/monitoreo de ETL, CRUD dimensional, calidad de datos | *(existente)* |
| `seguridad` | Usuarios, sesiones, permisos granulares, auditoría, errores de sistema | 6 |
| `facturacion` | Métodos de pago, transacciones (simuladas), invoices | 3 |
| `creadores` | Cuenta de artista, subida de tracks con staging y revisión admin | 4 |
| `social` | Seguir artistas, comentarios, compartir | 4 |
| `distribucion` | Sellos discográficos, licencias, restricción geográfica de reproducción | 7 |
| `experiencia` | Telemetría de reproducción, recomendaciones, tickets de soporte, A/B testing, reflejo de playlists, plan familiar, portadas y audio real | 6 |

Las 5 primeras forman el "módulo operativo" original (S7-S8); las 6 últimas son la
refactorización hacia sistema completo (detalle de cada decisión en
`docs/decisiones-refactorizacion.md`). `seguridad` y `facturacion` viven en ClickHouse a pesar
de ser dominios transaccionales por naturaleza — decisión pedagógica deliberada del docente, no
un error de arquitectura, para que el equipo documente las fricciones reales de una base
columnar fuera de su caso de uso ideal.

---

## Funcionalidades por módulo

### Catálogo y biblioteca (todos los roles, biblioteca requiere sesión)
- Catálogo organizado en 4 secciones permanentes — Canciones, Playlists, Artistas y Géneros —,
  cada una con su propio buscador y su propia vista de destacados (con stats: popularidad,
  cantidad de tracks, año); nunca mezcla resultados de búsqueda con widgets de descubrimiento de
  otro tipo de entidad. "Playlists" son los álbumes del dataset (la relación N:M real del
  catálogo: un track puede pertenecer a varias)
- Filtro por género (114 géneros) con chips descubribles dentro de la sección Canciones
- Detalle de track (7 atributos de audio, paywall Premium), artista y álbum con navegación
  cruzada
- Favoritos, playlists (crear/renombrar/eliminar, agregar/quitar tracks) e historial de
  reproducción — persistidos en ClickHouse (`FACT_ENGAGEMENT_USUARIO`) y PocketBase (playlists)
- Reproductor persistente entre páginas (React Context): reproduce audio real vía YouTube
  IFrame API (búsqueda por texto desde el cliente); si YouTube falla o no hay resultado, simula
  la reproducción completa (progreso real, play/pause funcional) con Web Audio API nativa en vez
  de deshabilitar el control
- Portadas reales de artistas/álbumes resueltas por un ETL en dos intentos (iTunes → Deezer),
  con reemplazo visual local si ninguna tiene resultado

### Suscripciones y facturación (requiere sesión)
- Planes B2C (free/premium) y B2B (básico/pro/enterprise), confirmar y cancelar, auto-Free
  transparente para B2C sin plan activo
- Métodos de pago estructurados y pago simulado (resultado aleatorio, invoice en éxito) —
  independiente de la activación del plan en sí

### Creadores, social y distribución (requiere sesión)
- Solicitud de cuenta de artista y subida de tracks (staging + revisión admin antes de
  promoverse al catálogo)
- Seguir artistas, comentar y compartir tracks
- Consulta de disponibilidad de un track por país (restricción geográfica real, RF-DIS-007)

### Analítica (`analyst`/`admin`, requiere suscripción B2B activa)
- Dashboard ejecutivo, engagement por artista/track, perfil de audio por género (radar),
  comparación y benchmark de artistas, tendencias semanales (small multiples), reflejo de
  playlists más agregadas, reporte diario operativo (admin, exportable a PDF)
- Gráficos con Recharts, code-split fuera del bundle principal (no se carga para quien nunca
  visita `/analitica`)

### Administración (`admin` únicamente)
- Permisos granulares, auditoría, errores de sistema
- Moderación de comentarios (social), revisión de cuentas/tracks de creadores, administración
  de facturación, distribución y plan familiar
- Selección de track/usuario por búsqueda (nombre/artista o nombre/correo) en vez de IDs
  internos crudos, en las vistas de disponibilidad (distribución), comentarios (social),
  permisos, auditoría de facturación y plan familiar
- ETL (disparo/monitoreo del DAG), CRUD de las 11 dimensiones editables, calidad de datos
- Consola de pruebas de la API de partners

### Partners — API de catálogo para integradores externos
- API de solo lectura (`/partners/v1/*`) autenticada por API key, segmentada por tier — campos
  de audio progresivamente más completos por tier, exportación masiva exclusiva de enterprise
- Cada llamada se registra en `LOG_LLAMADAS_PARTNER` con partner, endpoint, tier, resultado y
  duración

---

## Estructura del proyecto

```
tracklytics/
├── api/
│   ├── main.py                  # App FastAPI — include routers
│   ├── core/                    # config.py, database.py, cache.py, deps.py
│   └── paquetes/                # Un paquete por capability (11):
│       ├── catalogo/            # Tracks, artistas, álbumes, géneros
│       ├── biblioteca/          # Favoritos, historial, playlists (proxy a PocketBase)
│       ├── suscripciones/       # Planes, confirmar, activa, cancelar
│       ├── analitica/           # Dashboards + deps.py (gating B2B)
│       ├── gestion_datos/       # ETL, CRUD dimensiones, calidad de datos (capability `ingesta`)
│       ├── partners/            # API key auth, tiers, logging
│       ├── seguridad/           # Auth, permisos, auditoría, errores
│       ├── facturacion/         # Métodos de pago, transacciones, invoices
│       ├── creadores/           # Cuenta de artista, subida de tracks
│       ├── social/              # Seguimiento, comentarios, compartir
│       ├── distribucion/        # Sellos, licencias, restricción geográfica
│       └── experiencia/         # Telemetría, recomendaciones, tickets, portadas
├── frontend/                    # React + Vite + TypeScript — frontend vigente, containerizado (servicio `frontend-react`, puerto 8082)
│   ├── src/
│   │   ├── app/                 # router.tsx, layout/ (AppShell, AnalyticaShell, SeguridadShell)
│   │   ├── packages/            # Un paquete por capability (11), misma organización que `api/paquetes/`
│   │   └── shared/              # design-system (tokens), components, context (PlayerContext), lib (api-client, session)
│   ├── Dockerfile               # Build multi-stage: Vite compila, Nginx sirve estático + proxea al backend
│   ├── vite.config.ts
│   └── nginx.conf               # Config de producción, reglas de proxy en paridad con vite.config.ts
├── app/                         # Frontend legado (vanilla HTML/CSS/JS) — todavía servido en Docker (puerto 8081), ya no es el camino de usuario real
├── dataset/
│   └── spotify.csv              # Dataset fuente (113.550 registros)
├── docs/
│   ├── BITACORA_S6.md … BITACORA_S9.md   # Bitácoras semanales
│   ├── decisiones-refactorizacion.md     # Log completo de decisiones de esta refactorización
│   ├── negocio/                          # Documentación de negocio por capability (sin mecanismos de simulación académica)
│   └── PENDIENTES.md                     # Pendientes vigentes y deuda técnica
├── etl/
│   ├── bronze/ silver/ gold/    # Extracción, limpieza, carga dimensional + sintéticos + portadas + playlists_sync + modelo_negocio_sync
│   ├── utils/                   # clickhouse_client.py, pocketbase_client.py
│   └── dags/
│       ├── tracklytics_etl.py         # bronze → silver → gold → portada → synthetic → log (DAG principal)
│       ├── engagement_dag.py          # Eventos de engagement de referencia (independiente)
│       ├── playlists_sync_dag.py      # Reflejo analítico de playlists (PocketBase → ClickHouse, independiente)
│       └── modelo_negocio_sync_dag.py # FACT_ADQUISICION/FACT_DISPONIBILIDAD (independiente, seed por semana)
├── openspec/                    # Spec Driven Development
│   ├── config.yaml              # Constitución del proyecto (stack, reglas RT-01..RT-06)
│   ├── specs/                   # Specs vigentes de las 11 capabilities
│   └── changes/archive/         # Changes implementados y archivados (design.md/tasks.md por capability)
├── docker-compose.yml
└── .env                         # Variables de entorno (no versionado)
```

---

## Modelo de datos

**52 tablas físicas en ClickHouse** (verificado contra `system.tables`: 17 preexistentes al
inicio de la refactorización S9 + 30 de las 6 capabilities nuevas + 5 del cambio
`completar-modelo-base`, que cerró el gap de tablas de negocio pendientes desde antes de S9).
El inventario original de **58 "tablas" del modelo dimensional del proyecto**
(`openspec/config.yaml`, sección "Modelo de datos de negocio": 15 técnicas + 13 de negocio + 30
de las 6 capabilities) se reconcilió tabla por tabla contra `system.tables`: de las 13 de negocio
originalmente planeadas, 6 ya tienen tabla física exacta (5 de `completar-modelo-base` +
`FACT_ENGAGEMENT_USUARIO`, preexistente) y 7 se resolvieron de otra forma — 3 como colecciones de
PocketBase (`FACT_SUSCRIPCION`, `DIM_PARTNER`, `DIM_PLAN_SUSCRIPCION`, todas en la capability
`suscripciones`/`partners`) y 4 reutilizando una tabla ya existente con otro nombre
(`FACT_INTEGRACION_PARTNER`→`LOG_LLAMADAS_PARTNER`, `FACT_INGESTA_DATOS`→`ETL_LOGS`/
`ETL_BATCH_CONTROL`, `DIM_TIEMPO`→`DIM_DATE`, `DIM_CLIENTE`→`DIM_USUARIO`). El detalle completo
de columnas y relaciones de las 6 capabilities nuevas está en sus respectivos
`openspec/specs/<capability>/spec.md`; el núcleo original se resume abajo.

```
PocketBase ──► Bronze (Parquet crudo) ──► Silver (STG_RAW_TRACKS) ──► Gold (FACT_TRACKS + DIMs)
                                                                            │
                                                                            ▼
                                                                     etl/gold/portada.py
                                                              (imagen_url en DIM_ARTISTS/DIM_ALBUMS)

FACT_TRACKS (913.551 filas: 113.550 reales + sintéticos + subidos por artistas)
   source_type Enum8 — 'real' | 'synthetic' | 'user_uploaded'
   ORDER BY (genre_id, artist_id)
   FK lógicas → DIM_GENRES, DIM_ARTISTS, DIM_ALBUMS, DIM_DATE, DIM_MUSICAL_KEY,
                DIM_MODE, DIM_TIME_SIGNATURE, DIM_EXPLICIT_TYPE, DIM_POPULARITY_RANGE,
                DIM_TEMPO_RANGE, DIM_ENERGY_LEVEL

FACT_ENGAGEMENT_USUARIO — favoritos, historial y reproducción por usuario
LOG_LLAMADAS_PARTNER    — log operativo de la API de partners
ETL_LOGS / ETL_BATCH_CONTROL — historial y control de idempotencia de cargas
```

**Capabilities nuevas (30 tablas):** `seguridad` (`DIM_USUARIO`, `DIM_DISPOSITIVO`,
`FACT_SESION`, `FACT_PERMISO_USUARIO`, `FACT_AUDIT_LOG`, `FACT_ERROR_SISTEMA`); `facturacion`
(`DIM_METODO_PAGO`, `FACT_TRANSACCION_PAGO`, `FACT_INVOICE`); `creadores`
(`DIM_CUENTA_ARTISTA`, `FACT_SUBIDA_TRACK`, `DIM_ESTADO_REVISION`, `STG_ARTIST_UPLOADS`);
`social` (`BRIDGE_SEGUIMIENTO_ARTISTA`, `DIM_TIPO_INTERACCION_SOCIAL`, `FACT_COMENTARIO`,
`FACT_COMPARTICION`); `distribucion` (`DIM_PAIS`, `DIM_SELLO_DISCOGRAFICO`, `DIM_LICENCIA`,
`DIM_TIPO_RESTRICCION`, `DIM_CANAL_DISTRIBUCION`, `BRIDGE_RESTRICCION_TRACK`,
`FACT_RESTRICCION_REPRODUCCION`); `experiencia` (`FACT_REPRODUCCION_EVENTO`,
`FACT_IMPRESION_RECOMENDACION`, `FACT_TICKET_SOPORTE`, `FACT_AB_TEST_EXPOSICION`,
`BRIDGE_TRACK_PLAYLIST_USUARIO`, `BRIDGE_SUSCRIPTOR_FAMILIA`).

**`completar-modelo-base` (5 tablas, cierra el gap de negocio original — no es una capability
nueva, extiende `analitica`):** `DIM_CANAL_MARKETING`, `DIM_REGION` (agrupación de negocio,
distinta de `DIM_PAIS`/`distribucion`, que es país de licencia), `DIM_COMPONENTE_INFRAESTRUCTURA`,
`FACT_ADQUISICION`, `FACT_DISPONIBILIDAD` (uptime de infraestructura, distinto de
`FACT_RESTRICCION_REPRODUCCION`/`distribucion`, que es restricción geográfica de contenido).
Datos generados por el DAG independiente `modelo_negocio_sync` (ver sección de pipeline ETL).

**PocketBase — colecciones:** dataset base (`spotify_tracks`), sesión/usuarios (`users`),
playlists (`playlists`, `playlist_tracks`), suscripciones, partners, y las colecciones propias
de cada capability nueva que no ameritaban forzarse a ClickHouse (ver `design.md` de cada
capability para el razonamiento).

> **Nota sobre duplicados en tracklist:** el dataset de Spotify asigna múltiples géneros a una
> misma canción. En `FACT_TRACKS` esto se representa con una fila por combinación
> `track_id × genre_id`. La navegación usa `fact_id` (PK único) para cargar la fila exacta con
> su género correcto.

---

## Pipeline ETL — Capas Bronze / Silver / Gold

| Capa | Origen | Destino | Descripción |
|------|--------|---------|-------------|
| **Bronze** | PocketBase API | Parquet crudo | Extracción fiel sin transformaciones |
| **Silver** | Parquet Bronze | STG_RAW_TRACKS | Limpieza, dedup, validación de rangos |
| **Gold** | STG_RAW_TRACKS | FACT_TRACKS + DIMs | Modelo dimensional + datos sintéticos + portadas |

El DAG principal (`tracklytics_etl`) ejecuta las tasks en secuencia:
```
task_bronze → task_silver → task_gold → task_portada → task_synthetic → task_log
```

`task_portada` (capability `experiencia`) resuelve portadas reales de artistas/álbumes del
catálogo base — orden de intento distinto por entidad (iTunes primero para artistas, Deezer
primero para álbumes, ambas API sin credencial) — y persiste el resultado en
`etl/gold/portadas_cache.json`, que sobrevive a `docker compose down -v` o a una recarga que
reduzca `FACT_TRACKS` a los ~113k registros originales. Procesa 50 artistas + 50 álbumes por
corrida (resolución incremental, respeta el rate limit real de las APIs públicas). Cobertura
actual: ~10.6% de artistas y ~1.6% de álbumes con portada resuelta — limitada por el rate limit
real de ambas APIs bajo uso sostenido, no por errores de implementación (ver
`docs/decisiones-refactorizacion.md`, secciones 24-25).

Tres DAGs adicionales, todos con `schedule_interval=None` (disparo manual/API), independientes de
`tracklytics_etl` porque cada uno cubre un dominio de negocio ajeno al catálogo:

| DAG | Genera | Nota |
|---|---|---|
| `engagement_referencia` | Eventos de engagement sintéticos correlacionados con popularidad | Un `Param week_number` por corrida |
| `playlists_sync` | `BRIDGE_TRACK_PLAYLIST_USUARIO` (reflejo de playlists, PocketBase → ClickHouse) | Full refresh en cada corrida; también invocable on-demand desde `/experiencia/playlists/sincronizar` |
| `modelo_negocio_sync` | `FACT_ADQUISICION`/`FACT_DISPONIBILIDAD` | Un `Param week_number` por corrida, idempotente vía `ETL_BATCH_CONTROL` |

---

## Metodología de desarrollo

Desde la semana 7 (S7), las capabilities de Tracklytics se especifican con **Spec Driven
Development** usando [OpenSpec](https://github.com/Fission-AI/OpenSpec) antes de escribir
código.

**Flujo de trabajo:**

1. **Constitución del proyecto** (`openspec/config.yaml`) — stack obligatorio, reglas del
   docente (RT-01 a RT-06), modelo de datos técnico y de negocio, estándares ISO 25010.
2. **Propuesta de capability** (`/opsx:propose`) — qué cambia y por qué, en `proposal.md`.
3. **Especificación formal** (`specs/<capability>/spec.md`) — requisitos, escenarios
   WHEN/THEN, criterios de aceptación y trazabilidad de 5 niveles.
4. **Diseño técnico** (`design.md`) — en qué base de datos vive cada entidad y por qué, con
   alternativas descartadas.
5. **Implementación** (`/opsx:apply`) — desarrollo guiado por un checklist verificable
   (`tasks.md`).
6. **Archivado** (`/opsx:archive`) — la capability se mueve a
   `openspec/changes/archive/YYYY-MM-DD-<capability>/`, con su spec sincronizada en
   `openspec/specs/<capability>/spec.md`.

**Las 11 capabilities están implementadas, verificadas end-to-end y archivadas:**

| Capability | Cerrada |
|---|---|
| `catalogo` | S7 |
| `suscripciones` | S7 |
| `analitica` | S8 |
| `ingesta` | S8 |
| `partners` | S8 |
| `seguridad` | S9 (refactor) |
| `facturacion` | S9 (refactor) |
| `creadores` | S9 (refactor) |
| `social` | S9 (refactor) |
| `distribucion` | S9 (refactor) |
| `experiencia` | S9 (refactor) |

---

## Historial de sprints

| Sprint | Foco principal | Entregables clave |
|--------|---------------|-------------------|
| S1 | Infraestructura base | Docker Compose, PocketBase, ClickHouse schema, ETL Bronze/Silver/Gold |
| S2 | API + Dashboard analítico | FastAPI, endpoints catálogo/analítica, Dashboard ejecutivo con Plotly.js |
| S3 | App musical base | Login/registro, catálogo navegable, búsqueda, página track/artista/álbum |
| S4 | Roles y analítica avanzada | Comparar artistas, tendencias temporales, calidad de datos |
| S5 | Engagement de usuario | `fact_id` routing, favoritos persistidos en ClickHouse, historial, género visible en tracklist |
| S6 | UX completa + reproductor | Reproductor persistente, cola, cover art por gradiente, empty states — ver `docs/BITACORA_S6.md` |
| S7 | Spec Driven Development (OpenSpec) | Constitución, specs de `catalogo`/`suscripciones`/`analitica`/`partners`/`ingesta` — ver `docs/BITACORA_S7.md` |
| S8 | Implementación de `analitica`/`ingesta`/`partners` + correcciones UX | Cierre del módulo operativo original — ver `docs/BITACORA_S8.md` |
| S9 | QA/rendimiento del módulo operativo **+ refactorización completa hacia sistema completo** | Ver `docs/BITACORA_S9.md` (dos entregas dentro de la misma semana: seek/QA/optimización ClickHouse, y luego las 6 capabilities nuevas + migración a React + pulido final — detalle exhaustivo en `docs/decisiones-refactorizacion.md`) |

Resumen de la segunda entrega de S9 (el refactor):
- **6 capabilities OpenSpec nuevas** cerradas: `seguridad`, `facturacion`, `creadores`,
  `social`, `distribucion`, `experiencia` — 30 tablas físicas nuevas en ClickHouse.
- **Migración completa del frontend a React + Vite + TypeScript**, reemplazando el vanilla
  HTML/CSS/JS + Bootstrap para todo el camino de usuario real; luego containerizado
  (`frontend-react`, puerto 8082).
- **Bug crítico de integridad de datos corregido:** `fact_id` duplicado en `FACT_TRACKS`
  (22.1% de la tabla) — causa raíz (falta de guard de idempotencia + orden no determinista de
  PocketBase) resuelta permanentemente.
- **Pulido final:** sidebar + nav mobile, breakpoints unificados, fix de historial, code-splitting
  de Recharts (bundle principal −54%), manejo de errores consolidado, auditoría responsive.
- **`experiencia` completada e iterada:** reproducción de audio real (YouTube) con watchdog de
  4.5s (fallback a simulación cuando YouTube se queda en silencio sin disparar error, hallazgo de
  diagnóstico real con Playwright) y portadas reales (iTunes + Deezer, cache persistente en
  disco), perfil de usuario, navegación por género.
- **`completar-modelo-base` cerrado (2026-07-04):** las 5 tablas de negocio genuinamente
  faltantes desde antes de S9 (`DIM_CANAL_MARKETING`, `DIM_REGION`,
  `DIM_COMPONENTE_INFRAESTRUCTURA`, `FACT_ADQUISICION`, `FACT_DISPONIBILIDAD`) — 52 tablas
  físicas en total hoy. Extiende `analitica` (2 requirements nuevos), no es una capability
  nueva. DAG independiente `modelo_negocio_sync` para su generación de datos.
- **Cierre de la fase de diseño/UX del frontend (2026-07-04/05):** fix de header (logo +
  indicador de zona) en los shells admin, catálogo rediseñado en 4 secciones permanentes
  (Canciones/Playlists/Artistas/Géneros), título de pestaña dinámico por página, y el change
  `reemplazar-ids-por-busqueda` cerrado: nuevo endpoint de búsqueda de usuarios por nombre/correo
  (`seguridad`, admin-only) y dos componentes de selección con búsqueda (`TrackPicker`,
  `UserPicker`) que reemplazan los 5 campos de ID interno crudo en distribución, social,
  administración, facturación y plan familiar.

---

## Decisiones técnicas clave

- **threading.local para ClickHouse** — cada thread de Uvicorn tiene su propio cliente para
  evitar errores de consultas concurrentes.
- **Cache TTL** — los endpoints analíticos pesados usan caché (en memoria o `use_query_cache`
  de ClickHouse) para evitar re-ejecutar JOINs pesados en cada request.
- **Idempotencia ETL** — `ETL_BATCH_CONTROL` verifica si una semana ya fue cargada antes de
  insertar; guard adicional por `source_type='real'` en `FACT_TRACKS` tras el incidente de
  duplicación (ver `docs/decisiones-refactorizacion.md` §20).
- **`fact_id` para navegación** — PK único de `FACT_TRACKS`, usado en toda navegación en vez de
  `track_id` (no único) para resolver la relación N:M entre tracks y géneros.
- **`source_type`, no `is_synthetic`** — reemplazo directo (no conviven ambos campos) para
  distinguir tracks reales, sintéticos y subidos por artistas.
- **RT-01 respetado en toda escritura nueva** — cualquier escritura al catálogo (subida de
  artistas, favoritos, playlists) pasa por Python, nunca directo desde el frontend a PocketBase.
- **Gating por capability, no centralizado** — cada paquete define su propia dependencia de
  autorización en su propio `deps.py`, reutilizando solo `get_current_user` (central).
- **Sistema de diseño único, aplicado incremental** — tokens definidos una sola vez
  (`frontend/src/index.css`) antes de la primera capability nueva, evitando reconstruir pantallas
  dos veces.
- **`ApiError` con `status`/`detail` reales** (`frontend/src/shared/lib/api-client.ts`) —
  reemplaza un `Error` genérico que descartaba el body de FastAPI, habilitando manejo de errores
  consistente (`ErrorState`/`EmptyState` reutilizables) en vez de mensajes ad-hoc por página.
- **Reproducción simulada como fallback, no un estado de error** — decisión posterior del
  docente sobre el spec original de `experiencia` (RF-EXP-010): cuando YouTube falla, el
  reproductor simula la reproducción completa (Web Audio API) en vez de deshabilitarse.
- **Watchdog de reproducción** — diagnóstico real con Playwright encontró que YouTube a veces se
  queda indefinidamente en `readyState: 0` sin disparar `onError` (fallo silencioso); un
  `setTimeout` de 4.5s tras `onReady` complementa (no reemplaza) al disparador de `onError`.
- **Un DAG independiente por dominio de negocio ajeno al catálogo** — `playlists_sync` y
  `modelo_negocio_sync` no se integran a `tracklytics_etl` (a diferencia de `task_portada`, que sí
  opera sobre entidades que ese DAG ya carga) para no acoplar su ritmo ni su fallo al pipeline
  principal del catálogo.
- **Idempotencia sin columna de proceso dedicada** — `modelo_negocio_sync` reutiliza
  `ETL_BATCH_CONTROL` (ya compartida por todo el pipeline) con un `checksum` literal
  (`'modelo_negocio_sync'`, no un hash) como discriminador de origen, evitando colisión con los
  checksums MD5 de la carga del catálogo sin necesitar una migración de esquema.
