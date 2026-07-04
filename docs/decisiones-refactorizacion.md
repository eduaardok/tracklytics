# Tracklytics — Log de decisiones: refactorización hacia sistema completo

Fecha de inicio: 30 de junio 2026
Propósito: ancla de contexto para `openspec propose`, implementación en Claude Code, y
consolidación de documentación (Word). Cada decisión incluye el motivo, para no perder el
razonamiento entre esta conversación y las sesiones de ejecución.

---

## 1. Origen del cambio de alcance

El docente revisó las presentaciones de mitad de semestre y señaló que el enfoque general del
curso era demasiado mínimo. Usó como ejemplo a un compañero que debía construir un sistema tipo
e-commerce y se había limitado a lo mínimo indispensable. Indicó que:

- La parte **operativa** del sistema debe estar completa (no solo lo mínimo para que corra).
- La parte **táctica** (analítica, dashboards) y **estratégica** (predicciones con IA) vienen
  después, hacia el final del semestre.
- Como referencia de magnitud, mencionó que una IA consultada por el otro grupo estimó ~80-100
  tablas para un sistema de e-commerce completo, y que limitarlo a ~50 es razonable para el
  contexto académico.
- **Aclaración explícita del usuario:** 50 no es un mínimo exacto. Un rango de 40-60 tablas está
  bien. El criterio real es que el sistema esté completo, no que se quede corto.

Tracklytics no fue revisado directamente por el docente en esta ronda, pero el criterio aplica
igual al proyecto.

---

## 2. Conteo de partida (antes de la refactorización)

No se partía de 15 tablas como sugería la primera versión de las instrucciones. Ya existían 28
tablas documentadas entre S6 (TA) y S7 (GA):

- 15 técnicas de catálogo (11 DIM + 1 FACT + 3 infraestructura)
- 13 de negocio (6 FACT + 7 DIM), documentadas en S6 pero no necesariamente implementadas todas

**Decisión:** partir de 28, no de 15, al calcular cuántas tablas nuevas se necesitan.

---

## 3. Meta final de tablas: 59

Rango objetivo: 40-60. Se aterrizó en 59 (28 existentes + 31 nuevas) porque cada tabla nueva
tiene justificación funcional directa — no se agregó nada solo para llegar a un número.

Si en algún punto se necesita recortar hacia el centro del rango, los candidatos de menor
prioridad son (en orden): `FACT_AB_TEST_EXPOSICION`, `BRIDGE_SUSCRIPTOR_FAMILIA`, y colapsar el
trío de restricción regional (`DIM_TIPO_RESTRICCION` / `BRIDGE_RESTRICCION_TRACK` /
`FACT_RESTRICCION_REPRODUCCION`) en una sola tabla.

---

## 4. Por qué se fuerzan tablas OLTP dentro de ClickHouse

El docente preguntó explícitamente si el modelo se podía manejar todo por PocketBase (relacional)
y respondió que no — que se use ClickHouse (lo que le tocó a este grupo por asignación del
curso) precisamente para que encuentren las dificultades de usar una base columnar en dominios
transaccionales, y que eso se documente y analice como parte del aprendizaje. Cuando se pase a
la parte táctica (analítica pura), ClickHouse va a ser la herramienta correcta y el trabajo será
más simple, porque es para lo que está diseñada.

**Decisión:** la capability `seguridad` (usuarios, sesiones, permisos, auditoría, errores) y
`facturacion` (pagos, transacciones, invoices) se implementan en ClickHouse a propósito, no en
PocketBase, aunque el patrón de acceso sea transaccional. Se documenta explícitamente como
decisión pedagógica deliberada (no como error de arquitectura) en una sección dedicada del
diseño técnico.

**Excepción real, no forzada:** el catálogo (PocketBase) y el staging de subidas de artistas
(`STG_ARTIST_UPLOADS`, ver punto 6) sí tienen razones técnicas legítimas para su ubicación —
esas no se fuerzan, se explican por su naturaleza.

---

## 5. Qué le falta a Tracklytics para "sentirse como Spotify real"

Se identificaron seis vacíos funcionales frente a un Spotify real, y se les asignó una capability
OpenSpec cada uno:

| Vacío identificado | Capability |
|---|---|
| Sin identidad de usuario robusta, sin control de acceso granular, sin auditoría | `seguridad` |
| Sin pagos ni facturación real (más allá del estado de la suscripción) | `facturacion` |
| Sin forma de que un artista suba su propia música | `creadores` |
| Sin funciones sociales (seguir, comentar, compartir) | `social` |
| Sin modelado de mercado/licencias/restricciones geográficas | `distribucion` |
| Sin telemetría de consumo real (reproducción, recomendaciones, soporte) | `experiencia` |

---

## 6. Flujo de subida de tracks por artistas (`creadores`)

Restricción de arquitectura que había que resolver: PocketBase es inmutable desde el frontend, y
todo movimiento de datos debe pasar por Python (RT-01). Una subida de artista es una escritura
nueva al catálogo, así que no puede ir directo a PocketBase ni directo a `FACT_TRACKS`.

**Decisión confirmada:** tabla de staging separada, `STG_ARTIST_UPLOADS` (paralela a
`STG_RAW_TRACKS` pero para uploads en vez de cargas semanales del dataset base).

Flujo: artista sube desde frontend → Python valida → insert en `STG_ARTIST_UPLOADS` con
`DIM_ESTADO_REVISION = pendiente` → admin aprueba/rechaza → si se aprueba, ETL en Python
promueve el registro a `FACT_TRACKS` con `source_type = 'user_uploaded'`.

---

## 7. Cambio de `is_synthetic` a `source_type`

El booleano `is_synthetic` en `FACT_TRACKS` ya no alcanza porque ahora hay tres orígenes
posibles de un track: dataset real, generación sintética semanal, y subida de artista.

**Decisión:** reemplazar `is_synthetic` (boolean) por `source_type` (enum:
`real | synthetic | user_uploaded`). Esto es un breaking change sobre lo ya implementado —
cualquier query o vista que filtre por `is_synthetic=true/false` necesita migrarse a
`source_type='synthetic'` / `source_type='real'`.

**Decisión confirmada:** reemplazo directo, no conviven ambos campos. Mantener `is_synthetic` en
paralelo con `source_type` sería redundante (la misma información en dos formas) y generaría
inconsistencias si se actualiza uno y no el otro. Cualquier query, vista o endpoint que filtre por
`is_synthetic=true/false` se migra a `source_type='synthetic'` / `source_type='real'` en el mismo
cambio que se aplique a `FACT_TRACKS`.

---

## 8. Estructura de capabilities OpenSpec

Se parte de 5 capabilities existentes y archivadas: `catalogo`, `suscripciones`, `analitica`,
`partners`, `ingesta`.

Se agregan 6 nuevas, con naming corregido para seguir el patrón de sustantivo simple sin guion
(igual que las existentes):

| Nombre descartado | Nombre final | Motivo del cambio |
|---|---|---|
| `creador-artista` | `creadores` | Redundante + rompía el patrón sin guion |
| `operativo-oltp` | `seguridad` | Mezclaba español con sigla técnica; "operativo" ya se usa como clasificación general del sistema (operativo/táctico/estratégico), reutilizarlo aquí genera ambigüedad |
| `catalogo-extendido` | `distribucion` + `experiencia` | Capability sobrecargada (12 tablas de dominios distintos); se dividió en mercado/licencias vs. consumo/telemetría |
| `social` | `social` | Sin cambio, ya seguía el patrón |
| `facturacion` | `facturacion` | Sin cambio, ya seguía el patrón |

**Total: 11 capabilities** (5 existentes + 6 nuevas).

### Tablas por capability nueva

**`seguridad`:** DIM_USUARIO, DIM_DISPOSITIVO, FACT_SESION, FACT_PERMISO_USUARIO,
FACT_AUDIT_LOG, FACT_ERROR_SISTEMA

**`facturacion`:** DIM_METODO_PAGO, FACT_TRANSACCION_PAGO, FACT_INVOICE
(no duplica FACT_SUSCRIPCION / DIM_PLAN_SUSCRIPCION, ya existentes en el modelo de negocio base)

**`creadores`:** DIM_CUENTA_ARTISTA, FACT_SUBIDA_TRACK, DIM_ESTADO_REVISION,
STG_ARTIST_UPLOADS (infraestructura)

**`social`:** BRIDGE_SEGUIMIENTO_ARTISTA, FACT_COMPARTICION, FACT_COMENTARIO,
DIM_TIPO_INTERACCION_SOCIAL

**`distribucion`:** DIM_PAIS, DIM_SELLO_DISCOGRAFICO, DIM_LICENCIA, DIM_TIPO_RESTRICCION,
DIM_CANAL_DISTRIBUCION, FACT_RESTRICCION_REPRODUCCION, BRIDGE_RESTRICCION_TRACK

**`experiencia`:** FACT_REPRODUCCION_EVENTO, FACT_IMPRESION_RECOMENDACION,
FACT_TICKET_SOPORTE, FACT_AB_TEST_EXPOSICION, BRIDGE_ARTISTA_GENERO,
BRIDGE_TRACK_PLAYLIST_USUARIO, BRIDGE_ARTISTA_ALBUM, BRIDGE_USUARIO_DISPOSITIVO,
BRIDGE_SUSCRIPTOR_FAMILIA

### Orden de implementación confirmado

`seguridad` → `facturacion` → `creadores` → `social` → `distribucion` → `experiencia`

Motivo del orden: `seguridad` es prerequisito de todo lo demás (usuarios reales); `facturacion`
depende de usuarios; `creadores` y `social` dependen de usuarios y del catálogo existente;
`distribucion` y `experiencia` son las más independientes, quedan al final.

---

## 9. Frontend: migración a React + Vite

