## Context

Tracklytics combina dos bases de datos con propósitos distintos: PocketBase como fuente operativa (autenticación y entidades propias de la app) y ClickHouse como fuente analítica para el catálogo musical técnico (FACT_TRACKS y dimensiones) y, en esta capability, también como sistema de registro de eventos de biblioteca personal. La capability `catalogo` cruza ambos mundos en una misma request: lee catálogo desde ClickHouse, gestiona playlists en PocketBase, y registra favoritos/historial como eventos en ClickHouse (`FACT_ENGAGEMENT_USUARIO`), escritos de forma síncrona y directa desde FastAPI. FastAPI expone ambos accesos bajo `/app/v1/catalogo` (lectura de catálogo) y `/app/v1/biblioteca` (favoritos, playlists, historial).

Restricciones del proyecto que aplican a este diseño:
- ClickHouse es de solo lectura en cuanto al catálogo técnico (FACT_TRACKS y dimensiones); esta capability no escribe catálogo. Sí escribe eventos de biblioteca personal (favoritos, historial) en `FACT_ENGAGEMENT_USUARIO`, una tabla distinta del catálogo técnico (ver decisión dedicada más abajo).
- El cliente ClickHouse se gestiona en `threading.local` por request, nunca como singleton global.
- PocketBase es la base de datos para autenticación y para playlists (con sus tracks), con reglas de acceso por usuario.
- Favoritos e historial de reproducción no viven en PocketBase: se registran como eventos en ClickHouse (`FACT_ENGAGEMENT_USUARIO`), escritos de forma síncrona y directa desde los endpoints de FastAPI.
- `track_id` no es único en FACT_TRACKS (relación N:M con género); toda referencia a un track concreto desde biblioteca usa `fact_id`.

## Goals / Non-Goals

**Goals:**
- Autenticar usuarios contra PocketBase y exponer un token de sesión consumible por el frontend.
- Exponer búsqueda y detalle de catálogo musical leyendo ClickHouse, con tiempos de respuesta <1s.
- Persistir playlists (con sus tracks) en PocketBase, con reglas de acceso por usuario, y registrar favoritos e historial de reproducción como eventos en ClickHouse (`FACT_ENGAGEMENT_USUARIO`), escritos de forma síncrona desde FastAPI.
- Diferenciar el acceso de Usuario B2C (lectura + biblioteca) del Cliente B2B (solo lectura de catálogo).

**Non-Goals:**
- Recuperación de contraseña.
- Recomendaciones automáticas de tracks.
- Streaming/reproducción real de archivos de audio.
- Cualquier escritura de catálogo técnico (ETL, carga a ClickHouse) — eso es responsabilidad de otra capability.

## Decisions

### Dónde vive cada entidad

| Entidad | Base de datos | Razón |
|---|---|---|
| Usuario, credenciales, sesión | PocketBase | PocketBase gestiona el hashing de contraseñas y emisión de tokens de forma nativa; no se reimplementa auth en FastAPI. |
| Favoritos | ClickHouse (`FACT_ENGAGEMENT_USUARIO`) | Se registra como evento (`favorito_add`/`favorito_remove`) escrito de forma síncrona y directa desde el endpoint de FastAPI; el estado actual de favoritos se deriva leyendo el último evento por `fact_id` y usuario (ver decisión dedicada). |
| Playlists y sus tracks | PocketBase | Propiedad por usuario, mutable, con reglas de unicidad por playlist (RN-CAT-001) que se validan a nivel de aplicación antes de insertar. |
| Historial de reproducción | ClickHouse (`FACT_ENGAGEMENT_USUARIO`) | Se registra como evento (`reproduccion`) escrito de forma síncrona y directa desde el endpoint de FastAPI; solo lectura para el usuario (RN-CAT-003), nunca editado ni eliminado individualmente desde el cliente. |
| FACT_TRACKS, DIM_ARTISTS, DIM_ALBUMS, DIM_GENRES | ClickHouse | Catálogo técnico de ~700k+ registros; ClickHouse es la única fuente analítica (RT-05) y el motor adecuado para búsquedas paginadas con baja latencia sobre grandes volúmenes. Esta capability solo lee, nunca escribe aquí. |

