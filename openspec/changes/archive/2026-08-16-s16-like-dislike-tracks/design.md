## Context

`FACT_ENGAGEMENT_USUARIO` ya modela toggles mutuamente excluyentes vía par de eventos
(`favorito_add`/`favorito_remove`), resueltos por "último evento" (`argMax(event_type,
event_timestamp)`, ver `COUNT_FAVORITOS`/`FAVORITOS_ACTUALES`). Like/dislike necesita el mismo
mecanismo pero con TRES estados mutuamente excluyentes (like, dislike, ninguno) en vez de dos.

`raw_score` (RF-ANA-006) está hardcodeado en 5 sitios de `api/paquetes/analitica/queries.py`:
`ENGAGEMENT_BY_FACT` (2 ocurrencias: `agg` CTE y `max_raw` CTE), `ENGAGEMENT_BY_ARTIST` (mismas 2),
y `DASHBOARD_ENGAGEMENT_POR_GENERO` (1). Confirmado por grep que no hay más sitios en `api/`.
`benchmark_sql.py` y `etl/gold_ch/engagement.py` tienen fórmulas de engagement propias, ya
independientes de `raw_score` antes de este cambio (ver Non-Goals).

## Goals / Non-Goals

**Goals**
- Like suma al `raw_score` con el mismo peso relativo que un favorito parcial (×2, entre
  reproducción ×1 y favorito ×3).
- Dislike se registra y se muestra (transparencia social) pero no resta del score.
- Mutua exclusión like/dislike por usuario+track, igual que Spotify/YouTube.
- Resolución de "voto actual" correcta incluso con toggles rápidos (<1s).

**Non-Goals**
- No se modifica `GOLD_ENGAGEMENT_PERIODO` (`etl/gold_ch/engagement.py`) — fórmula de negocio
  distinta e independiente, fuera del alcance autorizado (solo RN-ANA-001/`raw_score`).
- No se modifica `benchmark_sql.py` — no replica `raw_score`.
- No se retrofitea el desempate por microsegundos a `favorito_add`/`favorito_remove` ni a los
  demás usos de `argMax(event_type, event_timestamp)` en `experiencia`/`seguridad` — mismo bug de
  fondo, pero tocar esos 4 sitios es un cambio más amplio y no autorizado por este prompt.

## Decisions

- **Tres event_type nuevos (`like`, `dislike`, `voto_remove`), no dos**: `favorito_add`/
  `favorito_remove` alcanzan con dos porque solo hay un estado binario (favorito o no). Like/
  dislike tiene tres estados (like, dislike, ninguno); insertar `like` o `dislike` ya resuelve la
  transición entre esos dos vía "último evento" (`argMax`) sin necesidad de una fila de remoción
  explícita — `voto_remove` existe únicamente para el caso DELETE (anular sin reemplazar por el
  voto contrario).
- **`raw_score` cuenta eventos `like` acumulados, no el estado neto actual** — mismo criterio ya
  establecido para `favorito_add` (`countIf(event_type = 'favorito_add')`, sin restar
  `favorito_remove`): un usuario que da like→dislike→like aporta 2 eventos `like` al `raw_score`,
  aunque el estado actual sea un solo like. Consistente con el resto de la fórmula, no una
  decisión nueva de este cambio.
- **`GET /likes` cuenta estado NETO** (vía `argMax` por usuario, igual que `COUNT_FAVORITOS`), no
  eventos acumulados — el número que ve el usuario en el botón debe reflejar "cuánta gente tiene
  esto likeado ahora", no "cuántos likes se dispararon alguna vez".
- **`event_seq DateTime64(6)` fuera del `ORDER BY`** de `FACT_ENGAGEMENT_USUARIO`: agregar una
  columna fuera de la clave de ordenamiento de un MergeTree es una operación de metadata barata
  (no reescribe partes existentes); cambiar el tipo de `event_timestamp` en sí (que sí es parte
  del `ORDER BY (user_id, event_timestamp)`) hubiera sido riesgoso sobre la tabla viva.
- **Dueño del endpoint: `biblioteca`, no `social`**: mismo criterio de "acción sobre un track
  propio del usuario" que favoritos/historial (ambos gateados por `require_b2c_user`, RN-CAT-004),
  no una interacción social entre usuarios (seguir, comentar) como sí lo es `social`.

## Risks / Trade-offs

- [Riesgo] Filas de `FACT_ENGAGEMENT_USUARIO` insertadas ANTES de la migración de `event_seq`
  recalculan la expresión `now64(6)` en cada lectura (ClickHouse no materializa el DEFAULT de una
  columna agregada por `ALTER ... ADD COLUMN` sobre partes existentes) → el desempate es
  inestable únicamente para esas filas históricas. Mitigación: no afecta ninguna fila real de
  negocio (`FACT_ENGAGEMENT_USUARIO` no tenía eventos `like`/`dislike` antes de este cambio, por
  definición — el enum no los admitía); confirmado con curl contra un `fact_id` nunca antes
  tocado que la resolución es correcta para todo evento posterior a la migración.
- [Riesgo] Mismo patrón de empate (`argMax` sobre `DateTime` de 1s) sigue presente en 4 sitios más
  del código (favoritos, experiencia, exportación) → aceptado como fuera de alcance, documentado
  como hallazgo pendiente en `proposal.md`.

## Migration Plan

- `ALTER TABLE FACT_ENGAGEMENT_USUARIO MODIFY COLUMN event_type Enum8(...)` (agrega `like`=4,
  `dislike`=5, `voto_remove`=6) aplicado en caliente sobre la base viva.
- `ALTER TABLE FACT_ENGAGEMENT_USUARIO ADD COLUMN event_seq DateTime64(6) DEFAULT now64(6)`
  aplicado en caliente.
- DDL de `init_clickhouse.py` actualizado para clones nuevos (ambos cambios ya incluidos desde la
  creación de la tabla, sin necesidad de migración en un entorno nuevo).

## Open Questions

Ninguna pendiente.
