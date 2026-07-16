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
# Dunning (modelo-financiero-completar-huecos, CU-O95): mismo umbral que
# `api/paquetes/suscripciones/router.py::MAX_INTENTOS_COBRO` — un cobro
# fallido ya no cancela de inmediato, pasa por hasta 3 intentos antes de
# degradar (design.md, decisión 2). El camino demostrable en vivo es el
# endpoint `POST /suscripciones/{id}/procesar-cobro` (esta DAG no tiene
# garantía de correr exactamente cada 30 días — ver memoria de proyecto,
# el scheduler de Airflow puede morir en silencio); esta función replica la
# misma política para cuando sí corre.
MAX_INTENTOS_COBRO = 3


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
    renovadas, canceladas, omitidas_sin_metodo, no_vencidas = 0, 0, 0, 0

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
        else:
            # Cobro fallido en la renovación (modelo-financiero-completar-
            # huecos, CU-O95, design.md Decisión 2): dunning real — pasa a
            # `pago_pendiente` con contador de intentos en vez de cancelar de
            # inmediato; solo se cancela/degrada al agotar
            # MAX_INTENTOS_COBRO. Mismo umbral que
            # `suscripciones/router.py::procesar_cobro`.
            intentos = int(sus.get("intentos_fallidos") or 0) + 1
            if intentos >= MAX_INTENTOS_COBRO:
                # B2C (tipo_plan free/premium/estudiante) degrada a free;
                # B2B (basico/pro/enterprise) cancela — mismo criterio que la
                # API. Este DAG no distingue rol de PocketBase directamente,
                # así que usa `tipo_plan` (ya disponible en `sus`) como proxy.
                if sus["tipo_plan"] in ("basico", "pro", "enterprise"):
                    httpx.patch(
                        f"{cfg['pb_url']}/api/collections/suscripciones/records/{suscripcion_id}",
                        json={"estado": "cancelada"},
                        headers={"Authorization": f"Bearer {pb_token}"},
                        timeout=30,
                    ).raise_for_status()
                    ch.insert(
                        "FACT_CANCELACION_SUSCRIPCION",
                        [(str(uuid.uuid4()), suscripcion_id, usuario_id, "precio", 0)],
                        column_names=["cancelacion_id", "suscripcion_id", "usuario_id", "motivo", "voluntaria"],
                    )
                else:
                    httpx.patch(
                        f"{cfg['pb_url']}/api/collections/suscripciones/records/{suscripcion_id}",
                        json={"tipo_plan": "free", "monto": 0, "estado": "activa", "intentos_fallidos": 0},
                        headers={"Authorization": f"Bearer {pb_token}"},
                        timeout=30,
                    ).raise_for_status()
                canceladas += 1
            else:
                httpx.patch(
                    f"{cfg['pb_url']}/api/collections/suscripciones/records/{suscripcion_id}",
                    json={"estado": "pago_pendiente", "intentos_fallidos": intentos},
                    headers={"Authorization": f"Bearer {pb_token}"},
                    timeout=30,
                ).raise_for_status()

    print(f"[facturacion_recurrente] {renovadas} renovadas, {canceladas} canceladas por cobro fallido, "
          f"{omitidas_sin_metodo} omitidas (sin método), {no_vencidas} aún no vencidas — "
          f"de {len(activas)} suscripciones de pago activas.")
