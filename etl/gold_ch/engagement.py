"""GOLD_ENGAGEMENT_PERIODO — C14/C16 (OT-15/17, Analítica y BI).

Real: `FACT_ENGAGEMENT_USUARIO` (52k+ filas reales, event_type reproducción/
favorito) unido a `FACT_TRACKS`/`DIM_GENRES` para el desglose por género;
`BRIDGE_TRACK_PLAYLIST_USUARIO` para adds a playlist; `DIM_USUARIO` para
usuarios nuevos/activos/retenidos. `engagement_score_promedio` es una
fórmula (reproducciones + favoritos×2 + playlist_adds×3, normalizada por
usuario activo) aplicada sobre conteos reales — no un valor inventado, es
una métrica derivada, igual que cualquier "score" de negocio.

Se limita a los 10 géneros con más reproducciones reales (más una fila de
rollup `genero=''` con el total del período) — desglosar los 114 géneros
reales del catálogo por período infla la tabla sin aportar señal.

`retenidos` compara usuarios activos del período actual contra el período
INMEDIATAMENTE anterior de la MISMA granularidad (no necesariamente la
semana calendario anterior cuando la granularidad es 'mes'/'trimestre'/
'anio'). S14-P3 eliminó el relleno demo (`rng_for`):
`etl/gold/backfill_negocio.py` genera reproducciones/favoritos reales para
los 24 meses de historia — un período o género sin actividad real no tiene
fila.

Like/dislike (S16 prompt 09, RN-ANA-001) NO se incorpora a
`engagement_score_promedio`: esta fórmula (reproducciones + favoritos×2 +
playlist_adds×3) es una métrica de negocio propia para el rollup de
período/género, independiente del `raw_score` de RF-ANA-006
(`api/paquetes/analitica/queries.py`, reproduccion×1 + favorito_add×3 +
like×2) que sí se actualizó. Ya eran fórmulas distintas antes de este
cambio (pesos distintos, incluye playlist_adds que RF-ANA-006 no tiene) —
sumar like aquí requeriría decidir su peso en un contexto de negocio
distinto, fuera del alcance autorizado (solo RN-ANA-001/raw_score).
"""

import time

from gold_ch.base import VENTANA_ORIGEN_DIAS, get_catalog_client, get_gold_client, log_run, periodo_sql, periodos_ventana, write_gold

TABLE = "GOLD_ENGAGEMENT_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "genero", "reproducciones_total", "favoritos_total",
    "playlist_adds_total", "engagement_score_promedio", "popularidad_promedio", "usuarios_activos",
    "nuevos_usuarios", "usuarios_retenidos", "es_estimado",
]


def run_gold_engagement(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    fecha_inicio_de = dict(ventana)
    catalog = get_catalog_client()
    gold = get_gold_client()

    top_generos = [r["name"] for r in catalog.query(
        """
        SELECT g.name AS name, count() AS n
        FROM FACT_ENGAGEMENT_USUARIO e
        JOIN FACT_TRACKS t ON t.fact_id = e.fact_id
        JOIN DIM_GENRES g ON g.genre_id = t.genre_id
        WHERE e.event_type = 'reproduccion'
        GROUP BY name ORDER BY n DESC LIMIT 10
        """
    ).named_results()]
    top_generos = top_generos or ["pop", "rock", "hip-hop"]

    por_genero = {(r["periodo"], r["genero"]): r for r in catalog.query(
        f"""
        SELECT {periodo_sql('e.event_timestamp', granularidad)} AS periodo, g.name AS genero,
               countIf(e.event_type = 'reproduccion') AS repros,
               countIf(e.event_type = 'favorito_add') - countIf(e.event_type = 'favorito_remove') AS favs,
               avg(t.popularity) AS pop, uniqExact(e.user_id) AS activos
        FROM FACT_ENGAGEMENT_USUARIO e
        JOIN FACT_TRACKS t ON t.fact_id = e.fact_id
        JOIN DIM_GENRES g ON g.genre_id = t.genre_id
        WHERE e.event_timestamp >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY AND g.name IN ({','.join(f"'{g}'" for g in top_generos)})
        GROUP BY periodo, genero
        """
    ).named_results()}

    rollup = {r["periodo"]: r for r in catalog.query(
        f"""
        SELECT {periodo_sql('event_timestamp', granularidad)} AS periodo,
               countIf(event_type = 'reproduccion') AS repros,
               countIf(event_type = 'favorito_add') - countIf(event_type = 'favorito_remove') AS favs,
               uniqExact(user_id) AS activos
        FROM FACT_ENGAGEMENT_USUARIO WHERE event_timestamp >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo
        """
    ).named_results()}

    playlist_adds = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha_agregado', granularidad)} AS periodo, count() AS n FROM BRIDGE_TRACK_PLAYLIST_USUARIO "
        f"WHERE fecha_agregado >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}

    nuevos = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha_registro', granularidad)} AS periodo, count() AS n FROM DIM_USUARIO "
        f"WHERE fecha_registro >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}

    activos_por_periodo_set: dict[str, set] = {}
    for r in catalog.query(
        f"SELECT {periodo_sql('event_timestamp', granularidad)} AS periodo, user_id FROM FACT_ENGAGEMENT_USUARIO "
        f"WHERE event_timestamp >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo, user_id"
    ).named_results():
        activos_por_periodo_set.setdefault(r["periodo"], set()).add(r["user_id"])

    def score(repros, favs, adds, activos):
        if not activos:
            return 0.0
        return round((repros + favs * 2 + adds * 3) / activos, 2)

    rows: list[tuple] = []
    prev_users: set[str] = set()
    for periodo in periodos:
        fi = fecha_inicio_de[periodo]
        r = rollup.get(periodo)
        adds = playlist_adds.get(periodo, 0)
        nuevos_n = nuevos.get(periodo, 0)
        if r:
            cur_users = activos_por_periodo_set.get(periodo, set())
            retenidos = len(cur_users & prev_users)
            prev_users = cur_users or prev_users
            # `favorito_add - favorito_remove` puede dar negativo si en ese
            # período se removieron más favoritos de tracks marcados en
            # períodos anteriores que los que se agregaron — real, pero
            # `favoritos_total` es UInt32 (no puede ser negativo).
            favs = max(r["favs"], 0)
            rows.append((
                granularidad, fi, periodo, "", r["repros"], favs, adds,
                score(r["repros"], favs, adds, r["activos"]), 0.0, r["activos"], nuevos_n, retenidos, 0,
            ))

        for genero in top_generos:
            g = por_genero.get((periodo, genero))
            if not g:
                continue
            rows.append((
                granularidad, fi, periodo, genero, g["repros"], max(g["favs"], 0), 0,
                score(g["repros"], max(g["favs"], 0), 0, g["activos"]),
                round(g["pop"] or 0, 2), g["activos"], 0, 0, 0,
            ))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
