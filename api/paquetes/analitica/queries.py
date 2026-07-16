from core.config import CH_DB as _DB

# ── analitica v1 (OpenSpec): dashboard, perfil, comparación, benchmark,
# tendencias, engagement, desempeño relativo, reporte diario ──────────────────
# Todas las queries usan referencias completas `{_DB}.TABLA` (p.ej.
# tracklytics.FACT_TRACKS) para dejar explícito que esta capability lee
# exclusivamente del ClickHouse existente, sin acoplarse a otra instancia.

DASHBOARD_KPIS = f"""
SELECT
    (SELECT count() FROM {_DB}.FACT_TRACKS)                    AS total_tracks,
    (SELECT count() FROM {_DB}.DIM_ARTISTS)                    AS total_artists,
    (SELECT count() FROM {_DB}.DIM_GENRES)                     AS total_genres,
    (SELECT round(avg(popularity), 2)   FROM {_DB}.FACT_TRACKS) AS avg_popularity,
    (SELECT round(avgIf(energy, source_type != 'user_uploaded'), 4)       FROM {_DB}.FACT_TRACKS) AS avg_energy,
    (SELECT round(avgIf(danceability, source_type != 'user_uploaded'), 4) FROM {_DB}.FACT_TRACKS) AS avg_danceability
"""

GENRE_AUDIO_PROFILE_V1 = f"""
SELECT
    g.genre_id                                                             AS genre_id,
    g.name                                                                 AS name,
    round(avgIf(ft.danceability,     ft.source_type != 'user_uploaded'), 4) AS danceability,
    round(avgIf(ft.energy,           ft.source_type != 'user_uploaded'), 4) AS energy,
    round(avgIf(ft.speechiness,      ft.source_type != 'user_uploaded'), 4) AS speechiness,
    round(avgIf(ft.acousticness,     ft.source_type != 'user_uploaded'), 4) AS acousticness,
    round(avgIf(ft.instrumentalness, ft.source_type != 'user_uploaded'), 4) AS instrumentalness,
    round(avgIf(ft.liveness,         ft.source_type != 'user_uploaded'), 4) AS liveness,
    round(avgIf(ft.valence,          ft.source_type != 'user_uploaded'), 4) AS valence,
    round(avgIf(ft.tempo,            ft.source_type != 'user_uploaded'), 2) AS avg_tempo,
    count()                                                                AS track_count
FROM {_DB}.FACT_TRACKS ft
JOIN {_DB}.DIM_GENRES g ON ft.genre_id = g.genre_id
WHERE g.genre_id = {{genre_id:Int32}}
GROUP BY g.genre_id, g.name
"""

ARTIST_AUDIO_STATS_V1 = f"""
SELECT
    a.artist_id                                                             AS artist_id,
    a.name                                                                  AS name,
    count()                                                                 AS track_count,
    round(avg(ft.popularity),       2)                                      AS avg_popularity,
    round(avgIf(ft.danceability,     ft.source_type != 'user_uploaded'), 4) AS avg_danceability,
    round(avgIf(ft.energy,           ft.source_type != 'user_uploaded'), 4) AS avg_energy,
    round(avgIf(ft.speechiness,      ft.source_type != 'user_uploaded'), 4) AS avg_speechiness,
    round(avgIf(ft.acousticness,     ft.source_type != 'user_uploaded'), 4) AS avg_acousticness,
    round(avgIf(ft.instrumentalness, ft.source_type != 'user_uploaded'), 4) AS avg_instrumentalness,
    round(avgIf(ft.liveness,         ft.source_type != 'user_uploaded'), 4) AS avg_liveness,
    round(avgIf(ft.valence,          ft.source_type != 'user_uploaded'), 4) AS avg_valence,
    countIf(ft.explicit_id = 1)                                             AS explicit_count
FROM {_DB}.FACT_TRACKS ft
JOIN {_DB}.DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE a.artist_id = {{artist_id:Int32}}
GROUP BY a.artist_id, a.name
"""