**Decisión:** se elimina la restricción de HTML/CSS/JS vanilla + Bootstrap 5. Nuevo stack:
React + Vite. Implica cambiar el Dockerfile del frontend a build multi-stage (compilación en una
etapa, servido estático por Nginx en producción).

**Decisión de secuencia:** no se rediseña todo el frontend de una vez ni se deja para el final.
Se define el sistema de diseño (tokens, layout, componentes base) una sola vez, antes de la
primera capability nueva, y se aplica de forma incremental en cada capability según se
implementa. Esto evita construir cada pantalla dos veces.

⚠️ **Pendiente:** el usuario mencionó querer aplicar una skill externa (`pbakaus/impeccable`) en
Claude Code para mejorar el diseño. No se tiene contexto de qué hace exactamente esa skill —
confirmar su función antes de que condicione decisiones del sistema de diseño.

---

## 10. Estrategia de documentación

Documentación en paralelo con la implementación, no al final:

- Cada capability genera sus propios artefactos OpenSpec (spec.md, design.md, tasks.md) al
  aplicarse.
- Al archivar cada capability, se redacta la sección correspondiente de documentación de negocio
  (siguiendo la regla ya existente: nunca mencionar mecanismos sintéticos en documentos de
  negocio).
- Consolidación final en Word al cerrar las 6 capabilities nuevas (Fase 7 del plan de acción),
  incluyendo actualización de diagramas UML/Excalidraw — los existentes son anteriores a la capa
  B2B2C y no deben reutilizarse sin evaluación.

---

## 11. Plan de acción — fases

0. Actualizar instrucciones de proyecto (este cambio) + definir sistema de diseño base
1. Capability `seguridad`
2. Capability `facturacion`
3. Capability `creadores`
4. Capability `social`
5. Capability `distribucion`
6. Capability `experiencia`
7. Consolidación documental (Word, diagramas)
8. Pulido final P4 (responsive, manejo de errores, video)

Cada capability sigue el ciclo: `openspec propose` → revisar spec.md/design.md/tasks.md →
`opsx:apply` → verificar con curl real → construir UI en React con el sistema de diseño →
`opsx:archive` → redactar sección de documentación.

---

**Decisión de lenguaje:** TypeScript, no JavaScript plano. Justificación: 11 capabilities de
backend devuelven datos tipados distintos; TS reduce errores de contrato API↔frontend y mejora
el autocompletado en Claude Code al consumir endpoints nuevos.

**Decisión de estructura:** el frontend React mantiene la misma organización por paquetes
funcionales que ya se usa en FastAPI — un directorio en `src/packages/` por cada una de las 11
capabilities (`catalogo`, `suscripciones`, `analitica`, `partners`, `ingesta`, `seguridad`,
`facturacion`, `creadores`, `social`, `distribucion`, `experiencia`), en vez de organizar por tipo
de archivo (todos los componentes juntos, todas las páginas juntas). El sistema de diseño
(`PRODUCT.md`/Impeccable) vive en `src/shared/design-system/`, compartido por todos los paquetes.

- Bundler: **Vite** confirmado.
- `is_synthetic` → `source_type`: **reemplazo directo** confirmado (ver sección 7).
- `pbakaus/impeccable`: skill de diseño para agentes de código (extiende `frontend-design` de
  Anthropic, 23 comandos, 44 reglas detectoras contra "look genérico de IA"). Se instala y
  configura desde Claude Code, no desde este chat. Flujo: `npx impeccable install` en la raíz del
  repo → `/impeccable init` dentro de Claude Code → genera `PRODUCT.md` (y opcionalmente
  `DESIGN.md`) con audiencia, tono, colores, tipografía — eso ES la Fase 0 de definición de
  sistema de diseño.

## 12. Hallazgos de la validación visual de `catalogo` + `analitica` (post Fase 0)

- **Bug de infraestructura:** el servicio `api` (FastAPI) no tenía bind mount de volumen en
  `docker-compose.yml` — cada cambio de código Python requería `docker compose up -d --build api`,
  no solo `restart`. Pendiente de confirmar si se agregó el volumen para desarrollo o se acepta
  el rebuild manual en cada capability nueva.
- **Deuda técnica limpiada:** se eliminó un router legacy en inglés (`api/routers/app_router.py`,
  código muerto, nunca montado en `main.py`) y 5 endpoints duplicados/obsoletos del router
  `analitica` v1. Se portaron 2 campos triviales (`explicit_count`, `avg_tempo`) de las queries
  legacy a las v1 antes de borrar.
- **Bug de semántica REST corregido:** `/app/v1/analitica/artistas/search` ahora devuelve
  `200 + []` en cero resultados, no `404` — el 404 quedó reservado para lookups por ID.
- **Confirmado (no es bug):** el router `analitica` v1 exige autenticación — la búsqueda de
  engagement devuelve `401 Unauthorized` sin sesión. Esto es esperado y correcto: no hay
  capability `seguridad` implementada todavía. Queda como la razón concreta para priorizar
  `seguridad` como primera capability nueva a implementar, según el orden ya confirmado.

## 13. Pendiente: login/registro siguen en el frontend viejo (`app/`, puerto 8081)

La capability `seguridad` conectó `api.js`/`auth.js` del frontend vanilla a FastAPI (en vez de
PocketBase directo), porque ahí ya existían `login.html`/`register.html` funcionando. El
frontend React (`frontend/`) todavía no tiene pantallas de login/registro — solo los 3 admin
pages del paquete `seguridad` (permisos, auditoría). Resultado: dos frontends coexisten, cada
uno con partes distintas de la experiencia de usuario real.

**Pendiente a resolver, no ahora:** migrar login/registro a React con el sistema de diseño de
Impeccable aplicado, antes de que la disonancia visual en el punto de entrada de la app sea
notoria para el evaluador. Candidato natural: hacerlo como parte del cierre de la Fase 7, o
antes si se nota que molesta durante el desarrollo de las siguientes capabilities.

**✅ Resuelto (2026-07-02), primer prompt de la fase de migración a React:**
`LoginPage`/`RegisterPage` (`frontend/src/packages/seguridad/pages/`) reemplazan
`login.html`/`register.html` para el camino React (`/login`, `/register`), con el sistema de
diseño ya establecido (tokens de `index.css`). Sesión real wireada: token/usuario en
`shared/lib/session.ts`, header `Authorization` inyectado automáticamente por `apiClient`
(`shared/lib/api-client.ts`) en todas las llamadas de todos los paquetes, guard genérico
`RequireAuth` (con soporte de `roles`) protegiendo `/facturacion`, `/creadores`, `/social/*`,
`/distribucion/disponibilidad` y todo el árbol `/seguridad/*` (admin-only), y logout real desde
`UserMenu` en los tres shells. `RequireSuscripcionActiva` (analitica) ahora recibe el token real
y distingue sin-sesión (→ `/login`) de sesión-sin-acceso (→ `/analitica/suscripciones`).
El frontend legacy (`app/`, puerto 8081) no se tocó — sigue coexistiendo hasta que el resto de
la fase (catalogo/suscripciones/analitica resto/partners/ingesta) se migre en prompts
posteriores. Fuera de alcance deliberado en este prompt: la orquestación de negocio post-login
del legacy (auto-asignar plan Free a B2C, redirigir B2B sin suscripción a onboarding de planes)
no se replicó en React — depende de la capability `suscripciones`, que todavía es un stub sin
páginas ni API client en este frontend.

## 14. Cover art y reproducción vía YouTube — diseño con fallback (capability `experiencia`)

Pedido: portadas (álbum/artista/track) y reproducción de audio real vía YouTube para tracks
reales. Decisión: **no es un requisito funcional del sistema simulado, es apoyo visual/UX** —
por lo tanto se diseña con fallback obligatorio, nunca como dependencia dura de internet.

- **Cover art:** ETL (Python, respeta RT-01) busca en iTunes Search API (pública, sin API key)
  solo para `source_type='real'`, guarda `imagen_url` en DIM_ARTISTS/DIM_ALBUMS. Si falla o el
  track es `synthetic`/`user_uploaded`, se usa un placeholder SVG local generado con los tokens
  de diseño de Impeccable — cero llamada externa en el fallback.
- **Audio:** YouTube IFrame Player API embebido en el frontend (búsqueda por texto en el
  cliente, sin gastar cuota de YouTube Data API). Si no hay internet o no hay resultado, el
  botón play queda deshabilitado o muestra estado "no disponible" — no rompe el resto de la app.
- Se implementa junto con `experiencia` (última capability), reactivando el click en `TrackCard`
  que quedó explícitamente fuera de alcance en el craft de `catalogo`.

## 15. Estado de avance — capabilities cerradas

- ✅ `seguridad` (6 tablas) — archivada
- ✅ `facturacion` (3 tablas) — archivada
- ✅ `creadores` (4 tablas: DIM_CUENTA_ARTISTA, FACT_SUBIDA_TRACK, DIM_ESTADO_REVISION,
  STG_ARTIST_UPLOADS) — archivada. Incluyó migración completa `is_synthetic`→`source_type` en
  catalogo/biblioteca/gestion_datos/etl_gold, salvaguarda de `ingesta` para no truncar tracks de
  artistas promovidos (rango de fact_id reservado ≥10M + `ALTER...DELETE` en vez de `TRUNCATE`),
  y exclusión de `source_type='user_uploaded'` de los promedios de audio en 5 queries de
  `analitica` (manteniendo track_count/avg_popularity inclusivos).
- ✅ `social` (4 tablas: BRIDGE_SEGUIMIENTO_ARTISTA, DIM_TIPO_INTERACCION_SOCIAL,
  FACT_COMENTARIO, FACT_COMPARTICION) — archivada.
