# TRACKLYTICS 
## Proyecto Completo: App Musical + Analítica + Pipeline ETL

> **Herramienta de desarrollo:** Claude Code

---

## Alcance total del proyecto

| Pilar | Descripción |
|-------|-------------|
| App Musical | Plataforma tipo Spotify con catálogo, reproducción, biblioteca personal |
| Analítica Tracklytics | Dashboards, KPIs, análisis de géneros/artistas/audio (solo admin/analyst) |
| Pipeline ETL | Bronze → Silver → Gold, generación sintética, orquestación con Airflow |
| Documentación | Diagramas ER, casos de uso por paquetes, fichas, video |

---

## Definición de Paquetes del Sistema

| Paquete | Área funcional | Actores |
|---------|---------------|---------|
| **Autenticación** | Login, registro, roles, sesión, perfil | User, Analyst, Admin |
| **Catálogo Musical** | Búsqueda, exploración de canciones, artistas, álbumes, géneros | User, Analyst, Admin |
| **Reproducción** | Player simulado, historial de escucha | User, Analyst, Admin |
| **Biblioteca Personal** | Favoritos, playlists propias | User, Analyst, Admin |
| **Analítica** | Dashboards ejecutivo, géneros, artistas, perfil de audio | Analyst, Admin |
| **Gestión de Datos** | ETL Bronze/Silver/Gold, CRUD dimensiones, logs | Admin |

---

## Estructura por paquetes (organización del código)

### API (FastAPI)
```
api/
├── main.py                        ← App principal, include routers
├── core/
│   ├── config.py                  ← Variables de entorno, constantes
│   ├── database.py                ← get_client, query_rows, query_one
│   └── security.py                ← Validación de roles, JWT
├── paquetes/
│   ├── autenticacion/
│   │   ├── __init__.py
│   │   ├── router.py              ← Login/register proxy, perfil
│   │   └── service.py             ← Lógica de auth con PocketBase
│   ├── catalogo/
│   │   ├── __init__.py
│   │   ├── router.py              ← /tracks, /artists, /albums, /genres
│   │   └── service.py             ← Queries ClickHouse de catálogo
│   ├── reproduccion/
│   │   ├── __init__.py
│   │   ├── router.py              ← /player, /history
│   │   └── service.py
│   ├── biblioteca/
│   │   ├── __init__.py
│   │   ├── router.py              ← /favorites, /playlists
│   │   └── service.py
│   ├── analitica/
│   │   ├── __init__.py
│   │   ├── router.py              ← /dashboard, /genres/trends, /artists/stats
│   │   └── service.py
│   └── gestion_datos/
│       ├── __init__.py
│       ├── router.py              ← /etl, /dim CRUD
│       └── service.py
```

### Frontend (App)
```
app/
├── css/main.css
├── js/
│   ├── auth.js
│   ├── api.js
│   └── components.js
├── img/
├── autenticacion/                 ← Paquete: Auth
│   ├── login.html
│   ├── register.html
│   └── profile.html
├── catalogo/                      ← Paquete: Catálogo Musical
│   ├── home.html
│   ├── search.html
│   ├── catalog.html
│   ├── artist.html
│   ├── album.html
│   ├── track.html
│   └── genres.html
├── biblioteca/                    ← Paquete: Biblioteca Personal
│   └── library.html
├── analitica/                     ← Paquete: Analítica (ya existe)
│   ├── dashboard.html
│   ├── genres.html
│   ├── artists.html
│   ├── etl.html
│   └── crud.html
└── index.html                     ← Redirect según sesión
```

### ETL (Pipeline)
```
etl/
├── bronze/                        ← Capa Bronze: datos crudos
│   ├── extract_pocketbase.py      ← Extrae de PocketBase sin transformar
│   └── raw_to_parquet.py          ← Guarda Parquet crudo
├── silver/                        ← Capa Silver: limpieza y validación
│   ├── clean_tracks.py            ← Normalización, dedup, validación
│   ├── split_dimensions.py        ← Separa artistas, álbumes, géneros
│   └── validate.py                ← Reglas de calidad de datos
├── gold/                          ← Capa Gold: modelo dimensional
│   ├── load_dimensions.py         ← Carga DIMs a ClickHouse
│   ├── load_facts.py              ← Carga FACT_TRACKS a ClickHouse
│   └── generate_synthetic.py      ← Generación de datos sintéticos
├── dags/
│   └── tracklytics_etl.py         ← DAG de Airflow
└── utils/
    ├── clickhouse_client.py
    └── pocketbase_client.py
```

---

## Capas Bronze / Silver / Gold

