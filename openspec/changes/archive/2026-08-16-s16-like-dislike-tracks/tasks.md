## 1. Backend: eventos like/dislike

- [x] 1.1 `ALTER TABLE FACT_ENGAGEMENT_USUARIO MODIFY COLUMN event_type Enum8(...)` en caliente (agrega `like`, `dislike`, `voto_remove`) + DDL de `init_clickhouse.py` actualizado
- [x] 1.2 `ALTER TABLE FACT_ENGAGEMENT_USUARIO ADD COLUMN event_seq DateTime64(6) DEFAULT now64(6)` en caliente + DDL actualizado (desempate de microsegundos, ver Fixes colaterales en proposal.md)
- [x] 1.3 `api/paquetes/biblioteca/queries.py`: `LIKES_DISLIKES_COUNT`, `VOTO_USUARIO_ACTUAL`
- [x] 1.4 `api/paquetes/biblioteca/router.py`: `POST/DELETE /tracks/{fact_id}/like`, `POST /tracks/{fact_id}/dislike`, `GET /tracks/{fact_id}/likes`

## 2. Fórmula de engagement (RN-ANA-001)

- [x] 2.1 `api/paquetes/analitica/queries.py`: `ENGAGEMENT_BY_FACT`, `ENGAGEMENT_BY_ARTIST` (agg + max_raw, 4 sitios), `DASHBOARD_ENGAGEMENT_POR_GENERO` (1 sitio) — `+ countIf(event_type = 'like') * 2`
- [x] 2.2 Confirmado por grep que no hay más sitios con la fórmula hardcodeada en `api/`
- [x] 2.3 `benchmark_sql.py` revisado — no replica `raw_score`, no se toca
- [x] 2.4 `etl/gold_ch/engagement.py` revisado — fórmula independiente, documentado inline por qué no se toca

## 3. Frontend: like/dislike en TrackCard y detalle

- [x] 3.1 `useLikes.ts` (mismo patrón que `useFavoritos.ts`)
- [x] 3.2 Botones like/dislike (`ThumbsUp`/`ThumbsDown` de `lucide-react`) en `TrackCard.tsx`
- [x] 3.3 Botones like/dislike en `TrackDetailPage.tsx`
- [x] 3.4 Fix colateral de rendimiento (encontrado en verificación Playwright, no hipotético): un
      listado de catálogo monta N `TrackCard` a la vez, cada uno pedía su propio
      `GET .../likes` — 20+ requests simultáneos saturaban el pool de ClickHouse (503
      reproducido bajo carga). Endpoint batch nuevo (`GET /biblioteca/tracks/likes?fact_ids=...`,
      `LIKES_DISLIKES_BATCH`/`VOTOS_USUARIO_BATCH`) + micro-batching de 20ms en `useLikes.ts`
      (transparente para `TrackCard`/`TrackDetailPage`, sin cambios en su API)

## 4. Verificación

- [x] 4.1 curl: track sin votos → `raw_score=0`, `engagement_score=0`
- [x] 4.2 curl: like → `raw_score` sube en 2, `engagement_score` recalculado
- [x] 4.3 curl: dislike sobre otro track → `engagement_score` no cambia
- [x] 4.4 curl: like→dislike→like→delete en un track nunca antes tocado → estado neto correcto en cada paso (bug de empate de `event_seq` encontrado y corregido en el camino, ver proposal.md)
- [x] 4.5 Playwright: like/dislike desde `TrackCard`/`TrackDetailPage`, conteo actualizado sin recargar — 5/5 tests, sin errores de consola, sin 503 tras el fix de batching
