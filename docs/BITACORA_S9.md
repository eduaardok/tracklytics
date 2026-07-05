# Bitácora de Desarrollo — Semana 9
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 9 de 16
**Fecha:** Junio–Julio 2026
**Cierre de semana:** ronda completa de QA post-S8 sobre el módulo operativo vivo — se identifican y corrigen 12 bugs de UX/datos, se añade exportación a PDF del reporte diario, se optimiza el rendimiento de ClickHouse (~7× en home, ~5× en historial) y se cierra la funcionalidad del reproductor con barra de progreso navegable (seek)

---

## Resumen ejecutivo

La semana 9 no introduce capabilities nuevas: es una sesión de hardening del módulo operativo completo (CU-O01–CU-O16) que había quedado codificado pero con detalles de UX sin pulir. Se prueba el stack completo con usuarios reales de demo, se identifican 12 problemas concretos y se resuelven todos. El resultado es un módulo operativo listo para presentación formal.

Se añade además un fichero `DEMO_CU_OPERATIVOS.txt` con la guía de demostración caso a caso (credenciales, pantallas, pasos, resultado esperado) para los 16 CUs, y se sincronizan los specs de `catalogo` y `analitica` con los cambios implementados.

---

## Bugs corregidos y mejoras UX

### Reproductor — ícono de volumen
El emoji 🔊 en la barra del reproductor se reemplazó por el SVG de Lucide (`volume-2`) consistente con el resto de íconos de la app.

### Reproductor — botones fav / nav / playlist
Los botones ♥, ⋮ y el clic en el título/artista del reproductor no estaban conectados en `_hydratePlayer()` ni en `playTrack()` — sí funcionaban al reproducir por primera vez pero se desconectaban al navegar de página. Se añadió el wiring completo de los tres botones en ambas funciones (patrón idéntico para garantizar consistencia).

### Reproductor — navegación al track detail iba a ruta incorrecta
El `onclick` del área de título/artista del reproductor apuntaba a `/track.html`; el archivo real está en `/catalogo/track.html`. Corregido.

### Reproductor — barra de progreso navegable (seek)
Se implementó `_initSeek()` en `components.js` usando la Pointer Events API (`pointerdown / pointermove / pointerup` con `setPointerCapture`). El usuario puede hacer clic en cualquier punto de la barra o arrastrar para posicionarse; funciona tanto en mouse como en touch. Si el reproductor está en pausa, solo actualiza la posición; si está reproduciendo, reinicia el timer desde el nuevo punto. Se añadieron dos mejoras visuales en `main.css`: la barra se ensancha de 4 px a 6 px al hover y aparece un knob (círculo blanco) al final del fill.

### Hero de detalle — texto ilegible sobre gradiente
Los textos `.detail-hero-type`, `.detail-hero-name` y `.detail-hero-sub` usaban `opacity` para atenuarse, lo que los hacía difíciles de leer sobre ciertos gradientes oscuros. Se reemplazó `opacity` por `color: rgba(255,255,255,…)` + `text-shadow` para garantizar legibilidad en cualquier color de fondo.

### Historial — tiempo relativo mostraba "ahora mismo" para todos los registros
`timeAgo()` en `library.html` parseaba la fecha de ClickHouse (`DateTime` sin sufijo de zona) como hora local (Colombia UTC-5), colocando los timestamps 5 horas en el futuro. Corregido añadiendo `'Z'` al string antes de pasarlo a `new Date()`.

### Historial y favoritos — géneros múltiples no se mostraban
La query SQL usaba un JOIN simple a `DIM_GENRES` que devolvía una fila por género. Se refactorizaron `FAVORITOS_ACTUALES` e `HISTORIAL_RECIENTE` en `biblioteca/queries.py` para usar una subquery de agregación pre-computada con `arrayStringConcat(groupUniqArray(…))`, igual que las queries del catálogo. El spec de `catalogo` se actualizó para incluir explícitamente favoritos e historial en el requisito de multi-género.

