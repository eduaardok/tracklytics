## 1. Esquema

- [x] 1.1 `ALTER TABLE DIM_USUARIO ADD COLUMN perfil_publico UInt8 DEFAULT 0` (aplicado en vivo + `init_clickhouse.py`)
- [x] 1.2 `CREATE TABLE FACT_NOTIFICACION` (aplicado en vivo + `init_clickhouse.py`)
- [x] 1.3 Campo `es_publica` en la colección `playlists` de PocketBase (aplicado en vivo vía `scripts/migrar_visibilidad_publica.py` + `pb_init.py`)

## 2. Backend — Notificaciones (`social`)

- [x] 2.1 Módulo `paquetes/social/notificaciones.py` (crear, crear_para_seguidores_de_artista)
- [x] 2.2 `GET /social/notificaciones`, `PATCH /social/notificaciones/{id}/leer`, `PATCH /social/notificaciones/leer-todas`
- [x] 2.3 Trigger: track aprobado → seguidores del artista (`creadores/router.py`)
- [x] 2.4 Trigger: comentario raíz en track propio / respuesta a comentario propio (`social/router.py`)
- [x] 2.5 Trigger: alta de colaborador de playlist (`biblioteca/router.py`)

## 3. Backend — Perfiles públicos (`social` + `seguridad` + `biblioteca`)

- [x] 3.1 `GET`/`PATCH /seguridad/perfil` extendido con `perfil_publico`
- [x] 3.2 `PATCH /biblioteca/playlists/{id}/visibilidad`
- [x] 3.3 `GET /social/usuarios/{id}/perfil` (público, sin sesión)

## 4. Backend — "Para ti" en secciones (`experiencia`)

- [x] 4.1 Queries `RECOMENDACIONES_NOVEDADES_ARTISTAS_SEGUIDOS`, `REDESCUBRE_USUARIO`
- [x] 4.2 `GET /experiencia/recomendaciones` retorna `secciones[]`

## 5. Backend — filtros de exploración de usuarios (`seguridad`)

- [x] 5.1 `usuarios_listado_sql`/`usuarios_listado_total_sql` parametrizadas por rol/fecha
- [x] 5.2 `GET /seguridad/usuarios/buscar` acepta `rol`, `fecha_desde`, `fecha_hasta`

## 6. Verificación de backend

- [x] 6.1 curl real: notificaciones (comentario, respuesta, colaborador, track aprobado), perfil público (privado → 404, público → datos), visibilidad de playlist, secciones de recomendaciones, filtros de usuarios/buscar

## 7. Frontend — Toasts centralizados

- [x] 7.1 `shared/context/ToastContext.{tsx,module.css}` + montaje en `app/providers/index.tsx`
- [x] 7.2 Enganchar a las 22 páginas/hooks con mutaciones existentes (favoritos, playlists, social, admin, perfil, etc.)

## 8. Frontend — Notificaciones

- [x] 8.1 `packages/social/components/NotificationBell.{tsx,module.css}`, montada en `AppShell`
- [x] 8.2 Dropdown con lista, conteo de no leídas, marcar leída/todas, navegación a la referencia

## 9. Frontend — Perfiles públicos

- [x] 9.1 `packages/social/pages/PerfilPublicoPage.tsx`, ruta pública `/usuarios/:usuarioId`
- [x] 9.2 Toggle de visibilidad de perfil en `ProfilePage`
- [x] 9.3 Toggle de visibilidad por playlist en `PlaylistsTab`
- [x] 9.4 Enlaces a perfil público desde autores de comentario (`TrackSocialPage`) y colaboradores de playlist (`PlaylistsTab`)

## 10. Frontend — "Para ti" en secciones

- [x] 10.1 `RecomendacionesPage.tsx` reescrito para renderizar `secciones[]`

## 11. Frontend — `UserPicker` modo explorar

- [x] 11.1 Botón "ver lista completa", paginación, filtro de rol
- [x] 11.2 Verificar que los 4 paneles que ya usan `UserPicker` (Permisos, Auditoría de facturación, Regalías, Familia) heredan el modo sin cambios propios

## 12. Verificación de frontend

- [x] 12.1 `tsc --noEmit` limpio (sin errores nuevos — el único error preexistente es `EngagementPage.tsx`, no tocado en esta ronda)
- [x] 12.2 `npm run build` limpio
- [x] 12.3 Playwright: login, campana de notificaciones, perfil público (propio y ajeno), toggle de visibilidad de playlist, secciones de "Para ti", `UserPicker` en modo explorar, toasts de éxito/error en al menos 3 acciones distintas (ejecutado y documentado en `docs/BITACORA_S10.md` sección "Ronda 2 → Verificación" — quedó sin marcar en este archivo por descuido de bookkeeping, confirmado en S11)

## 13. Documentación

- [x] 13.1 `openspec validate --strict --all` (17/17 en verde, reconfirmado S11)
- [x] 13.2 Nueva sección en `docs/BITACORA_S10.md` con fecha 2026-07-12 ("Ronda 2", línea 378)