| Capa | Fuente | Destino | Transformaciones |
|------|--------|---------|-----------------|
| **Bronze** | PocketBase API | Parquet crudo en disco | Ninguna — copia fiel del origen |
| **Silver** | Parquet Bronze | STG_RAW_TRACKS (ClickHouse) | Limpieza de nulos, normalización de tipos, dedup por track_id+genre, validación de rangos, split de artistas por ";" |
| **Gold** | STG_RAW_TRACKS | FACT_TRACKS + 11 DIMs | Asignación de FKs, discretización (popularity_range, tempo_range, energy_level), marcado is_synthetic, idempotencia por ETL_BATCH_CONTROL |

---

## Plan de 4 presentaciones (25% cada una)

### ═══ PRESENTACIÓN 1 — 25% — ESTA SEMANA ═══

**Tema:** Estructura base completa + App funcional + Documentación inicial

#### A) Funcionalidad (ya implementada)
| Componente | Estado |
|------------|--------|
| Auth (login/register/roles con PocketBase) | ✅ |
| Home con top canciones reales desde ClickHouse | ✅ |
| Búsqueda en tiempo real con debounce | ✅ |
| Catálogo con filtros por género y paginación | ✅ |
| Página de artista con stats + canciones | ✅ |
| Página de track con atributos de audio (barras) | ✅ |
| Géneros: grid colorido + detalle al click | ✅ |
| Sidebar colapsable con iconos SVG Lucide | ✅ |
| Player bar (simulado) | ✅ |
| Dashboard analítico integrado (solo admin/analyst) | ✅ |
| Subsecciones: géneros, artistas, ETL, CRUD | ✅ |
| Identidad visual violeta propia | ✅ |
| Docker compose up levanta todo | ✅ |
| 313,550 registros en ClickHouse (cumple 300k) | ✅ |
| API reorganizada en paquetes funcionales | ✅ |
| Frontend reorganizado en paquetes funcionales | ✅ |
| ETL reorganizado en capas Bronze/Silver/Gold | ✅ |
| Cache TTL + threading.local para concurrencia CH | ✅ |

#### B) Tareas Presentación 1
| Tarea | Tipo | Estado |
|-------|------|--------|
| Refactor API por paquetes (catalogo/, analitica/, gestion_datos/) | Técnico | ✅ |
| Refactor Frontend por paquetes (autenticacion/, catalogo/, biblioteca/, analitica/) | Técnico | ✅ |
| Reorganizar ETL en capas Bronze/Silver/Gold | Técnico | ✅ |
| Cliente ClickHouse con threading.local (concurrencia) | Técnico | ✅ |
| Cache TTL en endpoints analíticos pesados | Técnico | ✅ |
| Diagrama dimensional de la base de datos (Excalidraw) | Documentación | ✅ |
| Diagrama de casos de uso por paquetes (Excalidraw) | Documentación | ✅ |
| 22 fichas de casos de uso formato docente (Word) | Documentación | ✅ |
| Screenshots del sistema implementado | Documentación | ⏳ Pendiente |
| PDF final con link al video | Documentación | ⏳ Pendiente |
| Video de presentación | Entregable | ⏳ Pendiente |

#### Paquetes con casos de uso para esta presentación

**Paquete: Autenticación**
- CU-01: Iniciar sesión
- CU-02: Registrarse
- CU-03: Cerrar sesión

**Paquete: Catálogo Musical**
- CU-04: Buscar canciones
- CU-05: Explorar catálogo
- CU-06: Ver detalle de canción
- CU-07: Ver perfil de artista
- CU-08: Explorar géneros

**Paquete: Analítica** (acceso restringido)
- CU-09: Ver dashboard ejecutivo
- CU-10: Analizar géneros
- CU-11: Analizar artistas

**Paquete: Gestión de Datos** (acceso restringido)
- CU-12: Ejecutar pipeline ETL
- CU-13: Administrar dimensiones (CRUD)

#### Prompts para Claude Code — Presentación 1

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P1-1 — Refactor API por paquetes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contexto: api/main.py tiene ~600 líneas con toda la lógica junta.
api/routers/app_router.py tiene los endpoints de la app musical.

Reestructura la API en paquetes funcionales:

1. Crea api/core/ con:
   - config.py → mueve CH_HOST, CH_PORT, etc. y las constantes
   - database.py → mueve get_client, query_rows, query_one, 
     clean_row, execute

2. Crea api/paquetes/ con subdirectorios:
   - autenticacion/ → (vacío por ahora, proxy a PocketBase)
   - catalogo/router.py → mueve endpoints de app_router.py 
     (tracks, artists, albums, genres)
   - analitica/router.py → mueve endpoints de dashboard, 
     genres/trends, artists/stats
   - gestion_datos/router.py → mueve endpoints de ETL y DIM CRUD

3. main.py queda solo con: imports, app creation, middleware, 
   lifespan, include_router de cada paquete

