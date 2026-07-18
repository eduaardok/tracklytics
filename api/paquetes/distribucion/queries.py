# ── Existencia ──────────────────────────────────────────────────────────────

SELLO_EXISTE = "SELECT count() AS n FROM DIM_SELLO_DISCOGRAFICO WHERE sello_id = {sello_id:UInt32}"

ARTISTA_EXISTE = "SELECT count() AS n FROM DIM_ARTISTS WHERE artist_id = {artist_id:UInt32}"

ALBUM_EXISTE = "SELECT count() AS n FROM DIM_ALBUMS WHERE album_id = {album_id:UInt32}"

TRACK_EXISTE = "SELECT count() AS n FROM FACT_TRACKS WHERE fact_id = {fact_id:UInt64}"

PAIS_EXISTE = "SELECT count() AS n FROM DIM_PAIS WHERE pais_id = {pais_id:UInt16}"

CANAL_EXISTE = "SELECT count() AS n FROM DIM_CANAL_DISTRIBUCION WHERE canal_id = {canal_id:UInt16}"

TIPO_RESTRICCION_EXISTE = "SELECT count() AS n FROM DIM_TIPO_RESTRICCION WHERE tipo_restriccion_id = {tipo_restriccion_id:UInt16}"

# ── IDs auto-incrementales (mismo patrón que ARTIST_ID_MAX/ALBUM_ID_MAX en
#    `creadores/queries.py`: operaciones administrativas de bajo volumen, sin
#    necesidad de random.getrandbits) ─────────────────────────────────────────

SELLO_ID_MAX    = "SELECT max(sello_id) AS n FROM DIM_SELLO_DISCOGRAFICO"
LICENCIA_ID_MAX = "SELECT max(licencia_id) AS n FROM DIM_LICENCIA"
# Estado vigente de una licencia para el flujo de revocación (change p1-ciclos-vida).
LICENCIA_ESTADO_POR_ID = "SELECT licencia_id, sello_id, pais_id, toString(estado) AS estado FROM DIM_LICENCIA WHERE licencia_id = {licencia_id:UInt32} LIMIT 1"

# ── Sellos ──────────────────────────────────────────────────────────────────

SELLO_POR_ID = "SELECT sello_id, nombre, pais FROM DIM_SELLO_DISCOGRAFICO WHERE sello_id = {sello_id:UInt32} LIMIT 1"

SELLOS_LIST = "SELECT sello_id, nombre, pais FROM DIM_SELLO_DISCOGRAFICO ORDER BY nombre"

# ── Catálogos fijos (soporte de dropdowns en la UI admin) ──────────────────

PAISES_LIST = "SELECT pais_id, nombre, codigo_iso FROM DIM_PAIS ORDER BY nombre"

# ── Configuración de país (modelo-financiero-completar-huecos, CU-O97):
# moneda/tasa de cambio/IVA/retención fiscal, administrable — ver design.md
# decisión 4. Incluye países inactivos (el admin necesita verlos para poder
# reactivarlos); PAISES_LIST arriba sigue siendo el catálogo público/legacy
# de solo pais_id/nombre/codigo_iso, sin tocar.
PAISES_CONFIG_LIST = """
SELECT pais_id, nombre, codigo_iso, moneda_codigo, tasa_cambio_a_usd, iva_tasa,
       retencion_fiscal_pct, activo
FROM DIM_PAIS ORDER BY nombre
"""

PAIS_ID_MAX = "SELECT max(pais_id) AS n FROM DIM_PAIS"

PAIS_CONFIG_POR_ID = """
SELECT pais_id, nombre, codigo_iso, moneda_codigo, tasa_cambio_a_usd, iva_tasa,
       retencion_fiscal_pct, activo
FROM DIM_PAIS WHERE pais_id = {pais_id:UInt16} LIMIT 1
"""

CANALES_LIST = "SELECT canal_id, nombre FROM DIM_CANAL_DISTRIBUCION ORDER BY canal_id"

TIPOS_RESTRICCION_LIST = "SELECT tipo_restriccion_id, nombre, descripcion FROM DIM_TIPO_RESTRICCION ORDER BY tipo_restriccion_id"

