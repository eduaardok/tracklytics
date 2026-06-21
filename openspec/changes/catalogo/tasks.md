## 1. PocketBase: colecciones de playlists

- [x] 1.1 Crear colección `playlists` (usuario, nombre) con regla de acceso: solo el propietario puede leer/crear/editar/eliminar sus propias playlists
- [x] 1.2 Crear colección `playlist_tracks` (playlist, fact_id) con regla de acceso heredada del propietario de la playlist
- [x] 1.3 Verificar que las reglas de acceso de PocketBase impiden que un usuario lea/edite playlists de otro usuario (RN-CAT-002)

## 2. FastAPI: autenticación

- [ ] 2.1 Implementar endpoint de registro (`POST /app/v1/auth/registro`) contra PocketBase (RF-CAT-001)
- [ ] 2.2 Implementar endpoint de login (`POST /app/v1/auth/login`) que valida credenciales en PocketBase y devuelve token de sesión (RF-CAT-002)
- [ ] 2.3 Implementar endpoint de logout (`POST /app/v1/auth/logout`) que invalida el token activo en el cliente (RF-CAT-003)
- [x] 2.4 Implementar dependencia de autorización que distingue Usuario B2C (user) de Cliente B2B (analyst) a partir del token de sesión (RN-CAT-004)
- [x] 2.5 Verificar que un login con credenciales inválidas responde "Credenciales inválidas" sin indicar el campo que falló (Escenario 2)

## 3. FastAPI: catálogo (lectura ClickHouse)

- [x] 3.1 Implementar endpoint de búsqueda (`GET /app/v1/tracks/search`) con filtros por nombre, artista y género contra FACT_TRACKS, con paginación real (`limit`/`offset` + `total`) (RF-CAT-004, RF-CAT-005)
- [x] 3.2 Asegurar cliente ClickHouse en `threading.local` por request (no singleton global) para los endpoints de catálogo
- [x] 3.3 Implementar endpoint de detalle de track por `fact_id` (`GET /app/v1/tracks/fact/{fact_id}`) con los 7 atributos de audio principales (RF-CAT-006)
- [x] 3.4 Implementar endpoints de detalle de artista, álbum y género para soportar la navegación cruzada (RF-CAT-007)
- [ ] 3.5 Medir y validar que la búsqueda responde en menos de 1 segundo con el volumen actual de FACT_TRACKS (RNF-CAT-001, CA-CAT-002)

## 4. FastAPI: biblioteca personal (favoritos/historial en ClickHouse, playlists en PocketBase)

- [x] 4.1 Implementar endpoints de favoritos (`POST`/`DELETE /app/v1/biblioteca/favoritos`) restringidos a Usuario B2C autenticado (RF-CAT-008, RN-CAT-004)
- [x] 4.2 Implementar endpoints de playlists: crear, renombrar, eliminar (PocketBase, vía frontend) (RF-CAT-009)
- [x] 4.3 Implementar endpoints de tracks de playlist: agregar/quitar, validando que el track no esté ya en la playlist antes de insertar (RF-CAT-010, RN-CAT-001, Escenario 4)
- [x] 4.4 Implementar registro automático de reproducción en el historial al consumir un track (sin endpoint manual de creación expuesto al cliente) (RF-CAT-011)
- [x] 4.5 Implementar endpoint de consulta de historial (`GET /app/v1/biblioteca/historial`) ordenado del más reciente al más antiguo, sin endpoints de edición/eliminación individual (RF-CAT-012, RN-CAT-003)
- [x] 4.6 Verificar que un Cliente B2B recibe error al intentar usar cualquier endpoint de `/app/v1/biblioteca` (RN-CAT-004)

## 5. Frontend: paquete `autenticacion/`

- [x] 5.1 Construir formularios de registro y login con Bootstrap 5 local
- [x] 5.2 Manejar almacenamiento del token de sesión en el cliente y su invalidación en logout
- [x] 5.3 Mostrar mensaje "Credenciales inválidas" en login fallido sin indicar el campo (Escenario 2)

## 6. Frontend: paquete `catalogo/`

- [x] 6.1 Construir vista de búsqueda con campo de texto y filtro de género, consumiendo `/app/v1/tracks/search`
- [x] 6.2 Construir vista de detalle de track con los 7 atributos de audio y enlaces de navegación cruzada a artista, álbum y género (RF-CAT-007)
- [x] 6.3 Implementar paginación de resultados en la interfaz

## 7. Frontend: paquete `biblioteca/`

- [x] 7.1 Construir control de favoritos (agregar/quitar) con actualización optimista de UI antes de confirmar la persistencia en ClickHouse (RNF-CAT-002)
- [x] 7.2 Construir gestión de playlists (crear, renombrar, eliminar, agregar/quitar tracks) con manejo de error visible cuando se rechaza un track duplicado (Escenario 4)
- [x] 7.3 Construir vista de historial de reproducción ordenado del más reciente al más antiguo, de solo lectura
- [ ] 7.4 Ocultar/deshabilitar las vistas de biblioteca personal cuando el usuario autenticado es Cliente B2B (RN-CAT-004)

## 8. Verificación end-to-end

- [ ] 8.1 Verificar CA-CAT-001: login con credenciales correctas otorga acceso al catálogo
- [ ] 8.2 Verificar CA-CAT-002: búsqueda válida responde en menos de 1 segundo
- [ ] 8.3 Verificar CA-CAT-003: un favorito agregado persiste tras cerrar e iniciar sesión nuevamente
- [ ] 8.4 Verificar CA-CAT-004: intentar duplicar un track en la misma playlist es rechazado con mensaje claro
- [ ] 8.5 Verificar CA-CAT-005: una reproducción de track actualiza el historial sin intervención manual
