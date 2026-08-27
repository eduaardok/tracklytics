# DIM_CUENTA_ARTISTA y FACT_SUBIDA_TRACK son ReplacingMergeTree (mismo motivo
# ya documentado para FACT_SESION en `seguridad`): ClickHouse no fusiona las
# partes de inmediato, así que una fila ya resuelta (aprobada/rechazada)
# podría seguir viéndose como `pendiente` si se lee la tabla cruda. El estado
# vigente siempre se resuelve con argMax(columna, version) agrupando por la
# clave de la entidad, nunca filtrando la tabla directamente.
#
# Todo filtro (WHERE) sobre un campo que también se proyecta como alias de
# una función de agregación se aplica en una capa EXTERNA a esa agregación,
# nunca en la misma SELECT: ClickHouse reescribe el alias hacia adelante
# dentro del mismo SELECT y un WHERE que referencia el nombre de un alias
# agregado se interpreta como filtro post-agregación, lo que dispara
# "Code 184: ILLEGAL_AGGREGATION" (mismo problema ya documentado en
# `paquetes/seguridad/queries.py` para PERMISOS_VIGENTES/SESION_ABIERTA_POR_DISPOSITIVO).

_CUENTA_RESUELTA = """
    SELECT
        cuenta_artista_id,
        anyLast(usuario_id)                         AS usuario_id,
        argMax(nombre_artistico, actualizado_en)     AS nombre_artistico,
        argMax(estado_cuenta, actualizado_en)        AS estado_cuenta,
        anyLast(fecha_solicitud)                     AS fecha_solicitud,
        argMax(fecha_resolucion, actualizado_en)     AS fecha_resolucion,
        argMax(admin_resolutor_id, actualizado_en)   AS admin_resolutor_id
    FROM DIM_CUENTA_ARTISTA
    GROUP BY cuenta_artista_id
"""

CUENTA_ACTUAL_POR_USUARIO = f"""
SELECT * FROM ({_CUENTA_RESUELTA}) WHERE usuario_id = {{usuario_id:String}} LIMIT 1
"""

CUENTA_ACTUAL_POR_ID = f"""
SELECT * FROM ({_CUENTA_RESUELTA}) WHERE cuenta_artista_id = {{cuenta_artista_id:String}} LIMIT 1
"""

CUENTA_EXISTE_POR_USUARIO = """
SELECT count() AS n FROM DIM_CUENTA_ARTISTA WHERE usuario_id = {usuario_id:String}
"""


def cuentas_admin_sql(where: str) -> str:
    return f"""
    SELECT * FROM ({_CUENTA_RESUELTA})
    {where}
    ORDER BY fecha_solicitud DESC
    """


# ── Subidas de tracks (FACT_SUBIDA_TRACK + STG_ARTIST_UPLOADS + DIM_ESTADO_REVISION) ─

_SUBIDA_RESUELTA = """
    SELECT
        subida_id,
        anyLast(cuenta_artista_id)                   AS cuenta_artista_id,
        anyLast(staging_id)                           AS staging_id,
        argMax(estado_revision_id, version)           AS estado_revision_id,
        anyLast(fecha_subida)                         AS fecha_subida,
        argMax(fecha_resolucion, version)             AS fecha_resolucion,
        argMax(admin_resolutor_id, version)           AS admin_resolutor_id,
        argMax(fact_id_promovido, version)            AS fact_id_promovido
    FROM FACT_SUBIDA_TRACK
    GROUP BY subida_id
"""

_SUBIDA_JOIN = f"""
FROM ({_SUBIDA_RESUELTA}) f
JOIN DIM_ESTADO_REVISION er ON f.estado_revision_id = er.estado_revision_id
JOIN STG_ARTIST_UPLOADS s ON f.staging_id = s.staging_id
"""

