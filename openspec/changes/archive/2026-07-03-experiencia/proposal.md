## Why

Tracklytics no captura hoy la telemetría de consumo real que sostiene el modelo de negocio
data-flywheel: no hay evento de reproducción enriquecido (dispositivo, sesión, % completado)
más allá del registro básico de historial, no hay forma de medir si una recomendación mostrada
al usuario se traduce en reproducción, no hay canal de soporte para usuarios, no hay soporte
para agrupar suscriptores bajo un plan familiar, y dos piezas de experiencia de usuario quedaron
explícitamente diferidas en capabilities anteriores (portada real de álbum/artista/track, y
reproducción de audio real) porque dependían de una capability propia. `experiencia` cierra
estos seis vacíos, siendo la última de las seis capabilities operativas nuevas del proyecto.

## What Changes

- Se agrega **evento de reproducción enriquecido** (`FACT_REPRODUCCION_EVENTO`): dispositivo,
  sesión y porcentaje completado por reproducción, complementario al registro de historial ya
  existente (no lo reemplaza).
- Se agrega **telemetría de recomendaciones**: impresión mostrada al usuario
  (`FACT_IMPRESION_RECOMENDACION`) y si se tradujo en reproducción, con un algoritmo simple de
  reglas (sin motor de machine learning).
- Se agrega **canal de soporte**: Usuario B2C crea tickets, Lead Data Engineer/CTO los consulta
  y actualiza su estado (`FACT_TICKET_SOPORTE`).
- Se agrega **exposición a experimentos A/B** (`FACT_AB_TEST_EXPOSICION`), como infraestructura
  de medición reutilizable para futuras pruebas de producto.
- Se agrega un **reflejo analítico de las playlists del usuario** (`BRIDGE_TRACK_PLAYLIST_USUARIO`),
  sincronizado por un job batch desde la fuente de verdad operativa (PocketBase), para permitir
  análisis táctico (ej. tracks más agregados a playlists) sin convertir a ClickHouse en la fuente
  de verdad de esa entidad.
- Se agrega **agrupación de suscriptores bajo un plan familiar**
  (`BRIDGE_SUSCRIPTOR_FAMILIA`): un titular puede agregar miembros a su propia suscripción activa
  hasta un límite fijo, sobre cualquier plan pago existente (no introduce un plan nuevo).
- Se implementa **portada real de álbum/artista/track**: búsqueda en un directorio musical
  externo para el catálogo licenciado, con reemplazo visual local cuando no hay portada
  disponible — nunca una dependencia dura de un servicio externo.
- Se implementa **reproducción de audio real**, extendiendo el reproductor persistente ya
  existente (no reconstruyéndolo) con una fuente de audio real por búsqueda de texto; si no hay
  resultado disponible, el control de reproducción queda deshabilitado sin afectar el resto de
  la interfaz.

## Capabilities

### New Capabilities
- `experiencia`: telemetría de consumo real (reproducción enriquecida, recomendaciones),
  soporte al usuario, exposición a experimentos, reflejo analítico de playlists, agrupación de
  suscriptores familiares, y las dos piezas de experiencia visual/auditiva diferidas
  (portada real, reproducción de audio real).

### Modified Capabilities
Ninguna. `catalogo` no tiene ningún `### Requirement:` cuyo comportamiento cambie — su
"Reproductor persistente con barra de progreso navegable" sigue cumpliéndose exactamente igual
(el reproductor se extiende con una fuente de audio real, no se reemplaza ni cambia su
contrato). La sección informal "Fuera de alcance" de `catalogo/spec.md` menciona dos líneas que
quedan desactualizadas por este cambio (reproducción de audio real; recomendaciones "cubiertas
en analítica"), pero esa sección no es una lista de `### Requirement:` — no aplica el mecanismo
formal de spec delta. Se corrige como una edición directa de housekeeping durante la
implementación (`tasks.md`), no como delta spec.

## Impact

- **ClickHouse**: 6 tablas nuevas (`FACT_REPRODUCCION_EVENTO`, `FACT_IMPRESION_RECOMENDACION`,
  `FACT_TICKET_SOPORTE`, `FACT_AB_TEST_EXPOSICION`, `BRIDGE_TRACK_PLAYLIST_USUARIO`,
  `BRIDGE_SUSCRIPTOR_FAMILIA`) más dos columnas nuevas en `DIM_ARTISTS`/`DIM_ALBUMS` para
  portada real.
- **FastAPI**: nuevo paquete `api/paquetes/experiencia/` con endpoints de reproducción
  enriquecida, recomendaciones, tickets de soporte y suscriptores familiares; reusa
  `require_admin`/`audit.record` de `seguridad` y `require_b2c_user`/`get_current_user` de
  `core.deps` — no introduce mecanismos de autorización nuevos.
- **ETL (Python, Airflow)**: un nuevo job batch de sincronización PocketBase → ClickHouse para
  `BRIDGE_TRACK_PLAYLIST_USUARIO`, y una extensión del job de carga existente para resolver
  portadas reales vía un directorio musical externo.
- **Frontend (React)**: nuevo paquete `frontend/src/packages/experiencia/` para soporte y
  administración de tickets/experimentos; extensión (no reemplazo) de
  `shared/components/PlayerBar.tsx`/`shared/context/PlayerContext.tsx` con reproducción real, y
  de `packages/catalogo/components/TrackCard.tsx` con portada real — ambos ya existen desde la
  migración de `catalogo`.
- **Capability `catalogo`**: spec delta menor (ver arriba), sin cambios de código en esta
  propuesta — el trabajo de implementación toca sus componentes compartidos pero no sus
  endpoints ni requerimientos propios.