### Favoritos e historial como eventos en ClickHouse (FACT_ENGAGEMENT_USUARIO), escritura síncrona desde FastAPI

Favoritos e historial de reproducción no se modelan como entidades CRUD en PocketBase, sino como una tabla de eventos append-only en ClickHouse: `FACT_ENGAGEMENT_USUARIO` (`user_id`, `fact_id`, `event_type` ∈ {`favorito_add`, `favorito_remove`, `reproduccion`}, `event_timestamp`, y una marca de origen del evento). Cada solicitud de favorito o reproducción se procesa así, dentro del mismo request HTTP:

1. El endpoint de FastAPI (`/app/v1/biblioteca/favoritos/{fact_id}`, `/app/v1/biblioteca/historial/{fact_id}`) valida el token de sesión y verifica que el `fact_id` exista en FACT_TRACKS.
2. El endpoint inserta una sola fila en `FACT_ENGAGEMENT_USUARIO` vía `clickhouse-connect`, de forma síncrona, sin cola ni archivo intermedio.
3. El estado "favorito actual" de un track se deriva en lectura, tomando el último evento (`favorito_add` o `favorito_remove`) por `fact_id` y usuario; el historial se lee directamente como la secuencia de eventos `reproduccion` ordenados por `event_timestamp`.

Esta escritura síncrona, fila por fila, es una excepción consciente y razonada al patrón de carga batch del catálogo (que sí pasa por staging y Airflow): sigue cumpliendo RT-01 ("todo movimiento de datos ocurre desde Python") porque la inserción ocurre desde FastAPI, que es Python, usando el mismo cliente `clickhouse-connect` que el resto de la API — RT-01 exige que el movimiento de datos sea código Python, no que sea necesariamente un proceso batch. El pipeline Parquet/Airflow sigue siendo exclusivo de la carga del catálogo técnico (FACT_TRACKS y dimensiones); esta capability nunca lo invoca ni depende de él para registrar biblioteca personal.

Alternativa descartada: modelar favoritos/historial como colecciones de PocketBase (decisión original de este documento) con un pipeline ETL posterior hacia ClickHouse para alimentar `FACT_ENGAGEMENT_USUARIO`. Se descarta porque la implementación real ya escribe los eventos directamente y de forma síncrona en ClickHouse, evitando una doble escritura y el retraso de un ETL intermedio, y porque la capability `analitica` ya depende de `FACT_ENGAGEMENT_USUARIO` como tabla de eventos disponible en tiempo real para calcular `engagement_score`.

### Identificador de track en biblioteca: `fact_id` vs `track_id`

Favoritos, playlists e historial referencian tracks por `fact_id` (no `track_id`), porque un mismo `track_id` puede aparecer en múltiples filas de FACT_TRACKS (uno por género). Guardar `track_id` introduciría ambigüedad sobre qué fila/género se favoriteó. Alternativa descartada: resolver la ambigüedad en tiempo de lectura uniendo por `track_id` y desambiguando por género — se rechaza porque complica las reglas de no-duplicado (RN-CAT-001) y el detalle de audio mostrado.

### Optimistic UI en favoritos/historial y en playlists

El frontend actualiza la interfaz inmediatamente al marcar/desmarcar un favorito, registrar una reproducción o modificar una playlist (RNF-CAT-002), sin esperar la respuesta del backend antes de repintar (fire-and-forget desde el cliente). En el backend, cada solicitud se procesa de forma síncrona dentro del propio request: favoritos/historial insertan directamente en ClickHouse (`FACT_ENGAGEMENT_USUARIO`) y playlists escriben en PocketBase. Si la escritura subyacente falla, el frontend revierte el cambio optimista y muestra un mensaje de error. Alternativa descartada: esperar confirmación del backend antes de actualizar la UI — se rechaza porque introduce latencia perceptible en una interacción de uso muy frecuente.

### Validación de no-duplicado en playlists

La regla "un track solo puede agregarse una vez a la misma playlist" (RN-CAT-001) se valida en el backend (FastAPI) antes de insertar en PocketBase, devolviendo un error explícito si el track ya existe en la playlist. Alternativa descartada: depender de una restricción de unicidad a nivel de PocketBase sin validación previa — se rechaza porque el mensaje de error a nivel de base de datos es menos claro para el usuario que una validación explícita en el endpoint (Escenario 4 / CA-CAT-004).

