# ─────────────────────────────────────────────────────────────────────────────
# Recomendaciones (RF-EXP-002/003) — algoritmo simple documentado como tal
# (design.md, Non-Goal "Motor de recomendación con machine learning"), en 3
# niveles: (1) similitud de atributos de audio reales dentro de los géneros
# que el usuario más escucha (FACT_ENGAGEMENT_USUARIO, event_type=
# 'reproduccion' — comportamiento real, no solo favoritos), (2) mismo género
# que los favoritos si todavía no hay historial de reproducción, (3)
# popularidad global si no hay ni lo uno ni lo otro. Las tres queries
# deduplican por nombre+artista (GROUP BY ft.track_name, a.name — no por
# `track_id`: el mismo track real puede tener más de un `track_id` distinto
# en el dataset, ej. la misma grabación catalogada en varias ediciones/
# compilaciones, además de repetirse una vez por género dentro de un mismo
# `track_id`), con `min(fact_id)` como fact_id canónico. Bug encontrado en
# verificación visual, S10 día 5 — antes del fix el mismo track podía
# aparecer repetido en la lista de recomendaciones.
# ─────────────────────────────────────────────────────────────────────────────

GENEROS_FAVORITOS_USUARIO = """
SELECT DISTINCT ft.genre_id AS genre_id
FROM (
    SELECT fact_id, argMax(event_type, event_timestamp) AS last_event
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE user_id = {usuario_id:String}
    GROUP BY fact_id
    HAVING last_event = 'favorito_add'
) fav
JOIN FACT_TRACKS ft ON fav.fact_id = ft.fact_id
"""

FACT_IDS_FAVORITOS_USUARIO = """
SELECT fact_id FROM (
    SELECT fact_id, argMax(event_type, event_timestamp) AS last_event
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE user_id = {usuario_id:String}
    GROUP BY fact_id
    HAVING last_event = 'favorito_add'
)
"""

# Escucha real (no favoritos): géneros más escuchados y perfil de audio
# promedio, para "encontrar tracks con atributos similares dentro de los
# géneros que más escucha" en vez de solo género+popularidad.
FACT_IDS_ESCUCHADOS_USUARIO = """
SELECT DISTINCT fact_id FROM FACT_ENGAGEMENT_USUARIO
WHERE user_id = {usuario_id:String} AND event_type = 'reproduccion'
"""

GENEROS_MAS_ESCUCHADOS_USUARIO = """
SELECT ft.genre_id AS genre_id, count() AS plays
FROM FACT_ENGAGEMENT_USUARIO e
JOIN FACT_TRACKS ft ON ft.fact_id = e.fact_id
WHERE e.user_id = {usuario_id:String} AND e.event_type = 'reproduccion'
GROUP BY ft.genre_id
ORDER BY plays DESC
LIMIT 5
"""

PERFIL_AUDIO_USUARIO = """
SELECT
    avg(ft.danceability) AS danceability,
    avg(ft.energy)       AS energy,
    avg(ft.tempo)        AS tempo,
    avg(ft.valence)      AS valence
FROM FACT_ENGAGEMENT_USUARIO e
JOIN FACT_TRACKS ft ON ft.fact_id = e.fact_id
WHERE e.user_id = {usuario_id:String} AND e.event_type = 'reproduccion'
"""

# Nivel 1: similitud de audio real dentro de los géneros más escuchados.
# Distancia simple (suma de diferencias absolutas, heurística — no ML): las
# 4 métricas están en escala 0-1 salvo `tempo` (BPM, ~60-200), que se
# normaliza dividiendo entre 200 para que no domine la suma.
RECOMENDACIONES_POR_PERFIL_AUDIO = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                     AS track_id,
        min(ft.fact_id)                                                      AS fact_id,
        ft.track_name                                                        AS track_name,
        a.name                                                                AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                     AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url))  AS imagen_url,
        avg(ft.danceability)                                                 AS danceability,
        avg(ft.energy)                                                       AS energy,
        avg(ft.tempo)                                                        AS tempo,
        avg(ft.valence)                                                      AS valence
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.genre_id IN {genre_ids:Array(UInt16)}
      AND ft.fact_id NOT IN {excluidos:Array(UInt64)}
      AND ft.source_type != 'synthetic'
    GROUP BY ft.track_name, a.name
)
ORDER BY
    abs(danceability - {p_danceability:Float64})
  + abs(energy       - {p_energy:Float64})
  + abs(valence      - {p_valence:Float64})
  + abs(tempo        - {p_tempo:Float64}) / 200