# Todas las columnas calificadas (f./s./er.) llevan AS explícito: ClickHouse
# antepone el alias de tabla al nombre de salida ("f.cuenta_artista_id" en vez
# de "cuenta_artista_id") en cuanto detecta que el nombre bare colisiona con
# una columna de otra tabla del JOIN (aquí, STG_ARTIST_UPLOADS.cuenta_artista_id/
# staging_id y DIM_ESTADO_REVISION.estado_revision_id) — sin AS, el dict que
# devuelve query_row(s) tendría esas claves "sucias" y rompería cualquier
# acceso por nombre (`subida["cuenta_artista_id"]`).
_SUBIDA_COLS = """
    f.subida_id          AS subida_id,
    f.cuenta_artista_id  AS cuenta_artista_id,
    f.staging_id         AS staging_id,
    f.estado_revision_id AS estado_revision_id,
    er.nombre            AS estado_nombre,
    f.fecha_subida        AS fecha_subida,
    f.fecha_resolucion    AS fecha_resolucion,
    f.admin_resolutor_id  AS admin_resolutor_id,
    f.fact_id_promovido   AS fact_id_promovido,
    s.track_name          AS track_name,
    s.album_name          AS album_name,
    s.genre_id            AS genre_id,
    s.genre_ids           AS genre_ids,
    s.descripcion         AS descripcion,
    s.duration_ms         AS duration_ms,
    s.explicit            AS explicit
"""

# Versión vigente máxima de una subida (change p1-ciclos-vida): la edición y el
# retiro insertan una fila nueva con version = max+1 para ganar de forma
# determinista el argMax(estado_revision_id, version), a diferencia de las
# transiciones originales (que usaban version=0).
SUBIDA_MAX_VERSION = "SELECT max(version) AS v FROM FACT_SUBIDA_TRACK WHERE subida_id = {subida_id:String}"

SUBIDA_ACTUAL_POR_ID = f"""
SELECT
    {_SUBIDA_COLS},
    s.danceability AS danceability, s.energy AS energy, s.key AS key,
    s.loudness AS loudness, s.mode AS mode, s.speechiness AS speechiness,
    s.acousticness AS acousticness, s.instrumentalness AS instrumentalness,
    s.liveness AS liveness, s.valence AS valence, s.tempo AS tempo,
    s.time_signature AS time_signature
{_SUBIDA_JOIN}
WHERE f.subida_id = {{subida_id:String}}
"""

SUBIDAS_POR_CUENTA = f"""
SELECT {_SUBIDA_COLS}
{_SUBIDA_JOIN}
WHERE f.cuenta_artista_id = {{cuenta_artista_id:String}}
ORDER BY f.fecha_subida DESC
"""


def subidas_admin_sql(where: str) -> str:
    return f"""
    SELECT {_SUBIDA_COLS}
    {_SUBIDA_JOIN}
    {where}
    ORDER BY f.fecha_subida DESC
    """


GENERO_EXISTE = "SELECT count() AS n FROM DIM_GENRES WHERE genre_id = {genre_id:UInt16}"

# ── Perfil de audio por género (subida de track, mismo criterio de la ingesta) ─
# Consulta propia y liviana en vez de importar `etl/gold/enriquecimiento.py`:
# API y ETL corren en contenedores/entornos Python separados (ver design.md de
# `enriquecimiento-catalogo`, decisión 2 — misma convención de duplicación
# intencional ya usada entre `regalias/router.py` y `regalias_liquidacion.py`).
PERFIL_AUDIO_POR_GENERO = """
SELECT
    count()                    AS n,
    avg(energy)                AS energy,
    avg(danceability)          AS danceability,
    avg(acousticness)          AS acousticness,
    avg(instrumentalness)      AS instrumentalness,
    avg(valence)                AS valence,
    avg(tempo)                  AS tempo
FROM FACT_TRACKS
WHERE source_type = 'real' AND genre_id = {genre_id:UInt16}
"""