- ✅ `distribucion` (7 tablas: DIM_PAIS, DIM_SELLO_DISCOGRAFICO, DIM_LICENCIA,
  DIM_TIPO_RESTRICCION, DIM_CANAL_DISTRIBUCION, BRIDGE_RESTRICCION_TRACK,
  FACT_RESTRICCION_REPRODUCCION) — archivada (2026-07-02). Incluyó la migración BREAKING
  `DIM_ARTISTS.record_label`/`DIM_ALBUMS.label` (texto libre, 100% vacíos en el dataset base —
  nunca se poblaron) → `sello_id` (FK a `DIM_SELLO_DISCOGRAFICO`, poblada con un catálogo de
  referencia de sellos reales ya que no había valores históricos que extraer), con `ALTER ...
  DROP COLUMN` ejecutado solo tras verificar cobertura (`scripts/migrar_sellos.py`). El
  enforcement de restricción geográfica (RF-DIS-007) se agregó al endpoint ya existente
  `POST /app/v1/biblioteca/historial/{fact_id}` en vez de duplicar lógica, y el bloqueo se ve en
  la app real (`app/`, puerto 8081) sin tocar su frontend: el backend manda `detail` como string
  y el manejo global de `403` en `app/js/api.js::apiFetch` ya lo muestra en un toast. País del
  usuario resuelto por comparación case-insensitive contra `DIM_PAIS`; sin match, fail-open
  (no bloquea) — limitación conocida y documentada, no se normalizó `DIM_USUARIO.pais` en esta
  ronda para no duplicar alcance de migración en el mismo cambio.
- ✅ `experiencia` (6 tablas: FACT_REPRODUCCION_EVENTO, FACT_IMPRESION_RECOMENDACION,
  FACT_TICKET_SOPORTE, FACT_AB_TEST_EXPOSICION, BRIDGE_TRACK_PLAYLIST_USUARIO,
  BRIDGE_SUSCRIPTOR_FAMILIA, más `imagen_url` en DIM_ARTISTS/DIM_ALBUMS) — archivada
  (2026-07-03). Última de las 6 capabilities operativas nuevas del proyecto. Ver §20 para un
  hallazgo de integridad de datos descubierto durante su verificación (no introducido por esta
  capability, pendiente de resolución aparte).

## 16. Migración de frontend a React — segundo bloque: `catalogo` completo (2026-07-02)

Segundo prompt de la fase de migración (después de login/sesión, sección 13). Alcance: llevar
`catalogo` completo a React (`frontend/src/packages/catalogo/`) — filtro de género, detalle de
track/artista/álbum, favoritos, playlists, historial y un reproductor persistente (solo
estado/UI, sin audio real — eso es de `experiencia`).

**Hallazgo de deuda técnica (no parte del alcance original de `catalogo`):** el frontend legacy
(`app/js/playlists.js`) llama directo a PocketBase desde el navegador (URL hardcodeada
`http://localhost:8090`, colecciones `playlists`/`playlist_tracks`), saltándose FastAPI — viola
RT-01 ("todo movimiento de datos debe pasar por Python"), a diferencia del resto del sistema.
Nunca se documentó como excepción deliberada (a diferencia de catálogo/`STG_ARTIST_UPLOADS`, ver
sección 4). **Decisión confirmada por el usuario:** cerrar el gap con endpoints nuevos en
`api/paquetes/biblioteca/` (`pb_playlists.py` + rutas en `router.py`) que proxean a PocketBase
reusando `require_b2c_user` (mismo patrón que favoritos/historial) — las reglas de la colección en
PocketBase (`user = @request.auth.id`, `playlist.user = @request.auth.id`) ya limitan cada
operación a las propias playlists del usuario, sin reverificar ownership en Python. El frontend
React ya no llama a PocketBase directo en ningún punto.

**Completado:**
- Filtro de género en `CatalogPage` — ya soportado por el backend (`/tracks/search?genre=`), sin
  cambios de API.
- `TrackDetailPage` (`/catalogo/track/:factId`) y `ArtistDetailPage`
  (`/catalogo/artista/:artistaId`), con navegación cruzada real. Se agregó también
  `AlbumDetailPage` (`/catalogo/album/:albumId`), no pedida como página propia pero implícita en
  "navegación cruzada hacia su artista/álbum/género" del track detail — reusa endpoint/tipo ya
  existentes en `catalogo.api.ts`.
- `TrackCard` con el click habilitado (navega al detalle), botón de reproducir, favorito y menú
  de "agregar a playlist" — antes deshabilitado a propósito en el craft original de `catalogo`.
- `BibliotecaPage` (`/biblioteca`, con pestañas Favoritos/Playlists/Historial, mismo patrón de
  `DistribucionAdminPage`) — bloquea Cliente B2B con el mismo mensaje que
  `app/biblioteca/library.html` en vez de esperar el 403 del backend.
- Reproductor persistente (`shared/components/PlayerBar.tsx` + `shared/context/PlayerContext.tsx`,
  montado una sola vez en `AppShell`): estado de sesión de navegación (React Context, no
  localStorage, a diferencia del legacy) — track actual, play/pause, progreso simulado. Sin cola
  de reproducción (el prompt no la pidió explícitamente para este bloque). Registra el evento de
  "reproducción" en `HISTORIAL_RECIENTE` desde los propios call-sites (`TrackCard`,
  `TrackDetailPage`, `LibraryTrackRow`), no desde `PlayerContext` (vive en `shared/`, no debe
  depender de `packages/catalogo`).

**Desviación deliberada:** no se replicó el gating Premium del legacy (`track.html` oculta las
audio features detalladas si el plan es `free`) — depende de `getPlanTier()`/`suscripciones`, que
en React sigue siendo un stub sin API client; el prompt de este bloque no lo pidió explícitamente.
Queda para cuando se migre `suscripciones`.

## 17. Migración de frontend a React — tercer bloque: `suscripciones` completo (2026-07-03)

Tercer prompt de la fase de migración (después de login/sesión y `catalogo`, secciones 13 y 16).
Alcance: llevar `suscripciones` completo a React (`frontend/src/packages/suscripciones/`), que
hasta este bloque era un stub puro. El backend (`api/paquetes/suscripciones/`) ya existía completo
y archivado desde antes de la refactorización — no se tocó, salvo lectura.

**Hallazgo relevante durante la investigación previa (no en el legacy, sí en `facturacion`):**
además del campo `metodo_pago` de texto libre que valida `POST /app/v1/suscripciones` (mock puro,
sin pasarela, igual que el legacy), la capability `facturacion` (ya cerrada, ver sección 15) expone
un segundo mecanismo, real pero simulado: registrar un método de pago estructurado
(`DIM_METODO_PAGO`) y pagar la suscripción activa (`FACT_TRANSACCION_PAGO` con resultado aleatorio,
`FACT_INVOICE` en éxito). Ambos mecanismos son independientes — activar un plan nunca depende de
que ese pago simulado tenga éxito. **Decisión:** no duplicar el formulario de tarjeta de
`FacturacionPage` dentro de `PlanesPage`; en vez de eso, tras confirmar un plan de pago se muestra
un banner con link a `/facturacion` para registrar el método real y generar el invoice — reuso sin
duplicación de UI.

**Completado:**
- `PlanesPage` (`/suscripciones`) — una sola pantalla que combina selección de plan (B2C/B2B según
  `role`, filtrado server-side), confirmación con validación de método de pago solo a nivel de
  formulario, consulta de plan activo y cancelación con `confirm()` nativo — replica 1:1 la
  estructura de `app/autenticacion/planes.html` (que ya combinaba las tres cosas en una página; no
  se separaron en dos rutas para no duplicar el fetch de `/suscripciones/activa`). Soporta
  `?onboarding=1` igual que el legacy (banner, redirect a home tras confirmar, y redirect
  inmediato si ya hay plan activo al entrar en modo onboarding).
- Orquestación post-login/post-registro (pendiente marcado en la sección 13):
  `resolverDestinoPostAuth(role)` en `suscripciones/api/suscripciones.api.ts`, consumida desde
  `LoginPage`/`RegisterPage` (`packages/seguridad`) sin duplicar lógica de sesión. **Decisión
  para B2C — auto-Free, no redirect:** se replicó exactamente el criterio del legacy (`role="user"`
  sin plan activo se auto-suscribe a `free` de forma transparente) en vez de forzar una pantalla de
  selección, porque Free tiene precio 0 y no requiere método de pago — interponer una pantalla ahí
  sería fricción sin beneficio, y el legacy ya validó ese criterio en producción. B2B
  (`role="analyst"`) sin plan sí redirige a `/suscripciones?onboarding=1`, igual que el legacy,
  porque ninguno de sus planes es gratuito. Se usa una única función para login y registro (el
  legacy tenía dos variantes ligeramente distintas) porque una cuenta recién creada nunca tiene
  plan activo — el resultado es idéntico sin duplicar la lógica entre las dos páginas.
- Paywall de audio features en `TrackDetailPage` (pendiente marcado en la sección 16): hook
  compartido `usePlanActivo` (`packages/suscripciones/hooks/`, exportado por `index.ts`) consumido
  desde `catalogo`. Mismo criterio que `getPlanTier()` del legacy: cualquier plan activo distinto
  de `free` desbloquea (no se verifica el literal `'premium'`, ni se distingue B2C/B2B).
- `RequireSuscripcionActiva` (analitica) **no se generalizó ni se reusó tal cual**: es un guard de
  ruta completa contra un endpoint ya gateado por `require_b2b_panel_access`; el paywall de
  `TrackDetailPage` necesita gating parcial de una sección dentro de una página pública, forma
  distinta que un guard de ruta no resuelve. Se optó por `usePlanActivo` como pieza compartida en
  su lugar, evitando tanto el guard-fit forzado como una reimplementación redundante de la consulta
  a `/suscripciones/activa`.
- Nav link "Mi Plan" agregado a `AppShell` (mismo patrón que los demás ítems de nav), apuntando a
  `/suscripciones`.

Verificado: `tsc --noEmit` y `npm run build` limpios (los 3 errores preexistentes de
`EngagementPage.tsx` no están relacionados con este bloque).