ASC
LIMIT {limit:UInt32}
"""

# Nivel 2: mismo género que los favoritos (sin historial de reproducción
# todavía), ordenado por popularidad — mismo criterio que antes, ya deduplicado.
RECOMENDACIONES_POR_GENERO = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                     AS track_id,
        min(ft.fact_id)                                                      AS fact_id,
        ft.track_name                                                        AS track_name,
        a.name                                                                AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                     AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url))  AS imagen_url,
        max(ft.popularity)                                                   AS popularity
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.genre_id IN {genre_ids:Array(UInt16)}
      AND ft.fact_id NOT IN {excluidos:Array(UInt64)}
      AND ft.source_type != 'synthetic'
    GROUP BY ft.track_name, a.name
)
ORDER BY popularity DESC
LIMIT {limit:UInt32}
"""

# Nivel 3: sin historial ni favoritos — popularidad global, deduplicado.
RECOMENDACIONES_POPULARES = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                     AS track_id,
        min(ft.fact_id)                                                      AS fact_id,
        ft.track_name                                                        AS track_name,
        a.name                                                                AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                     AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url))  AS imagen_url,
        max(ft.popularity)                                                   AS popularity
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.fact_id NOT IN {excluidos:Array(UInt64)}
      AND ft.source_type != 'synthetic'
    GROUP BY ft.track_name, a.name
)
ORDER BY popularity DESC
LIMIT {limit:UInt32}
"""

# Variantes de "Para ti" (S10 ronda 2): "Hecho para ti" es el nivel 1 de
# arriba (RECOMENDACIONES_POR_PERFIL_AUDIO), solo renombrado en la UI. Las
# siguientes dos son secciones nuevas — ambas reutilizan el mismo shape de
# columnas (fact_id, track_id, track_name, artist_name, genre_name, imagen_url)
# para que el frontend renderice las 3 con el mismo componente de tarjeta.

# Novedades de artistas que sigues: comparte la señal de "track nuevo de un
# artista seguido" con la notificación `nuevo_track_artista_seguido`
# (paquetes/social/notificaciones.py) — mismo filtro artist_id IN (seguidos),
# ordenado por `inserted_at` (fecha real de ingreso a FACT_TRACKS, no
# `load_week` — ver init_clickhouse.py). Sin filtro de source_type: un track
# `user_uploaded` de un artista que sigues es, si acaso, más relevante.
RECOMENDACIONES_NOVEDADES_ARTISTAS_SEGUIDOS = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                     AS track_id,
        min(ft.fact_id)                                                      AS fact_id,
        ft.track_name                                                        AS track_name,
        a.name                                                                AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                     AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url))  AS imagen_url,
        max(ft.inserted_at)                                                  AS inserted_at
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.artist_id IN {artist_ids:Array(UInt32)}
      AND ft.fact_id NOT IN {excluidos:Array(UInt64)}
    GROUP BY ft.track_name, a.name
)
ORDER BY inserted_at DESC
LIMIT {limit:UInt32}
"""

