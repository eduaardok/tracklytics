# Bitácora S11 · P1 — Ciclos de vida de entidades de negocio

Change OpenSpec: **`p1-ciclos-vida`** (archivable como `2026-07-18-p1-ciclos-vida`).
Fecha: 2026-07-18.

El sistema sabía **crear** casi todas sus entidades de negocio pero no **operarlas a lo largo de su ciclo de vida**. Este bloque cierra esos huecos sin crear paquetes ni capabilities nuevas: cada pieza extiende un paquete existente. Toda acción administrativa se autoriza con el rol de área de `roles-gestion-usuarios` (`require_rol_admin`) y se audita en `FACT_AUDIT_LOG`. Todo movimiento de datos ocurre desde Python (RT-01).

## 1. Tablas y columnas nuevas

### ClickHouse (`tracklytics`) — en `init_clickhouse.py` (idempotente, `docker compose up` las crea sin pasos manuales)

| Objeto | Cambio |
|---|---|
| `FACT_DENUNCIA` | **Tabla nueva** (ReplacingMergeTree(actualizado_en) ORDER BY denuncia_id): denuncia_id, denunciante_id, tipo_objeto, objeto_id, motivo, descripcion, estado, created_at, actualizado_en |
| `DIM_CAMPANA_PUBLICITARIA.formato` | `String DEFAULT 'display'` — atributo comercial editable (audio/display/banner); retro-relleno desde `tipo_anuncio` |
| `DIM_CAMPANA_PUBLICITARIA.estado_manual` | `String DEFAULT ''` — pausa/cierre manual (`''`/`pausada`/`finalizada`), independiente de `activa` (presupuesto) |
| `FACT_TRACKS.disponible` | `UInt8 DEFAULT 1` — takedown de catálogo (soft-delete) |
| `DIM_ANUNCIANTE.activo` | `UInt8 DEFAULT 1` — desactivación de anunciantes |
| `DIM_LICENCIA.estado` | `MODIFY` enum → añade `'revocada'=4` |
| `DIM_LICENCIA.motivo_revocacion` / `fecha_revocacion` | `String DEFAULT ''` / `Nullable(DateTime)` |
| `STG_ARTIST_UPLOADS.descripcion` | `String DEFAULT ''` — metadata editable de tracks de artista |
| `DIM_ESTADO_REVISION` | Semilla del estado `retirado` (id 4), idempotente para instalaciones existentes |

### PocketBase — en `pb_init.py` (idempotente vía `ensure_collection_field`)

| Colección | Campo nuevo |
|---|---|
| `partners` | `api_key_hash` (text), `email_contacto` (text) |
| `suscripciones` | `fecha_vencimiento` (date) |

## 2. Endpoints agregados por capability

- **publicidad** — `PUT /admin/campanas/{id}`, `POST /admin/campanas/{id}/pausar`, `.../reanudar`, `.../finalizar`, `PUT /admin/anunciantes/{id}`, `POST /admin/anunciantes/{id}/desactivar` (`admin_finanzas`).
- **distribucion** — `POST /licencias/{id}/revocar` (`admin_contenido`).
- **regalias** — `PUT /admin/contratos/{id}`, `POST /admin/contratos/{id}/terminar`, `GET /admin/contratos/{id}/exportar` (`admin_finanzas`).
- **catalogo** — `POST /admin/tracks/{fact_id}/ocultar`, `.../restaurar` (`admin_contenido`); filtrado `disponible = 1` en `/tracks/top`, `/tracks/search`, by-artist/album/genre, detalle y detalle-by-fact.
- **creadores** — `PUT /tracks/{subida_id}`, `POST /tracks/{subida_id}/retirar` (`require_cuenta_artista_aprobada`, solo tracks propios).
- **partners** — `POST /app/v1/partners/admin` (crear), `GET /app/v1/partners/admin` (listar), `POST .../admin/{id}/rotar-key`, `POST .../admin/{id}/desactivar` (`admin_comercial`).
- **suscripciones** — `GET /admin/suscripciones`, `GET /admin/suscripciones/{id}`, `POST .../cancelar`, `POST .../extender` (`admin_comercial`).
- **social** — `POST /denuncias` (`require_b2c_user`), `GET /admin/denuncias`, `PUT /admin/denuncias/{id}` (`admin_comunidad`).
- **finanzas** — `GET /reporte` (consolidado por período) **ya existía**; satisface el requisito de 2.9 sin endpoint duplicado.

## 3. Decisiones de diseño

