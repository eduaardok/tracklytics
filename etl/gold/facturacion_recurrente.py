"""etl/gold/facturacion_recurrente.py — S10 Día 2: cierra el hueco de
"facturación recurrente" de la auditoría (los 3 DAGs existentes disparaban
todo manualmente, `schedule_interval=None`). Renueva cualquier suscripción de
pago activa cuyo último cobro exitoso tenga 30+ días — o que nunca se haya
cobrado, usando `suscripcion.created`.

Por qué esta lógica vive aquí y no reutiliza `procesar_pago` de la API: este
script corre en el contenedor `airflow`, que monta `./etl` (no `./api`) — ver
design.md del change `2026-07-11-regalias-publicidad`, Decisión 5, para las
dos alternativas evaluadas y por qué se descartó llamar a la API por HTTP.
Misma tasa de éxito/IVA que `api/paquetes/facturacion/queries.py`
(TASA_EXITO_DEFAULT=0.9, IVA_RATE) — valores duplicados a propósito, no
importables entre contenedores.
"""

import random
import uuid
from datetime import datetime, timezone

import httpx

from utils.clickhouse_client import get_client as get_ch_client
from utils.config import get_config
from utils.pocketbase_client import get_token

TASA_EXITO_DEFAULT = 0.9
IVA_RATE = 0.15
DIAS_CICLO = 30


def _suscripciones_activas_de_pago(cfg: dict, token: str) -> list[dict]:
    resp = httpx.get(
        f"{cfg['pb_url']}/api/collections/suscripciones/records",
        params={"filter": 'estado="activa"', "perPage": 500, "sort": "id"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return [s for s in items if float(s.get("monto") or 0) > 0]


def run_facturacion_recurrente(**context) -> None:
    cfg = get_config()
    ch = get_ch_client(cfg)
    pb_token = get_token(cfg)

    activas = _suscripciones_activas_de_pago(cfg, pb_token)
    ahora = datetime.now(timezone.utc)
    renovadas, omitidas_sin_metodo, no_vencidas = 0, 0, 0

    for sus in activas:
        suscripcion_id = sus["id"]
        usuario_id     = sus["usuario_o_cliente"]

        ultima = ch.query(
            "SELECT max(fecha) AS f FROM FACT_TRANSACCION_PAGO "
            "WHERE suscripcion_id = {s:String} AND estado = 'exitosa'",
            parameters={"s": suscripcion_id},
        ).result_rows[0][0]

        if ultima:
            fecha_base = ultima if ultima.tzinfo else ultima.replace(tzinfo=timezone.utc)
        else:
            creado = sus.get("created", "").replace(" ", "T")
            fecha_base = datetime.fromisoformat(creado.replace("Z", "+00:00")) if creado else ahora

        dias_transcurridos = (ahora - fecha_base).days
        if dias_transcurridos < DIAS_CICLO:
            no_vencidas += 1
            continue

        metodo = ch.query(
            "SELECT metodo_pago_id FROM DIM_METODO_PAGO WHERE usuario_id = {u:String} "
            "ORDER BY creado_en DESC LIMIT 1",
            parameters={"u": usuario_id},
        ).result_rows
        if not metodo:
            omitidas_sin_metodo += 1
            print(f"[facturacion_recurrente] {suscripcion_id}: sin método de pago, se omite la renovación")
            continue
        metodo_pago_id = metodo[0][0]

        monto  = float(sus["monto"])
        moneda = sus["moneda"]
        estado = "exitosa" if random.random() < TASA_EXITO_DEFAULT else "fallida"
        transaccion_id = str(uuid.uuid4())

        ch.insert(
            "FACT_TRANSACCION_PAGO",
            [(transaccion_id, usuario_id, metodo_pago_id, suscripcion_id, monto, moneda, estado)],
            column_names=["transaccion_id", "usuario_id", "metodo_pago_id", "suscripcion_id", "monto", "moneda", "estado"],
        )
        if estado == "exitosa":
            invoice_id = str(uuid.uuid4())
            iva = round(monto * IVA_RATE, 2)
            ch.insert(
                "FACT_INVOICE",
                [(invoice_id, usuario_id, transaccion_id, monto, iva, "emitido")],
                column_names=["invoice_id", "usuario_id", "transaccion_id", "monto", "iva", "estado"],
            )
        renovadas += 1

    print(f"[facturacion_recurrente] {renovadas} renovadas, {omitidas_sin_metodo} omitidas (sin método), "
          f"{no_vencidas} aún no vencidas — de {len(activas)} suscripciones de pago activas.")
