"""GOLD_CONSUMO_GENERO_PERIODO — C15/C17/C18 (OT-16/18/19, Analítica y BI).

Real: reproducciones/popularidad/energía por género y artista, agregadas
desde `FACT_ENGAGEMENT_USUARIO` (event_type='reproduccion') unido a
`FACT_TRACKS`/`DIM_GENRES`/`DIM_ARTISTS`. Limitado a los 15 géneros y 10
artistas con más reproducciones reales (mismo criterio que `engagement.py`).

`variacion_pct_vs_anterior` se calcula sobre la serie ya armada (real donde
ambos períodos tienen dato real; 0 si no hay período anterior).

OT-18 (proyección): regresión lineal (`numpy.polyfit`, grado 1) sobre la
serie de reproducciones reales de cada género — si un género tiene menos de
4 puntos reales, no se proyecta (pendiente/intercepto quedan en 0 y
`prediccion_4sem` vacío) en vez de ajustar una recta sobre casi nada.
Guardado SOLO en la fila del período más reciente de cada género (ver
`create_gold_tables.py`).

La proyección SOLO se calcula para granularidad='semana' (S14-P2) — no se
generalizó la regresión a las demás granularidades. Para 'dia'/'mes'/
'trimestre'/'anio', pendiente_regresion/intercepto_regresion quedan en 0 y
prediccion_4sem vacío en TODAS las filas, no solo en las que no alcanzan.

S14-P3 eliminó el relleno demo (`rng_for`): un género/artista sin
reproducciones reales en un período simplemente no tiene fila para ese
período — `etl/gold/backfill_negocio.py` genera reproducciones reales para
los 24 meses de historia.

OT-19 (benchmark): `popularidad_catalogo_base` es el promedio real de
`popularity` de TODO `FACT_TRACKS` (el catálogo completo, no solo lo
reproducido) — el "índice externo" que pedía el enunciado no existe como tal
(no hay una fuente de mercado externa integrada); se usa el catálogo base
completo como referencia, documentado explícitamente como aproximación.
"""

import time

import numpy as np

from gold_ch.base import VENTANA_ORIGEN_DIAS, get_catalog_client, get_gold_client, log_run, periodo_sql, periodos_ventana, write_gold

TABLE = "GOLD_CONSUMO_GENERO_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "genre_id", "genero", "artist_id", "artista", "reproducciones",
    "popularidad_promedio", "energia_promedio", "variacion_pct_vs_anterior",
    "pendiente_regresion", "intercepto_regresion", "prediccion_4sem",
    "popularidad_interna_promedio", "popularidad_catalogo_base", "diferencia_pct_benchmark", "es_estimado",
]