ARTISTAS_SEARCH_V1 = f"""
SELECT artist_id, name
FROM {_DB}.DIM_ARTISTS
WHERE lower(name) LIKE lower({{pattern:String}})
ORDER BY name
LIMIT {{limit:UInt32}}
"""

ARTIST_PREDOMINANT_GENRE = f"""
SELECT genre_id, count() AS n
FROM {_DB}.FACT_TRACKS
WHERE artist_id = {{artist_id:Int32}}
GROUP BY genre_id
ORDER BY n DESC
LIMIT 1
"""

TENDENCIAS_LOAD_WEEK = f"""
SELECT
    load_week                                              AS load_week,
    count()                                                AS track_count,
    round(avg(popularity), 2)                              AS avg_popularity,
    round(avgIf(energy, source_type != 'user_uploaded'), 4) AS avg_energy
FROM {_DB}.FACT_TRACKS
{{where}}
GROUP BY load_week
ORDER BY load_week
"""

# ── Paneles predictivos Enterprise (b2b-tier-access-analitica) ──────────────
# Serie semanal de popularidad por género/artista — ni GENRES_TRENDS (snapshot
# agregado sin dimensión temporal) ni ARTIST_AUDIO_STATS_V1 (agregado de todo
# el histórico) traen esta serie; se agrupa por `load_week` igual que
# TENDENCIAS_LOAD_WEEK, filtrando por genre_id/artist_id (design.md, decisión 3).
GENRE_WEEKLY_POPULARITY = f"""
SELECT
    load_week                        AS load_week,
    count()                          AS track_count,
    round(avg(popularity), 2)        AS avg_popularity
FROM {_DB}.FACT_TRACKS
WHERE genre_id = {{genre_id:Int32}}
GROUP BY load_week
ORDER BY load_week
"""

ARTIST_WEEKLY_POPULARITY = f"""
SELECT
    load_week                        AS load_week,
    count()                          AS track_count,
    round(avg(popularity), 2)        AS avg_popularity
FROM {_DB}.FACT_TRACKS
WHERE artist_id = {{artist_id:Int32}}
GROUP BY load_week
ORDER BY load_week
"""

# raw_score por fact_id: reproduccion x1 + favorito_add x3 (RF-ANA-006).
# No existe un evento de tipo "playlist_add" en FACT_ENGAGEMENT_USUARIO hoy
# (ver decisiones de diseño), por lo que ese término del raw_score es 0.
ENGAGEMENT_BY_FACT = f"""
WITH agg AS (
    SELECT
        countIf(event_type = 'reproduccion') AS reproducciones,
        countIf(event_type = 'favorito_add') AS favoritos,
        countIf(event_type = 'reproduccion') + countIf(event_type = 'favorito_add') * 3 AS raw_score
    FROM {_DB}.FACT_ENGAGEMENT_USUARIO
    WHERE fact_id = {{fact_id:UInt64}}
),
max_raw AS (
    SELECT max(raw) AS max_raw_score
    FROM (
        SELECT countIf(event_type = 'reproduccion') + countIf(event_type = 'favorito_add') * 3 AS raw
        FROM {_DB}.FACT_ENGAGEMENT_USUARIO
        GROUP BY fact_id
    )
)
SELECT
    agg.reproducciones                                                          AS reproducciones,
    agg.favoritos                                                               AS favoritos,
    agg.raw_score                                                               AS raw_score,
    max_raw.max_raw_score                                                       AS max_raw_score,
    if(agg.raw_score > 0 AND max_raw.max_raw_score > 0,
       least(100, round(agg.raw_score / max_raw.max_raw_score * 100)), 0)       AS engagement_score
FROM agg, max_raw
"""