### Modal de playlist vacío en páginas de catálogo
`initPlaylists()` solo se llamaba en `library.html` y `profile.html`. Al intentar agregar a playlist desde el reproductor en `home.html`, `search.html` o cualquier página de catálogo, el modal aparecía vacío. Se añadió `initPlaylists().catch(() => {})` dentro de `renderPlayer()`, que se ejecuta en todas las páginas.

### Race condition al crear playlist e inmediatamente agregar track
`createPlaylist()` era síncrona — insertaba un registro temporal con `id = "temp_…"` y el `addTrackToPlaylist()` inmediatamente posterior intentaba usar ese ID antes de que PocketBase respondiera con el real. Convertida a `async` y se usa `await createPlaylist()` en `createAndAdd()`.

### Reporte diario — exportación a PDF
Se añadió soporte de exportación vía `window.print()` con `@media print` en `reporte-diario.html`: oculta sidebar, player, controles y botón PDF; aplica fondo blanco, bordes de tabla y header con fecha y timestamp de generación. El botón "Descargar PDF" aparece solo tras generar el reporte. Spec de `analitica` actualizado: la exportación a PDF del reporte diario pasa de "Fuera de alcance" a requisito implementado.

### Reporte diario — nota de pendiente táctico explicativa
El banner de aviso se cambió de un mensaje genérico a uno específico: explica que las métricas de suscripciones y adquisiciones son un pendiente táctico porque requieren el ETL de PocketBase → ClickHouse (`FACT_SUSCRIPCION`, `FACT_ADQUISICION`), previsto para la capa táctica. Spec de `analitica` actualizado en consecuencia.

---

## Optimización de rendimiento ClickHouse

### Diagnóstico
Las páginas de catálogo (home) y biblioteca tardaban 3–4 segundos en cargar. Se midieron los endpoints principales:
- `/tracks/top?limit=20` → **4.364 ms**
- `/biblioteca/favoritos` → **3.025 ms**
- `/biblioteca/historial?limit=50` → **2.348 ms**

Con `docker stats` se detectó que ClickHouse estaba al **83.89 % CPU** y Airflow consumía **1.625 GiB** (28 % de los 5.788 GiB totales disponibles). La causa raíz es que `FACT_TRACKS` tiene **913.550 filas** (113.550 reales + 800.000 sintéticas de 8 semanas), y las queries de top tracks y multi-género hacían scans completos de la tabla.

### Solución aplicada

**`TRACKS_TOP` (`catalogo/queries.py`):**
- Se eliminó el doble scan (subquery `IN` + scan principal sobre 913k filas).
- Se añadió `WHERE ft.is_synthetic = 0` → reduce el dataset a 113.550 filas reales (~8×).
- Se añadió `SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1` → ClickHouse cachea el resultado 2 minutos entre todos los usuarios.
- `popularity` cambiada de `any()` a `max()` para obtener el valor pico real del track.

**Subquery de géneros en `FAVORITOS_ACTUALES` e `HISTORIAL_RECIENTE` (`biblioteca/queries.py`):**
- Se reemplazó la subquery correlacionada (incompatible con ClickHouse 24.3) y la subquery con `IN (user tracks)` (que hacía el plan más complejo y empeoraba) por `WHERE ft2.is_synthetic = 0 GROUP BY ft2.track_id`.
- Los datos sintéticos preservan el mismo `genre_id` que el track original, por lo que filtrar a datos reales devuelve géneros correctos para todos los tracks del usuario.

### Resultados post-optimización

| Endpoint | Antes | Después | Mejora |
|---|---|---|---|
| `/tracks/top` | 4.364 ms | 636 ms | **~7×** |
| `/biblioteca/historial` | 2.778 ms | 560 ms | **~5×** |
| `/biblioteca/favoritos` | 4.437 ms | 2.187 ms | **~2×** |

`favoritos` es el más lento porque construye el mapa de géneros para todos los 113k tracks reales antes de filtrar los del usuario — es el coste mínimo sin un pre-materialized view o cache a nivel de aplicación.

---

## Artefactos entregados

