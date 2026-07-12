## 1. Dashboards administrativos (RT-04) — 6 capabilities

- [x] 1.1 `seguridad`: `ACCIONES_POR_DIA`, `ERRORES_ULTIMAS_24H`, `SESIONES_ABIERTAS_TOTAL` (queries.py) + `GET /admin/dashboard`.
- [x] 1.2 `facturacion`: `INGRESO_POR_DIA`, `TRANSACCIONES_ULTIMAS_24H`, `INGRESO_TOTAL_HISTORICO` + `GET /admin/dashboard`.
- [x] 1.3 `creadores`: `SUBIDAS_POR_ESTADO`, `CUENTAS_ARTISTA_TOTAL` + `GET /admin/dashboard`.
- [x] 1.4 `social`: `ACTIVIDAD_SOCIAL_POR_DIA`, `ARTISTAS_MAS_SEGUIDOS` + `GET /admin/dashboard`.
- [x] 1.5 `distribucion`: `RESTRICCIONES_POR_PAIS`, `LICENCIAS_ACTIVAS_TOTAL` + `GET /admin/dashboard`.
- [x] 1.6 `experiencia`: `TICKETS_POR_ESTADO`, `TICKETS_ABIERTOS_TOTAL` + `GET /admin/dashboard`.
- [x] 1.7 Frontend: `shared/components/charts/` (MiniLineChart, MiniDonutChart, MiniBarChart, ChartTooltip, paleta oklch validada) reusables entre las 6 páginas.
- [x] 1.8 Frontend: 6 páginas (`AuditoriaPage`, `AuditoriaFacturacionPage`, `RevisionCreadoresPage`, `ModeracionSocialPage`, `DistribucionAdminPage`, `TicketsAdminPage`) con panel de KPIs + gráficos sobre datos reales, `lazyNamed()` en `router.tsx`.
- [x] 1.9 Fix de regresión de bundle: barrel re-exports de seguridad/facturacion/creadores/social/distribucion/experiencia filtraban los 6 dashboards al bundle principal por imports eager de otros componentes del mismo paquete — convertidos a imports de ruta directa (`router.tsx`, `AppShell.tsx`, `SeguridadShell.tsx`, `AnalyticaShell.tsx`, `PlanesPage.tsx`, `ProfilePage.tsx`, `RegisterPage.tsx`). Verificado con `npm run build` + grep de strings de cada dashboard en el bundle principal (0 matches).
- [x] 1.10 Verificar con curl los 6 endpoints de dashboard contra la API viva, confirmando datos reales (no sintéticos inventados).

## 2. Sesiones activas multi-dispositivo (`seguridad`)

- [x] 2.1 `MIS_SESIONES_ABIERTAS`, `SESION_POR_ID` (queries.py) — fix de `Code 184: ILLEGAL_AGGREGATION` envolviendo el filtro en un `SELECT * FROM (...) WHERE ...` externo (mismo patrón ya usado en `_CUENTA_RESUELTA`).
- [x] 2.2 `GET /seguridad/sesiones`, `DELETE /seguridad/sesiones/{sesion_id}` (reusa `_cerrar_sesion()`, verifica ownership → 403/404).
- [x] 2.3 Frontend: sección "Mis sesiones" en `ProfilePage` (`authApi.misSesiones()`, `cerrarSesionRemota()`, `miDispositivoId()`).
- [x] 2.4 Verificar con curl: listar sesiones abiertas reales (multi-login del mismo usuario), cerrar una remota, confirmar que desaparece de la lista.

## 3. Búsqueda avanzada (`catalogo`)

- [x] 3.1 `GET /tracks/search`: parámetros opcionales `popularity_min`, `tempo_min`, `tempo_max`, `energy_min` sobre `ft.popularity`/`ft.tempo`/`ft.energy`.
- [x] 3.2 Frontend: panel "Filtros avanzados" colapsable en `CatalogPage` (`CancionesSection`).
- [x] 3.3 Verificar con curl: búsqueda combinando los 3 filtros contra datos reales.

## 4. Feed de actividad social (`social`)

