"""Lectura de las 12 tablas GOLD_* (ClickHouse Gold, 8124) para los 30
endpoints de informes compuestos — SIEMPRE vía `core.database_gold`, nunca
agregando en caliente sobre el catálogo (8123), por regla de esta semana.

S14-P2: grano temporal configurable (día/semana/mes/trimestre/año, default
'semana' — el frontend actual no manda `granularidad` todavía, así que sin
ese parámetro el comportamiento es idéntico al de antes de S14-P2).
`periodo_inicio`/`periodo_fin` siguen aceptando etiquetas de período
legibles ('2026-W20', '2026-08', '2026-Q3', ...) en vez de fechas — se
resuelven contra `fecha_inicio` con una subconsulta (misma tabla, mismo
`granularidad`) en vez de comparar como string, porque el orden alfabético
de `periodo` no coincide con el cronológico para 'mes' ni 'trimestre'
('2026-Q10' no existe, pero '2026-Q9' < '2026-Q10' alfabéticamente sería un
bug distinto — el punto real es que comparar fechas es siempre correcto,
comparar etiquetas a veces no).
"""

from core.database_gold import query_rows_gold

TABLAS_GOLD = {
    "GOLD_ADQUISICION_PERIODO", "GOLD_API_CONSUMO_PERIODO", "GOLD_INFRAESTRUCTURA_PERIODO",
    "GOLD_FINANCIERO_PERIODO", "GOLD_REGALIAS_PERIODO", "GOLD_PIPELINE_PERIODO",
    "GOLD_ENGAGEMENT_PERIODO", "GOLD_CONSUMO_GENERO_PERIODO", "GOLD_CONTENIDO_PERIODO",
    "GOLD_COMUNIDAD_PERIODO", "GOLD_SEGURIDAD_PERIODO", "GOLD_PRODUCTO_PERIODO",
}


def _rango_where(tabla: str, granularidad: str, periodo_inicio: str | None, periodo_fin: str | None) -> tuple[str, dict]:
    clausulas = ["granularidad = {granularidad:String}"]
    params: dict = {"granularidad": granularidad}
    if periodo_inicio:
        clausulas.append(
            f"fecha_inicio >= (SELECT fecha_inicio FROM {tabla} "
            f"WHERE granularidad = {{granularidad:String}} AND periodo = {{p_ini:String}} LIMIT 1)"
        )
        params["p_ini"] = periodo_inicio
    if periodo_fin:
        clausulas.append(
            f"fecha_inicio <= (SELECT fecha_inicio FROM {tabla} "
            f"WHERE granularidad = {{granularidad:String}} AND periodo = {{p_fin:String}} LIMIT 1)"
        )
        params["p_fin"] = periodo_fin
    where = f"WHERE {' AND '.join(clausulas)}"
    return where, params


def fetch_gold(tabla: str, periodo_inicio: str | None = None, periodo_fin: str | None = None,
               granularidad: str = "semana", extra_where: str = "", extra_params: dict | None = None) -> list[dict]:
    where, params = _rango_where(tabla, granularidad, periodo_inicio, periodo_fin)
    if extra_where:
        where = f"{where} AND {extra_where}"
        params.update(extra_params or {})
    return query_rows_gold(f"SELECT * FROM {tabla} {where} ORDER BY fecha_inicio", params)


def fetch_periodos_disponibles(tabla: str, granularidad: str = "semana") -> list[dict]:
    """Etiquetas de período reales disponibles en `tabla` para `granularidad`,
    con su `fecha_inicio` — alimenta el selector de granularidad del
    frontend (bloque siguiente a S14-P2) con datos reales en vez de una
    lista fija de 12 semanas."""
    return query_rows_gold(
        f"SELECT DISTINCT periodo, fecha_inicio FROM {tabla} WHERE granularidad = {{granularidad:String}} ORDER BY fecha_inicio",
        {"granularidad": granularidad},
    )