| Artefacto | Estado |
|---|---|
| `DEMO_CU_OPERATIVOS.txt` | Nuevo — guía completa de demostración para CU-O01–CU-O16 con credenciales, pantallas y pasos |
| `openspec/specs/catalogo/spec.md` | Actualizado — multi-género en favoritos/historial + reproductor con seek |
| `openspec/specs/analitica/spec.md` | Actualizado — PDF export del reporte diario dentro de alcance, nota de pendiente táctico |
| `docs/BITACORA_S9.md` | Este documento |

---

## Deuda técnica identificada

| Ítem | Impacto | Estimación |
|---|---|---|
| `favoritos` aún tarda ~2 s | UX perceptible en demo | Se eliminaría con una Materialized View `genre_per_track` o cache a nivel FastAPI |
| Reproducción de audio real | Feature incompleto | Opción viable: YouTube IFrame API con YouTube Data v3 key (~media sesión) |
| Airflow consumiendo 28 % RAM idle | Performance global | `docker compose stop airflow` cuando no hay ETL en curso |
| `FACT_SUSCRIPCION` / `FACT_ADQUISICION` pendientes | Reporte diario incompleto | Capa táctica — ETL PocketBase → ClickHouse |

---

## Continuación de la semana — refactorización hacia sistema completo (30 jun – 4 jul 2026)

**Cierre:** después del QA/optimización de arriba, el docente revisó las presentaciones de
mitad de semestre y señaló que el alcance operativo general del curso era demasiado mínimo
(referencia: un equipo similar estimó ~80-100 tablas para un e-commerce completo, ~50 razonable
para el contexto académico). Se abre una refactorización mayor: 6 capabilities OpenSpec nuevas,
migración completa del frontend a React, y un bloque de pulido final. El razonamiento detallado
de cada decisión (por qué, alternativas descartadas, hallazgos durante la implementación) vive en
`docs/decisiones-refactorizacion.md` — esta entrada resume resultados, no lo repite.

### Capabilities OpenSpec nuevas (6, todas cerradas)

| Capability | Tablas | Notas |
|---|---|---|
| `seguridad` | 6 | Usuarios, sesiones, permisos, auditoría, errores — en ClickHouse por decisión pedagógica deliberada del docente (ver más abajo) |
| `facturacion` | 3 | Métodos de pago, transacciones, invoices — simulado, sin pasarela real |
| `creadores` | 4 | Cuentas de artista + flujo de subida de tracks con staging y revisión admin |
| `social` | 4 | Seguir artistas, comentarios, compartir |
| `distribucion` | 7 | Sellos, licencias, restricción geográfica de reproducción — incluyó migración breaking de `record_label`/`label` (texto libre) a FK real |
| `experiencia` | 6 | Telemetría de reproducción, recomendaciones, tickets de soporte, A/B testing, reflejo de playlists, plan familiar |

**Total de tablas: 28 (existentes) + 30 (nuevas) = 58** — un ajuste de 1 por debajo del objetivo
redondo de 59 planteado al inicio, porque `experiencia` terminó con 6 tablas en vez de las 9
planificadas originalmente (3 bridges — `BRIDGE_ARTISTA_GENERO`, `BRIDGE_ARTISTA_ALBUM`,
`BRIDGE_USUARIO_DISPOSITIVO` — no se implementaron por redundancia con relaciones ya resolubles
desde `FACT_TRACKS`/`DIM_USUARIO` sin una tabla bridge dedicada). Sigue dentro del rango 40-60
acordado con el docente. *(Nota de precisión, verificada contra `system.tables` al redactar el
README de cierre: 58 es el inventario de diseño del modelo dimensional completo — ClickHouse +
las entidades de negocio resueltas como colecciones de PocketBase, como `suscripciones`. Las
tablas físicas creadas en ClickHouse en este refactor son 30 (47 en total en ClickHouse hoy,
incluyendo las 17 preexistentes) — ambas cifras son correctas, cuentan cosas distintas. Ver
`README.md`, sección "Modelo de datos", para el detalle.)*