# Redescubre: resurge tracks que el propio usuario favoriteó o reprodujo
# alguna vez pero no ha tocado recientemente — no es una recomendación de
# tracks nuevos, es su propio historial ordenado por interacción más
# antigua. No usa `excluidos`: excluir "lo ya conocido" no tendría sentido
# acá, es literalmente lo ya conocido lo que se resurge.
REDESCUBRE_USUARIO = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                     AS track_id,
        min(ft.fact_id)                                                      AS fact_id,
        ft.track_name                                                        AS track_name,
        a.name                                                                AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                     AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url))  AS imagen_url,
        max(e.last_interaction)                                              AS last_interaction
    FROM (
        SELECT fact_id, max(event_timestamp) AS last_interaction
        FROM FACT_ENGAGEMENT_USUARIO
        WHERE user_id = {usuario_id:String} AND event_type IN ('favorito_add', 'reproduccion')
        GROUP BY fact_id
    ) e
    JOIN FACT_TRACKS ft ON ft.fact_id = e.fact_id
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    GROUP BY ft.track_name, a.name
)
ORDER BY last_interaction ASC
LIMIT {limit:UInt32}
"""

# ─────────────────────────────────────────────────────────────────────────────
# Radio, mix diario y afinidad de audio (change p2-descubrimiento-comunidad)
#
# Métrica de similitud (design.md, Decisión 1): distancia euclídea al cuadrado
# sobre 5 atributos, más una penalización aditiva por no compartir género. Los
# 4 primeros atributos ya están en escala 0-1; `tempo` va en BPM (~50-250) y se
# normaliza dividiendo entre 250, o dominaría por completo la suma.
#
# El género PENALIZA, no filtra: un track de otro género puede entrar si es muy
# cercano en audio, pero parte con desventaja. Un filtro duro encerraría la
# radio en un solo género, que es justo lo que la haría inútil.
#
# Deduplicación por (track_name, artist_name) y no por track_id: en el dataset
# la misma grabación puede tener varios track_id (ediciones/compilaciones),
# además de repetirse una vez por género. Misma convención que las queries de
# recomendación de arriba. Por eso la penalización se agrega con min(): un track
# que comparte ALGUNO de sus géneros con la semilla no queda penalizado.
# ─────────────────────────────────────────────────────────────────────────────

# Fragmento compartido: se interpola en las queries de abajo, nunca recibe
# valores del usuario (los valores siempre van como parámetros nombrados).
_DISTANCIA_AUDIO = """
      pow(danceability - {p_danceability:Float64}, 2)
    + pow(energy       - {p_energy:Float64},       2)
    + pow(valence      - {p_valence:Float64},      2)
    + pow(acousticness - {p_acousticness:Float64}, 2)
    + pow((tempo       - {p_tempo:Float64}) / 250.0, 2)
    + penalizacion_genero
"""

# Perfil de audio del usuario a partir de favoritos Y reproducciones (el
# PERFIL_AUDIO_USUARIO previo solo miraba reproducciones). Un usuario que
# marcó favoritos pero aún no reprodujo nada tenía perfil vacío y caía al
# nivel de popularidad global pese a haber dado señal explícita.
PERFIL_AUDIO_FAVORITOS_E_HISTORIAL = """
SELECT
    avg(ft.danceability) AS danceability,
    avg(ft.energy)       AS energy,
    avg(ft.valence)      AS valence,
    avg(ft.acousticness) AS acousticness,
    avg(ft.tempo)        AS tempo,
    count()              AS n_senales
FROM (
    SELECT fact_id, argMax(event_type, event_timestamp) AS last_event
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE user_id = {usuario_id:String}
      AND event_type IN ('favorito_add', 'favorito_remove', 'reproduccion')
    GROUP BY fact_id
    HAVING last_event IN ('favorito_add', 'reproduccion')
) senal
JOIN FACT_TRACKS ft ON ft.fact_id = senal.fact_id
"""

# Atributos de audio y géneros de un track semilla, para la radio.
TRACK_SEMILLA = """
SELECT
    any(ft.track_name)          AS track_name,
    avg(ft.danceability)        AS danceability,
    avg(ft.energy)              AS energy,
    avg(ft.valence)             AS valence,
    avg(ft.acousticness)        AS acousticness,
    avg(ft.tempo)               AS tempo,
    groupUniqArray(ft.genre_id) AS genre_ids,
    any(a.name)                 AS artist_name
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE ft.fact_id = {fact_id:UInt64} AND ft.disponible = 1
"""

# Radio: tracks similares a la semilla. Excluye la propia semilla por
# (track_name, artist_name) y no por fact_id, porque la semilla son N filas y
# además puede existir como varias ediciones.
RADIO_POR_TRACK = """
SELECT
    fact_id, track_id, track_name, artist_name, genre_name, imagen_url,
    round(__DISTANCIA__, 5) AS distancia
