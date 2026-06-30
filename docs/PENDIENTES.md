# Tracklytics v2 — Pendientes
> Última revisión: Semana 8 (S8). Reemplaza la versión anterior ("Pendientes Semana 2"),
> cuyos 3 bugs técnicos y la migración de Favoritos/Historial/Playlists ya fueron
> resueltos en sprints posteriores (confirmado en esta revisión, ver `BITACORA_S6.md`
> y `BITACORA_S8.md`).

## Exploración pendiente (sin decisión tomada)

- [ ] **Reproducción de audio real.** Hoy el reproductor es 100% simulado — no existe
      ningún `<audio>` ni archivo de sonido en el proyecto (el dataset de Spotify no
      trae audio, solo metadata + audio features). Opción recomendada evaluada:
      iTunes Search API (`itunes.apple.com/search`, sin auth, gratis) para resolver
      un preview real de 30s por `track_name` + `artist_name`, con fallback "vista
      previa no disponible" para los tracks sintéticos (no van a tener match real).
      Ya se había anticipado en `PLAN_MEJORAS_FRONTEND_P2.md` §3.1. Pendiente de
      decisión del usuario para implementar.

## Deuda técnica conocida (documentada, no resuelta por estar fuera de alcance de la capability que la encontró)

- [ ] `dim_create`/`dim_update` (`api/paquetes/gestion_datos/router.py`) construyen SQL
      por interpolación de strings, no parametrizada. Encontrado durante la
      implementación de `ingesta` en S8 (ver `design.md` archivado de esa capability);
      es código preexistente, no se corrigió para no expandir el alcance de esa
      capability.
- [ ] `api/routers/app_router.py` parece código muerto: no se importa desde
      `api/main.py` ni desde ningún paquete (`grep` confirmado en S8). Es probable
      que sea el archivo monolítico original anterior al refactor por paquetes
      (`api/paquetes/*`) descrito en `TRACKLYTICS_PLAN.md`. Verificar y eliminar si
      se confirma que no se usa.

## Capabilities de negocio fuera de alcance (dependencias externas no implementadas)

- [ ] **CU-T03 — Administración táctica de partners.** No existe alta/gestión de
      partners ni de llaves de API. La colección PocketBase `partners` se creó en S8
      como sustrato mínimo (alta manual vía superusuario) para que la capability
      operativa `partners` (CU-O12) tuviera algo que consumir.
- [ ] **Alimentación de `FACT_INTEGRACION_PARTNER`** desde `LOG_LLAMADAS_PARTNER` vía
      un pipeline ETL — explícitamente fuera de alcance de `partners` (S8); el log
      operativo ya existe y está listo como fuente para ese futuro pipeline.

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

## Resuelto (referencia histórica — no requiere acción)

- [x] ~~Campo `g.genre_id` sale con prefijo de tabla en `/genres/trends`~~ — verificado
      en vivo en S8, la respuesta ya devuelve `genre_id` limpio.
- [x] ~~CRUD de FACT_TRACKS no muestra registros en modo solo lectura~~ — verificado
      en vivo en S8 (`GET /facts` devuelve registros normalmente).
- [x] ~~Radar chart de géneros no cierra el polígono~~ — el código actual ya repite
      el primer elemento en `r`/`theta` (`renderRadar` en `dashboard.html`/`genres.html`).
- [x] ~~Migración de Favoritos/Historial/Playlists a ClickHouse/PocketBase~~ —
      completada en S6 (`FACT_ENGAGEMENT_USUARIO` + colecciones `playlists`/`playlist_tracks`).