# ── Resolución de país del usuario (design.md, Decisión 5: comparación
#    case-insensitive contra nombre o codigo_iso; sin match -> NULL -> fail-open
#    en el llamador, no en la query) ───────────────────────────────────────────

PAIS_ID_POR_TEXTO = """
SELECT pais_id FROM DIM_PAIS
WHERE lower(nombre) = lower({texto:String}) OR lower(codigo_iso) = lower({texto:String})
LIMIT 1
"""

# ── Licencias ───────────────────────────────────────────────────────────────


def licencias_sql(where: str) -> str:
    return f"""
    SELECT l.licencia_id AS licencia_id, l.sello_id AS sello_id, s.nombre AS sello_nombre,
           l.pais_id AS pais_id, p.nombre AS pais_nombre,
           l.fecha_inicio AS fecha_inicio, l.fecha_fin AS fecha_fin, l.estado AS estado
    FROM DIM_LICENCIA l
    JOIN DIM_SELLO_DISCOGRAFICO s ON l.sello_id = s.sello_id
    JOIN DIM_PAIS p ON l.pais_id = p.pais_id
    {where}
    ORDER BY l.fecha_inicio DESC
    """


# ── Restricciones ───────────────────────────────────────────────────────────

RESTRICCION_ACTIVA_EXISTE = """
SELECT b.tipo_restriccion_id AS tipo_restriccion_id, t.nombre AS tipo_restriccion_nombre
FROM BRIDGE_RESTRICCION_TRACK b
JOIN DIM_TIPO_RESTRICCION t ON b.tipo_restriccion_id = t.tipo_restriccion_id
WHERE b.fact_id_track = {fact_id_track:UInt64}
  AND b.pais_id = {pais_id:UInt16}
  AND b.canal_id = {canal_id:UInt16}
  AND b.activo = 1
LIMIT 1
"""

RESTRICCIONES_DE_TRACK = """
SELECT b.fact_id_track AS fact_id_track, b.pais_id AS pais_id, p.nombre AS pais_nombre,
       b.canal_id AS canal_id, c.nombre AS canal_nombre,
       b.tipo_restriccion_id AS tipo_restriccion_id, t.nombre AS tipo_restriccion_nombre,
       b.fecha_inicio AS fecha_inicio, b.activo AS activo
FROM BRIDGE_RESTRICCION_TRACK b
JOIN DIM_PAIS p ON b.pais_id = p.pais_id
JOIN DIM_CANAL_DISTRIBUCION c ON b.canal_id = c.canal_id
JOIN DIM_TIPO_RESTRICCION t ON b.tipo_restriccion_id = t.tipo_restriccion_id
WHERE b.fact_id_track = {fact_id_track:UInt64}
ORDER BY b.fecha_inicio DESC
"""

# Dashboard (RT-04, S10 Día 3): reproducciones bloqueadas reales por país
# (top 10) — agrega FACT_RESTRICCION_REPRODUCCION, escrita solo cuando el
# enforcement real de RF-DIS-007 bloquea un intento de reproducción.
RESTRICCIONES_POR_PAIS = """
SELECT p.nombre AS pais, count() AS total
FROM FACT_RESTRICCION_REPRODUCCION r
JOIN DIM_PAIS p ON r.pais_id = p.pais_id
GROUP BY p.nombre
ORDER BY total DESC
LIMIT 10
"""

LICENCIAS_ACTIVAS_TOTAL = "SELECT count() AS n FROM DIM_LICENCIA WHERE estado = 'activa'"

# ── Solicitudes de licencia ─────────────────────────────────────────────────
# SOLICITUD_LICENCIA es ReplacingMergeTree(actualizado_en) — mismo motivo ya
# documentado para DIM_CUENTA_ARTISTA (`creadores/queries.py`): una fila ya
# resuelta puede seguir viéndose como `pendiente` si se lee la tabla cruda,
# así que el estado vigente siempre se resuelve con argMax(columna, version)
# agrupando por solicitud_id, nunca filtrando la tabla directamente. Igual
# que allí, cualquier WHERE sobre un campo que también se proyecta como
# alias de una función de agregación se aplica en una capa EXTERNA a esa
# agregación (subselect), o dispara "Code 184: ILLEGAL_AGGREGATION".