## 18. Migración de frontend a React — cuarto bloque: resto de `analitica` (2026-07-03)

Cuarto prompt de la fase de migración (después de login/sesión, `catalogo` y `suscripciones`,
secciones 13, 16, 17). Alcance: las 5 vistas de `analitica` que faltaban — perfil de audio por
género (radar), comparación de artistas, benchmark de artista vs. género, tendencias semanales,
reporte diario operativo. Backend ya existía completo y archivado — no se tocó, y la
investigación previa confirmó que **no falta ningún endpoint real**: todas las rutas pedidas
existen tal cual en `router.py` (`/generos/{id}/perfil`, `/artistas/comparar`,
`/artistas/{id}/benchmark`, `/tendencias`, `/reporte-diario`).

**Librería de gráficos — decisión confirmada por el usuario:** Recharts, no Plotly.js (que usa
el legacy vía CDN). Motivo: el frontend no tenía ninguna librería de charts instalada, y
Plotly.js pesa varios MB incluso en su build básico — Recharts son componentes React nativos,
liviano, y se themea con los tokens oklch existentes sin resolver colores a hex a mano. Costo
real medido: el bundle JS pasó de ~395KB a ~821KB (gzip ~115KB → ~236KB) — Vite advierte por
chunk >500KB. **No se hizo code-splitting en este bloque** (sacaría el bundle de `analitica`
del chunk principal vía `React.lazy` a nivel de ruta) para mantener el alcance enfocado en las
5 vistas pedidas — queda como mejora natural de seguimiento, ya que hoy los usuarios B2C que
nunca visitan `/analitica/*` igual cargan Recharts en el bundle principal.