FROM (
    SELECT
        any(ft.track_id)                                                    AS track_id,
        min(ft.fact_id)                                                     AS fact_id,
        ft.track_name                                                       AS track_name,
        a.name                                                              AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                    AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url)) AS imagen_url,
        avg(ft.danceability)                                                AS danceability,
        avg(ft.energy)                                                      AS energy,
        avg(ft.valence)                                                     AS valence,
        avg(ft.acousticness)                                                AS acousticness,
        avg(ft.tempo)                                                       AS tempo,
        min(if(has({genre_ids:Array(UInt16)}, ft.genre_id), 0.0, 0.35))     AS penalizacion_genero
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.disponible = 1
      AND NOT (ft.track_name = {semilla_nombre:String} AND a.name = {semilla_artista:String})
    GROUP BY ft.track_name, a.name
)
ORDER BY distancia ASC, track_name ASC
LIMIT {limit:UInt32}
""".replace("__DISTANCIA__", _DISTANCIA_AUDIO)

# Mix diario, porción de afinidad: cercanos al perfil del usuario dentro de sus
# géneros habituales, excluyendo lo que ya conoce. El desempate por track_name
# es lo que hace el resultado estable entre llamadas del mismo día: sin él, dos
# tracks equidistantes podrían alternar.
MIX_AFINIDAD = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                    AS track_id,
        min(ft.fact_id)                                                     AS fact_id,
        ft.track_name                                                       AS track_name,
        a.name                                                              AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                    AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url)) AS imagen_url,
        avg(ft.danceability)                                                AS danceability,
        avg(ft.energy)                                                      AS energy,
        avg(ft.valence)                                                     AS valence,
        avg(ft.acousticness)                                                AS acousticness,
        avg(ft.tempo)                                                       AS tempo,
        0.0                                                                 AS penalizacion_genero
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.disponible = 1
      AND ft.genre_id IN {genre_ids:Array(UInt16)}
      AND ft.fact_id NOT IN {excluidos:Array(UInt64)}
    GROUP BY ft.track_name, a.name
)
ORDER BY (__DISTANCIA__) ASC, track_name ASC
LIMIT {limit:UInt32}
""".replace("__DISTANCIA__", _DISTANCIA_AUDIO)

# Mix diario, porción de exploración: FUERA de los géneros habituales del
# usuario. El orden es pseudoaleatorio pero determinista para ese usuario y ese
# día, porque la semilla del hash es (usuario_id + fecha) — de ahí que el mix
# "del día" sea estable y cambie solo al día siguiente (Decisión 2).
MIX_EXPLORACION = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                    AS track_id,
        min(ft.fact_id)                                                     AS fact_id,
        ft.track_name                                                       AS track_name,
        a.name                                                              AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                    AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url)) AS imagen_url,
        max(ft.popularity)                                                  AS popularity
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.disponible = 1
      AND ft.genre_id NOT IN {genre_ids:Array(UInt16)}
      AND ft.fact_id NOT IN {excluidos:Array(UInt64)}
      AND ft.popularity >= 40
    GROUP BY ft.track_name, a.name
)
ORDER BY cityHash64(concat(track_name, artist_name, {seed:String})) ASC
LIMIT {limit:UInt32}
"""

# Recomendaciones por afinidad (reemplazo del nivel 1): mismo criterio que el
# mix pero SIN restringir a los géneros habituales, para que la sección "Hecho
# para ti" pueda sorprender. Filtra `disponible = 1`, que las queries de
# recomendación previas no hacían.
RECOMENDACIONES_POR_AFINIDAD = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                    AS track_id,
        min(ft.fact_id)                                                     AS fact_id,
        ft.track_name                                                       AS track_name,
        a.name                                                              AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                    AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url)) AS imagen_url,
        avg(ft.danceability)                                                AS danceability,
        avg(ft.energy)                                                      AS energy,
        avg(ft.valence)                                                     AS valence,
        avg(ft.acousticness)                                                AS acousticness,
        avg(ft.tempo)                                                       AS tempo,
        min(if(has({genre_ids:Array(UInt16)}, ft.genre_id), 0.0, 0.35))     AS penalizacion_genero
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.disponible = 1
      AND ft.fact_id NOT IN {excluidos:Array(UInt64)}
      AND ft.source_type != 'synthetic'
    GROUP BY ft.track_name, a.name
)
ORDER BY (__DISTANCIA__) ASC, track_name ASC
LIMIT {limit:UInt32}
""".replace("__DISTANCIA__", _DISTANCIA_AUDIO)

