## Why

Con la capa operativa cerrada (S10, bloques 1-5), la auditoría de esta ronda encontró que la
plataforma seguía sin cerrar el círculo social básico de un producto de streaming: seguir a un
artista o comentar un track no generaba ningún aviso al destinatario, no había forma de que un
usuario mostrara su actividad musical a otros (todo perfil era, de hecho, invisible), "Para ti"
era una única lista genérica que no distinguía descubrimiento de redescubrimiento, buena parte de
las mutaciones de la UI seguían sin feedback visual (el sistema de toasts nunca llegó a
construirse en el frontend React, a diferencia del legacy `app/js/toast.js` ya retirado), y los
paneles admin que necesitan identificar un usuario (`UserPicker`, ya usado en 4 paneles) nunca
explotó la capacidad de listado completo paginado que el backend ya exponía desde el
09-07 — solo permitía buscar escribiendo.

## What Changes

- **Notificaciones (`social`)**: tabla nueva `FACT_NOTIFICACION` (destinatario, tipo, referencia,
  leído, timestamps). Tres triggers reales: track aprobado de un artista seguido → notifica a
  todos sus seguidores activos (`creadores` → `social.notificaciones`); respuesta a un comentario
  o comentario raíz en un track propio (resuelto por nombre de artista → cuenta de artista) →
  notifica al autor; alta de colaborador en una playlist → notifica al colaborador
  (`biblioteca` → `social.notificaciones`). Endpoints `GET /social/notificaciones` (lista +
  conteo de no leídas), `PATCH /social/notificaciones/{id}/leer` y
  `PATCH /social/notificaciones/leer-todas`. Campana en la barra superior de React con contador y
  dropdown.
- **Perfiles públicos/privados (`social` + `seguridad` + `catalogo`)**: `DIM_USUARIO.perfil_publico`
  (privado por defecto), editable desde Mi Perfil (`GET`/`PATCH /seguridad/perfil`, extendido).
  Campo `es_publica` en la colección `playlists` de PocketBase (privada por defecto), con su
  propio endpoint `PATCH /biblioteca/playlists/{id}/visibilidad`, exclusivo del owner. Página
  pública `GET /social/usuarios/{id}/perfil` (sin sesión) que retorna nombre y playlists públicas
  con sus tracks si el perfil es público, o 404 si es privado y el visitante no es el dueño.
  Enlazada desde comentarios y colaboradores de playlist en la UI.
- **Variantes de "Para ti" (`experiencia`)**: `GET /experiencia/recomendaciones` pasa de una lista
  plana a `secciones[]`. "Hecho para ti" reutiliza el algoritmo de 3 niveles existente (sin
  cambios de heurística, solo de presentación). "Novedades de artistas que sigues" reutiliza la
  misma señal artist_id-en-seguidos que dispara la notificación de track nuevo (`FACT_TRACKS`
  ordenado por `inserted_at`). "Redescubre" resurge el propio historial/favoritos con interacción
  más antigua. Las dos últimas se omiten de la respuesta (no aparecen vacías) si no hay señal.
- **Toasts centralizados (frontend)**: `ToastProvider`/`useToast()` nuevo en
  `shared/context/ToastContext.tsx`, montado una vez en `app/providers/index.tsx`. Enganchado a
  las 22 páginas/hooks del frontend que ya tenían mutaciones sin feedback visual (favoritos,
  playlists CRUD/reorder/colaboradores/visibilidad, seguir/dejar de seguir, comentar, tickets de
  soporte, cambio de contraseña, y once paneles admin de permisos/auditoría/regalías/publicidad/
  creadores/distribución/facturación/familia) — no solo las mutaciones nuevas de esta ronda.
- **`UserPicker` con listado completo (`seguridad` + frontend transversal)**: el componente ya
  compartido por 4 paneles admin gana un modo "explorar" (botón de lista) que abre la tabla
  completa paginada sin escribir nada, filtrable por rol; `GET /seguridad/usuarios/buscar` ya
  soportaba esto desde el 09-07 pero el frontend nunca lo explotaba. Sin filtro de plan: el plan
  vive en PocketBase, no en `DIM_USUARIO` — unirlo por fila implicaría N+1 llamadas a PocketBase
  por página en vez de un `WHERE` en ClickHouse (decisión explícita).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `social`: notificaciones (tabla, triggers, endpoints, UI); perfil público.
- `seguridad`: flag de visibilidad de perfil (`GET`/`PATCH /seguridad/perfil` extendido); modo
  explorar con filtros en `GET /seguridad/usuarios/buscar` (ya existente, ahora explotado por
  `UserPicker`).
- `catalogo`: flag `es_publica` en playlists propias, endpoint de visibilidad.
- `experiencia`: "Para ti" en secciones en vez de una lista plana.

## Impact

- **ClickHouse**: `DIM_USUARIO.perfil_publico` (`ALTER TABLE ADD COLUMN`), tabla nueva
  `FACT_NOTIFICACION` — ambos aplicados en vivo y agregados a `init_clickhouse.py` para
  instalaciones nuevas.
- **PocketBase**: campo `es_publica` en `playlists` — aplicado en vivo con
  `scripts/migrar_visibilidad_publica.py` (mismo patrón que
  `scripts/migrar_playlists_colaborativas.py`) y agregado a `pb_init.py`.
- **Backend**: `api/paquetes/social/{queries.py,router.py,notificaciones.py}` (nuevo módulo);
  `api/paquetes/seguridad/{queries.py,router.py}` (perfil, filtros de listado);
  `api/paquetes/biblioteca/{pb_playlists.py,router.py}` (visibilidad, trigger de colaborador);
  `api/paquetes/creadores/router.py` (trigger de track aprobado);
  `api/paquetes/experiencia/{queries.py,router.py}` (secciones de recomendaciones).
- **Frontend**: `shared/context/ToastContext.{tsx,module.css}` (nuevo);
  `packages/social/components/NotificationBell.{tsx,module.css}` (nuevo, montado en `AppShell`
  por ruta directa — mismo criterio anti-bundle-bloat que `UserMenu`);
  `packages/social/pages/PerfilPublicoPage.tsx` (nuevo, ruta pública `/usuarios/:usuarioId`);
  `packages/experiencia/pages/RecomendacionesPage.tsx` (reescrito, secciones);
  `shared/components/UserPicker.{tsx,module.css}` (modo explorar); 19 archivos adicionales con
  mutaciones enganchadas a `useToast()`.
- **Fuera de alcance**: filtro de plan en `UserPicker` (ver arriba); notificaciones push/email
  (solo in-app); "Redescubre" como tercer nivel de recomendación es explícitamente nice-to-have,
  incluido porque alcanzó el tiempo.
