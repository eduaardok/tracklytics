"""etl/gold/expandir_contratos_regalias.py — S14-P4, Fase 4: script de
corrección de una sola corrida (no forma parte del pipeline recurrente,
no se agrega a `docker-compose.yml`).

Problema real encontrado en la verificación de S14-P3: `DIM_CONTRATO_REGALIA`
solo tenía 3 contratos, 2 activos, vigentes recién desde julio de 2026 — los
informes de regalías en granularidad mes/trimestre/año mostraban casi todo
el rango en cero, no por un bug de agregación sino por escasez real de
contrapartes contratadas.

Qué hace, en orden:
1. Retrofecha `vigente_desde` de los 3 contratos ya existentes, distribuidas
   dentro de la ventana de 24 meses del backfill (no todas el mismo día).
2. Inserta contratos nuevos usando EXCLUSIVAMENTE contrapartes reales que ya
   existen en el catálogo — 8 contratos de sello (uno por cada fila de
   `DIM_SELLO_DISCOGRAFICO`, no se inventan sellos) + 11 contratos de artista
   (uno por cada fila de `DIM_CUENTA_ARTISTA`, no se inventan cuentas) = 19
   contratos nuevos, 22 en total. El `fact_id_track` de cada contrato nuevo
   se toma de los tracks reales con más reproducciones ya generadas por el
   backfill (`FACT_ENGAGEMENT_USUARIO`), para maximizar la chance real de
   que ese contrato tenga streams que liquidar en la mayoría de los meses —
   no una asignación al azar sobre las ~113k canciones reales, la mayoría
   de las cuales nunca se reprodujeron en la ventana.
3. Vuelve a llamar `gold.backfill_negocio.backfill_regalias()` (el mismo
   mecanismo ya usado por el backfill — HTTP real a `POST /admin/liquidar`,
   sin reimplementar la fórmula) tras borrar el flag de idempotencia propio
   del dominio "regalias" en `ETL_BATCH_CONTROL` — la idempotencia POR
   PERÍODO ya la garantiza el propio endpoint (`LIQUIDACION_YA_EXISTE_
   PERIODO`), así que solo hace falta que el backfill vuelva a intentar los
   meses que antes no encontraron streams/contrato vigente.
"""

import random
import sys
from datetime import date, timedelta

from gold.backfill_negocio import backfill_regalias, inicio_plataforma, _add_months, _meses_calendario
from utils.clickhouse_client import get_client
from utils.config import get_config

SEED = "expandir_contratos_regalias"


def _rng() -> random.Random:
    return random.Random(SEED)