**Decisión pedagógica deliberada:** `seguridad` y `facturacion` se implementaron en ClickHouse
(columnar) a pesar de ser dominios transaccionales por naturaleza — instrucción explícita del
docente para que el equipo encuentre y documente las fricciones reales de usar una base columnar
fuera de su caso de uso ideal, en vez de una elección de arquitectura del equipo.

### Migración de frontend a React (stack completo)

El frontend vanilla HTML/CSS/JS + Bootstrap 5 se reemplazó por React + Vite + TypeScript,
completado en bloques sucesivos: login/sesión, catálogo completo (favoritos, playlists,
historial, reproductor persistente), suscripciones (con orquestación post-login/registro),
resto de analítica (perfil de audio por género, comparación de artistas, benchmark, tendencias,
reporte diario), partners e ingesta. Sistema de diseño (`PRODUCT.md`, tokens oklch) definido una
sola vez al inicio y aplicado de forma incremental por capability, sin reconstruir pantallas dos
veces. El frontend legacy queda reemplazado en su totalidad para el camino de usuario real; no se
mantiene en paralelo.

### Bug crítico de integridad de datos: `fact_id` duplicado en `FACT_TRACKS`

Durante la verificación de `experiencia` se descubrió que **113,550 `fact_id` (22.1% de la
tabla)** apuntaban a dos tracks distintos cada uno — no una duplicación trivial, dos canciones
completamente diferentes compartiendo el mismo identificador. Causas raíz identificadas y
corregidas de forma permanente:
1. Faltaba un guard de idempotencia en la carga de `FACT_TRACKS` para registros reales — cada
   corrida del ETL insertaba de nuevo sin verificar si ya existían.
2. La API de PocketBase no garantizaba un orden estable entre llamadas (`sort` ausente), así que
   una recarga completa podía asignar el mismo `fact_id` secuencial a un track distinto que en
   la carga anterior.

Ambas causas se corrigieron en `etl/gold/loader.py` y `etl/utils/pocketbase_client.py`. Datos
remediados: `FACT_TRACKS` pasó de 1,027,101 a 913,551 filas correctas, 0 duplicados verificados
post-fix.

### Pulido final P4

Sidebar vertical + nav mobile real (drawer con hamburguesa) reemplazando el nav horizontal
original, con breakpoint unificado (768px) entre los 3 shells de la app. Corrección de un bug de
historial que excluía tracks 100% sintéticos de la vista del usuario aunque el evento sí se
hubiera registrado. Code-splitting de `/analitica` y `/seguridad/ingesta` (ambos con Recharts) —
el bundle principal bajó de **882 KB a 409 KB** (gzip: 253 KB → 120 KB), una reducción de ~54%
que además elimina la carga de una librería de gráficos para usuarios que nunca visitan esas
secciones. Patrón único de manejo de errores (`ErrorState`/`EmptyState` reutilizables) con
`status`/`detail` reales del backend en vez de mensajes genéricos, y auditoría responsive de las
~35 páginas de la migración con corrección de las tablas/layouts que rompían en móvil/tablet.

### Funcionalidad de `experiencia` completada

- **Reproducción de audio:** YouTube IFrame API (búsqueda por texto desde el cliente, sin API
  key) con reproducción simulada como fallback (Web Audio API nativa, tono de volumen muy bajo)
  cuando YouTube no responde o no hay resultado — decisión posterior del docente/usuario sobre el
  comportamiento original ("no disponible"), documentada como revisión de spec en
  `openspec/specs/experiencia/spec.md`.
- **Portadas reales:** resolución en dos intentos, iTunes Search API primero y Deezer Search API
  como alternativa (ambas sin API key) — Deezer se agregó tras confirmar que iTunes por sí solo
  dejaba una fracción significativa de artistas/álbumes sin resolver, además de un bug de
  implementación (búsqueda de artista con un tipo de entidad de iTunes que nunca trae imagen).
  Fallback final: reemplazo visual generado localmente, sin llamada externa.
- **Página de perfil de usuario:** vista de solo lectura (email, tipo de cuenta, fecha de
  registro) — no existía ninguna en React. Cambio de contraseña queda fuera de alcance porque el
  backend no expone ese endpoint (documentado, no inventado).