4. Cada router.py importa de api/core/database.py
5. Agrega __init__.py en todas las carpetas
6. No cambiar ninguna URL de endpoint — mismos paths exactos

Después: docker compose up -d --build api
Verificar que todos los endpoints siguen respondiendo igual.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P1-2 — Refactor Frontend por paquetes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contexto: app/ tiene todos los HTML en la raíz.
app/analytics/ ya existe como subcarpeta.

Reorganiza los archivos HTML en carpetas por paquete:

1. Crea app/autenticacion/ y mueve:
   login.html, register.html, profile.html

2. Crea app/catalogo/ y mueve:
   home.html, search.html, catalog.html, artist.html, 
   album.html, track.html, genres.html

3. Crea app/biblioteca/ y mueve:
   library.html

4. app/analitica/ ya existe (renombrar analytics/ → analitica/)
   con: dashboard.html, genres.html, artists.html, etl.html, crud.html

5. app/index.html queda en la raíz como redirect

6. IMPORTANTE: actualiza TODOS los links internos en:
   - Cada archivo HTML (hrefs entre páginas)
   - js/components.js (links de la sidebar)
   - js/auth.js (redirects a login/home)
   - nginx.conf (si necesita ajuste de rutas)
   
7. Actualiza la sidebar en components.js para que los links 
   apunten a las nuevas rutas:
   /autenticacion/login.html, /catalogo/home.html, etc.

Después: docker compose up -d --build app
Verificar que toda la navegación funciona correctamente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P1-3 — Renombrar ETL a Bronze/Silver/Gold
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contexto: etl/ tiene los scripts de carga. El DAG de Airflow 
está en etl/dags/. El Dockerfile está en etl/etl_Dockerfile.

Reorganiza etl/ en capas:

1. Crea etl/bronze/ → extracción cruda de PocketBase
2. Crea etl/silver/ → limpieza, validación, split de dimensiones
3. Crea etl/gold/ → carga a FACT_TRACKS y DIMs, generación sintética

4. Mueve la lógica existente a la capa correspondiente:
   - Lo que extrae de PocketBase y genera Parquet → bronze/
   - Lo que limpia, valida y normaliza → silver/
   - Lo que carga a ClickHouse y genera sintéticos → gold/

5. Actualiza el DAG de Airflow para importar desde las nuevas rutas
6. Actualiza el Dockerfile del ETL si es necesario
7. Agrega comentarios docstring en cada archivo explicando qué capa 
   es y qué hace

No cambiar la lógica — solo reorganizar archivos y actualizar imports.

Después: docker compose up -d --build etl airflow
Verificar que el ETL sigue funcionando.
```

---

### ═══ PRESENTACIÓN 2 — 50% ═══

**Tema:** Reproducción + Biblioteca Personal + Perfil completo

| Componente | Descripción |
|------------|-------------|
| Player funcional | Click en canción → player bar muestra info + progreso simulado |
| Historial automático | Cada "reproducción" se registra en PocketBase |
| Favoritos | Botón ❤️ en canciones, persistente en PocketBase |
| Playlists | Crear, editar, eliminar playlists propias |
| Perfil completo | Nombre, email, rol, estadísticas de escucha |
| Library funcional | Vista unificada de favoritos + playlists + historial |

**Paquetes nuevos documentados:**
- Reproducción (CU-14 a CU-16)
- Biblioteca Personal (CU-17 a CU-20)

---

### ═══ PRESENTACIÓN 3 — 75% ═══

**Tema:** Analítica avanzada + Calidad de datos + Optimización

| Componente | Descripción |
|------------|-------------|
| Dashboard de audio features | Distribución de danceability, energy, valence, tempo |
| Tendencias temporales | Evolución por semana de carga (date_id) |
| Comparador de géneros | Radar superpuesto de 2+ géneros |
| Validaciones ETL | Reglas de calidad en capa Silver con reportes |
| Optimización ClickHouse | Índices, materialized views para dashboards |
| Tests | Tests unitarios del ETL + tests de la API |

---

### ═══ PRESENTACIÓN 4 — 100% ═══

**Tema:** Pulido final + Documentación completa + Deploy

| Componente | Descripción |
|------------|-------------|
| Responsive completo | Todas las pantallas adaptadas a móvil |
| Skeleton loaders | En todas las pantallas |
| Error handling global | Sesión expirada, red caída, errores API |
| Documentación ISO 25010 | Evidencia de cada característica de calidad |
| Manual de usuario | Guía de uso del sistema |
| Video final | Demo completa de todo el sistema |
| Docker limpio | compose up sin errores, sin configuración manual |


---

*Plan generado para desarrollo con Claude Code.*
*Cada presentación incluye prompts detallados al iniciar.*