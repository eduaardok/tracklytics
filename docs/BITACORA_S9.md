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