- **Navegación por género:** sección "Explorar por género" con chips descubribles en el
  catálogo, cerrando un gap donde el filtro ya existía (un `<select>`) pero no era visualmente
  descubrible.

### Artefactos entregados (continuación)

| Artefacto | Estado |
|---|---|
| `docs/decisiones-refactorizacion.md` | Nuevo — log completo de decisiones, hallazgos y verificaciones de todo el refactor |
| `openspec/specs/{seguridad,facturacion,creadores,social,distribucion,experiencia}/spec.md` | Nuevos — specs de las 6 capabilities cerradas |
| `openspec/specs/experiencia/spec.md` | Revisado — reproducción simulada y portada en dos intentos |
| `frontend/` | Nuevo — app React+Vite+TS completa, reemplaza el frontend legacy |
| `PRODUCT.md` | Nuevo — sistema de diseño (audiencia, tono, colores, tipografía) |

### Deuda técnica identificada (continuación)

| Ítem | Impacto | Estimación |
|---|---|---|
| Consistencia visual de manejo de errores incompleta en `ingesta`/`seguridad`/`social` (~9 archivos) | Cosmético — funcionan igual, solo no comparten el componente `ErrorState` unificado | Migración mecánica, ~1-2 h |
| Nav mobile real solo en el shell B2C (`AppShell`) | `AnalyticaShell`/`SeguridadShell` siguen sin alternativa bajo 768px | Extender el mismo patrón de drawer a los 2 shells admin |
| Airflow consumiendo CPU alto en idle (heartbeat de scheduler/triggerer) | Compite por recursos con ClickHouse/API en el mismo host | `docker compose stop airflow` cuando no hay ETL en curso |
| Consolidación final en Word + diagramas UML/Excalidraw actualizados | Pendiente, fuera de alcance de este bloque | Última fase antes del cierre del proyecto |
| Cobertura de portadas reales sigue baja (~10.6% artistas, ~1.6% álbumes) | Estético — el fallback visual local cubre el resto sin romper nada | Rate limit real de iTunes/Deezer bajo uso sostenido; se resuelve incrementalmente en corridas futuras del DAG |
| `app/` (frontend legado) sigue en `docker-compose.yml` | Ninguno funcional — ya no es el camino de usuario real | Retirarlo del compose una vez se confirme que nada externo lo referencia |

---

## Continuación de la semana — hardening de producción y cierre del modelo de negocio (4 jul 2026)

Tercer bloque de trabajo de la semana, después del refactor de 6 capabilities (arriba). Detalle
completo de cada hallazgo y decisión en `docs/decisiones-refactorizacion.md` (secciones 21-25 y
el change `completar-modelo-base`); esta entrada resume resultados.

### Fixes urgentes reportados por admin + diagnóstico real con Playwright

Se instaló Playwright para diagnosticar interactivamente (no solo revisión de código) dos
problemas reportados en producción: reproducción sin sonido y portadas sin cargar.

- **Nav de administración incompleto:** ni el nav original ni el sidebar de Fase 8 tenían enlace
  hacia `/analitica` o `/seguridad` desde el shell B2C — gap preexistente, no una regresión.
  Corregido con gating por rol idéntico al que ya aplica el backend.
- **Reproducción — hallazgo real:** YouTube (`listType: 'search'`) a veces deja el `<video>`
  interno indefinidamente en `readyState: 0` sin disparar `onError` — un fallo silencioso, no un
  bloqueo de autoplay como se sospechaba inicialmente. Fix: un `setTimeout` de 4.5s tras
  `onReady` que dispara el fallback simulado si no se detectó reproducción real, complementario
  a `onError` (no lo reemplaza). Verificado con 5 corridas reales de Playwright: 5/5 terminaron
  sonando algo (real o simulado), ninguna quedó en silencio indefinido.
- **Bug real de portadas corregido:** la búsqueda de portada de artista usaba
  `entity=musicArtist` contra iTunes Search, un tipo de entidad que **nunca** devuelve artwork
  por diseño de esa API — 0% de artistas resueltos no era falta de corridas, era un bug. Fix:
  buscar por `entity=album` con el nombre del artista (mismo patrón que otros clientes de
  Apple Music), verificado con una corrida real post-fix.
