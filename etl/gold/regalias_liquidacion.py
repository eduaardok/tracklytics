"""etl/gold/regalias_liquidacion.py — S10 Día 2: liquidación periódica real de
regalías (streams reales × pool real, ver design.md del change
`2026-07-11-regalias-publicidad`, Decisión 1, para la fórmula completa).
Misma lógica que `POST /app/v1/regalias/admin/liquidar` (duplicada a
propósito — ver Decisión 5, este script corre en el contenedor `airflow`, sin
acceso al paquete `api`); ambas leen y escriben las mismas tablas, así que un
operador puede disparar la liquidación manualmente por API o dejar que este
DAG la corra semanalmente sin que se pisen entre sí. Ambos caminos verifican
si el rango de fechas exacto ya fue liquidado antes de insertar
(modelo-financiero-simulacion, design.md Decisión 4) — llamar dos veces con
el mismo rango ya no duplica filas."""

import uuid
from datetime import date, datetime

from utils.clickhouse_client import get_client as get_ch_client
from utils.config import get_config

TASA_RIGHTSHOLDERS = 0.70
PCT_MASTER = 0.80
PCT_PUBLISHING = 0.20


def run_liquidacion_regalias(**context) -> None:
    cfg = get_config()
    ch = get_ch_client(cfg)

    data_interval = context.get("data_interval_start")
    data_interval_end = context.get("data_interval_end")
    if data_interval is None or data_interval_end is None:
        raise RuntimeError("Este DAG requiere data_interval_start/end (schedule_interval real, no disparo manual sin fechas)")

    periodo_inicio = data_interval.date() if hasattr(data_interval, "date") else data_interval
    periodo_fin    = data_interval_end.date() if hasattr(data_interval_end, "date") else data_interval_end

    ya_liquidado = ch.query(
        "SELECT count() FROM FACT_LIQUIDACION_REGALIA WHERE periodo_inicio = {i:Date} AND periodo_fin = {f:Date}",
        parameters={"i": periodo_inicio, "f": periodo_fin},
    ).result_rows[0][0]
    if ya_liquidado:
        print(f"[regalias_liquidacion] Período {periodo_inicio}—{periodo_fin}: ya liquidado. Saltando.")
        return

    inicio_dt = datetime.combine(periodo_inicio, datetime.min.time())
    fin_dt    = datetime.combine(periodo_fin, datetime.min.time())

    total_transacciones = ch.query(
        "SELECT sum(monto) FROM FACT_TRANSACCION_PAGO WHERE estado = 'exitosa' "
        "AND fecha >= {i:DateTime} AND fecha < {f:DateTime}",
        parameters={"i": inicio_dt, "f": fin_dt},
    ).result_rows[0][0] or 0.0
    total_publicidad = ch.query(
        "SELECT sum(monto) FROM FACT_INGRESO_PUBLICITARIO WHERE fecha >= {i:DateTime} AND fecha < {f:DateTime}",
        parameters={"i": inicio_dt, "f": fin_dt},
    ).result_rows[0][0] or 0.0

    pool_total = float(total_transacciones) + float(total_publicidad)
    pool_rightsholders = pool_total * TASA_RIGHTSHOLDERS

    streams_rows = ch.query(
        "SELECT fact_id, count() FROM FACT_ENGAGEMENT_USUARIO WHERE event_type = 'reproduccion' "
        "AND event_timestamp >= {i:DateTime} AND event_timestamp < {f:DateTime} GROUP BY fact_id",
        parameters={"i": inicio_dt, "f": fin_dt},
    ).result_rows
    streams_por_track = {r[0]: r[1] for r in streams_rows}
    total_streams = sum(streams_por_track.values())

    if pool_rightsholders <= 0 or total_streams == 0:
        print(f"[regalias_liquidacion] Período {periodo_inicio}—{periodo_fin}: sin ingreso o sin streams, nada que liquidar.")
        return

    contratos_rows = ch.query(
        "SELECT contrato_id, fact_id_track, sello_id, cuenta_artista_id, productor_id, "
        "pct_master_sello, pct_master_artista, pct_master_productor, "
        "pct_publishing_sello, pct_publishing_artista "
        "FROM DIM_CONTRATO_REGALIA WHERE activo = 1 "
        "AND vigente_desde <= {f:Date} AND (vigente_hasta IS NULL OR vigente_hasta >= {i:Date}) "
        "ORDER BY fact_id_track, vigente_desde DESC",
        parameters={"f": periodo_fin, "i": periodo_inicio},
    ).result_rows

    contrato_por_track: dict[int, tuple] = {}
    for row in contratos_rows:
        fact_id_track = row[1]
        contrato_por_track.setdefault(fact_id_track, row)

    filas = []
    for fact_id_track, c in contrato_por_track.items():
        (contrato_id, _fact_id_track, sello_id, cuenta_artista_id, productor_id,
         pct_master_sello, pct_master_artista, pct_master_productor,
         pct_publishing_sello, pct_publishing_artista) = c

        track_streams = streams_por_track.get(fact_id_track, 0)
        if track_streams == 0:
            continue
        track_revenue = pool_rightsholders * (track_streams / total_streams)
        master_pool = track_revenue * PCT_MASTER
        publishing_pool = track_revenue * PCT_PUBLISHING

        candidatos = [
            ("sello", sello_id, master_pool * (pct_master_sello / 100) + publishing_pool * (pct_publishing_sello / 100)),
            ("artista", cuenta_artista_id, master_pool * (pct_master_artista / 100) + publishing_pool * (pct_publishing_artista / 100)),
            ("productor", productor_id, master_pool * (pct_master_productor / 100)),
        ]
        for tipo, rightsholder_id, monto in candidatos:
            if rightsholder_id is None or monto <= 0:
                continue
            filas.append((
                str(uuid.uuid4()), contrato_id, fact_id_track, tipo, str(rightsholder_id),
                periodo_inicio, periodo_fin, track_streams, round(monto, 2), "USD",
            ))

    if filas:
        ch.insert(
            "FACT_LIQUIDACION_REGALIA", filas,
            column_names=[
                "liquidacion_id", "contrato_id", "fact_id_track", "tipo_rightsholder", "rightsholder_id",
                "periodo_inicio", "periodo_fin", "streams_periodo", "monto", "moneda",
            ],
        )
    print(f"[regalias_liquidacion] Período {periodo_inicio}—{periodo_fin}: {len(filas)} liquidaciones, "
          f"pool_total={pool_total:.2f}, pool_rightsholders={pool_rightsholders:.2f}, total_streams={total_streams}.")
