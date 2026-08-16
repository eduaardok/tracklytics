## Why

Último pendiente de negocio conocido antes de grabar los 3 videos demo: like/dislike en tracks.
RN-ANA-001 (fórmula de `engagement_score`, capability `analitica`) estaba cerrada en sesiones
anteriores y explícitamente fuera de alcance (ver `design.md` de
`2026-08-16-s16-multigenero-relevancia-artista`, Non-Goals: "No se toca la fórmula de engagement
score (RN-ANA-001, fuera de alcance de este prompt)"). Eduardo autoriza explícitamente en esta
sesión (S16 prompt 09) reabrirla para sumar la señal de like.

## What Changes

- Nuevo par de eventos `like`/`dislike` en `FACT_ENGAGEMENT_USUARIO` (mismo patrón que
  `favorito_add`/`favorito_remove`), mutuamente excluyentes por usuario+track. Un tercer valor,
  `voto_remove`, permite anular un voto sin inventarle significado de negocio propio.
- `raw_score` (RF-ANA-006) pasa de `reproduccion×1 + favorito_add×3` a
  `reproduccion×1 + favorito_add×3 + like×2`. Dislike NO resta puntos — se muestra en UI para
  transparencia social, pero no compone el score (autorización explícita de Eduardo: la fórmula
  solo agrega señales positivas, restar complicaría la lectura pedagógica del índice sin aportar
  valor de negocio claro).
- Endpoints nuevos en `biblioteca` (dueño natural: junto a favoritos/historial, mismo patrón
  `_insert_event`): `POST/DELETE /biblioteca/tracks/{fact_id}/like`,
  `POST /biblioteca/tracks/{fact_id}/dislike`, `GET /biblioteca/tracks/{fact_id}/likes`.
- Botón like/dislike en `TrackCard` y `TrackDetailPage`, junto al de favoritos ya existente.
  Conteo de likes visible; dislikes no se muestran como número público (mismo criterio que
  Spotify/YouTube), solo como estado del voto propio.

## Capabilities

### New Capabilities
(ninguna)

### Modified Capabilities
- `analitica`: RN-ANA-001 (RF-ANA-006, "Cálculo de engagement_score") incorpora `like` como
  tercera señal ponderada del `raw_score`. La condición "al menos una interacción registrada"
  (RF-ANA-007) no cambia de criterio — sigue derivándose de `raw_score > 0`, que ahora también se
  activa solo con un like (sin reproducción ni favorito).

`biblioteca` no tiene spec de OpenSpec propia en este repo (no existe `openspec/specs/biblioteca`
— favoritos/historial/playlists se documentaron directamente en código en sesiones anteriores sin
pasar por el ciclo de specs). Los endpoints nuevos de like/dislike siguen ese mismo precedente; no
se crea una spec nueva solo para este cambio.

## Impact

- Backend: `api/paquetes/biblioteca/{router,queries}.py` (endpoints + queries nuevas),
  `api/paquetes/analitica/queries.py` (`ENGAGEMENT_BY_FACT`, `ENGAGEMENT_BY_ARTIST`,
  `DASHBOARD_ENGAGEMENT_POR_GENERO`), `init_clickhouse.py` (DDL: `event_type` Enum8 con 3 valores
  nuevos, columna `event_seq` para desempate — ver Fixes colaterales).
- Frontend: `useLikes.ts` (hook nuevo, mismo patrón que `useFavoritos.ts`), `TrackCard.tsx`,
  `TrackDetailPage.tsx`.
- `etl/gold_ch/engagement.py` (`GOLD_ENGAGEMENT_PERIODO`) NO se modifica — es una métrica de
  negocio distinta (reproducciones + favoritos×2 + playlist_adds×3, rollup de período/género), ya
  independiente de `raw_score` de RF-ANA-006 antes de este cambio; documentado inline por qué no
  aplica.
- `benchmark_sql.py` NO se modifica — su comparación SQL-vs-Gold usa solo `reproduccion`, nunca
  replicó la fórmula de `raw_score`.

## Fixes colaterales (hallazgo real durante verificación)

**Rendimiento (Playwright, no hipotético):** verificar `TrackCard` en un listado de catálogo real
reprodujo un 503 de ClickHouse — cada `TrackCard` pedía su propio `GET .../tracks/{fact_id}/likes`,
y un listado de 20+ tracks disparaba 20+ requests simultáneos. Se agregó
`GET /biblioteca/tracks/likes?fact_ids=...` (`LIKES_DISLIKES_BATCH`/`VOTOS_USUARIO_BATCH`) y un
micro-batching de 20ms en `useLikes.ts` que agrupa todos los `fact_id` pedidos en la misma vuelta
de evento en una sola llamada — transparente para `TrackCard`/`TrackDetailPage`, que no cambiaron
su forma de usar el hook. Verificado que el 503 no vuelve a aparecer tras el fix (Playwright, 5/5
tests, catálogo con 20 tracks visibles).


Verificando "like→dislike→like en <1s resuelve al estado correcto" (criterio de aceptación de
este prompt) se encontró que `argMax(event_type, event_timestamp)` puede empatar: `event_timestamp`
es `DateTime` (resolución de 1 segundo), y dos toggles rápidos del mismo usuario+track caían en el
mismo segundo, resolviendo al evento incorrecto. Se agregó `event_seq DateTime64(6) DEFAULT
now64(6)` (fuera del `ORDER BY` de la tabla, no reescribe el índice existente) y las queries
nuevas (`LIKES_DISLIKES_COUNT`, `VOTO_USUARIO_ACTUAL`) desempatan por esa columna. El mismo patrón
`argMax(event_type, event_timestamp)` existe también en `favorito_add`/`favorito_remove`
(`biblioteca/queries.py`), `experiencia/queries.py` (3 sitios) y
`seguridad/exportacion.py` — **no se tocan** (fuera de alcance de este prompt, "no tocar
favorito_add/favorito_remove existentes"); queda como hallazgo pendiente para una sesión futura.