**Se aplicó la skill `dataviz` antes de escribir cualquier gráfico**, lo que cambió el diseño de
`TendenciasPage` respecto al legacy: `trends.html` usa un gráfico con doble eje Y (`yaxis`/
`yaxis2`) para combinar `track_count` (conteo sin límite), `avg_popularity` (0-100) y
`avg_energy` (0-1) en un solo gráfico — la skill marca el dual-axis como el anti-patrón #1
("Never a dual-axis chart — two measures of different scale → two charts, small multiples, or
indexed to a common base"). **Se reemplazó por small multiples**: 3 paneles de línea
independientes, cada uno con su propio eje Y en su escala real, mismo eje X (`load_week`). La
paleta categórica de 2 colores (violeta/teal, para comparación y benchmark) se validó con
`scripts/validate_palette.js` del skill contra la superficie oscura real de la app — los tokens
`--color-primary-light`/`--color-accent` tal cual fallan la banda de luminosidad en modo oscuro
(quedan muy claros), así que se usaron variantes más oscuras de la misma familia de hue
(`oklch(0.64 0.15 290)` / `oklch(0.65 0.14 195)`), documentadas en `AudioRadarChart.tsx`.

**Completado:**
- `GenerosPage` (`/analitica/generos`) — selector de género (reusa `GET /genres` del router
  `catalogo`, que no tiene endpoint de listado propio en `analitica`; ver hallazgo abajo) +
  radar de un solo atributo (sin leyenda, criterio del skill: "a single series needs no legend
  box").
- `ComparacionPage` (`/analitica/comparacion`) — 2 `ArtistPicker` + radar de 2 series + tabla de
  diferencias (7 atributos + tracks + popularidad + explícitos).
- `ArtistaBenchmarkPage` (`/analitica/benchmark`) — 1 `ArtistPicker` + radar artista vs. género
  predominante + tabla. **Decisión (pedida explícitamente "decide y justifica"): página propia
  en `analitica`, no embebida en `ArtistDetailPage` (catalogo).** `catalogo` nunca importa de
  `analitica` hoy (regla de aislamiento observada en todo el frontend) y el propio legacy ya
  resuelve esto como página independiente (`benchmark.html`), no como sección embebida.
- `TendenciasPage` (`/analitica/tendencias`) — 3 small multiples + filtro opcional de rango de
  semanas (un solo row de filtros arriba de los gráficos, criterio del skill).
- `ReporteDiarioPage` (`/analitica/reporte-diario`) — KPIs de ingestas + tabla de engagement por
  tipo + nota. **Export "PDF" — decisión confirmada por el usuario: replicar `window.print()` +
  `@media print`**, igual que el legacy (que tampoco usa jsPDF ni ninguna librería real) — cero
  dependencias nuevas, sin regresión de alcance. Se agregó `@media print` tanto en la página
  (fuerza texto/fondo imprimibles, oculta los controles) como en `AnalyticaShell.module.css`
  (oculta sidebar/brandBar, que la página no puede tocar por estar fuera de su propio módulo
  CSS).
- Guard de rol para reporte diario: el backend exige `require_staff` (admin), no solo
  `require_b2b_panel_access` — `RequireSuscripcionActiva` (que ya envuelve todo el `Outlet` del
  shell) no distingue ese caso. Se envolvió solo esa ruta con `RequireAuth roles={['admin']}`
  (guard genérico ya existente, mismo patrón que `/seguridad/*`) en vez de crear un guard nuevo,
  y el link de nav correspondiente se oculta client-side para no-admin (`getRole() === 'admin'`)
  para no mostrar un link que siempre rebota.
- `ArtistPicker` (componente compartido nuevo en `analitica/components/`): extrae el patrón de
  búsqueda+dropdown+debounce que `EngagementPage` ya tenía inline, reusado 3 veces
  (`ComparacionPage` x2, `ArtistaBenchmarkPage` x1) en vez de triplicarlo.
- `AudioRadarChart` (componente compartido nuevo): wrapper de Recharts `RadarChart` con 1-2
  series, tooltip themeado a los tokens del proyecto, usado por las 3 páginas con radar
  (`GenerosPage`, `ComparacionPage`, `ArtistaBenchmarkPage`).

**Hallazgo (no bug, resuelto sin tocar backend):** `analitica` no tiene endpoint de listado de
géneros — el legacy `genres.html` llama `/genres/trends`, que no existe en `router.py` actual
(query huérfana). `GenerosPage` reusa `GET /genres` (router `catalogo`, mismo que alimenta el
filtro de `CatalogPage`) para el selector, sin duplicar esa data ni pedir un endpoint nuevo.

Verificado: `tsc --noEmit` limpio (mismos 3 errores preexistentes de `EngagementPage.tsx`) y
`npm run build` exitoso (con warning de tamaño de chunk >500KB por Recharts, no bloqueante).

## 19. Migración de frontend a React — quinto y sexto bloque: `partners` e `ingesta` (2026-07-03)

Bloques 5 y 6 de la migración (después de login/sesión, `catalogo`, `suscripciones` y
`analitica`, secciones 13, 16-18). Ambas capabilities eran stubs puros. Backend ya existía y
archivado para las dos — no se tocó lógica de negocio, pero sí se corrigió un gap de
infraestructura real (ver más abajo, sección "Bug de infraestructura encontrado").

**Corrección a la premisa del prompt — `partners` NO es admin-only en el backend.** Se verificó
contra `api/paquetes/partners/deps.py`/`router.py`: las 9 rutas de `/partners/v1/*` se
autentican con `X-API-Key` (`require_partner`, colección PocketBase `partners`, sin relación con
`role=admin` ni con la sesión del staff) — es una API pública para consumidores externos por
tier (básico/pro/enterprise), no una API interna. Lo único admin-only es la **consola de
verificación** (`console.html` en el legacy, ahora `PartnersConsolePage`), que es una
herramienta de desarrollo, no el contrato de la API en sí — confirmado también en
`openspec/specs/partners/spec.md`, sección "Herramientas de verificación y demo". `ingesta`
(paquete real `gestion_datos`, no `ingesta` — el nombre de capability y el de paquete Python
difieren) sí es 100% admin-only en todas sus rutas (`require_lead_data_engineer` aplicado a
nivel de router, sin excepciones) — la premisa del prompt era correcta para este caso.

**Decisión de ubicación — ambas bajo `/seguridad/*`, no árboles propios.** El prompt sugería
replicar el patrón de `ReporteDiarioPage` (`RequireAuth roles={['admin']}` por ruta, dentro de
`AnalyticaShell`). Se decidió algo más preciso: montar `PartnersConsolePage`/`EtlPage`/
`CrudDimensionesPage`/`DataQualityPage` como hijos de `/seguridad`, el mismo patrón ya usado
por `AuditoriaFacturacionPage`/`RevisionCreadoresPage`/`ModeracionSocialPage`/
`DistribucionAdminPage` (back-office de otras capabilities agregado al shell admin existente).
Motivo: `SeguridadShell` ya está envuelto en `<RequireAuth roles={['admin']}>` a nivel de shell
— replicar el guard por ruta habría sido una duplicación innecesaria (`ReporteDiarioPage`
necesitaba ese patrón específicamente porque vive en `AnalyticaShell`, que NO es admin-only por
defecto; aquí no aplica esa razón). Nav agregado a `SeguridadShell.tsx` (5 ítems nuevos:
Partners, Ingesta ETL, Dimensiones, Calidad de datos) — sin riesgo de overflow, el sidebar es
vertical y ya tenía margen de sobra (ver evaluación de sidebar de un bloque anterior).

**Bug de infraestructura real encontrado y corregido (no opcional — bloqueaba todo el bloque):**
`vite.config.ts` (dev) y `nginx.conf` (prod) solo proxean `/app/v1/*` hacia el backend. La
mayoría de las rutas de `gestion_datos` (`/health`, `/etl/*`, `/data-quality`, `/facts`,
`/dim/*`) y **todas** las de `partners` (`/partners/v1/*`) están montadas en la raíz del
backend, sin ese prefijo — confirmado en vivo contra el dev server real: `curl
localhost:5173/data-quality` devolvía `200` pero con el `index.html` de la SPA como cuerpo, no
JSON (fallback de Vite, no error explícito). Esto también afecta a algo que **ya estaba
desplegado antes de este bloque**: `/dashboard/executive` (`analitica`, router legacy sin
prefijo) tiene el mismo problema — el KPI dashboard probablemente lleva rota desde que se migró
`analitica` a React. Se agregaron reglas de proxy nuevas en ambos archivos
(`/dashboard`, `/health`, `/etl`, `/data-quality`, `/facts`, `/dim`, `/partners/v1`),
verificadas en vivo tras el fix (`curl localhost:5173/data-quality` → `401` real con
`{"detail":"..."}`, no más el fallback SPA). Se trató como cambio de infraestructura de
frontend (proxy config), no de backend — respeta "SOLO frontend" del prompt.

**Completado:**
- `PartnersConsolePage` (`/seguridad/partners`) — réplica mínima de `console.html`: API key +
  parámetros (page/limit/id), 9 botones "Probar" (uno por endpoint real, con su tier mínimo
  declarado), badge de status (verde/ámbar 403/rojo), tiempo de respuesta en ms, JSON crudo de
  la respuesta. Usa `fetch` directo con `X-API-Key` — deliberadamente NO usa `apiClient`/sesión
  del admin, para probar la API igual que la vería un partner externo real. **No se replicó
  `landing.html`** (demo pública sin sesión dirigida a partners externos, confirmado contra el
  spec — no es una pantalla interna de Tracklytics).
- `EtlPage` (`/seguridad/ingesta`) — disparo (semana, `forzar_recarga`, `synthetic_mode`),
  monitoreo real por polling cada 5s (`GET /ejecuciones/{id}`, igual que `etl.html` — no hay
  websockets en el backend), 4 etapas del pipeline (extracción/transformación/carga/auditoría),
  historial + última carga + tasa de rechazo con flag "Requiere revisión" (>1%). **No se
  incluyó el botón "Vaciar todos los datos"** (`POST /etl/clear`, legacy) — trunca
  `FACT_TRACKS`/`ETL_BATCH_CONTROL`, acción destructiva no pedida explícitamente en el alcance
  de este prompt; se excluyó a propósito en vez de agregar un botón de borrado masivo no
  solicitado.
- `CrudDimensionesPage` (`/seguridad/ingesta/dimensiones`) — CRUD genérico de las 11 DIM
  editables (`DIM_TABLES`) + vista de solo lectura de `FACT_TRACKS`. El formulario de
  crear/editar se genera dinámicamente a partir de las keys de una fila real (no hay endpoint
  de esquema para 11 tablas heterogéneas) — **limitación conocida:** "Nuevo" queda deshabilitado
  si la tabla está vacía (no hay fila de la que derivar los campos). RN-ING-004 (confirmación al
  eliminar dimensión referenciada) replicada 1:1: modal propio en el primer intento, y si el
  backend responde `409` con el conteo de referencias en `FACT_TRACKS`, un segundo `confirm()`
  nativo con el mensaje real del backend antes de reintentar con `confirmar=true` — mismo flujo
  de dos pasos que `crud.html`.
- `DataQualityPage` (`/seguridad/ingesta/calidad`) — KPIs + donut de distribución por origen.
  **Cierra un gap real del legacy**: `data-quality.html` solo grafica Real vs. Sintético e
  ignora `user_uploaded_records`/`user_uploaded_pct`, aunque `GET /data-quality` ya los devuelve
  — la vista nueva muestra las 3 categorías. Paleta categórica de 3 colores (violeta/teal ya
  validados en `analitica`, más un tercer tono ámbar) validada con
  `scripts/validate_palette.js` del skill `dataviz` contra la superficie oscura real, mismo
  criterio que el bloque anterior.
- `ingesta.api.ts` reusa el patrón `_root` de `analitica.api.ts` (derivar la raíz quitando
  `/app/v1` de la base configurada) para las rutas root-mounted, pero SÍ inyecta el bearer de
  sesión (a diferencia de `partners`, que no puede tocar la sesión del admin) — y agrega manejo
  de error con el `detail` real del backend (`IngestaApiError`), necesario para mostrar los
  mensajes de los guards de idempotencia/concurrencia (409) al usuario.

**Verificación en vivo (no solo build):** con el dev server real corriendo, se confirmó por
`curl` que el fix de proxy funciona (JSON real, no fallback SPA) y con un smoke test headless
(Playwright, mismo enfoque que en el bugfix de nav de `AppShell`) que las 4 rutas nuevas
redirigen correctamente a `/login` sin sesión y no producen errores de consola. **No se pudo
verificar el render autenticado** (formularios, CRUD real, gráfico de dona) por no contar con
credenciales de un usuario `role=admin` sembrado — queda para prueba manual del usuario (pasos
abajo).

Verificado: `tsc --noEmit` limpio (mismos 3 errores preexistentes de `EngagementPage.tsx`) y
`npm run build` exitoso.

## 20. ✅ Resuelto — `fact_id` duplicado en `FACT_TRACKS` (era prioridad alta)

**Estado: RESUELTO (2026-07-04).** Descubierto durante la verificación de `experiencia`
(2026-07-03), diagnosticado a fondo y corregido en un cambio aparte, fuera del alcance de esa
capability.

### Qué se encontró

Al construir `TOP_TRACKS_PLAYLIST` (capability `experiencia`) apareció un warning de React por
keys duplicadas que llevó a auditar `FACT_TRACKS` directamente contra ClickHouse real:

```sql
SELECT fact_id, COUNT(*) FROM FACT_TRACKS GROUP BY fact_id HAVING COUNT(*) > 1
```

**Números exactos (verificados en Docker real, no simulados):** 113,550 `fact_id` distintos
con `COUNT(*) > 1`, 227,100 filas afectadas de 1,027,101 totales (22.1%), 100% de las filas
`source_type='real'` duplicadas (`synthetic`/`user_uploaded` con 0 duplicados). No era solo
duplicación trivial: las dos filas de un mismo `fact_id` eran tracks completamente distintos
(`track_id`/`track_name`/artista diferentes) — ej. `fact_id=1` apuntaba tanto a
"Böxig Leise - Pig & Dan Remix" como a "Lolly".

### ⚠️ Corrección importante sobre la causa disparadora

El diagnóstico inicial especuló que la duplicación venía de "una corrida de producción
histórica (probable dado el historial de 9 sprints)". **Esa especulación era incorrecta** y
se corrige aquí explícitamente. Investigando con más profundidad (columna `FACT_TRACKS.inserted_at`,
`_part` de ClickHouse, y el historial real de `ETL_LOGS`/`ETL_BATCH_CONTROL`/`DagRun` de
Airflow) se encontraron dos lotes con `inserted_at` distintos:

- `2026-07-02 05:15:30/31` (113,550 filas) — respaldado por una corrida real y completa,
  registrada en `ETL_LOGS` (log_id 18) y `ETL_BATCH_CONTROL` (batch_id 1). Este es el estado
  legítimo que existía antes de la sesión de `experiencia`.
- `2026-07-03 23:34:56/57` (113,550 filas) — **generado por mí mismo, sin querer, durante la
  verificación de la tarea 3.3 de `experiencia`**, al correr
  `airflow tasks test tracklytics_etl task_portada 2026-05-14` para probar la resolución de
  portadas. Asumí (incorrectamente) que ese comando corre solo `task_portada` de forma
  aislada; en este setup de Airflow, `tasks test` en realidad ejecutó también la cadena
  upstream completa (`task_bronze → task_silver → task_gold`) antes de `task_portada` —
  confirmado con los logs de Airflow de esa corrida
  (`run_id=__airflow_temporary_run_2026-07-03T23:34:12...__`, con archivos de log para
  `task_bronze`/`task_silver`/`task_gold`, ninguno para `task_synthetic`/`task_log`, y sin
  ninguna entrada nueva ese día en `ETL_LOGS`/`ETL_BATCH_CONTROL` — es decir, nunca fue una
  corrida "oficial" del pipeline).

Es decir: **la causa disparadora inmediata no fue un incidente de producción antiguo — fue un
comando de diagnóstico de esta misma sesión que tuvo un efecto secundario no anticipado.** La
causa estructural (el guard de idempotencia faltante, ver abajo) es la que hizo que ese efecto
secundario se manifestara como una duplicación real de datos en vez de un no-op; ambas cosas
son ciertas y están diferenciadas a propósito en este párrafo.

### Causas raíz (dos, independientes, ambas corregidas)

1. **Falta de guard de idempotencia** en `etl/gold/loader.py::run_gold`: las dimensiones
   (`DIM_GENRES`, `DIM_ALBUMS`, `DIM_ARTISTS`, etc.) estaban protegidas con
   `if _count(tabla) == 0` antes de insertar, pero el insert de `FACT_TRACKS` para los
   registros reales (`real_df`, con `fact_id = np.arange(1, n_real+1)`) no tenía ese guard —
   se ejecutaba incondicionalmente en cada corrida de `task_gold`, sin importar qué
   `week_number` se pidiera. **Fix:** se agregó el mismo guard (`if _count(... WHERE
   source_type='real') > 0: skip`) — verificado repitiendo el mismo comando que causó el bug
   original: `FACT_TRACKS` se mantuvo en 913,551 filas y 0 duplicados.
2. **Orden no determinista de PocketBase**: `etl/utils/pocketbase_client.py::fetch_all_pages`
   no especificaba ningún `sort` en sus llamadas a la API de PocketBase. Sin un `sort`
   explícito, el orden de retorno de los registros no está garantizado entre dos llamadas —
   y como `fact_id` se asigna secuencialmente (`np.arange`) según el orden de llegada, una
   recarga completa legítima (borrar y recargar desde cero, como ya hace `ingesta`) podía
   asignar el mismo `fact_id` a un track distinto que en la carga anterior, incluso con el
   guard del punto 1 en su lugar. **Fix:** se agregó `sort=id` (orden ascendente por el id
   interno de PocketBase, único y estable) a ambas llamadas de `fetch_all_pages`. Verificado
   contra PocketBase real: sin `sort`, el orden es el orden físico incidental de SQLite (no
   garantizado por contrato); con `sort=id`, es un orden lexicográfico explícito y
   reproducible.

### Remediación de datos aplicada

- Confirmado con `SELECT` el valor exacto de `inserted_at` del lote artefacto (partido en dos
  timestamps por el chunking de 50,000 filas del insert original: `23:34:56` con 50,000 filas
  y `23:34:57` con 63,550 filas) antes de borrar.
- `ALTER TABLE FACT_TRACKS DELETE WHERE inserted_at IN ('2026-07-03 23:34:56', '2026-07-03
  23:34:57')` — ejecutado tras confirmación explícita del usuario sobre el predicado exacto
  (dos intentos previos con un predicado más amplio de lo autorizado fueron bloqueados
  correctamente por el clasificador de seguridad de modo automático).
- Verificado tras la mutación: `FACT_TRACKS` pasó de 1,027,101 a 913,551 filas,
  `SELECT fact_id, COUNT(*) ... HAVING COUNT(*) > 1` da 0 filas, `source_type='real'` volvió a
  113,550 exactas.
- Re-verificados con `curl` los datos de prueba de `experiencia` que referenciaban los
  `fact_id` afectados (54256, 62609, 56797, 41870, 69488): historial, la playlist de prueba
  (`GET /biblioteca/playlists/{id}`), `FACT_REPRODUCCION_EVENTO` y `FACT_IMPRESION_RECOMENDACION`
  siguen resolviendo cada uno a exactamente un track, sin ambigüedad.

No se emprendió ninguna reconciliación de FKs "perdedoras" contra otras tablas (favoritos,
comentarios, etc.) — no fue necesaria: el lote borrado solo tenía unas horas de antigüedad
(generado en esta misma sesión), no había ningún dato de usuario real creado contra los
`fact_id` de ese lote específico antes de su eliminación.

## 21. Fase 8 — pulido final P4, primer bloque (2026-07-04)

Primeros 4 de 6 ítems de pulido final, ejecutados en un solo bloque (consolidación Word queda
para el cierre, fuera de este bloque).

**Sidebar + nav mobile (`AppShell`):** reemplazado el nav horizontal (con `NavMoreMenu` bajo un
trigger "Más") por un sidebar vertical, mismo patrón visual que `AnalyticaShell`/`SeguridadShell`
(220px, `position: sticky`). Agrupación por arquitectura de información: consumo primario arriba
(Catálogo/Mi Biblioteca/Mi Plan), transaccional/admin-adyacente abajo de un divider
(Facturación/Creadores/Social/Distribución/Soporte — "Soporte" no estaba en el ejemplo original
del prompt, se ubicó en el segundo grupo por ser una acción puntual, no de consumo diario).
`NavMoreMenu.tsx`/`.module.css` eliminados (código muerto, sin otro consumidor, verificado con
grep antes de borrar).

**Nav mobile real bajo el breakpoint (gap que sí se resolvió esta vez):** `MobileNavDrawer.tsx`
nuevo, drawer con hamburguesa en vez de bottom tabs — con 8 ítems de nav, una barra inferior
quedaría apretada o necesitaría su propio scroll horizontal (mismo problema ya resuelto sacando
el nav del header en un bloque anterior); un panel deslizante con scroll vertical escala mejor.
Reutiliza el patrón de click-outside-to-close que `NavMoreMenu`/`AddToPlaylistMenu` ya usaban.
Cierra al navegar, al presionar Escape, y si la ventana crece más allá del breakpoint (rotar una
tablet); bloquea el scroll del body mientras está abierto. **Alcance del nav mobile real limitado
a `AppShell`**, tal como pedía el prompt — `AnalyticaShell`/`SeguridadShell` (paneles admin/B2B)
mantienen su comportamiento previo de ocultar el sidebar sin reemplazo; ese gap queda fuera de
este bloque.

**Breakpoint unificado — 768px**, elegido porque ya era el valor usado por 2 de los 3 shells
(`AnalyticaShell`/`SeguridadShell`); solo `AppShell` tuvo que cambiar (antes 640px, sin relación
real con el colapso de sidebar de los otros dos). `AppShell.module.css` conserva una segunda
media query en 480px, pero solo para afinar espaciado en teléfonos muy angostos (oculta el badge
"beta", reduce padding) — no es un segundo breakpoint de layout, no contradice la unificación.

**PlayerBar no tapa el nav:** `.sidebarWithPlayer` (AppShell) y `.panelWithPlayer`
(MobileNavDrawer) agregan `padding-bottom: calc(var(--player-bar-height) + var(--space-sm))`
condicional a `currentTrack`, mismo tratamiento que `.mainWithPlayer` ya tenía.

**Fix `HISTORIAL_RECIENTE` (tracks sintéticos excluidos del historial):** la subquery `ga` que
resuelve `genre_name` por `track_id` filtraba `WHERE ft2.source_type != 'synthetic'` — si el
`track_id` de un `fact_id` no tenía ninguna fila con otro `source_type`, la subquery no producía
match y el `INNER JOIN` excluía todo el historial de ese track, aunque el evento de reproducción
sí existiera en `FACT_ENGAGEMENT_USUARIO`. Se quitó el filtro solo en esta query (no en
`FAVORITOS_ACTUALES`/`TRACKS_BY_FACT_IDS`, que no estaban en el alcance de este ítem y no
presentan el mismo síntoma reportado). Verificado contra Docker real: track 100% sintético
(`fact_id=539173`, `syn_6_025622`) apareció en `GET /biblioteca/historial` tras registrar el
evento vía `POST /biblioteca/historial/539173`; un track real (`fact_id=108637`) verificado en
paralelo para confirmar que no hubo regresión.

**Code-splitting de `/analitica`:** `AnalyticaShell` y las 9 páginas/componentes de su árbol de
rutas (incluyendo `TopTracksPlaylistsPage`, que vive en `experiencia` pero cuelga de
`/analitica`) convertidos a `React.lazy` vía un helper `lazyNamed` (adapta los named exports del
proyecto, que nunca usa `export default`, al contrato de `React.lazy`). Un único `<Suspense>` en
`router.tsx` cubre la carga de `AnalyticaShell`; otro dentro de `AnalyticaShell.tsx`, envolviendo
el `Outlet`, cubre la carga de cualquier página hija — evita envolver cada `element` del route
config individualmente. Fallback: mismo patrón `// cargando…` ya usado en el resto de la app
(`CatalogPage`, `FavoritosTab`, etc.), sin introducir un spinner ni componente nuevo.

**Hallazgo durante la implementación (corregido, no solo reportado):** el primer intento no
redujo el bundle — `AnalyticaShell` seguía apareciendo en el chunk principal. Causa: `router.tsx`
importaba `AppShell`/`SeguridadShell` desde el barrel `@app/layout`, y ese barrel también
re-exporta `AnalyticaShell` de forma estática (`export { AnalyticaShell } from './AnalyticaShell'`)
— importar cualquier cosa del barrel evalúa el módulo completo, creando una arista estática hacia
`AnalyticaShell.tsx` sin importar que no se usara el named export. Fix: `router.tsx` importa
`AppShell`/`SeguridadShell` directo de su archivo (`@app/layout/AppShell`,
`@app/layout/SeguridadShell`), no del barrel — el barrel en sí no se tocó, otros consumidores
pueden seguir usándolo.

Bundle principal: **882.26 kB → 768.45 kB** (gzip 252.92 kB → 226.73 kB), reducción de ~114 kB
(~13%) / ~26 kB gzip. No llega a eliminar el warning de chunk >500kB de Vite porque Recharts
también lo usa `ingesta/pages/DataQualityPage.tsx` (fuera de alcance de este ítem, no tocado) —
esa página se importa de forma estática en `router.tsx`, así que la librería Recharts en sí queda
parcialmente en el bundle principal por ese consumidor ajeno a `/analitica`. Queda anotado como
mejora natural de seguimiento si se decide extender el code-splitting a `ingesta`.

**Verificación:** `tsc --noEmit` limpio (mismos 3 errores preexistentes de `EngagementPage.tsx`,
no relacionados). `npm run build` exitoso con los tamaños de arriba. Playwright **no está
instalado en el proyecto** (confirmado, ningún `package.json` lo referencia) — verificación de
nav hecha por revisión de código + `vite preview` con `curl` (confirma que las rutas `/`,
`/analitica`, `/seguridad/permisos` responden 200 sin crash del servidor; no valida interacción
JS en navegador real, limitación explícita). curl real contra Docker para el fix de historial
(arriba). No se ejecutó ningún smoke test de clic real en el drawer/hamburguesa por falta de
herramienta de automatización de navegador en este entorno.

## 22. Fase 8 — pulido final P4, segundo bloque: responsive general + manejo de errores (2026-07-04)

Ítems 5-6 de los 6 originales de Fase 8 (video demo queda para el cierre). Auditoría delegada a
2 agentes de investigación en paralelo (uno por ítem) para cubrir ~35 páginas sin agotar
contexto propio; los hallazgos se verificaron/priorizaron antes de aplicar fixes.

**Item 5 (responsive):** 10 páginas con problema real (dentro del umbral ">10" para pausar), causa
concentrada en 3 archivos CSS compartidos (`SeguridadPages.module.css`, `DistribucionPages.module.css`,
`ExperienciaPages.module.css`) sin ninguna regla responsive. Fix: wrapper `.tableScroll`
(`overflow-x: auto`, mismo patrón ya usado en `CrudDimensionesPage`) para las tablas de
Auditoría/Errores/Permisos (seguridad) y el historial de `EtlPage`; `.tablePanel { overflow: hidden
→ overflow-x: auto }` en distribucion/experiencia (mismo recorte de esquinas, ya no clipea
columnas); `flex-wrap` en `CatalogPage.searchRow` y `EngagementPage.controls`.

**Item 6 (manejo de errores):** patrón nuevo — `ApiError` (clase, `shared/lib/api-client.ts`) con
`status`/`detail` reales del backend en vez de un `Error` genérico que descartaba el body;
`ErrorState`/`EmptyState` (`shared/components/`) reemplazando 4 variantes de caja casi idénticas
(`.errorBox`/`.bannerError`/`.errorText`/`.blocked` reusado). Gaps reales corregidos: favoritos
sin feedback al chocar con el límite Free (`useFavoritos.toggleError`), bloqueo geográfico
RF-DIS-007 completamente silencioso en `registrarReproduccion` (ahora `PlayerContext.
reportPlaybackIssue` detiene la reproducción y muestra el `detail` real del backend), 404 vs.
error genérico indistinguibles en Track/Artist/AlbumDetailPage, donut vacío sin mensaje en
`DataQualityPage`, chequeo frágil de string en `CuentaArtistaPage` reemplazado por
`ApiError.status`. Consultado el usuario sobre el barrido de consistencia completo (~20 archivos/
43 sitios, más grande de lo esperado): **eligió hacerlo completo**. Interrumpido a mitad por la
nueva prioridad de la sección 23 (usuario ausente) — quedaron migrados `creadores`,
`distribucion`, `experiencia`, `facturacion`, `catalogo` (todos); **pendientes**: `ingesta`
(`CrudDimensionesPage`/`DataQualityPage`/`EtlPage`, ~4 sitios), `seguridad`
(`AuditoriaPage`/`PermisosPage`/`ErroresPage`/`LoginPage`/`RegisterPage`, ~5 sitios), `social`
(`ArtistaSocialPage`/`ModeracionSocialPage`/`SeguidosSocialPage`/`TrackSocialPage`, ~6 sitios) —
funcionan igual que antes, solo no comparten todavía el componente unificado.

**Verificación:** `tsc --noEmit` y `npm run build` limpios en cada punto de control. curl real
contra Docker confirmando el fix de historial sintético (sección 21) sin regresión en tracks
reales, y el bloqueo geográfico ahora visible. Playwright sigue sin estar instalado.

## 23. Fixes urgentes reportados por admin — sesión sin pausas (2026-07-04)

El usuario reportó 5 problemas navegando como admin y pidió resolverlos **sin pausar a
preguntar** (excepción de una sola sesión, por ausencia del usuario) — toda decisión de
arquitectura que normalmente se hubiera confirmado queda documentada aquí con su justificación
en su lugar.

**1. Nav de admin incompleto:** confirmado por revisión de código — ni el nav horizontal
original ni el sidebar de Fase 8 (sección 21) tuvieron nunca un link hacia `/analitica` o
`/seguridad` desde `AppShell`; no fue una regresión de la migración a sidebar, era un gap
preexistente que la migración solo hizo más visible (antes tampoco existía, simplemente nadie lo
había notado). Fix: `navAdminFor(role)` en `AppShell.tsx`, tercer grupo del sidebar (con su
propio divider) — "Analítica" para `role IN (admin, analyst)`, "Administración" para
`role = admin`, exactamente el mismo gating que ya usa el backend
(`require_b2b_panel_access`/`require_admin`). El drawer mobile reusa el mismo array fusionado en
`secondary` en vez de un tercer grupo propio — simplificación táctica, el mobile no necesita la
separación visual extra que sí tiene sentido en el sidebar de escritorio.

**2. Página de perfil — no existía:** confirmado, `UserMenu` solo tenía email/rol/logout.
Decisión de alcance mínimo: **de solo lectura** — el backend de seguridad
(`api/paquetes/seguridad/router.py`) no expone ningún endpoint de cambio de contraseña, y no se
inventó uno nuevo (excede "alcance mínimo razonable" para una sesión sin poder confirmar
decisiones de backend). `ProfilePage.tsx` (`/perfil`, paquete `seguridad`) muestra email, tipo de
cuenta y fecha de registro. La fecha de registro no requirió tocar el backend: `auth.api.ts` ya
guardaba el record completo de PocketBase en `localStorage` (`resp.record` tipado como
`SessionUser & Record<string, unknown>`), solo faltaba declarar `created` en el tipo `SessionUser`
para poder leerlo — cero llamadas nuevas. Link agregado en `UserMenu` (todo el bloque de
identidad, antes un `<span>`, ahora un `<Link>`).

**3. Navegación por género:** diagnóstico explícito antes de decidir (pedido por el prompt):
`GenerosPage` (analitica) **no** cubre la necesidad B2C — es un radar de audio features por
género, gateado a B2B/admin (`RequireSuscripcionActiva`), inútil para un usuario Free que solo
quiere "ver tracks de este género". El filtro de género ya existía en `CatalogPage` (un
`<select>`) pero sin ninguna entrada visual — fácil de no notarlo. Fix: fila "Explorar por
género" con chips clicables (mismo estado `genre` que el `<select>`, que se mantiene intacto como
selector preciso/alfabético) en scroll horizontal — 114 géneros en el dataset (confirmado por
curl), un grid con wrap habría ocupado varias pantallas; no se curó una lista "top N" para evitar
introducir un criterio de negocio arbitrario no pedido.

**4. Covers no cargan — bug real, no solo cobertura pendiente:** diagnóstico completo antes de
actuar. Encontrado: `task_portada` (capability `experiencia`) **nunca formó parte de una corrida
real y completa del DAG** — se agregó al archivo del DAG después de la última corrida
"oficial" (2026-07-02, antes del cierre de `experiencia` el 2026-07-03); su única ejecución
previa fue la prueba manual aislada documentada en la sección 20 (que generó el incidente de
`fact_id` duplicado, ya resuelto). Confirmado con `airflow tasks states-for-dag-run`: ninguna
`DagRun` en el historial incluye `task_portada`. Sobre esa base, sí había además un **bug real de
código**: la resolución de portada de artistas usaba `entity=musicArtist` contra la iTunes Search
API, y ese tipo de entidad **nunca** devuelve el campo `artworkUrl100` (confirmado contra la API
real — el objeto de resultado ni siquiera tiene esa key) — 0/29,859 artistas resueltos, por diseño
roto, no por falta de corridas ni por rate limit. Fix: `etl/gold/portada.py` ahora busca
`entity=album` con el nombre del artista como término (mismo patrón que usan otros clientes de
iTunes/Apple Music cuando no hay foto de artista) — verificado con una corrida real
post-fix: 30/50 artistas resueltos en un solo intento (0/50 antes del fix, consistentemente).
Ejecutado `resolver_portadas()` 3 veces de forma directa (import Python dentro del contenedor
`airflow`, **no** vía `airflow tasks test` — ese comando fue el que causó el incidente de la
sección 20 por cascadear el DAG completo; invocar la función directamente evita ese riesgo por
completo). Progreso real verificado en ClickHouse: artistas 0→30/29,859, álbumes 53→70/46,591;
las corridas siguientes se frenaron solas por rate limit real de iTunes (403/429, confirmado en
los logs) — no se insistió más allá de 3 intentos para respetar el límite, el resto se resuelve
incrementalmente en las próximas corridas reales del DAG (ya con el bug corregido). Mejora
adicional: `AlbumArt.tsx` (fallback compartido de `TrackCard`/`LibraryTrackRow`) no tenía ningún
ícono en su estado sin portada — una caja lisa que en una lista de varias filas se lee como
"cargando" en vez de "sin portada"; se le agregó el mismo glifo `♪` que ya usaban los fallbacks
de página de detalle, por consistencia.

**5. YouTube: error visible en vez de fallback silencioso:** sin Playwright/navegador disponible
en este entorno, no fue posible reproducir interactivamente el error reportado — el fix se hizo
por revisión de código, identificando dos rutas de fallo reales sin manejar en
`PlayerContext.tsx`: (a) `loadYouTubeApi()` nunca tenía vía de rechazo — si el script de YouTube
fallaba al cargar o tardaba indefinidamente, `play()` quedaba esperando un `.then()` que nunca
llega, sin error ni "no disponible", silencio total (peor que un error visible, en realidad); (b)
`new window.YT.Player(...)` no estaba envuelto en `try/catch` — una excepción síncrona (ej. un
parámetro que la API ya no soporta) se propagaba sin capturar, visible en consola. Fix: `reject`
explícito en `script.onerror` + timeout de 8s en `loadYouTubeApi()`, y `try/catch` alrededor de la
construcción del `YT.Player` — ambos caminos ahora caen al mismo estado `playbackUnavailable` ya
usado para "sin resultado en la búsqueda" (RF-EXP-010), sin excepción sin capturar. **Aclaración
importante:** no existe hoy un "progreso simulado independiente del audio real" en el código —
`progressMs` se actualiza únicamente desde `getCurrentTime()` del reproductor de YouTube real
cuando la reproducción sí funciona, y no se muestra ninguna barra de progreso cuando
`playbackUnavailable` es true (mismo comportamiento antes y después de este fix, no se tocó). Si
el usuario esperaba una animación de progreso incluso sin audio real, ese comportamiento no existe
en el código actual y no se agregó en esta sesión — habría contradicho el propio RF-EXP-010
("el control de reproducción... queda deshabilitado"), y crear una regla de negocio nueva
("simular progreso sin audio real") es exactamente el tipo de decisión que esta sesión no debía
tomar sin poder confirmarla. Queda anotado explícitamente como posible malentendido a aclarar
cuando el usuario vuelva.

**Verificación:** `tsc --noEmit` y `npm run build` limpios tras cada bug. Backend: curl real
contra Docker para `/genres` (114 géneros), `/artists/{id}` con y sin `imagen_url` resuelto
(antes/después del fix de portada), conteos ClickHouse directos (`DIM_ARTISTS`/`DIM_ALBUMS`)
antes y después de cada corrida de `resolver_portadas()`, y `airflow tasks states-for-dag-run`
para confirmar que `task_portada` nunca corrió en una `DagRun` real. Frontend: sin
Playwright/navegador disponible (confirmado, no instalado) — nav admin y perfil verificados por
revisión de código contra el gating real del backend, no por interacción real en browser;
limitación explícita, igual que en la sección 22.

## 24. Actualización intencional de RF-EXP-010 + fuente alternativa de portadas (2026-07-04)

Dos pedidos explícitos del usuario, no decisiones tácticas propias: (1) cambio de spec
deliberado sobre RF-EXP-010 — reproducción simulada en vez de "no disponible" cuando YouTube
falla; (2) investigar una fuente de portadas alternativa a iTunes para cuando esta no tiene
resultado (más allá del límite de 50/corrida y del bug de `entity=musicArtist` ya corregido en
la sección 23).

**1. Reproducción simulada:** `PlayerContext.tsx` reescrito — las 3 rutas de fallo de YouTube ya
identificadas y corregidas en la sección 23 (offline, rechazo de `loadYouTubeApi`, excepción de
`new YT.Player`, y el evento `onError` del player real) ahora llaman a
`startSimulatedPlayback()` en vez de `setPlaybackUnavailable(true)`. Implementación con Web
Audio API nativa (cero dependencia nueva): un `AudioContext` compartido por sesión (perezoso,
mismo patrón que `ytApiPromise`), un oscilador seno de 220Hz con ganancia muy baja (0.025, con
rampa de 50ms al iniciar/pausar para evitar el "click" audible típico de Web Audio al cambiar
volumen en seco) durante `duration_ms` exacto del track. El progreso (`progressMs`) se calcula
por reloj de pared (`Date.now()`), no por el audio en sí — desacoplado a propósito, evita
depender de la precisión de `AudioContext.currentTime` a través de pausas/resumes.
`playbackUnavailable`/`playbackUnavailableReason` quedan reservados exclusivamente para el
bloqueo geográfico real (RF-DIS-007, `reportPlaybackIssue`) — esa sigue siendo la única razón
legítima para impedir la reproducción; simular audio para un track geo-bloqueado habría
socavado la restricción de negocio real. `PlayerBar.tsx` no necesitó ningún cambio: ya renderiza
controles/progreso normales cuando `playbackUnavailable` es false, que es exactamente el estado
en el que queda la reproducción simulada — "mismo aspecto visual" se cumple porque es literalmente
el mismo código de render, no una branch nueva. Actualizado `openspec/specs/experiencia/spec.md`
(Requirement "Reproducción de audio real") con una nota explícita de que esta es una revisión
posterior decidida por el usuario, no el comportamiento del propuesto original — y un addendum
histórico en el `design.md` archivado de la capability (`openspec/changes/archive/
2026-07-03-experiencia/`) para que no se asuma vigente el diseño original al leerlo después.

**2. Fuente alternativa de portadas — Deezer, sin bloqueo por API key:** evaluados los 3
candidatos sugeridos. MusicBrainz/Cover Art Archive requiere dos llamadas por término (buscar el
MBID en MusicBrainz, luego pedir la portada a Cover Art Archive con ese MBID) — descartado frente
a una alternativa de una sola llamada. **Deezer Search API** (`api.deezer.com/search/artist` y
`/search/album`) confirmada contra la API real: sin API key, sin cuenta, una sola llamada por
término, devuelve URLs de imagen en alta resolución directamente en la respuesta — mismo criterio
que iTunes (sin credencial). Implementado en `etl/gold/portada.py` como segundo intento
(`_buscar_portada_deezer`): iTunes primero, Deezer si iTunes no tuvo resultado, SVG local si
ninguna de las dos. Para artistas, Deezer además resuelve algo que iTunes estructuralmente no
puede (una foto real del artista vía `picture_big`, no un álbum usado como proxy). Verificado con
corridas reales post-fix: antes de este cambio, la corrida más limpia lograba 30/50 artistas y
0-17/50 álbumes (limitada por el rate limit real de iTunes, 403/429 tras pocos requests); con
Deezer como segundo intento, las siguientes 3 corridas lograron 50/50, 50/50 y 50/50 artistas, y
46/50, 44/50, 39/50 álbumes — Deezer no mostró el mismo problema de rate limit en las mismas
pruebas. Progreso acumulado verificado en ClickHouse: artistas 30→180/29,859, álbumes
70→199/46,591 en esta sesión. Verificado con curl que una URL resuelta por Deezer
(`cdn-images.dzcdn.net`) responde `200 image/jpeg` real y se sirve correctamente a través del
endpoint `/artists/{id}` del backend sin cambios adicionales (el campo `imagen_url` ya fluye
igual sin importar cuál de las dos fuentes lo resolvió).

**No se necesitó detenerse a preguntar por una API key/cuenta** — Deezer resultó viable sin
credencial, cumpliendo el criterio explícito del usuario, así que no aplicó la condición de
parada del prompt.

**Verificación:** `tsc --noEmit` y `npm run build` limpios. Backend: corridas reales de
`resolver_portadas()` contra Docker (misma técnica ya usada en la sección 23 — invocación directa
por Python, no `airflow tasks test`), conteos ClickHouse antes/después de cada corrida, curl
confirmando el `content-type`/status real de una imagen servida por Deezer y su presencia en la
respuesta del endpoint de artistas. Frontend: sin Playwright disponible, la simulación de audio
se verificó por revisión de código + build limpio, no por reproducción interactiva real en
navegador (limitación explícita, ya señalada en secciones anteriores) — no fue posible confirmar
visualmente que la barra de progreso avanza en un `PlayerBar` real, aunque el código comparte
exactamente el mismo camino de render que la reproducción real ya verificada visualmente en
bloques anteriores de este proyecto.

## 25. Diagnóstico real con Playwright + fix del watchdog de reproducción (2026-07-04)

Instalado Playwright (`@playwright/test` + Chromium) para diagnosticar de forma interactiva
(no solo revisión de código) los dos problemas reportados: reproducción sin sonido y covers sin
cargar. Diagnóstico primero, fix después, ambos en la misma sesión.

**Diagnóstico de reproducción — hallazgo real, distinto de lo hipotetizado en la sección 23:**
no es un bloqueo por política de autoplay del navegador (`video.muted=false`, `video.volume=1`
confirmados en el `<video>` real dentro del iframe de YouTube — si arrancara, sonaría). El
hallazgo real, instrumentando temporalmente `PlayerContext.tsx` con trazas (revertidas antes de
aplicar cualquier fix) y verificado en 5+ corridas: `onReady` de la IFrame API dispara con
normalidad, `player.playVideo()` se llama, pero el `<video>` interno **se queda para siempre en
`readyState: 0` (HAVE_NOTHING)** — nunca resuelve ningún medio real a partir de
`listType: 'search'` + `list: '<texto>'`. `onError` **nunca dispara** en este caso (técnicamente
no hay error, solo silencio) — confirmado idéntico para un track real (Adele – Hello) y uno
sintético, no es una distinción real/sintético. Consecuencia: el fallback simulado agregado en
la sección 24 nunca se activaba para este modo de fallo específico, porque su único disparador
era `onError`.

**Fix — watchdog adicional a onError (no lo reemplaza):** en `PlayerContext.tsx`, tras `onReady`,
un `setTimeout` de 4.5s (`YT_PLAYBACK_WATCHDOG_MS`) revisa si `onStateChange` ya reportó
`PLAYING` al menos una vez; si no, se asume el fallo silencioso descrito arriba y se dispara
`startSimulatedPlayback()`, igual que ya hacía `onError`. Se agregó una guarda
(`fallbackTriggered`) para que, si ambos disparadores llegaran a ocurrir (poco probable pero
posible), el segundo no reinicie el tono simulado ya en curso desde cero.

**Verificación (Playwright, 5 corridas, mismo track real usado en el diagnóstico):** primera
tanda con margen de espera insuficiente (7s) dio 4/5 — la corrida restante no había alcanzado a
completar ni siquiera el `onReady` inicial dentro de la ventana de verificación (arranque en frío
de la primera navegación de un contexto nuevo, no una falla del watchdog en sí). Con margen
ajustado a 12s (watchdog de 4.5s + colchón realista para que `onReady` mismo dispare): **5/5
corridas terminaron sonando algo** — YouTube nunca resolvió un video real en ninguna de las 5,
así que las 5 cayeron al fallback simulado (progreso avanzando, botón "Pausar"); ninguna quedó
en "▶ 0:00" indefinido. `tsc --noEmit` y `npm run build` limpios tras el cambio.

**Covers — confirmado con la query pedida antes de cualquier fix:** 180/29,859 artistas (0.6%) y
199/46,591 álbumes (0.43%) con `imagen_url` poblado al momento del diagnóstico — causa principal
confirmada como cobertura de datos, no bug de frontend (verificado también que una imagen ya
resuelta carga sin CORS/mixed-content en un navegador real). Se corrieron ~15 corridas
adicionales de `resolver_portadas()` (misma técnica de invocación directa por Python, nunca
`airflow tasks test`, por la razón ya documentada en la sección 23). Progreso: artistas
180→**969**/29,859 (**3.25%**, ~5.4×), álbumes 199→**543**/46,591 (**1.17%**, ~2.7×). La tasa de
éxito de álbumes por corrida cayó de forma sostenida (39→27→…→4) por el rate limit real de
iTunes acumulándose durante la sesión; artistas se mantuvo estable (~49/50 por corrida) gracias a
Deezer. Se detuvo la resolución en ese punto por rate limit real, no por límite de tiempo
arbitrario — coherente con "respetar el rate limit" ya establecido en la sección 23; el resto se
sigue resolviendo incrementalmente en corridas futuras del DAG real, ya con ambos fixes (bug de
`entity=musicArtist` y watchdog) en su lugar.