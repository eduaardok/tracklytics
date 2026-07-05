## Context

Cinco campos de entrada manual de ID (`fact_id` de track o `usuario_id`) viven hoy en Distribución, Social, Administración, Facturación y plan familiar. Para tracks ya existe un endpoint de búsqueda por nombre/artista (`GET /app/v1/tracks/search`, en `api/paquetes/catalogo/router.py`, sin guard, consulta ClickHouse). Para usuarios no existe ningún endpoint de búsqueda por nombre o correo — solo lecturas exactas por `usuario_id`.

El frontend ya tiene un patrón probado y reusado para este mismo problema: `ArtistPicker` (`frontend/src/packages/analitica/components/ArtistPicker.tsx`) — input con debounce de 300ms, dropdown tipo listbox, selección por `onMouseDown` (evita que el `blur` del input cierre el dropdown antes del click), botón de limpiar selección. Hoy solo se usa dentro de `analitica` (`ComparacionPage` x2, `ArtistaBenchmarkPage` x1), acotado a artistas.

## Goals / Non-Goals

**Goals:**
- Que las 5 ubicaciones dejen de requerir que el operador conozca un ID interno.
- Un endpoint de búsqueda de usuarios por nombre o correo, exclusivo de `admin`.
- Dos componentes de selección con búsqueda reusables entre paquetes (tracks, usuarios), generalizando el patrón ya validado de `ArtistPicker` en vez de inventar uno nuevo.

**Non-Goals:**
- No se crea un catálogo público de playlists ni ningún concepto nuevo de negocio — la búsqueda de tracks ya existe y no cambia.
- No se migra `ArtistPicker` en sí (sigue viviendo en `analitica`, acotado a sus 3 usos actuales) — los componentes nuevos son paralelos, no un reemplazo de ese componente.
- No se agrega un mecanismo de autorización nuevo — todo consumidor de la búsqueda de usuarios ya depende de `require_admin` hoy.

## Decisions

### Dónde vive el endpoint de búsqueda de usuarios: ClickHouse `DIM_USUARIO`, paquete `seguridad`
La identidad de usuario vive en dos lugares: PocketBase (credenciales, fuente real) y `DIM_USUARIO` en ClickHouse (reflejo poblado en cada registro/login, columnas `usuario_id`, `email`, `nombre`, `pais`, `rol`, `fecha_registro` — ver `api/paquetes/seguridad/router.py`, `_insert_dim_usuario`). Buscar por nombre o correo con `LIKE` es una operación de solo lectura y agregación, el tipo de consulta para la que ClickHouse ya es la fuente en todo el resto del proyecto — no PocketBase, que no está pensado para búsquedas de texto libre por el frontend. El endpoint nuevo (`GET /app/v1/seguridad/usuarios/buscar?q=&limit=`) vive en `api/paquetes/seguridad/router.py`, dueño de `DIM_USUARIO` y de `require_admin` (`api/paquetes/seguridad/deps.py`), reutilizado sin cambios por `creadores`, `distribucion`, `experiencia`, `facturacion` y `social` para sus propios endpoints admin — el mismo guard aplica aquí sin necesidad de una dependencia nueva.

Alternativa considerada: exponer la búsqueda directo contra PocketBase (`GET /api/collections/users/records?filter=...`) desde cada capability consumidora. Rechazada: duplicaría la llamada a PocketBase en 3 paquetes distintos, y esta app ya seguía el patrón de que ninguna capability de negocio llama a PocketBase directo salvo `seguridad` (dueña de esa integración) — ver `openspec/specs/seguridad/spec.md`, "Registro de usuario".

### Dos componentes de selección, generalizando el patrón de `ArtistPicker`
Se crean `TrackPicker` y `UserPicker` en `frontend/src/shared/components/` (no en `analitica`, porque los consumidores son de 5 capabilities distintas — `shared/` es la única ubicación que cualquier paquete puede importar sin romper la regla de aislamiento por capability). Ambos replican la mecánica ya probada de `ArtistPicker` (debounce 300ms, `onMouseDown` para seleccionar, botón de limpiar, `role="listbox"`):
- `TrackPicker`: busca contra `GET /tracks/search` (ya existente, catalogo), muestra `AlbumArt` + nombre + artista por resultado.
- `UserPicker`: busca contra el endpoint nuevo `GET /seguridad/usuarios/buscar`, muestra nombre + correo por resultado.

Alternativa considerada: mover `ArtistPicker` a `shared/` y parametrizarlo por tipo de entidad (track/usuario/artista) con una prop de "search function" genérica. Rechazada por ahora: forzaría tocar los 3 usos existentes de `ArtistPicker` dentro de `analitica` (fuera del alcance de este cambio) solo para ganar una abstracción que, con 3 variantes concretas, no ahorra código real frente a duplicar el esqueleto ya extraído — ver guía del proyecto de preferir 2-3 líneas repetidas antes que una abstracción prematura.

## Risks / Trade-offs

- [`DIM_USUARIO` puede quedar desalineado si un usuario cambia su nombre o correo directo en PocketBase sin volver a iniciar sesión] → Mitigación: no aplica hoy — no existe ningún flujo de edición de perfil que cambie nombre/correo (`ProfilePage` no expone esa edición); si se agrega en el futuro, deberá sincronizar `DIM_USUARIO` igual que ya hace el login (`USUARIO_EXISTE_EN_DIM`/backfill).
- [Un admin escribe una búsqueda muy corta (1 carácter) y trae cientos de coincidencias] → Mitigación: mismo patrón ya usado por `ArtistPicker`, que solo dispara la búsqueda con 2+ caracteres; se replica ese mínimo en `TrackPicker`/`UserPicker`, más un `limit` acotado en el endpoint nuevo (igual que `tracks/search`).