# Género dominante del usuario, para redactar el `motivo` de la recomendación
# ("similar a tus favoritos de <género>") sin inventar nada por track.
GENERO_DOMINANTE_USUARIO = """
SELECT g.name AS genero, count() AS n
FROM FACT_ENGAGEMENT_USUARIO e
JOIN FACT_TRACKS ft ON ft.fact_id = e.fact_id
JOIN DIM_GENRES  g  ON g.genre_id = ft.genre_id
WHERE e.user_id = {usuario_id:String}
  AND e.event_type IN ('favorito_add', 'reproduccion')
GROUP BY g.name
ORDER BY n DESC
LIMIT 1
"""


# ─────────────────────────────────────────────────────────────────────────────
# Tickets de soporte (RF-EXP-004/005)
# ─────────────────────────────────────────────────────────────────────────────

TICKET_POR_ID = """
SELECT fact_id, usuario_id, asunto, descripcion, estado, fecha_creacion, fecha_resolucion
FROM FACT_TICKET_SOPORTE WHERE fact_id = {fact_id:UInt64} LIMIT 1
"""

MIS_TICKETS = """
SELECT fact_id, asunto, descripcion, estado, fecha_creacion, fecha_resolucion
FROM FACT_TICKET_SOPORTE
WHERE usuario_id = {usuario_id:String}
ORDER BY fecha_creacion DESC
"""


def tickets_admin_sql(where: str) -> str:
    return f"""
    SELECT fact_id, usuario_id, asunto, descripcion, estado, fecha_creacion, fecha_resolucion
    FROM FACT_TICKET_SOPORTE
    {where}
    ORDER BY fecha_creacion DESC
    """


# ─────────────────────────────────────────────────────────────────────────────
# Reflejo de playlists (RF-EXP-006/007)
# ─────────────────────────────────────────────────────────────────────────────

TOP_TRACKS_PLAYLIST = """
SELECT
    b.fact_id_track                AS fact_id,
    any(ft.track_name)              AS track_name,
    any(a.name)                    AS artist_name,
    count(DISTINCT b.playlist_id)  AS playlists_count
FROM BRIDGE_TRACK_PLAYLIST_USUARIO b
JOIN FACT_TRACKS ft ON b.fact_id_track = ft.fact_id
JOIN DIM_ARTISTS a  ON ft.artist_id    = a.artist_id
GROUP BY b.fact_id_track
ORDER BY playlists_count DESC
LIMIT {limit:UInt32}
"""

# ─────────────────────────────────────────────────────────────────────────────
# Plan familiar (RF-EXP-008)
# ─────────────────────────────────────────────────────────────────────────────

MIEMBROS_DE_SUSCRIPCION = """
SELECT b.usuario_id AS usuario_id, u.nombre AS nombre, u.email AS email,
       b.es_titular AS es_titular, b.fecha_union AS fecha_union
FROM BRIDGE_SUSCRIPTOR_FAMILIA b
LEFT JOIN DIM_USUARIO u ON u.usuario_id = b.usuario_id
WHERE b.suscripcion_id = {suscripcion_id:String}
ORDER BY b.es_titular DESC, b.fecha_union ASC
"""

# Autoservicio (CU-O51/52/53, B2C titular): resuelve la `suscripcion_id` del
# plan familiar al que pertenece el usuario autenticado, sin necesitar rol
# admin ni conocer el id de antemano.
SUSCRIPCION_FAMILIAR_DE_USUARIO = """
SELECT suscripcion_id FROM BRIDGE_SUSCRIPTOR_FAMILIA WHERE usuario_id = {usuario_id:String} LIMIT 1
"""