- **Persistencia de portadas:** cache en disco (`etl/gold/portadas_cache.json`, bind mount, no
  volumen Docker) que sobrevive a `docker compose down -v` o a una recarga que reduzca
  `FACT_TRACKS` a los ~113k registros originales — antes de este cambio, cualquiera de esas dos
  operaciones habría borrado todo el progreso de resolución acumulado.
- **Orden de resolución invertido para álbumes** (Deezer primero, iTunes como respaldo — para
  artistas se mantuvo iTunes primero, que ya funcionaba bien) tras observar que iTunes se
  degrada con cada corrida sostenida dentro de la misma sesión. Un loop de 2 horas (43 corridas)
  corrido para medir el efecto real dio un resultado honesto, no el esperado: el ritmo de álbumes
  también se degradó con Deezer primero (17→0 por corrida), solo que partiendo de una base más
  baja — la causa real es rate limiting de ambas APIs bajo uso sostenido más una cola de títulos
  cada vez más difícil de resolver, no el orden de las fuentes. Cobertura final de esa sesión:
  artistas 10.6% (3.169/29.859), álbumes 1.6% (732/46.591).

### Containerización del frontend React

`frontend/Dockerfile` y `frontend/nginx.conf` ya existían (multi-stage Vite+Nginx) pero sin
servicio propio en `docker-compose.yml` — el frontend vigente solo corría con `npm run dev`,
violando la regla del docente de que todo corra en Docker. Se agregó el servicio
`frontend-react` (puerto 8082), sin recrear ningún contenedor existente
(`--no-recreate`/`--no-deps` en cada paso de verificación).

### Auditoría del inventario de 58 tablas

Antes de esta semana, `system.tables` mostraba 47 tablas físicas contra un inventario de diseño
de 58 (`openspec/config.yaml`: 15 técnicas + 13 de negocio + 30 de las 6 capabilities). Se
reconcilió cada una de las 13 tablas de negocio originales una por una: 6 no tenían tabla física
homónima porque su función ya la cumplía otra tabla con otro nombre o vivían en PocketBase
(detalle en `README.md`, sección "Modelo de datos"), y **5 eran un gap genuino, nunca
implementado**: `DIM_CANAL_MARKETING`, `DIM_REGION`, `DIM_COMPONENTE_INFRAESTRUCTURA`,
`FACT_ADQUISICION`, `FACT_DISPONIBILIDAD`. Esta auditoría fue solo de diagnóstico — no se
implementó nada en ese momento, dio origen al cambio siguiente.

### `completar-modelo-base` — cierre del gap (change cerrado, no una capability nueva)

Cambio OpenSpec propuesto, implementado y archivado (`openspec/changes/archive/
2026-07-04-completar-modelo-base/`) para cerrar las 5 tablas encontradas en la auditoría de
arriba. A diferencia de las 6 capabilities de la semana, este cambio **extiende `analitica`**
(2 `### Requirement:` nuevos) en vez de crear una capability nueva.

- **ClickHouse:** las 5 tablas, aditivas — 52 tablas físicas en total hoy.
- **ETL:** DAG independiente `modelo_negocio_sync` (`Param week_number`, seed reproducible
  `week*42`, idempotencia vía `ETL_BATCH_CONTROL` con un checksum propio) — no se integró a
  `tracklytics_etl` porque es un dominio de negocio ajeno al catálogo, mismo criterio ya usado
  para `playlists_sync`. Backfill de 4 semanas cargado en la verificación.
- **Backend:** `GET /app/v1/analitica/adquisicion` y `/disponibilidad`, mismo guard
  (`require_b2b_panel_access`) que el resto de la capability.