def run_gold_consumo_genero(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    fecha_inicio_de = dict(ventana)
    catalog = get_catalog_client()
    gold = get_gold_client()

    pop_base = catalog.command("SELECT round(avg(popularity), 2) FROM FACT_TRACKS")
    pop_base = float(pop_base) if pop_base else 50.0

    generos = list(catalog.query(
        """
        SELECT g.genre_id AS genre_id, g.name AS name, count() AS n
        FROM FACT_ENGAGEMENT_USUARIO e JOIN FACT_TRACKS t ON t.fact_id = e.fact_id
        JOIN DIM_GENRES g ON g.genre_id = t.genre_id
        WHERE e.event_type = 'reproduccion' GROUP BY genre_id, name ORDER BY n DESC LIMIT 15
        """
    ).named_results())
    generos = generos or [{"genre_id": 1, "name": "pop"}]

    artistas = list(catalog.query(
        """
        SELECT a.artist_id AS artist_id, a.name AS name, count() AS n
        FROM FACT_ENGAGEMENT_USUARIO e JOIN FACT_TRACKS t ON t.fact_id = e.fact_id
        JOIN DIM_ARTISTS a ON a.artist_id = t.artist_id
        WHERE e.event_type = 'reproduccion' GROUP BY artist_id, name ORDER BY n DESC LIMIT 10
        """
    ).named_results())
    artistas = artistas or [{"artist_id": 1, "name": "Artista Demo"}]

    ids_genero = ",".join(str(g["genre_id"]) for g in generos)
    reales_genero = {(r["periodo"], r["genre_id"]): r for r in catalog.query(
        f"""
        SELECT {periodo_sql('e.event_timestamp', granularidad)} AS periodo, t.genre_id AS genre_id,
               count() AS repros, avg(t.popularity) AS pop, avg(t.energy) AS ene
        FROM FACT_ENGAGEMENT_USUARIO e JOIN FACT_TRACKS t ON t.fact_id = e.fact_id
        WHERE e.event_type = 'reproduccion' AND t.genre_id IN ({ids_genero})
          AND e.event_timestamp >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY
        GROUP BY periodo, genre_id
        """
    ).named_results()}

    ids_artista = ",".join(str(a["artist_id"]) for a in artistas)
    reales_artista = {(r["periodo"], r["artist_id"]): r for r in catalog.query(
        f"""
        SELECT {periodo_sql('e.event_timestamp', granularidad)} AS periodo, t.artist_id AS artist_id,
               count() AS repros, avg(t.popularity) AS pop, avg(t.energy) AS ene
        FROM FACT_ENGAGEMENT_USUARIO e JOIN FACT_TRACKS t ON t.fact_id = e.fact_id
        WHERE e.event_type = 'reproduccion' AND t.artist_id IN ({ids_artista})
          AND e.event_timestamp >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY
        GROUP BY periodo, artist_id
        """
    ).named_results()}

    def serie_y_variacion(reales: dict, clave_fn):
        """Arma la serie sobre los períodos con dato real (se omite el
        período si no hay reproducciones reales) y calcula variación % vs.
        el período anterior de la MISMA serie."""
        salida = []  # (periodo, repros, pop, ene, variacion)
        anterior = None
        for periodo in periodos:
            r = reales.get(clave_fn(periodo))
            if not r:
                continue
            repros, pop, ene = r["repros"], round(r["pop"] or 0, 2), round(r["ene"] or 0, 2)
            variacion = round(((repros - anterior) / anterior * 100), 2) if anterior else 0.0
            salida.append((periodo, repros, pop, ene, variacion))
            anterior = repros or anterior
        return salida

    rows: list[tuple] = []
    for g in generos:
        serie = serie_y_variacion(reales_genero, lambda p, gid=g["genre_id"]: (p, gid))
        pendiente, intercepto, prediccion = 0.0, 0.0, []
        if granularidad == "semana" and serie:
            y = np.array([s[1] for s in serie], dtype=float)
            x = np.arange(len(y), dtype=float)
            tiene_suficiente = int((y > 0).sum()) >= 4
            if tiene_suficiente:
                pendiente, intercepto = np.polyfit(x, y, 1)
                prediccion = [round(float(pendiente * (len(y) - 1 + k) + intercepto), 2) for k in range(1, 5)]
                prediccion = [max(0.0, v) for v in prediccion]

        pop_interna_serie = [s[2] for s in serie if s[2]]
        pop_interna = round(sum(pop_interna_serie) / len(pop_interna_serie), 2) if pop_interna_serie else pop_base
        diff_pct = round((pop_interna - pop_base) / pop_base * 100, 2) if pop_base else 0.0

        for i, (periodo, repros, pop, ene, variacion) in enumerate(serie):
            es_ultimo = i == len(serie) - 1
            rows.append((
                granularidad, fecha_inicio_de[periodo], periodo, g["genre_id"], g["name"], 0, "", repros, pop, ene, variacion,
                round(float(pendiente), 4) if es_ultimo else 0.0,
                round(float(intercepto), 2) if es_ultimo else 0.0,
                prediccion if es_ultimo else [],
                pop_interna, pop_base, diff_pct, 0,
            ))

    for a in artistas:
        serie = serie_y_variacion(reales_artista, lambda p, aid=a["artist_id"]: (p, aid))
        pop_interna_serie = [s[2] for s in serie if s[2]]
        pop_interna = round(sum(pop_interna_serie) / len(pop_interna_serie), 2) if pop_interna_serie else pop_base
        diff_pct = round((pop_interna - pop_base) / pop_base * 100, 2) if pop_base else 0.0
        for periodo, repros, pop, ene, variacion in serie:
            rows.append((
                granularidad, fecha_inicio_de[periodo], periodo, 0, "", a["artist_id"], a["name"], repros, pop, ene, variacion,
                0.0, 0.0, [], pop_interna, pop_base, diff_pct, 0,
            ))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