USUARIO_POR_EMAIL = """
SELECT usuario_id, nombre, email FROM DIM_USUARIO WHERE lower(email) = lower({email:String}) LIMIT 1
"""

COUNT_MIEMBROS_SUSCRIPCION = """
SELECT count() AS n FROM BRIDGE_SUSCRIPTOR_FAMILIA WHERE suscripcion_id = {suscripcion_id:String}
"""

# Un usuario pertenece, como máximo, a un plan familiar activo a la vez (spec.md)
# — se verifica sin filtrar por suscripcion_id porque la membresía se elimina
# (DELETE físico) al salir de un plan, así que cualquier fila presente es la
# membresía vigente.
USUARIO_YA_EN_PLAN_FAMILIAR = """
SELECT count() AS n FROM BRIDGE_SUSCRIPTOR_FAMILIA WHERE usuario_id = {usuario_id:String}
"""

MIEMBRO_EXISTE = """
SELECT count() AS n FROM BRIDGE_SUSCRIPTOR_FAMILIA
WHERE suscripcion_id = {suscripcion_id:String} AND usuario_id = {usuario_id:String}
"""

SUSCRIPCION_TIENE_TITULAR = """
SELECT count() AS n FROM BRIDGE_SUSCRIPTOR_FAMILIA
WHERE suscripcion_id = {suscripcion_id:String} AND es_titular = 1
"""

# Dashboard (RT-04, S10 Día 3): tickets de soporte reales por estado —
# FACT_TICKET_SOPORTE es append-once por ticket (ALTER UPDATE in-place al
# resolver, no ReplacingMergeTree), así que un GROUP BY directo ya refleja
# el estado vigente sin necesitar argMax.
TICKETS_POR_ESTADO = "SELECT estado, count() AS total FROM FACT_TICKET_SOPORTE GROUP BY estado"

TICKETS_ABIERTOS_TOTAL = "SELECT count() AS n FROM FACT_TICKET_SOPORTE WHERE estado IN ('abierto', 'en_proceso')"

# ─────────────────────────────────────────────────────────────────────────────
# Reportes administrativos
# ─────────────────────────────────────────────────────────────────────────────

# Panel de pruebas A/B: FACT_AB_TEST_EXPOSICION es MergeTree simple (no
# versionada), así que un GROUP BY directo ya refleja el estado real sin
# necesitar argMax.
AB_TESTS_RESUMEN = """
SELECT
    experimento,
    variante,
    count() AS exposiciones,
    min(fecha) AS primera_exposicion,
    max(fecha) AS ultima_exposicion,
    uniq(usuario_id) AS usuarios_unicos
FROM FACT_AB_TEST_EXPOSICION
GROUP BY experimento, variante
ORDER BY experimento, variante
"""

# Panel de plan familiar (RF-EXP-008): una fila por suscripcion_id con el
# titular resuelto vía maxIf(es_titular=1) — mismo shape que MIEMBROS_DE_
# SUSCRIPCION pero agregado por familia, no expandido por miembro. `plan`
# (tipo_plan de PocketBase) NO se resuelve acá: BRIDGE_SUSCRIPTOR_FAMILIA no
# tiene esa columna (vive en PocketBase, misma decisión ya tomada para
# `plan_activo` en `seguridad`) — se enriquece en el router con un lookup por
# `familia_id` (= suscripcion_id de PocketBase).
FAMILIAS_RESUMEN = """
SELECT
    f.suscripcion_id AS familia_id,
    count() AS total_miembros,
    maxIf(f.usuario_id, f.es_titular = 1) AS titular_id,
    maxIf(u.nombre, f.es_titular = 1) AS titular_nombre,
    maxIf(u.email, f.es_titular = 1) AS titular_email,
    min(f.fecha_union) AS creada_en
FROM BRIDGE_SUSCRIPTOR_FAMILIA f
LEFT JOIN DIM_USUARIO u ON f.usuario_id = u.usuario_id
GROUP BY f.suscripcion_id
ORDER BY creada_en DESC
"""