- **Frontend:** `AdquisicionPage` (tabla) y `DisponibilidadInfraPage` (small multiples)
  reemplazan los 2 últimos `ComingSoonPage` de `analitica`. Nombrada explícitamente distinta de
  `DisponibilidadPage` (`distribucion`, restricción geográfica de reproducción) para no
  confundir ambos conceptos de "disponibilidad". Verificación encontró y corrigió un gap real no
  previsto en el plan original: el nav de `AnalyticaShell` tenía ambas rutas marcadas como
  "pronto", lo que además hacía bypass del guard `RequireSuscripcionActiva` en el frontend para
  esas dos páginas — corregido moviéndolas a la nav real con gating normal.

### Artefactos entregados (tercer bloque)

| Artefacto | Estado |
|---|---|
| `docker-compose.yml` | Actualizado — servicio `frontend-react` nuevo |
| `etl/gold/portada.py` | Actualizado — persistencia en cache, orden Deezer-primero para álbumes, fix `entity=album` |
| `etl/gold/portadas_cache.json` | Nuevo — cache en disco, bind mount |
| `etl/gold/modelo_negocio_sync.py`, `etl/dags/modelo_negocio_sync_dag.py` | Nuevos |
| `frontend/src/shared/context/PlayerContext.tsx` | Actualizado — watchdog de reproducción |
| `openspec/changes/archive/2026-07-04-completar-modelo-base/` | Nuevo — change cerrado |
| `openspec/specs/analitica/spec.md` | Actualizado — 2 requirements nuevos (adquisición, disponibilidad de infraestructura) |

---

## Continuación de la semana — cierre de la fase de diseño/UX del frontend (4-5 jul 2026)

Cuarto bloque de trabajo de la semana: dos correcciones puntuales reportadas tras iteración de UI
(fix de header, rediseño del catálogo) y un change OpenSpec para reemplazar los últimos campos de
ID interno crudo del frontend por selectores con búsqueda. Detalle de decisiones en
`openspec/changes/archive/2026-07-05-reemplazar-ids-por-busqueda/design.md`; esta entrada resume
resultados.

### Fix de header — logo y ZoneSwitcher solapados