_SOLICITUD_RESUELTA = """
    SELECT
        solicitud_id,
        anyLast(sello_id)                           AS sello_id,
        argMax(paises_solicitados, actualizado_en)   AS paises_solicitados,
        argMax(canales_solicitados, actualizado_en)  AS canales_solicitados,
        anyLast(fecha_inicio_propuesta)              AS fecha_inicio_propuesta,
        argMax(fecha_fin_propuesta, actualizado_en)  AS fecha_fin_propuesta,
        argMax(estado, actualizado_en)               AS estado,
        argMax(motivo_rechazo, actualizado_en)       AS motivo_rechazo,
        anyLast(fecha_solicitud)                     AS fecha_solicitud,
        argMax(fecha_resolucion, actualizado_en)     AS fecha_resolucion,
        argMax(admin_resolutor_id, actualizado_en)   AS admin_resolutor_id
    FROM SOLICITUD_LICENCIA
    GROUP BY solicitud_id
"""


def solicitudes_licencia_sql(where: str) -> str:
    return f"""
    SELECT * FROM ({_SOLICITUD_RESUELTA}) s
    {where}
    ORDER BY s.fecha_solicitud DESC
    """


SOLICITUD_LICENCIA_ACTUAL_POR_ID = f"""
SELECT * FROM ({_SOLICITUD_RESUELTA}) WHERE solicitud_id = {{solicitud_id:String}} LIMIT 1
"""

# ── Disponibilidad por país como lista navegable (mejoras-producto-revision-qa) ─
# `BRIDGE_RESTRICCION_TRACK.tipo_restriccion_id` es `UInt16` NO nullable —
# ClickHouse rellena las filas sin match de un LEFT JOIN con el valor default
# de la columna (0), no con NULL real, salvo que la sesión tenga
# `join_use_nulls=1` (no es el caso acá). `IS NULL` sobre esa columna sería
# siempre falso, marcando TODO el catálogo como bloqueado — bug detectado en
# verificación manual de esta misma change. El filtro de estado y el cálculo
# de `disponible` comparan explícitamente contra `0` (ningún
# `tipo_restriccion_id` real empieza en 0, ver seed de `DIM_TIPO_RESTRICCION`
# en `init_clickhouse.py`), nunca sobre el alias `disponible` (mismo criterio
# ya documentado en el proyecto para evitar que ClickHouse reescriba el alias
# hacia adelante dentro del mismo SELECT).


def disponibilidad_lista_sql(where: str) -> str:
    return f"""
    SELECT
        f.fact_id AS fact_id_track,
        f.track_name AS track_name,
        a.name AS artist_name,
        b.tipo_restriccion_id = 0 AS disponible,
        if(b.tipo_restriccion_id = 0, NULL, t.nombre) AS tipo_restriccion
    FROM FACT_TRACKS f
    JOIN DIM_ARTISTS a ON f.artist_id = a.artist_id
    LEFT JOIN BRIDGE_RESTRICCION_TRACK b
        ON b.fact_id_track = f.fact_id AND b.pais_id = {{pais_id:UInt16}}
        AND b.canal_id = {{canal_id:UInt16}} AND b.activo = 1
    LEFT JOIN DIM_TIPO_RESTRICCION t ON b.tipo_restriccion_id = t.tipo_restriccion_id
    {where}
    ORDER BY f.fact_id
    LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
    """


def disponibilidad_lista_total_sql(where: str) -> str:
    return f"""
    SELECT count() AS n
    FROM FACT_TRACKS f
    JOIN DIM_ARTISTS a ON f.artist_id = a.artist_id
    LEFT JOIN BRIDGE_RESTRICCION_TRACK b
        ON b.fact_id_track = f.fact_id AND b.pais_id = {{pais_id:UInt16}}
        AND b.canal_id = {{canal_id:UInt16}} AND b.activo = 1
    {where}
    """