ENGAGEMENT_BY_ARTIST = f"""
WITH artist_facts AS (
    SELECT fact_id FROM {_DB}.FACT_TRACKS WHERE artist_id = {{artist_id:Int32}}
),
agg AS (
    SELECT
        countIf(event_type = 'reproduccion') AS reproducciones,
        countIf(event_type = 'favorito_add') AS favoritos,
        countIf(event_type = 'reproduccion') + countIf(event_type = 'favorito_add') * 3 AS raw_score
    FROM {_DB}.FACT_ENGAGEMENT_USUARIO
    WHERE fact_id IN (SELECT fact_id FROM artist_facts)
),
max_raw AS (
    SELECT max(raw) AS max_raw_score
    FROM (
        SELECT countIf(event_type = 'reproduccion') + countIf(event_type = 'favorito_add') * 3 AS raw
        FROM {_DB}.FACT_ENGAGEMENT_USUARIO
        GROUP BY fact_id
    )
)
SELECT
    agg.reproducciones                                                          AS reproducciones,
    agg.favoritos                                                               AS favoritos,
    agg.raw_score                                                               AS raw_score,
    max_raw.max_raw_score                                                       AS max_raw_score,
    if(agg.raw_score > 0 AND max_raw.max_raw_score > 0,
       least(100, round(agg.raw_score / max_raw.max_raw_score * 100)), 0)       AS engagement_score
FROM agg, max_raw
"""

TRACK_POPULARITY = f"""
SELECT ft.fact_id, ft.track_id, ft.track_name, ft.popularity, a.name AS artist_name
FROM {_DB}.FACT_TRACKS ft
JOIN {_DB}.DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE ft.fact_id = {{fact_id:UInt64}}
"""

# Reporte diario operativo (RF-ANA-008): agrega ingestas (ETL_LOGS) y
# actividad de engagement (FACT_ENGAGEMENT_USUARIO) del día corriente.
# FACT_SUSCRIPCION y FACT_ADQUISICION no existen en el esquema ClickHouse
# actual (ver decisiones de diseño) — no se agregan datos de suscripciones
# ni adquisiciones para no inventar una fuente de datos inexistente.
REPORTE_DIARIO_INGESTAS = f"""
SELECT
    count()                     AS corridas,
    sum(records_read)           AS records_read,
    sum(records_inserted)       AS records_inserted,
    sum(records_rejected)       AS records_rejected,
    groupArray(status)          AS statuses
FROM {_DB}.ETL_LOGS
WHERE toDate(run_timestamp) = {{fecha:Date}}
"""

REPORTE_DIARIO_ENGAGEMENT = f"""
SELECT
    event_type AS event_type,
    count()    AS total
FROM {_DB}.FACT_ENGAGEMENT_USUARIO
WHERE toDate(event_timestamp) = {{fecha:Date}}
GROUP BY event_type
"""

GENRES_TRENDS = """
SELECT
    g.genre_id                      AS genre_id,
    g.name                          AS name,
    round(avg(ft.popularity), 2)    AS avg_popularity,
    count()                         AS track_count,
    round(avg(ft.energy), 4)        AS avg_energy,
    round(avg(ft.danceability), 4)  AS avg_danceability,
    round(avg(ft.valence), 4)       AS avg_valence
FROM FACT_TRACKS ft
JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
GROUP BY g.genre_id, g.name
ORDER BY track_count DESC
LIMIT {limit:UInt32}
OFFSET {offset:UInt32}
"""

GENRES_TOTAL = "SELECT uniq(genre_id) AS n FROM FACT_TRACKS"

GENRE_AUDIO_PROFILE = """
SELECT
    g.genre_id                         AS genre_id,
    g.name                             AS name,
    round(avg(ft.danceability),     4) AS danceability,
    round(avg(ft.energy),           4) AS energy,
    round(avg(ft.speechiness),      4) AS speechiness,
    round(avg(ft.acousticness),     4) AS acousticness,
    round(avg(ft.instrumentalness), 4) AS instrumentalness,
    round(avg(ft.liveness),         4) AS liveness,
    round(avg(ft.valence),          4) AS valence,
    round(avg(ft.tempo),            2) AS avg_tempo,
    round(avg(ft.loudness),         2) AS avg_loudness
FROM FACT_TRACKS ft
JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
WHERE g.genre_id = {genre_id:Int32}
GROUP BY g.genre_id, g.name
"""