def main() -> None:
    client = get_client(get_config())
    rng = _rng()

    dia_inicio = inicio_plataforma()
    dia_fin = date.today()
    meses = _meses_calendario(dia_inicio, dia_fin)
    print(f"Ventana: {dia_inicio} — {dia_fin} ({len(meses)} meses).")

    # ── 1. Retrofechar los 3 contratos existentes ──────────────────────────
    # `vigente_desde` es parte de la clave de orden (ORDER BY (fact_id_track,
    # vigente_desde)) — ClickHouse no permite UPDATE sobre columnas de clave
    # (CANNOT_UPDATE_COLUMN), así que se reemplaza con DELETE + INSERT
    # (mismo patrón idempotente que `write_gold`, aplicado acá a mano).
    columnas_contrato = [
        "contrato_id", "fact_id_track", "sello_id", "cuenta_artista_id", "productor_id",
        "pct_master_sello", "pct_master_artista", "pct_master_productor",
        "pct_publishing_sello", "pct_publishing_artista",
        "vigente_desde", "vigente_hasta", "activo",
    ]
    existentes = list(client.query(
        f"SELECT {', '.join(columnas_contrato)} FROM DIM_CONTRATO_REGALIA"
    ).named_results())
    filas_retrofechadas = []
    for i, c in enumerate(existentes):
        # Distribuidos en el primer tercio de la ventana, no todos el mismo día.
        offset_meses = int(len(meses) * 0.15) + i * 3
        nuevo_inicio = _add_months(dia_inicio, offset_meses)
        nuevo_fin = None
        if c["vigente_hasta"]:
            span = (c["vigente_hasta"] - c["vigente_desde"]).days
            nuevo_fin = nuevo_inicio + timedelta(days=span)
        fila = dict(c)
        fila["vigente_desde"], fila["vigente_hasta"] = nuevo_inicio, nuevo_fin
        filas_retrofechadas.append(tuple(fila[col] for col in columnas_contrato))
        print(f"  [retrofecha] {c['contrato_id']} -> vigente_desde={nuevo_inicio}"
              f"{f', vigente_hasta={nuevo_fin}' if nuevo_fin else ''}")

    client.command("ALTER TABLE DIM_CONTRATO_REGALIA DELETE WHERE 1=1")
    client.insert("DIM_CONTRATO_REGALIA", filas_retrofechadas, column_names=columnas_contrato)

    # ── 2. Contratos nuevos sobre contrapartes reales ──────────────────────
    top_tracks = [r["fact_id"] for r in client.query(
        "SELECT fact_id, count() AS n FROM FACT_ENGAGEMENT_USUARIO WHERE event_type = 'reproduccion' "
        "GROUP BY fact_id ORDER BY n DESC LIMIT 40"
    ).named_results()]
    if not top_tracks:
        print("ERROR: no hay reproducciones reales para asignar tracks a los contratos nuevos. Abortando.")
        sys.exit(1)

    sellos = [r["sello_id"] for r in client.query("SELECT sello_id FROM DIM_SELLO_DISCOGRAFICO ORDER BY sello_id").named_results()]
    productores = [r["productor_id"] for r in client.query("SELECT productor_id FROM DIM_PRODUCTOR ORDER BY productor_id").named_results()]
    cuentas_artista = [r["cuenta_artista_id"] for r in client.query("SELECT cuenta_artista_id FROM DIM_CUENTA_ARTISTA").named_results()]

    filas = []
    track_pool = list(top_tracks)
    rng.shuffle(track_pool)
    idx_track = 0
    idx_mes = 0

    def _siguiente_track():
        nonlocal idx_track
        t = track_pool[idx_track % len(track_pool)]
        idx_track += 1
        return t

    def _siguiente_vigencia():
        # Reparte los contratos nuevos en el 60% más antiguo de la ventana,
        # para que la mayoría de los meses de la ventana tenga contrato
        # vigente y no solo los últimos.
        nonlocal idx_mes
        offset = int(len(meses) * 0.05) + int(idx_mes * (len(meses) * 0.55) / max(1, len(sellos) + len(cuentas_artista)))
        idx_mes += 1
        return _add_months(dia_inicio, offset)

    # 8 contratos de sello (uno por sello real, sin cuenta de artista).
    for i, sello_id in enumerate(sellos):
        productor_id = productores[i % len(productores)] if rng.random() < 0.6 else None
        vigente_desde = _siguiente_vigencia()
        pct_master_prod = 15 if productor_id else 0
        filas.append((
            f"s14p4-sello-{sello_id}", int(_siguiente_track()), sello_id, None,
            productor_id, 100 - pct_master_prod, 0, pct_master_prod, 100, 0,
            vigente_desde, None, 1,
        ))

    # 11 contratos de artista (uno por cuenta de artista real, sin sello).
    for i, cuenta_artista_id in enumerate(cuentas_artista):
        productor_id = productores[i % len(productores)] if rng.random() < 0.5 else None
        vigente_desde = _siguiente_vigencia()
        pct_master_prod = 25 if productor_id else 0
        filas.append((
            f"s14p4-artista-{i:02d}", int(_siguiente_track()), None, cuenta_artista_id,
            productor_id, 0, 100 - pct_master_prod, pct_master_prod, 0, 100,
            vigente_desde, None, 1,
        ))

    client.insert(
        "DIM_CONTRATO_REGALIA", filas,
        column_names=[
            "contrato_id", "fact_id_track", "sello_id", "cuenta_artista_id", "productor_id",
            "pct_master_sello", "pct_master_artista", "pct_master_productor",
            "pct_publishing_sello", "pct_publishing_artista",
            "vigente_desde", "vigente_hasta", "activo",
        ],
    )
    print(f"  [contratos nuevos] {len(filas)} insertados ({len(sellos)} de sello + {len(cuentas_artista)} de artista).")

    total_contratos = len(existentes) + len(filas)
    print(f"Total de contratos: {total_contratos} ({len(existentes)} existentes + {len(filas)} nuevos).")

    # ── 3. Regenerar liquidaciones — mismo camino que el backfill ──────────
    client.command("ALTER TABLE ETL_BATCH_CONTROL DELETE WHERE checksum = 'backfill_negocio:regalias'")
    print("  [regalias] flag de idempotencia del dominio 'regalias' reiniciado — regenerando liquidaciones...")
    backfill_regalias(dia_inicio, dia_fin)


if __name__ == "__main__":
    main()
