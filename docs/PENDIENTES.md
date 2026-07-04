# Tracklytics v2 — Pendientes
> Última revisión: Semana 9 (S9), tras el refactor completo (6 capabilities OpenSpec nuevas +
> migración a React + `completar-modelo-base`). Reemplaza la versión anterior ("Semana 8"),
> cuyos ítems ya resueltos se movieron a "Resuelto" abajo con referencia a dónde se resolvieron.

## Exploración pendiente (sin decisión tomada)

Ninguno pendiente en esta categoría por ahora — el único ítem que vivía aquí (reproducción de
audio real) ya se implementó, ver "Resuelto".

## Deuda técnica conocida (documentada, no resuelta por estar fuera de alcance de la capability que la encontró)

- [ ] `dim_create`/`dim_update` (`api/paquetes/gestion_datos/router.py`) construyen SQL
      por interpolación de strings, no parametrizada. Encontrado durante la
      implementación de `ingesta` en S8 (ver `design.md` archivado de esa capability);
      es código preexistente, no se corrigió para no expandir el alcance de esa
      capability. Sigue sin resolverse tras el refactor de S9 (no se tocó ese router).
- [ ] Consistencia visual de manejo de errores incompleta en `ingesta`/`seguridad`/`social`
      (~9 archivos, ~1-2h): funcionan igual que el resto, solo no comparten el componente
      `ErrorState`/`EmptyState` unificado que ya adoptaron `creadores`/`distribucion`/
      `experiencia`/`facturacion`/`catalogo` (Fase 8 P4, S9).
- [ ] Nav mobile real (drawer con hamburguesa) solo existe en el shell B2C (`AppShell`) —
      `AnalyticaShell`/`SeguridadShell` (paneles admin/B2B) siguen ocultando el sidebar sin
      reemplazo bajo 768px (Fase 8 P4, S9).
- [ ] Airflow consume CPU/RAM alto en idle (heartbeat de scheduler/triggerer), compitiendo con
      ClickHouse/API en el mismo host — mitigación actual: `docker compose stop airflow` cuando
      no hay ETL en curso.
- [ ] Cobertura de portadas reales sigue baja (~10.6% artistas, ~1.6% álbumes al cierre de S9,
      ver `docs/decisiones-refactorizacion.md` §25) — limitada por rate limiting real de
      iTunes/Deezer bajo uso sostenido, no por un bug. El fallback visual local cubre el resto
      sin romper la experiencia; se resuelve incrementalmente en corridas futuras del DAG
      `tracklytics_etl` (`task_portada`).
- [ ] `app/` (frontend legado, vanilla HTML/CSS/JS) sigue en `docker-compose.yml` (puerto 8081)
      aunque ya no es el camino de usuario real desde que `frontend/` (React) se containerizó
      (servicio `frontend-react`, S9) — retirarlo queda pendiente de limpieza, no bloqueante.

## Capabilities de negocio fuera de alcance (dependencias externas no implementadas)

- [ ] **CU-T03 — Administración táctica de partners.** No existe alta/gestión de
      partners ni de llaves de API. La colección PocketBase `partners` se creó en S8
      como sustrato mínimo (alta manual vía superusuario) para que la capability
      operativa `partners` (CU-O12) tuviera algo que consumir.
- [ ] **Alimentación de `FACT_INTEGRACION_PARTNER`** desde `LOG_LLAMADAS_PARTNER` vía
      un pipeline ETL — explícitamente fuera de alcance de `partners` (S8); el log
      operativo ya existe y está listo como fuente para ese futuro pipeline. Confirmado en la
      auditoría de tablas de S9 que `LOG_LLAMADAS_PARTNER` es el nombre físico definitivo (no se
      creará una tabla `FACT_INTEGRACION_PARTNER` separada — sería una duplicación del mismo
      dato, ver `README.md`, sección "Modelo de datos").

## Mejoras futuras (sin sprint asignado)

- [ ] Reportes con análisis estadístico avanzado (box plot, heatmap, correlaciones)
- [ ] Dockerfile propio para Airflow (evitar reinstalar dependencias en cada arranque)
- [ ] `load_pocketbase.py` integrado en `docker compose up` (actualmente requiere
      pasos manuales documentados en el README)
- [ ] Diagramas ArchiMate en Archi como complemento a los UML
- [ ] Medición formal de rendimiento de `catalogo` (búsqueda <1s) y `suscripciones`
      (confirmación <3s) — hoy solo se verificó con timing informal de `curl`
      (arrastrado desde S7)
- [ ] Tarea 7.4 de `catalogo` (archivada): ocultar/deshabilitar visualmente las
      vistas de biblioteca personal para Cliente B2B en la UI — el gating ya está
      resuelto en backend y ahora también muestra un bloqueo inline + toast (S8),
      pero no se ocultan los links de navegación hacia esas vistas para ese rol.
- [ ] Consolidación final en Word + diagramas UML/Excalidraw actualizados — los existentes son
      anteriores a la capa B2B2C (6 capabilities de S9) y no deben reutilizarse sin evaluación;
      última fase antes del cierre del proyecto.

## Resuelto (referencia histórica — no requiere acción)

- [x] ~~Reproducción de audio real~~ — resuelto en S9 (capability `experiencia`): YouTube
      IFrame Player API (búsqueda por texto, sin API key) con reproducción simulada (Web Audio
      API nativa) como fallback, más un watchdog de 4.5s para el caso en que YouTube se queda en
      silencio sin disparar error (hallazgo de diagnóstico real con Playwright).
- [x] ~~`api/routers/app_router.py` código muerto~~ — confirmado y eliminado en S9 (nunca se
      importaba desde `api/main.py` ni desde ningún paquete).
- [x] ~~Campo `g.genre_id` sale con prefijo de tabla en `/genres/trends`~~ — verificado
      en vivo en S8, la respuesta ya devuelve `genre_id` limpio.
- [x] ~~CRUD de FACT_TRACKS no muestra registros en modo solo lectura~~ — verificado
      en vivo en S8 (`GET /facts` devuelve registros normalmente).
- [x] ~~Radar chart de géneros no cierra el polígono~~ — el código actual ya repite
      el primer elemento en `r`/`theta` (`renderRadar` en `dashboard.html`/`genres.html`).
- [x] ~~Migración de Favoritos/Historial/Playlists a ClickHouse/PocketBase~~ —
      completada en S6 (`FACT_ENGAGEMENT_USUARIO` + colecciones `playlists`/`playlist_tracks`).
- [x] ~~Frontend React sin containerizar~~ — resuelto en S9: servicio `frontend-react` en
      `docker-compose.yml` (puerto 8082, build multi-stage Vite+Nginx).
- [x] ~~5 tablas de negocio pendientes desde el diseño original (`DIM_CANAL_MARKETING`,
      `DIM_REGION`, `DIM_COMPONENTE_INFRAESTRUCTURA`, `FACT_ADQUISICION`,
      `FACT_DISPONIBILIDAD`)~~ — resuelto en S9 con el change `completar-modelo-base`
      (`openspec/changes/archive/2026-07-04-completar-modelo-base/`): tablas en ClickHouse, DAG
      `modelo_negocio_sync`, endpoints y páginas reales en `analitica` (reemplazan los últimos 2
      `ComingSoonPage`).