TRENDS_WEEKLY = """
SELECT
    d.week_number                    AS week_number,
    any(d.period_label)              AS period_label,
    count()                          AS track_count,
    round(avg(ft.popularity),    2)  AS avg_popularity,
    round(avg(ft.energy),        4)  AS avg_energy,
    round(avg(ft.danceability),  4)  AS avg_danceability
FROM FACT_TRACKS ft
JOIN DIM_DATE d ON ft.date_id = d.date_id
GROUP BY d.week_number
ORDER BY d.week_number ASC
"""

ARTISTS_SEARCH = """
SELECT artist_id, name
FROM DIM_ARTISTS
WHERE lower(name) LIKE lower({pattern:String})
ORDER BY name
LIMIT {limit:UInt32}
OFFSET {offset:UInt32}
"""

ARTISTS_SEARCH_TOTAL = """
SELECT count() AS n FROM DIM_ARTISTS WHERE lower(name) LIKE lower({pattern:String})
"""

ARTIST_STATS = """
SELECT
    a.artist_id                          AS artist_id,
    a.name                               AS name,
    count()                              AS track_count,
    round(avg(ft.popularity),      2)    AS avg_popularity,
    round(avg(ft.energy),          4)    AS avg_energy,
    round(avg(ft.danceability),    4)    AS avg_danceability,
    round(avg(ft.valence),         4)    AS avg_valence,
    round(avg(ft.acousticness),    4)    AS avg_acousticness,
    round(avg(ft.speechiness),     4)    AS avg_speechiness,
    round(avg(ft.instrumentalness),4)    AS avg_instrumentalness,
    round(avg(ft.liveness),        4)    AS avg_liveness,
    countIf(ft.explicit_id = 1)          AS explicit_count
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE a.artist_id = {artist_id:Int32}
GROUP BY a.artist_id, a.name
"""

ARTIST_GENRE_BENCHMARKS = """
SELECT
    g.name                        AS name,
    round(avg(ft2.popularity), 2) AS genre_avg_popularity
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a   ON ft.artist_id  = a.artist_id
JOIN DIM_GENRES  g   ON ft.genre_id   = g.genre_id
JOIN FACT_TRACKS ft2 ON ft2.genre_id  = g.genre_id
WHERE a.artist_id = {artist_id:Int32}
GROUP BY g.name
ORDER BY genre_avg_popularity DESC
"""

DASHBOARD_TOTAL_TRACKS  = "SELECT count() AS n FROM FACT_TRACKS"
DASHBOARD_TOTAL_ARTISTS = "SELECT count() AS n FROM DIM_ARTISTS"
DASHBOARD_TOTAL_GENRES  = "SELECT count() AS n FROM DIM_GENRES"

DASHBOARD_AUDIO_AVG = """
SELECT
    round(avg(popularity),   2)                                     AS avg_popularity,
    round(avgIf(energy,       source_type != 'user_uploaded'), 4)   AS avg_energy,
    round(avgIf(danceability, source_type != 'user_uploaded'), 4)   AS avg_danceability,
    round(avgIf(valence,      source_type != 'user_uploaded'), 4)   AS avg_valence,
    round(avgIf(tempo,        source_type != 'user_uploaded'), 2)   AS avg_tempo
FROM FACT_TRACKS
"""

DASHBOARD_TOP_GENRES = """
SELECT g.name AS name, count() AS track_count
FROM FACT_TRACKS ft
JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
GROUP BY g.name
ORDER BY track_count DESC
LIMIT 10
"""

DASHBOARD_TOP_ARTISTS = """
SELECT a.name                          AS name,
       count()                         AS track_count,
       round(avg(ft.popularity), 2)    AS avg_popularity
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
GROUP BY a.name
ORDER BY track_count DESC
LIMIT 10
"""