### Acceso de solo lectura para Cliente B2B

El rol de Cliente B2B (analyst) puede invocar los endpoints de búsqueda y detalle de `/app/v1/catalogo`, pero los endpoints de `/app/v1/biblioteca` rechazan la operación si el usuario autenticado no tiene rol de Usuario B2C (RN-CAT-004). Esta verificación se hace en FastAPI a nivel de dependencia de autorización, reutilizando el token de sesión emitido por PocketBase.

### Endpoints de autenticación: el frontend permanece hablando directo con PocketBase, sin proxy en FastAPI

El frontend invoca directamente los endpoints nativos de PocketBase para registro (`POST /api/collections/users/records`), login (`POST /api/collections/users/auth-with-password`) y logout (eliminación del token en el cliente), sin pasar por un proxy `/app/v1/auth/*` en FastAPI. Esta capability no introduce dichos endpoints proxy.

Razón: PocketBase ya expone estas operaciones de forma segura (hashing de contraseña, emisión y validación de token), y el resto de la API (`get_current_user` en `api/core/deps.py`) ya valida ese mismo token contra PocketBase vía `auth-refresh`. Agregar un proxy en FastAPI duplicaría esa lógica sin resolver ningún requisito funcional adicional: RF-CAT-001/002/003 exigen que registro/login/logout funcionen, no que el cliente llegue a PocketBase indirectamente. Alternativa descartada: implementar `/app/v1/auth/registro`, `/app/v1/auth/login`, `/app/v1/auth/logout` como proxies — se descarta porque no hay hoy un requisito de negocio (auditoría centralizada, intercambio de token específico para un cliente móvil, throttling de login a nivel de aplicación) que lo justifique, y porque el flujo actual ya cumple RF-CAT-001/002/003 y RNF-CAT-003 sin esa capa adicional. Si en el futuro surge un requisito concreto que lo exija, se documentará como una actualización de esta decisión.

## Risks / Trade-offs

- [Riesgo] Búsqueda de catálogo lenta al crecer FACT_TRACKS más allá de ~700k registros → Mitigación: índices/orden de columnas en ClickHouse sobre nombre, artista y género, y paginación obligatoria en la API (RNF-CAT-001).
- [Riesgo] Inconsistencia entre la UI optimista y el estado real si la escritura subyacente (ClickHouse para favoritos/historial, PocketBase para playlists) falla → Mitigación: el frontend revierte el cambio optimista y notifica el error al usuario.
- [Riesgo] La escritura síncrona evento por evento en `FACT_ENGAGEMENT_USUARIO` agrega dos round-trips a ClickHouse en el camino crítico del request (verificación de existencia del `fact_id` + insert del evento) → Mitigación: el volumen de eventos por usuario es bajo (favoritos y reproducciones individuales, no cargas masivas), y el patrón de inserts pequeños y frecuentes es consistente con el motor MergeTree usado en esta tabla.
- [Riesgo] Cliente ClickHouse mal gestionado entre requests concurrentes del frontend → Mitigación: cliente en `threading.local` por request, nunca singleton global (restricción de proyecto ya establecida para toda la API).
- [Riesgo] Confusión entre `track_id` y `fact_id` al integrar frontend/backend → Mitigación: la API de biblioteca solo acepta `fact_id` como identificador de track; se documenta explícitamente en los endpoints.

## Migration Plan

No aplica migración de datos: esta capability introduce colecciones nuevas en PocketBase (usuarios ya existen como dataset base; se agregan colecciones de `playlists` y `playlist_tracks`) y endpoints nuevos en FastAPI. Favoritos e historial no requieren una colección nueva en PocketBase: se registran directamente en `FACT_ENGAGEMENT_USUARIO`, tabla ya definida en el modelo de datos técnico de ClickHouse. No se modifica el esquema de FACT_TRACKS ni de las dimensiones del catálogo. Despliegue vía `docker compose up` sin pasos manuales adicionales.

## Open Questions

Ninguna pendiente: el alcance, reglas de negocio y dependencias quedan completamente definidos en la especificación.