- [x] 4.1 `FEED_ACTIVIDAD_SEGUIDOS` (UNION ALL comentarios + comparticiones de tracks de artistas seguidos) + `GET /social/feed`.
- [x] 4.2 Frontend: sección "Actividad reciente de artistas que sigo" en `SeguidosSocialPage`.
- [x] 4.3 Documentar explícitamente la reinterpretación: `social` sigue artistas, no usuarios — el feed no simula un follow de usuarios inexistente.

## 5. Playlists: reorder + colaborativa (`catalogo`)

- [x] 5.1 PocketBase: campo `colaboradores` (relation multi a `users`) en `playlists`; reglas ampliadas de `playlists`/`playlist_tracks` (`listRule`/`viewRule`/`createRule`/`updateRule`/`deleteRule` incluyen colaboradores; `updateRule`/`deleteRule` de la playlist en sí siguen siendo exclusivos del owner).
- [x] 5.2 `pb_init.py` actualizado (instalación nueva) + `scripts/migrar_playlists_colaborativas.py` (instancia ya viva) — ejecutado dos veces contra la instancia real: alta del campo/reglas, y luego ampliación de `updateRule` de `playlist_tracks` a colaboradores (ver 5.4).
- [x] 5.3 `pb_playlists.py`: `reordenar()` (PATCH secuencial de `position`, 1-indexado), `agregar_colaborador()`/`quitar_colaborador()` (modifiers `colaboradores+`/`colaboradores-` de PocketBase v0.23+).
- [x] 5.4 Bug encontrado y corregido en verificación: `position` es un campo numérico `required` en PocketBase, que trata `0` como "vacío" (`validation_required`) — `reordenar()` debía arrancar en 1, no en 0 (mismo criterio que `agregar_track`). Encontrado también: `playlist_tracks.updateRule` no incluía a los colaboradores (solo `listRule`/`viewRule`/`createRule`/`deleteRule`), lo que bloqueaba el reorder para un colaborador — corregido en `pb_init.py` y en el script de migración, y re-ejecutada la migración contra la instancia viva.
- [x] 5.5 `router.py`: `PUT /playlists/{id}/reordenar`, `POST`/`DELETE /playlists/{id}/colaboradores[/{usuario_id}]` (resuelve email → `usuario_id` reusando `USUARIO_POR_EMAIL` de `experiencia`, mismo patrón de import cruzado ya usado en este archivo); `detalle_playlist` expone `is_owner`/`colaboradores`.
- [x] 5.6 Fix de bug preexistente (no introducido en esta iteración): `eliminar_playlist` fallaba con 500 para cualquier playlist con ≥1 track — PocketBase rechaza borrar un registro referenciado por una relation `required` con `cascadeDelete: false`. `pb_playlists.eliminar()` ahora borra primero los `playlist_tracks` de la playlist.
- [x] 5.7 Traducción de 404-por-regla-de-PocketBase a 403 legible en `renombrar_playlist`, `eliminar_playlist`, `reordenar_playlist` y gestión de colaboradores.
- [x] 5.8 Frontend: controles de mover arriba/abajo por track (sin librería de drag-and-drop nueva) y panel de colaboradores (listar/invitar por email/quitar, visible a todos con acceso, edición solo para el owner) en `PlaylistsTab`.
- [x] 5.9 Verificar con curl extremo a extremo con dos usuarios reales: owner crea playlist + agrega 3 tracks, invita colaborador por email, colaborador ve el detalle (`is_owner: false`), colaborador reordena, colaborador intenta renombrar (403 limpio), owner quita al colaborador, colaborador sin acceso ya no ve el detalle (404), owner elimina la playlist con tracks (verifica el fix de 5.6).

## 6. Validación final

- [x] 6.1 `npm run build` limpio (typecheck + bundle) tras cada tanda de cambios de frontend.
- [x] 6.2 Regresión con curl sobre los 6 dashboards, sesiones, búsqueda avanzada, feed social y ciclo completo de playlists colaborativas — 0 roturas tras los fixes de 1.9, 2.1, 5.4 y 5.6.
- [ ] 6.3 Recorrido manual en navegador de las pantallas nuevas/tocadas — no se pudo automatizar en este entorno (sin herramienta de automatización de navegador disponible en esta sesión); pendiente de confirmación visual del usuario.