`AnalyticaShell` y `SeguridadShell` mostraban el indicador de zona (`ZoneSwitcher`, "Volver al
catálogo") solapado con el nombre del sistema, y les faltaba el logo que sí aparece en el resto de
la app (`AppShell`). Causa: `.brandBar` en esos dos shells no tenía `gap` ni `flex-shrink: 0` en el
wordmark, a diferencia de `AppShell`, que ya reservaba espacio correctamente para sus 3 elementos.
Se igualó el patrón (gap en `.brandBar`, `flex-shrink: 0` en `.wordmark`, logo agregado) sin tocar
`ZoneSwitcher` en sí.

### Catálogo rediseñado en 4 secciones permanentes

Hallazgo de incoherencia de UX: al buscar en el catálogo, la página seguía mostrando "Explorar por
género" y "Artistas destacados" por encima de los resultados de búsqueda — dos mecanismos de
descubrimiento y de resultado mezclados en la misma vista. Se reemplazó por 4 pestañas permanentes
— **Canciones, Playlists, Artistas, Géneros** —, cada una con su propio buscador y su propia vista
de destacados (nunca ambos combinados). Aclaración de dominio surgida en el camino: "Playlists" en
la UI son los álbumes del dataset — el modelo técnico los llama `DIM_ALBUMS`, pero la relación N:M
real (un track en varias) corresponde al concepto de negocio de playlist, no de álbum musical
tradicional. No se creó backend nuevo: se reutilizó `GET /albums/search` (ya existente) agregando
`imagen_url` y `avg_popularity` a esa consulta y a `ARTISTS_TOP`/`ARTISTS_SEARCH`/`GENRES_LIST`
para que las cards de destacados tuvieran portada y stats. Se renombró la copia visible de
"Álbum" a "Playlist" en `AlbumDetailPage` para consistencia (la ruta/componente interno no
cambió).

### Título de pestaña dinámico por página

El `<title>` del navegador era estático en toda la app. Se agregó el hook
`useDocumentTitle` (`frontend/src/shared/hooks/`) y se aplicó en las 39 páginas de la app, cada una
con su título (estático o derivado de los datos cargados, ej. nombre del track/artista/playlist).

### `reemplazar-ids-por-busqueda` — último gap de selectores por búsqueda (change cerrado)

Cinco campos pedían un identificador interno crudo (`fact_id` de track o `usuario_id`) escrito a
mano: disponibilidad por país (distribución), comentar un track (social), permisos
(administración), auditoría de facturación, y titular/miembro de plan familiar. La búsqueda de
tracks ya existía (`GET /tracks/search`, capability `catalogo`); la de usuarios no.

- **Backend:** nuevo endpoint de solo lectura `GET /app/v1/seguridad/usuarios/buscar?q=&limit=`
  en la capability `seguridad` (dueña de `DIM_USUARIO` y de `require_admin`, guard canónico ya
  reutilizado por creadores/distribucion/experiencia/facturacion/social), filtrando por nombre o
  correo con `LIKE`.
- **Frontend:** dos componentes de selección con búsqueda en `shared/components/` —
  `TrackPicker` y `UserPicker` — generalizando el patrón ya probado de `ArtistPicker`
  (`packages/analitica/components/`): debounce 300ms, selección por `onMouseDown`, mínimo 2
  caracteres. Reemplazan los 5 campos de ID crudo; el campo `suscripcion_id` de plan familiar
  quedó igual, al no ser un identificador de usuario.
- **Alcance del change OpenSpec:** un solo change multi-capability (`distribucion`, `social`,
  `seguridad`, `facturacion`, `experiencia`) en vez de 5 separados — es el mismo patrón de UX
  repetido de forma idéntica, y el endpoint nuevo es infraestructura compartida por 3 de las 5.
- **Verificación:** curl real contra el endpoint nuevo (401 sin token, 403 con token no-admin,
  200 con coincidencias por nombre/correo, lista vacía sin coincidencias); Playwright con sesión
  admin real recorriendo las 7 vistas tocadas (2 shells + 5 formularios), 0 errores de consola;
  `tsc --noEmit` y `npm run build` limpios.

### Artefactos entregados (cuarto bloque)

| Artefacto | Estado |
|---|---|
| `frontend/src/app/layout/{AnalyticaShell,SeguridadShell}.tsx` + `.module.css` | Corregido — logo y espaciado del header |
| `frontend/src/packages/catalogo/pages/CatalogPage.tsx` | Reescrito — 4 secciones permanentes con destacados + búsqueda propia |
| `api/paquetes/catalogo/queries.py` | Actualizado — `imagen_url`/`avg_popularity` en `ARTISTS_TOP`, `ARTISTS_SEARCH`, `ALBUMS_SEARCH`, `GENRES_LIST` |
| `frontend/src/shared/hooks/useDocumentTitle.ts` | Nuevo — título de pestaña dinámico, aplicado en 39 páginas |
| `openspec/changes/archive/2026-07-05-reemplazar-ids-por-busqueda/` | Nuevo — change cerrado |
| `api/paquetes/seguridad/{queries,router}.py` | Actualizado — endpoint `GET /usuarios/buscar` |
| `frontend/src/shared/components/{TrackPicker,UserPicker}.tsx` + `.module.css` | Nuevos |
| `openspec/specs/{distribucion,social,seguridad,facturacion,experiencia}/spec.md` | Actualizados — selección por búsqueda en vez de ID crudo |

### Deuda técnica identificada (cuarto bloque)

| Ítem | Impacto | Estimación |
|---|---|---|
| `TrackPicker`/`UserPicker` duplican el esqueleto de `ArtistPicker` en vez de una versión genérica parametrizada | Cosmético — 3 componentes casi idénticos en vez de 1 genérico | Evaluado y descartado por ahora (design.md): generalizar forzaría tocar los 3 usos existentes de `ArtistPicker` sin ahorro real de código con solo 3 variantes concretas |
| "Playlists" en la UI vive sobre la tabla técnica `DIM_ALBUMS` | Ninguno funcional — es una decisión de naming de producto, no un gap de datos | Si se requiere un concepto de playlist curada/pública distinto del álbum del dataset, sería una capability nueva, no un rename |
