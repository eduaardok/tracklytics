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

![Records](https://img.shields.io/badge/Registros-1.1M+-8B5CF6?style=for-the-badge)
![Tables](https://img.shields.io/badge/Tablas_ClickHouse-70-8B5CF6?style=for-the-badge)
![Capabilities](https://img.shields.io/badge/Capabilities_OpenSpec-15-8B5CF6?style=for-the-badge)
![Progress](https://img.shields.io/badge/Avance-modelo%20de%20negocio%20completo-22c55e?style=for-the-badge)

> Plataforma de analítica musical e inteligencia de negocio sobre datos de Spotify,
> construida con ClickHouse, Airflow, FastAPI y un frontend React + TypeScript.
> Incluye una app musical tipo Spotify completa (catálogo, biblioteca, reproducción real,
> suscripciones, pagos, creadores, social, distribución, regalías, publicidad, finanzas) con
> sistema de roles, dashboards administrativos por capability y 15 capabilities especificadas
> con Spec Driven Development (OpenSpec), todas implementadas y archivadas.

Tracklytics procesa un dataset base de 113.550 registros reales de Spotify más datos
sintéticos semanales acumulados (1.113.555 registros confirmados hoy en `FACT_TRACKS`, semanas
1-11 cargadas, tras corregir un incidente de duplicación — ver
`docs/BITACORA_S10.md`), los almacena en un modelo dimensional columnar en
ClickHouse (76 tablas físicas), orquesta las cargas con Apache Airflow (7 DAGs: catálogo,
recarga de portadas independiente, recalificación administrativa en bloque, engagement de
referencia, playlists, modelo de negocio y finanzas periódicas) y los expone mediante una API
REST (FastAPI), un frontend React containerizado (único frontend del proyecto) con dashboards
analíticos y administrativos interactivos (Recharts), reproducción de audio real (YouTube) con
fallback simulado y watchdog anti-silencio, portadas reales (iTunes + Deezer, con cache
persistente), liquidación real de regalías, publicidad con reconocimiento de ingreso en tiempo
real, un panel financiero consolidado (gastos, reembolsos, cuentas por cobrar/pagar, presupuesto
de campañas), y una API de catálogo para partners externos.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Fuente de datos | PocketBase — dataset base `spotify_tracks` (113.550 registros) + 5 colecciones más: `users`, `playlists`, `playlist_tracks`, `suscripciones`, `partners` |
| Staging | Parquet (vía PyArrow) |
| Base de datos | ClickHouse 24.3 (MergeTree) — 76 tablas físicas en esquema estrella (verificado con `system.tables`), incluyendo capabilities transaccionales (`seguridad`, `facturacion`, `finanzas`) implementadas en columnar por decisión pedagógica deliberada del docente |
| Orquestación ETL | Apache Airflow 2.9 — DAG principal (`tracklytics_etl`) + 3 DAGs independientes (`playlists_sync`, `modelo_negocio_sync`, `finanzas_periodicas`) |
| API REST | FastAPI + Uvicorn (Python 3.11) — 15 paquetes (uno por capability), incluye API de partners autenticada por API key |
| Frontend | React 18 + TypeScript + Vite — único frontend del proyecto (`frontend/`), containerizado (servicio `frontend-react`, build multi-stage Vite+Nginx); el frontend legado vanilla HTML/CSS/JS (`app/`) se retiró por completo del repo en S10 |
| Visualización | Recharts (dashboards de `analitica` y dashboards administrativos por capability, componentes nativos de React sobre los tokens de diseño) |
| Audio real | YouTube IFrame Player API (búsqueda por texto desde el cliente, sin API key) con reproducción simulada (Web Audio API nativa) como fallback cuando no hay resultado, conexión, o cuando YouTube se queda en silencio sin disparar error (watchdog de 4.5s tras `onReady`) |
| Portadas reales | iTunes Search API + Deezer Search API (orden de intento distinto por entidad, sin API key en ninguna) — cache persistente en disco (`etl/gold/portadas_cache.json`) sobrevive a `docker compose down -v`; reemplazo visual local si ninguna fuente resuelve |
| Sistema de diseño | Tokens propios en oklch (`frontend/src/index.css`), definidos una vez y aplicados incrementalmente por capability — ver `PRODUCT.md` |
| Servidor web | Nginx (reverse proxy del único frontend, `frontend-react`) |
| Auth | PocketBase JWT (roles: `user` / `analyst` / `admin`) + roles administrativos especializados (`superadmin`, `admin_finanzas`, `admin_contenido`, `admin_comunidad`, `admin_datos`, `admin_comercial`) gestionados en ClickHouse |
| Contenedores | Docker + Docker Compose (6 servicios de larga duración: PocketBase, ClickHouse, Airflow, API, frontend React, más los jobs de init) |

---

## Requisitos previos

- **Docker Desktop** (incluye Docker Compose) — para todo el stack (API, ClickHouse, Airflow, PocketBase, frontend React); `docker compose up -d` es suficiente para levantarlo todo
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

# ClickHouse Gold (S13-P2) — segunda instancia, capa de agregaciones.
# Mismo CLICKHOUSE_USER/CLICKHOUSE_PASSWORD de arriba (no es una cuenta
# distinta, es una instancia distinta). Sin tablas todavía — ver P3.
CLICKHOUSE_GOLD_DB=tracklytics_gold

# Airflow
AIRFLOW_USER=admin
AIRFLOW_PASSWORD=tracklytics2026
AIRFLOW_SECRET_KEY=tracklytics_secret_key_2026
AIRFLOW_DAG_ID=tracklytics_etl
# URL pública de Airflow (la que abre el navegador, no la interna de red
# Docker) — solo hace falta cambiarla si se accede al stack desde otra
# IP/host que no sea localhost.
AIRFLOW_PUBLIC_URL=http://localhost:8080

# ETL
WEEK_NUMBER=1
```

### 3. Levantar todo el stack (API, ClickHouse, Airflow, PocketBase, frontend React)

```bash
docker compose up -d
```

Docker Compose levanta automáticamente todos los servicios en el orden correcto:

1. **PocketBase** y **ClickHouse** arrancan primero.
2. **pb-init** crea las colecciones necesarias en PocketBase y carga los 113.550 registros
   desde el CSV (tarda ~5 min).
3. **init-db** crea el schema dimensional en ClickHouse (76 tablas).
4. **Airflow**, **API** y el **frontend React** (`frontend-react`, puerto 8082, único frontend)
   quedan disponibles.

> **Nota:** en la primera ejecución espera ~5–7 minutos a que `pb-init` termine antes de lanzar
> el ETL. Puedes monitorear con: `docker logs tracklytics_pb_init -f`

> **⚠️ Tras hacer `git pull` con cambios de frontend, el paso 3 NO alcanza.**
> `docker compose up -d` reutiliza la imagen de `frontend-react` si ya existe — no
> reconstruye aunque el código fuente haya cambiado (Compose solo invoca `docker build`
> si la imagen no existe o si se pasa `--build`/`build` explícitamente). Corré:
> ```bash
> ./scripts/rebuild-frontend.sh
> ```
> Reconstruye la imagen con el commit actual y se autoverifica contra
> `http://localhost:8082` (fingerprint `<meta name="build-commit">` en el HTML servido,
> ver `frontend/Dockerfile`) — falla con un mensaje claro si el container terminó
> sirviendo otra cosa, en vez de quedar "andando" con código viejo en silencio.

### 4. (Opcional) Frontend React en modo desarrollo

El paso 3 ya deja el frontend corriendo en `http://localhost:8082` (build de producción
servido por Nginx) — usá `./scripts/rebuild-frontend.sh` después de cada `git pull` con
cambios de frontend para que sea el build *vigente* (ver nota arriba). Para desarrollo con
hot reload:

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
monitorea el estado en tiempo real.

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
| `/regalias/ganancias` — Ganancias propias (artista o sello) por período | Requiere sesión (cuenta de artista o de sello) |
| `/analitica/*` — Dashboard, engagement, géneros, tendencias, playlists top, disponibilidad de infraestructura | `analyst`/`admin` con suscripción B2B activa (tier Básico o superior) |
| `/analitica/comparacion`, `/analitica/benchmark`, `/analitica/adquisicion` (índice de desempeño relativo vive en `/analitica/engagement`) | `analyst`/`admin` con tier B2B Pro o superior |
| `/analitica/proyeccion-genero`, `/analitica/proyeccion-artista` — paneles predictivos (proyección estadística, no ML) | `analyst`/`admin` con tier B2B Enterprise |
| `/analitica/reporte-diario` | `admin` únicamente |
| `/seguridad/*` — Permisos, auditoría, errores, dashboards administrativos (auditoria/facturacion/creadores/social/distribucion/soporte, cada uno `GET /admin/dashboard`), moderación, plan familiar, regalías (contratos/liquidación), publicidad (anunciantes/campañas), partners (consola), ingesta (ETL/CRUD/calidad de datos) | `admin` únicamente |
| `/login`, `/register`, `/acerca-de` | Pública |

> `/analitica/disponibilidad` (uptime de infraestructura) y `/distribucion/disponibilidad`
> (restricción geográfica de reproducción) son vistas distintas con nombres parecidos —
> conceptos de negocio no relacionados, ver los `design.md` archivados en `openspec/changes/archive/`.

### Backend y servicios

| Servicio | URL | Acceso |
|---|---|---|
| API REST + Swagger | http://localhost:8000/docs | - |
| Frontend React (único, containerizado) | http://localhost:8082 | Según ruta, ver arriba |
| Airflow UI | http://localhost:8080 | admin |
| PocketBase Admin | http://localhost:8090/_/ | admin |
| ClickHouse (catálogo) | localhost:8123 (HTTP) / 9000 (nativo) | `CLICKHOUSE_USER`/`CLICKHOUSE_PASSWORD` |
| ClickHouse Gold (S13-P2, capa de agregaciones) | localhost:8124 (HTTP) / 9001 (nativo) | Mismas credenciales — sin tablas todavía, ver P3 |
| Mailpit (P2, S16 — captura de email real) | http://localhost:8025 | - |

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

**Roles administrativos por área** (S12, `BRIDGE_USUARIO_ROL_ADMIN`): además del `admin`
bootstrap ("superadmin", acceso total), 6 cuentas pueden tener un rol acotado a un área de
negocio (`admin_finanzas`/`admin_contenido`/`admin_comunidad`/`admin_datos`/`admin_comercial`)
— asignado por endpoint (`POST /admin/usuarios/{id}/rol-admin`), no por el campo `role` nativo
de PocketBase. El sidebar administrativo (S14-FINAL) refleja esto en tiempo real: cada rol ve
solo las secciones/links que su rol realmente puede abrir (verificado 1:1 contra el
`require_rol_admin` de cada endpoint backend, no una lista aparte), aterriza tras el login en su
panel principal (no en el catálogo B2C), y lo muestra en un badge de color junto a su email. Ver
`docs/CUENTAS_DEMO.md` para las 7 cuentas de demostración (una por rol, contraseña compartida vía
`SUPERADMIN_DEMO_PASSWORD`) y qué informes/paneles ve cada una. El **Balanced Scorecard**
(`/analitica/bsc`, 4 perspectivas estratégicas) es exclusivo de staff interno (`superadmin`, no
de un rol de área ni de `analyst`) — mismo criterio que reporte diario/churn/P&L/MRR-ARR.

`/acerca-de` (pública) actúa de hub de marca y explica las tres rutas de alta reales, sin
crear roles nuevos: **oyente** (`/register`, rol `user`), **artista** (`/register?tipo=artista`
crea la misma cuenta `user` y entra directo a `/creadores` a solicitar la cuenta de artista,
aprobación de admin) y **sello/productora/distribuidora** (sin autoregistro — programa de
Partners en `/partners`, acceso por API key).

La API de **partners** (`/partners/v1/*`) usa un esquema de autenticación completamente
distinto: no hay sesión de PocketBase ni rol — cada solicitud se autentica con una
API key por header (`X-API-Key`), resuelta contra la colección `partners`, segmentada por tier
(básico/pro/enterprise).

---

## Capabilities (15, todas especificadas con OpenSpec y archivadas)

| Capability | Casos de uso | Tablas ClickHouse nuevas |
|---|---|---|
| `catalogo` | Navegación, búsqueda (con filtros avanzados de popularidad/tempo/energy), detalle de track/artista/álbum, favoritos, playlists (colaborativas, con reorder) | *(existente)* |
| `suscripciones` | Planes B2C/B2B, confirmar, consultar activa, cancelar, trial de 7 días, plan estudiante, churn con motivo, cambio de plan con prorrateo, dunning (cobro fallido con reintentos), precios de plan configurables | *(existente)* + `FACT_CANCELACION_SUSCRIPCION`, `DIM_PLAN` |
| `analitica` | Dashboards ejecutivos, perfil de audio por género, comparación/benchmark de artistas, tendencias, reporte diario, churn/funnel/P&L, MRR/ARR, acceso graduado por tier B2B (Básico/Pro/Enterprise) y 2 paneles predictivos exclusivos Enterprise (proyección de tendencia de género/artista) | *(existente)* |
| `partners` | API de catálogo para integradores externos, autenticada por API key | *(existente)* |
| `ingesta` (paquete `gestion_datos`) | Disparo/monitoreo de ETL, CRUD dimensional, calidad de datos, recalificación administrativa en bloque | *(existente)* |
| `seguridad` | Usuarios, sesiones activas multi-dispositivo (consulta y cierre remoto), permisos granulares, auditoría, errores de sistema, dashboard administrativo | 6 |
| `facturacion` | Métodos de pago (checkout con tarjeta simulada), transacciones (simuladas), invoices, IVA configurable con override por país, notificación simulada de factura por correo, información de empresa editable, dashboard administrativo | 5 |
| `creadores` | Cuenta de artista, subida de tracks con staging y revisión admin, dashboard administrativo | 4 |
| `social` | Seguir artistas, comentarios, compartir, feed de actividad de artistas seguidos, dashboard administrativo | 4 |
| `distribucion` | Sellos discográficos (con país), licencias (con flujo de solicitud por sello), restricción geográfica de reproducción, configuración de país (moneda/tasa de cambio/IVA/retención fiscal), dashboard administrativo | 8 |
| `experiencia` | Telemetría de reproducción, recomendaciones, tickets de soporte, A/B testing, reflejo de playlists, plan familiar, portadas y audio real, dashboard administrativo | 6 |
| `regalias` | Productores, contratos de reparto por track, cuentas de sello, liquidación real por período con retención fiscal (bruto/retenido/neto), retiro de ganancias, consulta de ganancias propias (artista/sello) | 6 |
| `publicidad` | Anunciantes, campañas con CPM (audio y display), impresión de anuncio a usuarios free, reconocimiento de ingreso publicitario en tiempo real, pausa automática por presupuesto agotado | 4 |
| `simulacion` | Panel admin-only: genera streams + suscripciones + impresiones publicitarias en conjunto y liquida el período resultante, para demostrar el flujo de dinero de punta a punta sin operar la app manualmente a escala | *(sin tabla propia — escribe en tablas de otras capabilities)* |
| `finanzas` | Gastos operativos, reembolsos validados, cuentas por cobrar/pagar, tracking de presupuesto de campañas + alertas, indicadores empresariales, dashboard y reporte financiero consolidado | 2 |

Las 5 primeras forman el "módulo operativo" original (S7-S8); las 6 siguientes son la
refactorización hacia sistema completo (detalle de cada decisión en los `design.md`
archivados en `openspec/changes/archive/`); `regalias` y `publicidad` cierran el modelo de negocio de
streaming real (S10) — ver la sección [Regalías y publicidad](#regalías-y-publicidad-modelo-de-negocio-real)
más abajo; `simulacion` (S11) demuestra ese modelo de dinero a escala sin operar la app
manualmente; `finanzas` (S11) cierra el panel de salud financiera — costo operativo, reembolsos,
cuentas por cobrar/pagar y control de presupuesto publicitario — compuesto sobre el dato que las
demás capabilities ya generaban, sin duplicar su lógica. `seguridad` y `facturacion` viven en
ClickHouse a pesar de ser dominios transaccionales por naturaleza — decisión pedagógica
deliberada del docente, no un error de arquitectura, para que el equipo documente las fricciones
reales de una base columnar fuera de su caso de uso ideal.

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
- Favoritos, playlists (crear/renombrar/eliminar, agregar/quitar/reordenar tracks, colaboradores
  invitados por correo con permiso de editar tracks pero no renombrar/eliminar) e historial de
  reproducción — persistidos en ClickHouse (`FACT_ENGAGEMENT_USUARIO`) y PocketBase (playlists)
- Búsqueda avanzada de catálogo: filtros opcionales de popularidad mínima y rango de
  tempo/energy, combinables con el término de búsqueda y el filtro de género
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
- Seguir artistas, comentar y compartir tracks; feed de actividad reciente (comentarios y
  comparticiones) de los artistas que el usuario sigue
- Consulta de disponibilidad de un track por país (restricción geográfica real, RF-DIS-007)
- Sesiones activas propias por dispositivo, con cierre remoto de cualquiera de ellas
  (`seguridad`, sección "Mis sesiones" del perfil)

### Analítica (`analyst`/`admin`, requiere suscripción B2B activa, acceso graduado por tier)
- **Básico**: dashboard ejecutivo, engagement por artista/track, perfil de audio por género
  (radar), tendencias semanales (small multiples), reflejo de playlists más agregadas,
  disponibilidad de infraestructura
- **Pro**: todo lo de Básico + comparación y benchmark de artistas, índice de desempeño relativo
  (Mercado vs. Tracklytics), adquisición de usuarios por canal
- **Enterprise**: todo lo de Pro + proyección de tendencia de género y proyección de trayectoria
  de artista vs. su género — extrapolación estadística simple (regresión lineal) con alerta
  temprana embebida, nunca presentada como predicción de IA
- El tier insuficiente muestra un estado "disponible desde el plan X" con CTA de upgrade, no un
  403 genérico (`TierUpsell.tsx`)
- Reporte diario operativo (`admin`, exportable a PDF) — independiente del tier B2B, nunca
  alcanzable por ningún Cliente B2B sin importar el plan
- Gráficos con Recharts, code-split fuera del bundle principal (no se carga para quien nunca
  visita `/analitica`)

### Administración (`admin` únicamente)
- Permisos granulares, auditoría, errores de sistema
- Moderación de comentarios (social), revisión de cuentas/tracks de creadores, administración
  de facturación, distribución y plan familiar
- Dashboards administrativos con gráficos reales (Recharts) para `seguridad`, `facturacion`,
  `creadores`, `social`, `distribucion` y `experiencia` — ver
  [Dashboards administrativos](#dashboards-administrativos-rt-04) más abajo
- Administración de regalías (productores, contratos de reparto, cuentas de sello, liquidación
  manual por período) y de publicidad (anunciantes, campañas) — ver
  [Regalías y publicidad](#regalías-y-publicidad-modelo-de-negocio-real) más abajo
- Selección de track/usuario por búsqueda (nombre/artista o nombre/correo) en vez de IDs
  internos crudos, en las vistas de disponibilidad (distribución), comentarios (social),
  permisos, auditoría de facturación y plan familiar — el selector de usuario también se
  puede abrir en modo "explorar lista completa" (paginado, filtrable por rol), con columnas
  de nombre/correo/rol/fecha de registro en vez de una lista angosta
- Auditoría y errores de sistema identifican al usuario por nombre y correo, no solo por
  `usuario_id`; Permisos selecciona recurso/acción de un catálogo cerrado (`GET
  /seguridad/permisos/catalogo`) en vez de campos de texto libre
- ETL (disparo/monitoreo del DAG), CRUD de las 11 dimensiones editables, calidad de datos
- Consola de pruebas de la API de partners

### Partners — API de catálogo para integradores externos
- API de solo lectura (`/partners/v1/*`) autenticada por API key, segmentada por tier — campos
  de audio progresivamente más completos por tier, exportación masiva exclusiva de enterprise
- Cada llamada se registra en `LOG_LLAMADAS_PARTNER` con partner, endpoint, tier, resultado y
  duración

---

## Regalías y publicidad (modelo de negocio real)

Cierra el modelo de negocio real de streaming musical: cómo se le paga a quien tiene derechos
sobre un track, y cómo se financia el tier free.

- **Productores y contratos de reparto** (`regalias`): un track tiene un contrato vigente que
  define qué porcentaje corresponde a sello, artista y productor. Dos tipos de derecho — master
  (grabación) y publishing (composición) — sin una entidad `DIM_EDITORIAL` separada (decisión
  explícita: sin editorial propia, el publishing se reparte entre sello/artista).
- **Liquidación real por período** (`POST /regalias/admin/liquidar`, admin, y automática cada
  semana vía el DAG `finanzas_periodicas`): `pool_rightsholders = (Σ transacciones exitosas del
  período + Σ ingreso publicitario del período) × 70%`, repartido pro-rata entre tracks según su
  participación real en streams (`FACT_ENGAGEMENT_USUARIO`, `event_type='reproduccion'`), y
  dentro de cada track entre sello/artista/productor según su contrato vigente.
- **Cuentas de sello** (`DIM_CUENTA_SELLO`, alta exclusiva de admin — un sello ya es una entidad
  de catálogo administrada, no de autoservicio como una cuenta de artista) y consulta de
  ganancias propias tanto para artista (`GET /regalias/artista/mis-ganancias`) como para sello
  (`GET /regalias/sello/mis-ganancias`), con su vista en `/regalias/ganancias`.
- **Publicidad** (`publicidad`): anunciantes y campañas con CPM real; una impresión de anuncio
  se muestra entre canciones a un usuario del plan free (interrumpe el reproductor, requiere
  completarse antes de continuar) y su ingreso se reconoce en el momento (`monto = cpm / 1000`),
  sin agregación diferida — ese ingreso entra al mismo pool que reparte regalías.
- **`finanzas_periodicas`** (Airflow, `schedule_interval="@weekly"`, cron real — no disparo
  manual): primero renueva las suscripciones vencidas cobrando de verdad contra el método de
  pago del usuario, y luego liquida las regalías del período con el ingreso ya actualizado.

Fuera de alcance (decisión explícita, no pendiente): pasarela de anuncios de video/display fuera
del reproductor de audio, segmentación de campañas por audiencia (toda campaña activa es
elegible para cualquier usuario free), y gestión de composición/editorial separada del artista.

---

## Finanzas (panel de salud financiera, S11)

Cierra el hueco que quedaba entre "cuánto entra" (`v1_pnl` de `analitica`: suscripciones +
publicidad − regalías pagadas) y "cuál es la utilidad real" de la plataforma. Todo admin-only,
13 endpoints bajo `/app/v1/finanzas`, auditado (`audit.record`) en cada mutación.

- **Gastos operativos**: CRUD con soft-delete (`FACT_GASTO_OPERATIVO`) por categoría
  (infraestructura, marketing, nómina, licencias, servicios, soporte, legal, otros); un gasto
  anulado se excluye de todo cálculo financiero derivado.
- **Reembolsos**: vinculados a `FACT_TRANSACCION_PAGO` (`FACT_REEMBOLSO`), con validación de que
  el monto no exceda lo pagado menos reembolsos previos y de que la transacción esté `exitosa`
  — rechazo antes de insertar, no una fila con estado `rechazado`.
- **Cuentas por cobrar y por pagar**: resumen on-read (sin tabla de estado nueva) sobre
  `FACT_INVOICE`, `FACT_LIQUIDACION_REGALIA` y `FACT_RETIRO_REGALIA`.
- **Presupuesto de campañas**: consumo calculado on-read sobre `FACT_INGRESO_PUBLICITARIO` por
  campaña, con alerta al 80%/100% y pausa automática (`DIM_CAMPANA_PUBLICITARIA.activa=0`) al
  agotarse — ver también [Regalías y publicidad](#regalías-y-publicidad-modelo-de-negocio-real).
- **Dashboard, indicadores (ARPU, % de ingreso a regalías/gastos, crecimiento vs. periodo
  anterior), alertas administrativas y reporte por periodo**: todos componen `v1_pnl` restando
  gastos y reembolsos, sin reimplementar su cálculo.
- **Panel admin en React** (`/seguridad/finanzas`, 8 pestañas), con foco en gráficos no
  convencionales: anillo de progreso para margen/consumo de presupuesto (incluida una grilla de un
  gauge por campaña), treemap de gasto por categoría, dispersión monto×fecha de reembolsos para
  detectar outliers, y radar de proporciones para los indicadores del periodo.

Fuera de alcance de esta entrega (documentado, no pendiente por descuido): exportación PDF/Excel
del reporte — ver `docs/BITACORA_S11.md` (Bloque 7).

---

## Dashboards administrativos (RT-04)

Las 6 capabilities de negocio que no tenían panel visual propio ahora exponen un endpoint
`GET /admin/dashboard` (rol `admin`) con métricas agregadas sobre datos reales de ClickHouse —
sin datos sintéticos inventados para el gráfico. Cada uno tiene su página en React
(`/seguridad/<ruta>`, code-split, `lazyNamed()`) con KPIs y gráficos Recharts sobre la paleta de
diseño validada del proyecto:

| Capability | Endpoint | Página | Métricas |
|---|---|---|---|
| `seguridad` | `GET /seguridad/admin/dashboard` | `/seguridad/auditoria` | Acciones auditadas por día, errores de las últimas 24h, sesiones abiertas totales |
| `facturacion` | `GET /facturacion/admin/dashboard` | `/seguridad/facturacion` | Ingreso diario, transacciones de las últimas 24h, ingreso histórico total |
| `creadores` | `GET /creadores/admin/dashboard` | `/seguridad/creadores` | Subidas de track por estado de revisión, total de cuentas de artista |
| `social` | `GET /social/admin/dashboard` | `/seguridad/social` | Actividad social diaria (comentarios/comparticiones), ranking de artistas más seguidos |
| `distribucion` | `GET /distribucion/admin/dashboard` | `/seguridad/distribucion` | Restricciones de reproducción por país, licencias activas totales |
| `experiencia` | `GET /experiencia/admin/dashboard` | `/seguridad/soporte` | Tickets de soporte por estado, tickets abiertos/en proceso totales |

---

## Estructura del proyecto

```
tracklytics/
├── api/
│   ├── main.py                  # App FastAPI — include routers
│   ├── core/                    # config.py, database.py, cache.py, deps.py
│   └── paquetes/                # Un paquete por capability (15):
│       ├── catalogo/            # Tracks, artistas, álbumes, géneros, búsqueda avanzada
│       ├── biblioteca/          # Favoritos, historial, playlists (colaborativas, reorder — proxy a PocketBase)
│       ├── suscripciones/       # Planes, confirmar, activa, cancelar, trial, plan estudiante, churn
│       ├── analitica/           # Dashboards + deps.py (gating B2B), churn/funnel/P&L, MRR/ARR
│       ├── gestion_datos/       # ETL, CRUD dimensiones, calidad de datos, recalificación (capability `ingesta`)
│       ├── partners/            # API key auth, tiers, logging
│       ├── seguridad/           # Auth, sesiones, permisos, roles administrativos por área, gestión de usuarios (vista 360°, suspender/reactivar), lockout, recuperación de contraseña, baja de cuenta, auditoría, errores, dashboard admin
│       ├── facturacion/         # Métodos de pago, transacciones, invoices, info de empresa, dashboard admin
│       ├── creadores/           # Cuenta de artista, subida de tracks, dashboard admin
│       ├── social/              # Seguimiento, comentarios, compartir, feed, dashboard admin
│       ├── distribucion/        # Sellos, licencias (+ solicitud por sello), restricción geográfica, dashboard admin
│       ├── experiencia/         # Telemetría, recomendaciones, tickets, portadas, dashboard admin
│       ├── regalias/            # Productores, contratos, cuentas de sello, liquidación, retiro, ganancias
│       ├── publicidad/          # Anunciantes, campañas, impresión de anuncio, ingreso publicitario, pausa por presupuesto
│       ├── simulacion/          # Generación conjunta de actividad (streams+suscripciones+ads) + liquidación
│       └── finanzas/            # Gastos, reembolsos, cuentas por cobrar/pagar, presupuesto de campañas, dashboard financiero
├── frontend/                    # React + Vite + TypeScript — único frontend, containerizado (servicio `frontend-react`, puerto 8082)
│   ├── src/
│   │   ├── app/                 # router.tsx, layout/ (AppShell, AnalyticaShell, SeguridadShell)
│   │   ├── packages/            # Un paquete por capability con UI propia, misma organización que `api/paquetes/`
│   │   └── shared/              # design-system (tokens), components, context (PlayerContext), lib (api-client, session)
│   ├── Dockerfile               # Build multi-stage: Vite compila, Nginx sirve estático + proxea al backend
│   ├── vite.config.ts
│   └── nginx.conf               # Config de producción, reglas de proxy en paridad con vite.config.ts
├── dataset/
│   └── spotify.csv              # Dataset fuente (113.550 registros)
├── docs/
│   ├── BITACORA_S6.md … BITACORA_S11.md  # Bitácoras semanales (S11 es una sola bitácora, 13 bloques: monetización, finanzas, tier B2B, roles admin, ciclos de vida, descubrimiento/comunidad, fix reproducción YouTube)
│   ├── CONSTITUCION_TRACKLYTICS.md       # Identidad y principios del proyecto
│   ├── DIMENSIONAL_MODEL.md              # Modelo dimensional (fact + dimensiones)
│   ├── negocio/                          # Documentación de negocio por capability (sin mecanismos de simulación académica)
│   └── PENDIENTES.md                     # Pendientes vigentes y deuda técnica
├── etl/
│   ├── bronze/ silver/ gold/    # Extracción, limpieza, carga dimensional + sintéticos + portadas + recalificación + playlists_sync + modelo_negocio_sync
│   ├── utils/                   # clickhouse_client.py, pocketbase_client.py
│   └── dags/
│       ├── tracklytics_etl.py         # bronze → silver → gold → synthetic → log (DAG principal; portadas ya no bloquea, ver Fase 7 de la S11)
│       ├── reload_portadas_dag.py     # Resolución de portadas (iTunes+Deezer), independiente del camino crítico
│       ├── recalificacion_dag.py      # Corrección en bloque de año/país/perfil de audio ya cargados (`schedule_interval=None`)
│       ├── engagement_dag.py          # Eventos de engagement de referencia (independiente)
│       ├── playlists_sync_dag.py      # Reflejo analítico de playlists (PocketBase → ClickHouse, independiente)
│       ├── modelo_negocio_sync_dag.py # FACT_ADQUISICION/FACT_DISPONIBILIDAD (independiente, seed por semana)
│       └── finanzas_periodicas_dag.py # Renovación de suscripciones + liquidación de regalías (semanal, cron real)
├── openspec/                    # Spec Driven Development
│   ├── config.yaml              # Constitución del proyecto (stack, reglas RT-01..RT-06)
│   ├── specs/                   # Specs archivadas — 15 de 15 capabilities
│   └── changes/archive/         # Changes implementados y archivados (design.md/tasks.md por capability)
├── docker-compose.yml
└── .env                         # Variables de entorno (no versionado)
```

---

## Modelo de datos

**76 tablas físicas en ClickHouse** (verificado contra `system.tables`: 52 al cierre de S9 — 17
preexistentes al inicio de la refactorización + 30 de las 6 capabilities nuevas + 5 del cambio
`completar-modelo-base` — más 9 de `regalias`/`publicidad` cerradas en S10; el resto se agregó
durante S11: entre otras, `FACT_CANCELACION_SUSCRIPCION`, `FACT_RETIRO_REGALIA`, `DIM_EMPRESA`,
`SOLICITUD_LICENCIA`, `FACT_GASTO_OPERATIVO` y `FACT_REEMBOLSO`, más las 3 del cambio
`roles-gestion-usuarios` (`DIM_ROL_ADMINISTRATIVO`, `BRIDGE_USUARIO_ROL_ADMIN`,
`FACT_TOKEN_RECUPERACION`), `FACT_DENUNCIA` de `p1-ciclos-vida` y las 2 de
`p2-descubrimiento-comunidad` (`BRIDGE_BLOQUEO_USUARIO`, `FACT_STRIKE_USUARIO`)
— `simulacion` no agrega tabla
propia, escribe en tablas de otras capabilities). El inventario
original de **58 "tablas" del modelo dimensional del proyecto**
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

FACT_TRACKS (1.113.555 filas: 113.550 reales + sintéticos (semanas 1-11) + subidos por artistas)
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

**`regalias`/`publicidad` (9 tablas, S10 — ver
[Regalías y publicidad](#regalías-y-publicidad-modelo-de-negocio-real)):** `regalias`
(`DIM_PRODUCTOR`, `BRIDGE_PRODUCTOR_TRACK`, `DIM_CONTRATO_REGALIA`, `FACT_LIQUIDACION_REGALIA`,
`DIM_CUENTA_SELLO`); `publicidad` (`DIM_ANUNCIANTE`, `DIM_CAMPANA_PUBLICITARIA`,
`FACT_IMPRESION_ANUNCIO`, `FACT_INGRESO_PUBLICITARIO`). Ninguna tabla existente se modificó al
agregar estas dos capabilities.

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
task_bronze → task_silver → task_gold → task_synthetic → task_log
```

Portadas ya no bloquea este camino: `task_portada` corría entre `task_gold` y `task_synthetic`
hasta S11, alargando cada carga semanal 3-6 minutos por resolución externa (iTunes/Deezer); se
sacó a un DAG independiente (`reload_portadas`, ver tabla abajo) y la duración de una carga
completa bajó a ~65 segundos.

`reload_portadas` resuelve portadas reales de artistas/álbumes del catálogo base — orden de
intento distinto por entidad (iTunes primero para artistas, Deezer primero para álbumes, ambas
API sin credencial) — y persiste el resultado en `etl/gold/portadas_cache.json`, que sobrevive a
`docker compose down -v` o a una recarga que reduzca `FACT_TRACKS` a los ~113k registros
originales. Procesa 50 artistas + 50 álbumes por corrida (resolución incremental, respeta el
rate limit real de las APIs públicas). Cobertura actual: ~10.6% de artistas y ~1.6% de álbumes
con portada resuelta — limitada por el rate limit real de ambas APIs bajo uso sostenido, no por
errores de implementación (ver `docs/BITACORA_S11.md`).

Seis DAGs adicionales, independientes de `tracklytics_etl` porque cada uno cubre un dominio de
negocio ajeno al catálogo (o, en el caso de `reload_portadas`, porque bloqueaba el camino
crítico sin necesidad); todos son de disparo manual/API (`schedule_interval=None`) excepto
`finanzas_periodicas`, que corre en cron real:

| DAG | Genera | Nota |
|---|---|---|
| `reload_portadas` | Resolución de portadas reales (iTunes → Deezer) | Sacado de `tracklytics_etl` en S11 — ver nota arriba |
| `recalificacion` | Corrección en bloque de año/país/perfil de audio ya cargados, sin tocar `source_type='real'` | S11 — un `ALTER TABLE ... UPDATE` por valor distinto, no por fila |
| `engagement_referencia` | Eventos de engagement sintéticos correlacionados con popularidad | Un `Param week_number` por corrida |
| `playlists_sync` | `BRIDGE_TRACK_PLAYLIST_USUARIO` (reflejo de playlists, PocketBase → ClickHouse) | Full refresh en cada corrida; también invocable on-demand desde `/experiencia/playlists/sincronizar` |
| `modelo_negocio_sync` | `FACT_ADQUISICION`/`FACT_DISPONIBILIDAD` | Un `Param week_number` por corrida, idempotente vía `ETL_BATCH_CONTROL` |
| `finanzas_periodicas` | Renovación de suscripciones vencidas (cobro real) + `FACT_LIQUIDACION_REGALIA` del período | `schedule_interval="@weekly"`, cron real — no disparo manual; primero renueva, luego liquida con el ingreso ya actualizado |

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

**Las 15 capabilities están implementadas, verificadas end-to-end y archivadas en
`openspec/specs/`.** No hay ningún change operativo pendiente de archivar —
`openspec/changes/` solo contiene `archive/` (23 changes archivados a la fecha; `openspec
validate --specs` en verde para las 15 capabilities).

| Capability | Cerrada | Archivada en `openspec/specs/` |
|---|---|---|
| `catalogo` | S7 | ✅ |
| `suscripciones` | S7 | ✅ |
| `analitica` | S8 | ✅ |
| `ingesta` | S8 | ✅ |
| `partners` | S8 | ✅ |
| `seguridad` | S9 (refactor) | ✅ |
| `facturacion` | S9 (refactor) | ✅ |
| `creadores` | S9 (refactor) | ✅ |
| `social` | S9 (refactor) | ✅ |
| `distribucion` | S9 (refactor) | ✅ |
| `experiencia` | S9 (refactor) | ✅ |
| `regalias` | S10 | ✅ |
| `publicidad` | S10 | ✅ |
| `simulacion` | S11 | ✅ |
| `finanzas` | S11 | ✅ |

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
| S9 | QA/rendimiento del módulo operativo **+ refactorización completa hacia sistema completo** | Ver `docs/BITACORA_S9.md` (dos entregas dentro de la misma semana: seek/QA/optimización ClickHouse, y luego las 6 capabilities nuevas + migración a React + pulido final) |
| S10 | Retiro del frontend legado + modelo de negocio real (regalías/publicidad) + cierre de la capa operativa | Frontend único (React); capabilities `regalias`/`publicidad` (9 tablas, DAG `finanzas_periodicas`); 6 dashboards administrativos RT-04; sesiones activas multi-dispositivo; búsqueda avanzada; feed social; playlists colaborativas + reorder — ver resumen abajo |
| S11 | Cierre del modelo de monetización y de dinero + calidad de datos del catálogo + capability `finanzas` + tier B2B + gobierno de identidad + ciclos de vida + descubrimiento/comunidad | 9 changes de OpenSpec + 1 fix técnico directo (13 bloques); capabilities `simulacion` y `finanzas` (2 nuevas, 15 en total); publicidad display, trial + plan estudiante, churn con motivo, funnel/P&L, MRR/ARR, retiro de regalías, cambio de plan con prorrateo, dunning real, retención fiscal, país/moneda/IVA configurables; flujo de solicitud de licencia por sello; enriquecimiento de catálogo (año/país deterministas, coherencia audio-género, recalificación en bloque); gating por tier B2B (Básico/Pro/Enterprise) con 2 paneles predictivos Enterprise; 6 roles administrativos por área con gestión de usuarios (vista 360°, lockout, recuperación de contraseña, baja de cuenta); ciclos de vida de entidades de negocio (pausar/revocar/terminar/takedown/retirar, CRUD de partners, denuncias); búsqueda unificada, radio/mix diario por similitud de audio, bloqueos, strikes, verificación de email, exportación de datos — ver `docs/BITACORA_S11.md` |
| S12 | Reportes administrativos de `seguridad`/`experiencia`/`social` | 5 endpoints de solo lectura: `GET /admin/usuarios-reporte`, `GET /admin/strikes` (`seguridad`); `GET /admin/ab-tests`, `GET /admin/familias` (`experiencia`); `GET /admin/notificaciones` (`social`); 5 páginas frontend nuevas (sección "Reportes" del sidebar admin) que los consumen — ver `docs/BITACORA_S12.md` |
| S13-P1 | Auditoría completa del sistema + polish visual + mapa de objetivos | Auditoría de los 27 informes simples y CRUD administrativo (26/27 existen con datos reales); toggle grid/lista en catálogo con portadas por gradiente de género; `SkeletonLoader`/`EmptyState` compartidos aplicados de forma consistente; paleta violeta en gráficos Recharts (grid punteado, animación desactivada, botones con gradiente); persistencia de las secciones colapsables del sidebar admin; `docs/OBJETIVOS_TRACKLYTICS.md` (4 OE, 35 OT, 65 OO, matriz de trazabilidad completa) — ver `docs/BITACORA_S13.md` |
| S13-P2 | Informe faltante (sesiones activas) + patrón CRUD docente + infraestructura ClickHouse Gold | `GET /admin/sesiones-activas` (`seguridad`) + página `/seguridad/sesiones-activas` (cierra Obj 30, única brecha total de S13-P1); componentes compartidos `CrudModal`/`CrudActionButtons` (modal reutilizable con foco atrapado, Escape, fieldset readonly en modo "ver"); patrón CRUD completo (Insertar/Editar/Ver detalle/Eliminar vía modal) aplicado a Partners, Campañas publicitarias y Tickets de soporte; segunda instancia de ClickHouse (`clickhouse-gold`, puerto 8124, base `tracklytics_gold` vacía — tablas y DAGs en P3) con módulo de conexión propio (`api/core/database_gold.py`) — ver `docs/BITACORA_S13.md` |
| S13-P3a | Capa Gold: 13 tablas + DAG de agregación + 30 endpoints de informes compuestos (solo backend) | `create_gold_tables.py` (13 tablas `GOLD_*` en ClickHouse Gold, real-primero-demo-después con columna `es_estimado`); `etl/gold_ch/` (12 módulos de agregación, incluida regresión lineal para proyecciones) + `dag_gold_aggregations.py` (idempotente por período ISO-semana); paquete `api/paquetes/reportes/` con los 30 endpoints `GET /app/v1/reportes/compuestos/<departamento>/<informe>`, gateados por rol administrativo departamental — los 30 verificados con curl real, datos no vacíos. Frontend de estos informes queda para P3b — ver `docs/BITACORA_S13.md` |
| S13-P3b | Frontend de los 30 informes compuestos (solo frontend) | 6 componentes plantilla reutilizables (`ReportLayout`/`KpiCards`/`TrendChart`/`RankingTable`/`DistributionChart`/`PredictionChart` en `shared/components/reportes/`) + hook `useCompoundReport`; 30 configuraciones (`departamento`/`informe`/`render`) agrupadas en 9 archivos por departamento en vez de 30 páginas monolíticas, servidas por una única ruta genérica `/reportes/:departamento/:informe`; submenú "Informes Compuestos" anidado en la sección "Reportes" del sidebar admin (9 grupos colapsables); verificado con Playwright (sidebar, filtro de período, badge "Datos estimados", C07/C14/C17 con datos y gráficos reales) — ver `docs/BITACORA_S13.md` |
| S13-P4 a P8 | Auditoría de re-clon, perf de catálogo, sidebar/PDF/perf, mejoras B2C de catálogo | Ver `docs/BITACORA_S13.md` y `AUDITORIA_S13.md` para el detalle fase por fase (no resumido acá) |
| S14-P1 a P4 | Grano temporal configurable en Gold + API; datos reales de 24 meses (elimina `rng_for()`) + 7 cuentas demo por rol; correcciones de arranque limpio (credenciales por env var, auto-siembra de cuentas, mapeo monto→plan, densidad de regalías, generación bajo demanda con relleno de huecos) | Ver `docs/BITACORA_S14.md` (bloques P2/P3/P4) |
| S14-P5 | Selector de granularidad en el frontend de los 30 informes compuestos (backend ya listo desde P2); corrección de exportación PDF (filtros excluidos de la captura, botón nuevo en el dashboard ejecutivo); fallback de plan más cercano en el mapeo monto→plan; pulido visual puntual; **dos bugs de gating admin encontrados y corregidos por verificación real en navegador (Playwright), invisibles a cualquier verificación por `curl`**: `RequireAuth` bloqueaba `/seguridad`/`/reportes` a las 6 cuentas admin_* de demo (comparaba contra el `role` crudo de PocketBase, no contra `BRIDGE_USUARIO_ROL_ADMIN`); `require_b2b_panel_access`/`require_staff` de `analitica` no tenían el mismo fallback que `require_rol_admin`, bloqueando el dashboard ejecutivo a la propia cuenta superadmin | Ver `docs/BITACORA_S14.md` (bloque P5) |
| S14-FINAL | **Balanced Scorecard estratégico** (`GET /analitica/bsc/resumen`, 4 perspectivas × 2 KPIs sobre 6 tablas Gold reales, `/analitica/bsc` en el frontend); sidebar administrativo dinámico por rol real (leído directamente del `require_rol_admin` de cada capability backend, no asumido); landing post-login propia por rol (`superadmin`/`analyst` → dashboard ejecutivo, cada rol de área → su panel); badge de rol visible en header y sidebar; fix de un bug latente en `RequireAuth` con roles combinados; glassmorphism/sparklines/charts premium/skeleton shimmer en el design system; fix real de exportación PDF (page breaks que respetan filas de tabla — `page-break-inside` de CSS no aplica al pipeline html2canvas+jsPDF, se implementó detección real de límites de fila); **se evitó activamente una regresión de bundle de +43kB gzip** (`framer-motion` para transiciones de página, reemplazado por CSS puro). Auditoría real encontró 2 gaps de datos sin arreglar (cobertura de licencias por territorio ~0%, resolución de portadas de artista en 0% — ver bitácora) | Ver `docs/BITACORA_S14.md` (bloque S14-FINAL) |
| S16 | Paginación real en 5 listados admin (tickets, transacciones recientes/por-usuario, anunciantes, campañas, strikes globales); resolución de IDs a nombre/email real en comentarios (`social`, JOIN a `FACT_TRACKS`/`DIM_ARTISTS`) y suscripciones admin (batch a `DIM_USUARIO`, sin N+1); fix de doble encabezado en exportación PDF (`data-pdf-export-ignore` en el header de `ReportLayout`); 14ª tabla Gold **`GOLD_CREADORES_PERIODO`** (grano por `cuenta_artista_id`, "activo" = ≥1 subida en `FACT_SUBIDA_TRACK` en el período) + módulo `etl/gold_ch/creadores.py` + KPI real `_kpi_retencion_creadores()` en el BSC (perspectiva Cliente/OE5, reemplaza el `sin_datos` que traía desde S14-FINAL — overlap de creadores activos trimestre-sobre-trimestre, mismo patrón que `_kpi_retencion_b2b`). "Respuesta a decisiones estratégicas" (OE4) queda `sin_datos` a propósito: es una métrica de gobernanza que ningún pipeline puede medir, no un gap pendiente | Ver `docs/BITACORA_S16.md` |

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

Resumen de S10 (cierre de la capa operativa, 4 días):
- **Retiro completo del frontend legado (`app/`):** React queda como único frontend del
  proyecto; ya no se levanta ningún servicio adicional en Docker para él.
- **`regalias` y `publicidad` (2 capabilities nuevas, 9 tablas):** liquidación real de regalías
  por período (pool de transacciones + ingreso publicitario, repartido pro-rata por streams
  reales) y publicidad con CPM real e ingreso reconocido en el momento — ver
  [Regalías y publicidad](#regalías-y-publicidad-modelo-de-negocio-real). DAG `finanzas_periodicas`
  (cron real semanal) conecta ambas: renueva suscripciones cobrando de verdad y luego liquida.
- **6 dashboards administrativos (RT-04)** para las capabilities de negocio que no tenían panel
  visual — ver [Dashboards administrativos](#dashboards-administrativos-rt-04).
- **Sesiones activas multi-dispositivo**, **búsqueda avanzada de catálogo** (popularidad/tempo/
  energy), **feed de actividad social** y **playlists colaborativas + reorder** (con
  invitación/remoción de colaboradores por correo).
- **Auditoría final de cierre:** se encontraron y corrigieron dos bugs de integridad preexistentes
  en PocketBase (no introducidos en S10, expuestos por la propia auditoría) — `eliminar_playlist`
  fallaba con 500 para cualquier playlist con tracks, y borrar un usuario con playlists propias
  fallaba de la misma forma; ambos corregidos con `cascadeDelete` real en las relations
  `playlists.user` y `playlist_tracks.playlist` (antes en `False`), más una cascada manual en
  `pb_playlists.eliminar()` para el camino que pasa por la API. Se auditó también el patrón de
  fondo (PocketBase devuelve 404, no 403, cuando una regla de update/delete rechaza la
  operación) en el resto de paquetes que hablan directo con PocketBase — sin otro caso hoy
  alcanzable por un usuario no-dueño, porque ninguna otra colección tiene todavía una feature
  multi-usuario compartida como los colaboradores de playlist.

Resumen de S11 (cierre del modelo de dinero + calidad de catálogo + tier B2B + gobierno de
identidad + ciclos de vida + descubrimiento/comunidad, 13-22 jul, detalle completo en
`docs/BITACORA_S11.md`):
- **Monetización y retención:** publicidad display (además de audio), churn con motivo
  auditable, trial de 7 días + plan estudiante, funnel de conversión y P&L consolidado en
  `analitica`; bug real corregido (`admin` podía suscribirse y facturar como B2C).
- **Modelo financiero cerrado:** liquidación de regalías idempotente, cancelación automática en
  cobro de renovación fallido, retiro de ganancias (`FACT_RETIRO_REGALIA`), MRR/ARR en vivo.
- **Capability `simulacion` (14ª):** panel admin-only que genera streams + suscripciones +
  impresiones publicitarias en la misma ventana de tiempo y liquida el período resultante, para
  demostrar el flujo de dinero de punta a punta sin operar la app manualmente a escala.
- **Calidad de datos del catálogo:** año/país deterministas por hash (ya no `0`/`""` sin
  informar), perfil de audio sintético calculado empíricamente por género (ya no un pool global
  sin relación con el género), recalificación administrativa en bloque de lo ya cargado, mismo
  criterio en la subida de tracks por artistas.
- **6 hallazgos de una revisión manual de producto**, corregidos: exención de anuncios para
  artistas aprobados, disclosure de fecha de cobro antes de confirmar el trial, disponibilidad de
  catálogo por país como lista navegable (más un bug real de ClickHouse —
  `join_use_nulls`— encontrado en el camino), moneda incorrecta fija en facturas (dos vistas),
  tags de stack técnico reemplazados por mensajes de producto en el login.
- **Información de empresa editable** (`DIM_EMPRESA`) en el encabezado de facturas, antes
  hardcodeada.
- **Sesión autónoma de 10 fases:** cierre de deuda de 3 changes sin archivar, eliminación de IDs
  crudos en formularios admin, flujo de solicitud de licencia por sello, visibilidad de datos
  generados por semana, reporte de regalías por contrato, checkout de pago más realista sin
  persistir datos sensibles, 4 visualizaciones nuevas en el dashboard ejecutivo, `task_portada`
  sacada del camino crítico del DAG principal (~3-6 min → 65s), carga completa hasta semana 11
  (1.113.550 registros), constitución del proyecto actualizada.
- **Capability `finanzas` (15ª, cierre de semana):** gastos operativos, reembolsos validados
  contra `FACT_TRANSACCION_PAGO`, cuentas por cobrar/pagar, tracking de presupuesto de campañas
  con alerta 80%/100% y pausa automática, indicadores empresariales, alertas administrativas y
  dashboard/reporte financiero consolidado — compuesto sobre `v1_pnl` y el resto del dato ya
  existente, sin duplicar lógica. Primera suite de pytest del proyecto (26/26). Exportación
  PDF/Excel quedó fuera de esta entrega (documentado, no pendiente por descuido).
- **Panel admin de `finanzas` (React)**, en una segunda pasada la misma semana: 8 vistas
  (`/seguridad/finanzas`) — dashboard, gastos, reembolsos, cuentas por cobrar/pagar, presupuesto
  de campañas, indicadores, alertas, reporte — con foco explícito en gráficos no convencionales en
  vez del bar/donut por defecto del resto del proyecto: un anillo de progreso (`RadialGauge`) para
  margen/% de presupuesto consumido (incluida una grilla de un gauge por campaña), un treemap para
  gasto por categoría, una dispersión monto×fecha para detectar reembolsos elevados como outliers,
  y un radar de proporciones (%) para los indicadores del periodo. Verificado con Playwright real
  contra el stack levantado (`docker compose` + `npm run dev`), sesión admin real creada con
  `pb_client.crear_usuario(rol="admin")`: las 8 pestañas cargan sin errores de consola, y un ciclo
  completo de alta de gasto (formulario → tabla) confirmado end-to-end.
- **Gating por tier B2B en `analitica`** (16 jul): Básico/Pro/Enterprise real (no solo suscripción
  activa), con 2 paneles predictivos exclusivos Enterprise (proyección de tendencia de género y de
  trayectoria de artista, regresión lineal simple, `numpy.polyfit`).
- **Modelo financiero, huecos finales** (16 jul, mismo día): cambio de plan con prorrateo, dunning
  real (3 intentos, degradación B2C→free / cancelación B2B), retención fiscal en liquidación de
  regalías, país/moneda/IVA/precios de plan configurables sin tocar código.
- **Gobierno de identidad y autorización** (16–17 jul): 6 roles administrativos por área
  (`require_rol_admin`), reemplazando el check monolítico `role=="admin"` en ~50 endpoints; gestión
  de usuarios con vista 360°, suspender/reactivar; lockout por intentos fallidos; recuperación de
  contraseña simulada; baja de cuenta propia.
- **Ciclos de vida de entidades de negocio** (18 jul): pausar/reanudar/finalizar campañas, revocar
  licencias, editar/terminar contratos de regalías, takedown de catálogo, editar/retirar tracks de
  artista, CRUD de partners con rotación de API key, administración de suscripciones, denuncias de
  contenido con bandeja de moderación.
- **Descubrimiento y comunidad** (19 jul): búsqueda unificada multi-entidad; radio por canción y
  mix diario determinista por similitud de audio calculada en SQL (sin ML externo); recomendaciones
  por afinidad con motivo explicable; bloqueo entre usuarios; strikes con suspensión automática a
  los 3; verificación de correo simulada; exportación de datos personales.
- **Cierre técnico: reproducción real de YouTube** (19–22 jul): `listType: 'search'` (deprecado por
  YouTube en 2020) reemplazado por resolución de `videoId` vía YouTube Data API v3 desde el
  backend; corregido en el camino un crash de React por reconciliar un nodo que la IFrame API ya
  había reemplazado, y el audio quedando sonando tras el logout.

---

## Decisiones técnicas clave

- **threading.local para ClickHouse** — cada thread de Uvicorn tiene su propio cliente para
  evitar errores de consultas concurrentes.
- **Cache TTL** — los endpoints analíticos pesados usan caché (en memoria o `use_query_cache`
  de ClickHouse) para evitar re-ejecutar JOINs pesados en cada request.
- **Idempotencia ETL** — `ETL_BATCH_CONTROL` verifica si una semana ya fue cargada antes de
  insertar; guard adicional por `source_type='real'` en `FACT_TRACKS` tras el incidente de
  duplicación (ver `docs/BITACORA_S10.md`).
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