DASHBOARD_LAST_ETL = """
SELECT status, run_timestamp, records_inserted
FROM ETL_LOGS
ORDER BY run_timestamp DESC
LIMIT 1
"""

DASHBOARD_EXPLICIT_DIST = """
SELECT e.label AS explicit_label, count() AS track_count
FROM FACT_TRACKS ft
JOIN DIM_EXPLICIT_TYPE e ON ft.explicit_id = e.explicit_id
GROUP BY e.label
"""

# ── Dashboard: charts de negocio (auditoría "numbers-only" 2026-07-14) ────────
# Series diarias de ingresos vs. regalías pagadas — el rango real de datos en
# las 3 FACT tables es de solo ~12 días (ver verificación con clickhouse-client
# antes de escribir esto), por lo que `toDate` (día) da una serie mucho más
# legible que `toStartOfWeek` (que colapsaría todo en 1-2 puntos). Cada query
# se agrega por separado (no UNION) porque los rangos de fecha de las 3 tablas
# no coinciden — el merge por fecha se resuelve en Python (router.py).
DASHBOARD_INGRESOS_SUSCRIPCION_DIARIO = """
SELECT toDate(fecha) AS dia, sum(monto) AS monto
FROM FACT_TRANSACCION_PAGO
WHERE estado = 'exitosa'
GROUP BY dia
ORDER BY dia
"""

DASHBOARD_INGRESOS_PUBLICITARIOS_DIARIO = """
SELECT toDate(fecha) AS dia, sum(monto) AS monto
FROM FACT_INGRESO_PUBLICITARIO
GROUP BY dia
ORDER BY dia
"""

# `fecha_calculo` (no `periodo_inicio`) — es el mismo campo que ya usa
# REGALIAS_PAGADAS_EN_RANGO para el P&L consolidado (momento en que la
# liquidación se calculó/pagó), para que este chart y el endpoint /pnl
# cuenten la misma plata con el mismo criterio de fecha.
DASHBOARD_REGALIAS_PAGADAS_DIARIO = """
SELECT toDate(fecha_calculo) AS dia, sum(monto) AS monto
FROM FACT_LIQUIDACION_REGALIA
GROUP BY dia
ORDER BY dia
"""

# Top géneros por engagement real — mismo raw_score que ENGAGEMENT_BY_FACT/
# ENGAGEMENT_BY_ARTIST (reproduccion x1 + favorito_add x3), agregado por
# género en vez de por track/artista, para no inventar una fórmula de
# scoring distinta a la ya usada en el resto de `analitica`.
DASHBOARD_ENGAGEMENT_POR_GENERO = """
SELECT
    g.name                                                                        AS name,
    countIf(e.event_type = 'reproduccion') + countIf(e.event_type = 'favorito_add') * 3 AS value
FROM FACT_ENGAGEMENT_USUARIO e
JOIN FACT_TRACKS ft ON e.fact_id = ft.fact_id
JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
GROUP BY g.name
ORDER BY value DESC
LIMIT 10
"""

# ── completar-modelo-base: adquisición de usuarios y disponibilidad de ────────
# infraestructura (CU-O54/CU-O55). `semana` es el lunes de la semana de
# `fecha` (toMonday), no `load_week` de FACT_TRACKS — estas tablas son un
# dominio de negocio independiente del catálogo (ver design.md).
ADQUISICION_POR_CANAL = f"""
SELECT
    toMonday(fa.fecha)  AS semana,
    dcm.nombre          AS canal,
    count()             AS usuarios_nuevos
FROM {_DB}.FACT_ADQUISICION fa
JOIN {_DB}.DIM_CANAL_MARKETING dcm ON fa.canal_id = dcm.canal_id
GROUP BY semana, canal
ORDER BY semana, canal
"""

DISPONIBILIDAD_POR_COMPONENTE = f"""
SELECT
    toMonday(fd.fecha)                                  AS semana,
    dci.nombre                                           AS componente,
    round((1 - avg(fd.hubo_incidente)) * 100, 2)         AS disponibilidad_pct
FROM {_DB}.FACT_DISPONIBILIDAD fd
JOIN {_DB}.DIM_COMPONENTE_INFRAESTRUCTURA dci ON fd.componente_id = dci.componente_id
GROUP BY semana, componente
ORDER BY semana, componente
"""

