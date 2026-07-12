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

# ── Sellos ──────────────────────────────────────────────────────────────────

SELLO_POR_ID = "SELECT sello_id, nombre FROM DIM_SELLO_DISCOGRAFICO WHERE sello_id = {sello_id:UInt32} LIMIT 1"

SELLOS_LIST = "SELECT sello_id, nombre FROM DIM_SELLO_DISCOGRAFICO ORDER BY nombre"

# ── Catálogos fijos (soporte de dropdowns en la UI admin) ──────────────────

PAISES_LIST = "SELECT pais_id, nombre, codigo_iso FROM DIM_PAIS ORDER BY nombre"

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