1. **Doble estado de campaña**: `activa` (presupuesto) y `estado_manual` (pausa/cierre manual) son ejes independientes. Elegibilidad de servido = `activa = 1` Y `estado_manual = ''`. `finalizar` es terminal (409 al reanudar/pausar una finalizada). Así no se colapsan "sin presupuesto", "pausada a mano" y "cerrada" en un solo flag.
2. **`formato` vs `tipo_anuncio`**: `formato` (audio/display/banner) es descriptivo/comercial y editable; `tipo_anuncio` sigue gobernando el canal técnico de servido. Editar `formato` sincroniza `tipo_anuncio` (banner → display). No se rompió el servido existente.
3. **Partners en PocketBase, API key hasheada**: los partners viven **solo en PocketBase** (no en ClickHouse); el CRUD opera vía `pb_client` con token de superusuario (RT-01). La API key se guarda como **hash SHA-256** en `api_key_hash`; la key en claro se devuelve **una sola vez** al crear/rotar. El campo `api_key` (requerido por el esquema) recibe un placeholder no-recuperable en partners creados desde el sistema. `find_by_api_key` hashea la key recibida y busca por `api_key_hash`, con **fallback** a `api_key` en claro para los 2 partners demo legados (sin migración destructiva). Tiers en español (`basico|pro|enterprise`), consistentes con `TIER_RANK` ya desplegado. **Nota**: la resolución partner→tier tiene un caché TTL de 30 s en `deps.py`; tras rotar/desactivar, la key vieja puede seguir aceptándose hasta 30 s (verificado: a los 31 s → 401).
4. **Takedown por track_id**: un track existe como N filas en `FACT_TRACKS` (una por género); ocultar/retirar aplica `disponible = 0` a **todas** las filas del `track_id` (localizado por el `fact_id` de la ruta) para que desaparezca de verdad de la búsqueda (que dedup por track_id).
5. **Contratos de regalías**: el PUT acepta los splits granulares reales (`pct_master_*`, `pct_publishing_*`, `vigente_hasta`), fusiona con los valores actuales y revalida la invariante de creación (cada split suma 100). `terminar` usa `activo = 0` + `vigente_hasta = today()` (sin columna `estado` nueva); las queries de liquidación ya filtran `activo = 1`.
6. **Edición de track de artista**: al editar un track `aprobado` vuelve a `pendiente` (revisión editorial). Las transiciones insertan una fila nueva en `FACT_SUBIDA_TRACK` con `version = max+1` para ganar el `argMax(estado, version)` de forma determinista (las transiciones originales usaban `version = 0`).
7. **Denuncias**: no ejecutan acción automática sobre el objeto; solo alimentan la bandeja de moderación. Cancelación administrativa de suscripción se registra en `FACT_CANCELACION_SUSCRIPCION` con motivo `'otro'` (el enum es cerrado); el motivo libre del admin queda en la auditoría.

## 4. Verificación (curl real, ClickHouse `tracklytics`)

Todas las cuentas de prueba se crearon con `pb_client.crear_usuario` (admin `p1admin@test.com`, user `p1user@test.com`, artista `p1artist@test.com`). Login: `POST /app/v1/seguridad/auth/login` (requiere `dispositivo_id`).

| Flujo | Resultado |
|---|---|
| Campaña: crear → pausar → reanudar → editar (formato/presupuesto) → finalizar → reanudar finalizada | `pausada` → `''` → ok → `finalizada` → **409** ✓ |
| Anunciante: desactivar | `activo = 0` ✓ |
| Licencia: crear → revocar → revocar de nuevo | `revocada` → **409** ✓ |
| Contrato: crear → editar % inválido → editar válido → terminar → terminar de nuevo → exportar | **422** → ok → `terminado` → **409** → JSON con contrato+resumen+liquidaciones ✓ |
| Track catálogo: ocultar → buscar → restaurar → buscar | desaparece de search (total 0) → reaparece ✓ |
| Artista: aprobar → editar (vuelve a `pendiente`, nombre+desc actualizados) → retirar | `pendiente` → `retirado`, `disponible = 0` en FACT_TRACKS ✓ |
| Partner: crear → key funciona (200) → listar (sin key/hash) → rotar → (31 s) key vieja **401**, key nueva **200** → desactivar | ✓ |
| Suscripciones: listar (total 77) → extender 30d → detalle (fecha_vencimiento + cobros) | ✓ |
| Usuario: denunciar track → admin lista pendientes → marca revisada | `pendiente` → `revisada` ✓ |