PERFIL_AUDIO_GLOBAL = """
SELECT
    avg(energy)                AS energy,
    avg(danceability)          AS danceability,
    avg(acousticness)          AS acousticness,
    avg(instrumentalness)      AS instrumentalness,
    avg(valence)                AS valence,
    avg(tempo)                  AS tempo
FROM FACT_TRACKS
WHERE source_type = 'real'
"""

# ── Resolución de dimensiones para la promoción a FACT_TRACKS (promocion.py) ──

ARTIST_ID_POR_NOMBRE = "SELECT artist_id FROM DIM_ARTISTS WHERE name = {name:String} LIMIT 1"
ARTIST_ID_MAX = "SELECT max(artist_id) AS n FROM DIM_ARTISTS"

ALBUM_ID_POR_NOMBRE = "SELECT album_id FROM DIM_ALBUMS WHERE name = {name:String} LIMIT 1"
ALBUM_ID_MAX = "SELECT max(album_id) AS n FROM DIM_ALBUMS"

LOAD_WEEK_MAX = "SELECT max(load_week) AS n FROM FACT_TRACKS"
FACT_ID_MAX = "SELECT max(fact_id) AS n FROM FACT_TRACKS"

# Dashboard (RT-04, S10 Día 3): distribución real de subidas por estado de
# revisión — reusa `_SUBIDA_RESUELTA` (mismo patrón argMax de resolución de
# ReplacingMergeTree que el resto de esta capability, nunca sobre la tabla cruda).
SUBIDAS_POR_ESTADO = f"""
SELECT er.nombre AS estado, count() AS total
FROM ({_SUBIDA_RESUELTA}) f
JOIN DIM_ESTADO_REVISION er ON f.estado_revision_id = er.estado_revision_id
GROUP BY er.nombre
"""

CUENTAS_ARTISTA_TOTAL = "SELECT count() AS n FROM (SELECT cuenta_artista_id FROM DIM_CUENTA_ARTISTA GROUP BY cuenta_artista_id)"


# ── Analítica propia del artista (R2, S16-P9) ────────────────────────────────
# Lo que la auditoría dejó anotado y CuentaArtistaPage esperaba: engagement
# real sobre los tracks propios. La fuente es FACT_ENGAGEMENT_USUARIO
# filtrando por los fact_id promovidos de la cuenta — el mismo patrón IN
# podable que experiencia usa desde S16-P7 (la tabla no tiene projection por
# fact_id, pero el costo es comparable al de las agregaciones de SENALES).
# Favoritos netos = altas − bajas (mismo criterio de favorito vigente que
# biblioteca/experiencia aplican con argMax; aquí la resta basta porque solo
# interesa el saldo por track).

ANALITICA_ARTISTA_POR_TRACK = """
SELECT
    fact_id,
    countIf(event_type = 'reproduccion')   AS plays,
    countIf(event_type = 'like')           AS likes,
    countIf(event_type = 'favorito_add') - countIf(event_type = 'favorito_remove') AS favoritos,
    uniqIf(user_id, event_type = 'reproduccion') AS oyentes
FROM FACT_ENGAGEMENT_USUARIO
WHERE fact_id IN {fact_ids:Array(UInt64)}
GROUP BY fact_id
"""

# Rango parametrizado (S17, "date range customizable en dashboards"): antes
# era una ventana fija de 30 días — `desde`/`hasta` los resuelve el router
# (default: últimos 30 días, tope de 366 días, ver `_rango_dias` en
# `creadores/router.py`).
ANALITICA_ARTISTA_SERIE = """
SELECT
    toDate(event_timestamp) AS dia,
    count()                 AS plays
FROM FACT_ENGAGEMENT_USUARIO
WHERE event_type = 'reproduccion'
  AND fact_id IN {fact_ids:Array(UInt64)}
  AND event_timestamp >= {desde:DateTime} AND event_timestamp < {hasta:DateTime}
GROUP BY dia
ORDER BY dia ASC
"""
