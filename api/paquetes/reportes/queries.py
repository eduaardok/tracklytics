"""Lectura de las 12 tablas GOLD_* (ClickHouse Gold, 8124) para los 30
endpoints de informes compuestos — SIEMPRE vía `core.database_gold`, nunca
agregando en caliente sobre el catálogo (8123), por regla de esta semana.
"""

from core.database_gold import query_rows_gold


def _rango_where(periodo_inicio: str | None, periodo_fin: str | None) -> tuple[str, dict]:
    clausulas, params = [], {}
    if periodo_inicio:
        clausulas.append("periodo >= {p_ini:String}")
        params["p_ini"] = periodo_inicio
    if periodo_fin:
        clausulas.append("periodo <= {p_fin:String}")
        params["p_fin"] = periodo_fin
    where = f"WHERE {' AND '.join(clausulas)}" if clausulas else ""
    return where, params


def fetch_gold(tabla: str, periodo_inicio: str | None = None, periodo_fin: str | None = None,
               extra_where: str = "", extra_params: dict | None = None) -> list[dict]:
    where, params = _rango_where(periodo_inicio, periodo_fin)
    if extra_where:
        where = f"{where} AND {extra_where}" if where else f"WHERE {extra_where}"
        params.update(extra_params or {})
    return query_rows_gold(f"SELECT * FROM {tabla} {where} ORDER BY periodo", params)