## 5. Estado de las portadas al cerrar la sesión

El DAG `reload_portadas` se disparó al inicio (PASO 0). Estaba **pausado**; se despausó y ejecutó ~5 min (`success`). Pero el DAG solo procesa `_BATCH_LIMIT = 50` por corrida — no vacía el backlog.

Universo a cubrir: solo las **~89,741 canciones reales** (`source_type = 'real'`); las sintéticas del pipeline no llevan portada y el resolver ya las excluye. Para vaciar ese backlog se lanzó en background el script standalone `gold.backfill_portadas` (`resolver_portadas_tracks_spotify_todas`), pensado para correr horas desatendido — secuencial (concurrencia=1 + pausa de 1.5 s/req) porque Spotify oEmbed bloquea la IP con 429 ante paralelismo. Ritmo observado: ~2,000 tracks/h (primer lote 60/60 limpio). Estimación del propio código: ~45 h para las 89.7k; válvula de corte a 9 h. Reanudable (`WHERE imagen_url IS NULL`, escribe por lote). Cobertura al cerrar la sesión: **~266 tracks reales** y subiendo; artistas ~47% (14,024/29,863), álbumes ~7% (3,356/46,596). Queda corriendo — **no está completo** y no cabe al 100% en una sola ventana de 7 h.

## 6. Frontend (sistema de diseño Impeccable)

Implementado por completo. `npm run build` **verde**; `tsc --noEmit` sin errores en los archivos tocados (los 3 errores restantes viven en `analitica/EngagementPage.tsx`, preexistentes y ajenos a este cambio). Contenedor `frontend-react` reconstruido y sirviendo; rutas SPA nuevas responden 200.

**Archivos nuevos:**
- `catalogo/pages/AdminTracksPage.{tsx,module.css}` — takedown: buscar+ocultar, lista de ocultos+restaurar.
- `partners/pages/AdminPartnersPage.{tsx,module.css}` — CRUD + rotar/desactivar, panel de revelación de API key (una vez).
- `partners/api/partnersAdmin.api.ts`.
- `suscripciones/pages/AdminSuscripcionesPage.{tsx,module.css}` — listado con filtros, detalle con cobros, cancelar/extender.
- `social/components/DenunciarButton.{tsx,module.css}` — botón + modal reutilizable de denuncia.

**Archivos modificados:**
- `publicidad/PublicidadAdminPage` — Pausar/Reanudar/Finalizar + badge de estado + modal de edición; Desactivar anunciante.
- `distribucion/components/LicenciasTab` — botón Revocar + modal de motivo.
- `regalias/RegaliasAdminPage` — Editar (modal de porcentajes) / Terminar / Exportar (descarga JSON) por contrato.
- `creadores/CuentaArtistaPage` — Editar (modal) / Retirar por track propio.
- `social/TrackSocialPage` — botón Denunciar en cada comentario y en el track; `social/ModeracionSocialPage` — bandeja de denuncias con filtros y acciones Revisada/Resuelta.
- Backend de apoyo: `GET /admin/tracks/ocultos` (catalogo) para poder restaurar tracks que ya no aparecen en la búsqueda.
- Rutas (`app/router.tsx`) y navegación (`app/layout/SeguridadShell.tsx`): `/seguridad/catalogo`, `/seguridad/suscripciones`, `/seguridad/partners/gestion`.

**Nota de diseño:** todos los diálogos usan un modal propio con backdrop (`position: fixed`, z-index de modal) para escapar el `overflow` de las tablas; las confirmaciones destructivas simples (finalizar campaña, terminar contrato, retirar track, rotar/desactivar partner) usan el `ConfirmProvider` existente. Badges de estado, botones fantasma y modales siguen los tokens del sistema (`--color-*`, `--space-*`, `--radius-*`).

## 7. Archivos tocados (backend)

- `init_clickhouse.py`, `pb_init.py`
- `api/paquetes/publicidad/{router,queries}.py`
- `api/paquetes/distribucion/{router,queries}.py`
- `api/paquetes/regalias/{router,queries}.py`
- `api/paquetes/catalogo/{router,queries}.py`
- `api/paquetes/creadores/{router,queries}.py`
- `api/paquetes/partners/{router,pb_client}.py`
- `api/paquetes/suscripciones/{router,pb_client}.py`
- `api/paquetes/social/{router,queries}.py`
- `openspec/changes/p1-ciclos-vida/**` (proposal, design, tasks, 9 delta specs) — `openspec validate --strict`: **valid**.
