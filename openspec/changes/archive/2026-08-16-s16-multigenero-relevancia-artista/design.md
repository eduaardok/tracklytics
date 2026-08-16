## Context

`STG_ARTIST_UPLOADS.genre_id` era un `UInt16` escalar — una subida de artista solo podía llevar
un género, mientras que `FACT_TRACKS` ya modela N:M track-género vía filas repetidas que
comparten `track_id` (confirmado en `promocion.py` y en las queries de catálogo antes de tocar
nada). `FACT_SUBIDA_TRACK.fact_id_promovido` es un único `UInt64` nullable, usado por
`retirar_track` para ocultar el track en el catálogo — con un solo género esto era correcto por
construcción (una subida = una fila de FACT_TRACKS), pero rompería con multi-género si no se
corregía a la vez (solo ocultaría el género "principal").

Las notificaciones de comentario tenían dos rutas: comentario raíz (`referencia_tipo="track"`,
ya funcionaba) y respuesta (`referencia_tipo="comentario"`, sin vista de destino en el frontend
— `NotificationBell.abrir()` no tiene rama para ese tipo, el clic no navegaba a ningún lado).

`/tracks/search` ordenaba únicamente por `popularity DESC`.

## Goals / Non-Goals

**Goals**
- Multi-género real en subida de artista, consistente con el modelo N:M ya existente.
- Retiro de un track propio oculta todas sus filas (todos los géneros), no solo una.
- Notificación de respuesta a comentario navegable (mismo destino que la de comentario raíz).
- Relevancia textual en `/tracks/search` como complemento de popularidad, no su reemplazo.
- Badge de contenido explícito visible en catálogo (el campo ya se capturaba, no se mostraba).

**Non-Goals**
- No se toca la fórmula de engagement score (RN-ANA-001, fuera de alcance de este prompt).
- No se introduce un motor de búsqueda de texto completo externo — la relevancia se resuelve con
  una expresión `multiIf` de ClickHouse sobre el `where` ya existente.
- No se crea una vista de "detalle de comentario" — la notificación de respuesta apunta al track
  (donde el hilo completo es visible), no a un comentario aislado.

## Decisions

- **`genre_ids Array(UInt16)`, no una tabla puente nueva**: mismo patrón ya usado en el proyecto
  para campos multi-valor de un solo formulario (`SOLICITUD_LICENCIA.paises_solicitados`/
  `canales_solicitados`) — evita una migración de tabla puente para un caso que no la necesita
  (la N:M real ya vive en las filas de `FACT_TRACKS`, `genre_ids` es solo el payload de entrada).
  `genre_id` (primer género) se conserva como columna de compatibilidad — el backfill sintético
  de negocio (`etl/gold/backfill_negocio.py`) sigue insertando solo `genre_id`; el `DEFAULT
  [genre_id]` de la columna nueva la completa automáticamente sin tocar ese script.
- **Promoción: N filas de FACT_TRACKS por subida multi-género**, todas con el mismo `track_id`
  (= `staging_id`) — exactamente el modelo que ya usa el resto del catálogo para tracks
  multi-género, no uno nuevo.
- **Retiro por `track_id`, no por `fact_id_promovido`**: `fact_id_promovido` sigue existiendo
  (un id de referencia, el del primer género) pero el takedown real (`disponible = 0`) filtra por
  `track_id`, igual que el takedown administrativo de catálogo.
- **Notificación de respuesta → `referencia_tipo="track"`**: `body.fact_id_track` ya está
  disponible en el body del comentario (no solo en el comentario padre), así que no hace falta
  resolver nada adicional — se reusa el mismo campo que ya usa la notificación de comentario
  raíz.
- **Relevancia vía `multiIf` + `ORDER BY (relevancia DESC, popularity DESC)`**: se evaluó un
  motor de búsqueda de texto completo externo y se descartó — fuera del stack ya definido
  (ClickHouse, sin dependencias nuevas) y desproporcionado para 3 niveles de relevancia sobre un
  `LIKE` que ya existía.

## Risks / Trade-offs

- [Riesgo] Un artista con muchos géneros por track podría intentar seleccionar más de los que
  tiene sentido de negocio → Mitigación: tope de 5 géneros (`Field(max_length=5)`), igual que el
  máximo real observado en tracks del catálogo con más géneros.
- [Riesgo] La expresión de relevancia agrega una evaluación `multiIf` por fila en la sub-consulta
  de ranking → Mitigación: solo se activa cuando hay `q` (texto de búsqueda); verificado con curl
  que el tiempo de respuesta en caliente no cambia de forma perceptible (~30ms en ambos casos).

## Migration Plan

- `ALTER TABLE STG_ARTIST_UPLOADS ADD COLUMN genre_ids Array(UInt16) DEFAULT [genre_id]` aplicado
  en caliente sobre la base ya viva (190 filas existentes, backfilleadas). DDL de
  `init_clickhouse.py` actualizado para clones nuevos.
- Sin migración de `FACT_TRACKS`/`FACT_SUBIDA_TRACK` — ambas ya soportaban el modelo necesario.

## Open Questions

Ninguna pendiente.