# ── monetizacion-retencion-mejoras: churn, funnel de conversión, P&L ──────────
# `suscripcion_id`/`usuario_id` de estas tablas son IDs de PocketBase, sin
# JOIN SQL posible con ClickHouse — el cruce con altas/bajas de suscripción
# se resuelve en Python (router.py), no aquí (ver design.md, decisión 5).

CANCELACIONES_POR_MES = f"""
SELECT toStartOfMonth(fecha) AS mes, count() AS cancelaciones
FROM {_DB}.FACT_CANCELACION_SUSCRIPCION
WHERE fecha >= {{desde:DateTime}} AND fecha < {{hasta:DateTime}}
GROUP BY mes ORDER BY mes
"""

CANCELACIONES_POR_MES_Y_MOTIVO = f"""
SELECT toStartOfMonth(fecha) AS mes, motivo, count() AS cancelaciones
FROM {_DB}.FACT_CANCELACION_SUSCRIPCION
WHERE fecha >= {{desde:DateTime}} AND fecha < {{hasta:DateTime}}
GROUP BY mes, motivo ORDER BY mes, motivo
"""

BAJAS_ANTES_DE = f"""
SELECT count() AS n FROM {_DB}.FACT_CANCELACION_SUSCRIPCION WHERE fecha < {{fecha:DateTime}}
"""

# Funnel: usuarios distintos con al menos una impresión (audio o display, sin
# filtrar por tipo — RF: "vio al menos un anuncio") en el rango.
USUARIOS_CON_IMPRESION_EN_RANGO = f"""
SELECT count(DISTINCT usuario_id) AS n
FROM {_DB}.FACT_IMPRESION_ANUNCIO
WHERE fecha >= {{desde:DateTime}} AND fecha < {{hasta:DateTime}}
"""

# P&L: ingreso por suscripciones exitosas, ingreso publicitario reconocido y
# regalías pagadas en el rango — cada término ya existe en su capability
# dueña (facturacion/publicidad/regalias), aquí solo se agregan por fecha.
INGRESO_SUSCRIPCIONES_EN_RANGO = f"""
SELECT coalesce(sum(monto), 0) AS total
FROM {_DB}.FACT_TRANSACCION_PAGO
WHERE estado = 'exitosa' AND fecha >= {{desde:DateTime}} AND fecha < {{hasta:DateTime}}
"""

INGRESO_PUBLICITARIO_EN_RANGO = f"""
SELECT coalesce(sum(monto), 0) AS total
FROM {_DB}.FACT_INGRESO_PUBLICITARIO
WHERE fecha >= {{desde:DateTime}} AND fecha < {{hasta:DateTime}}
"""

REGALIAS_PAGADAS_EN_RANGO = f"""
SELECT coalesce(sum(monto), 0) AS total
FROM {_DB}.FACT_LIQUIDACION_REGALIA
WHERE fecha_calculo >= {{desde:DateTime}} AND fecha_calculo < {{hasta:DateTime}}
"""

# MRR/ARR (modelo-financiero-simulacion): MRR real (suscripciones activas en
# PocketBase) se resuelve en Python vía pb_client — esta query solo aporta la
# tendencia histórica aproximada (ingreso cobrado por mes, no MRR
# reconstruido punto-en-el-tiempo, ver design.md decisión 7).
INGRESO_MENSUAL_RECURRENTE_HISTORICO = f"""
SELECT toStartOfMonth(fecha) AS mes, sum(monto) AS ingreso
FROM {_DB}.FACT_TRANSACCION_PAGO
WHERE estado = 'exitosa' AND fecha >= {{desde:DateTime}} AND fecha < {{hasta:DateTime}}
GROUP BY mes ORDER BY mes
"""
