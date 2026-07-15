import asyncio
import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import execute, get_client, query_one, query_rows
from paquetes.analitica.queries import (
    INGRESO_PUBLICITARIO_EN_RANGO,
    INGRESO_SUSCRIPCIONES_EN_RANGO,
    REGALIAS_PAGADAS_EN_RANGO,
)
from paquetes.finanzas.deps import DIAS_REGALIAS_PENDIENTES, REEMBOLSO_MONTO_ALTO_USD, require_admin
from paquetes.finanzas.queries import (
    CONSUMO_RECIENTE_CAMPANA,
    GASTO_POR_ID,
    GASTOS_ACTIVOS_EN_RANGO,
    GASTOS_POR_CATEGORIA_EN_RANGO,
    INGRESO_POR_ANUNCIANTE_EN_RANGO,
    INVOICES_PENDIENTES_AGING,
    MONTO_REEMBOLSADO_PROCESADO,
    REEMBOLSOS_EN_RANGO,
    REEMBOLSOS_POR_TRANSACCION,
    REEMBOLSOS_PROCESADOS_EN_RANGO,
    REEMBOLSOS_PROCESADOS_EN_RANGO_DETALLE,
    REGALIAS_LIQUIDADAS_ANTIGUAS_POR_RIGHTSHOLDER,
    RETIROS_PENDIENTES,
    RETIROS_PROCESADOS_EN_RANGO,
    SALDO_REGALIAS_NO_RETIRADO_TOTAL,
    TRANSACCION_POR_ID,
    consumo_presupuesto_campana_sql,
    gastos_list_sql,
)
# Reutilizado, no duplicado (design.md, Decisión 3 / tasks.md 5.2): el saldo
# disponible de un rightsholder ya se calcula en `regalias` con esta misma
# fórmula (liquidado - retirado[pendiente+procesado]).
from paquetes.regalias.router import _saldo_disponible
from paquetes.seguridad import audit
from paquetes.suscripciones import pb_client

router = APIRouter(prefix="/app/v1/finanzas", tags=["Finanzas"])

# Ventana de días usada para el ritmo de consumo reciente de una campaña al
# proyectar linealmente su fecha de agotamiento (tasks.md 6.2).
DIAS_RITMO_PROYECCION = 7


def _rango_dt(desde: date, hasta: date) -> tuple[datetime, datetime]:
    if desde > hasta:
        raise HTTPException(status_code=422, detail="desde no puede ser mayor que hasta")
    return datetime.combine(desde, datetime.min.time()), datetime.combine(hasta, datetime.min.time()) + timedelta(days=1)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Gastos operativos (CU-O82)
# ─────────────────────────────────────────────────────────────────────────────

class GastoBody(BaseModel):
    concepto: str
    categoria: Literal[
        "infraestructura", "marketing", "nomina", "licencias", "servicios", "soporte", "legal", "otros",
    ]
    monto: float
    fecha: date
    descripcion: str = ""


def _gasto_o_404(gasto_id: str) -> dict:
    row = query_one(GASTO_POR_ID, {"gasto_id": gasto_id})
    if not row:
        raise HTTPException(status_code=404, detail="Gasto operativo no encontrado")
    return row


@router.post("/gastos", status_code=201)
def crear_gasto(body: GastoBody, admin: dict = Depends(require_admin)):
    if body.monto <= 0:
        raise HTTPException(status_code=422, detail="El monto del gasto debe ser mayor que 0")
    if not body.concepto.strip():
        raise HTTPException(status_code=422, detail="El concepto del gasto no puede estar vacío")

    gasto_id = str(uuid.uuid4())
    admin_id = admin["record"]["id"]
    get_client().insert(
        "FACT_GASTO_OPERATIVO",
        [(gasto_id, body.concepto.strip(), body.categoria, body.monto, body.fecha, body.descripcion, "activo", admin_id)],
        column_names=["gasto_id", "concepto", "categoria", "monto", "fecha", "descripcion", "estado", "responsable_id"],
    )
    despues = {
        "gasto_id": gasto_id, "concepto": body.concepto.strip(), "categoria": body.categoria,
        "monto": body.monto, "fecha": str(body.fecha), "descripcion": body.descripcion, "estado": "activo",
    }
    audit.record(
        usuario_id=admin_id, accion="crear_gasto_operativo", tabla_afectada="FACT_GASTO_OPERATIVO",
        antes=None, despues=despues,
    )
    return {"status": "ok", **despues}


@router.get("/gastos")
def listar_gastos(
    categoria: str | None = Query(None),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    estado: str | None = Query(None),
    admin: dict = Depends(require_admin),
):
    clauses, params = [], {}
    if categoria is not None:
        clauses.append("categoria = {categoria:String}")
        params["categoria"] = categoria
    if desde is not None:
        clauses.append("fecha >= {desde:Date}")
        params["desde"] = desde
    if hasta is not None:
        clauses.append("fecha < {hasta:Date}")
        params["hasta"] = hasta
    if estado is not None:
        clauses.append("estado = {estado:String}")
        params["estado"] = estado
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return {"data": query_rows(gastos_list_sql(where), params)}


@router.put("/gastos/{gasto_id}")
def editar_gasto(gasto_id: str, body: GastoBody, admin: dict = Depends(require_admin)):
    antes = _gasto_o_404(gasto_id)
    if body.monto <= 0:
        raise HTTPException(status_code=422, detail="El monto del gasto debe ser mayor que 0")

    execute(
        "ALTER TABLE FACT_GASTO_OPERATIVO UPDATE "
        "concepto = {concepto:String}, categoria = {categoria:String}, monto = {monto:Float32}, "
        "fecha = {fecha:Date}, descripcion = {descripcion:String} "
        "WHERE gasto_id = {gasto_id:String}",
        {
            "gasto_id": gasto_id, "concepto": body.concepto.strip(), "categoria": body.categoria,
            "monto": body.monto, "fecha": body.fecha, "descripcion": body.descripcion,
        },
    )
    despues = {
        "gasto_id": gasto_id, "concepto": body.concepto.strip(), "categoria": body.categoria,
        "monto": body.monto, "fecha": str(body.fecha), "descripcion": body.descripcion,
    }
    audit.record(
        usuario_id=admin["record"]["id"], accion="editar_gasto_operativo", tabla_afectada="FACT_GASTO_OPERATIVO",
        antes=antes, despues=despues,
    )
    return {"status": "ok", **despues}


@router.post("/gastos/{gasto_id}/anular")
def anular_gasto(gasto_id: str, admin: dict = Depends(require_admin)):
    antes = _gasto_o_404(gasto_id)
    execute(
        "ALTER TABLE FACT_GASTO_OPERATIVO UPDATE estado = 'anulado' WHERE gasto_id = {gasto_id:String}",
        {"gasto_id": gasto_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="anular_gasto_operativo", tabla_afectada="FACT_GASTO_OPERATIVO",
        antes=antes, despues={"gasto_id": gasto_id, "estado": "anulado"},
    )
    return {"status": "ok", "gasto_id": gasto_id, "estado": "anulado"}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Reembolsos (CU-O85/CU-O86)
# ─────────────────────────────────────────────────────────────────────────────

class ReembolsoBody(BaseModel):
    transaccion_id: str
    monto: float
    tipo: Literal["total", "parcial"]
    motivo: str


def _monto_disponible_reembolso(transaccion_id: str, monto_pagado: float) -> float:
    """Análogo a `_saldo_disponible` de `regalias` (design.md, Decisión 3 /
    tasks.md 3.1): monto pagado - suma de reembolsos ya `procesado` sobre esa
    misma transacción. Calculado on-read, nunca persistido."""
    reembolsado = float((query_one(MONTO_REEMBOLSADO_PROCESADO, {"transaccion_id": transaccion_id}) or {}).get("total") or 0)
    return monto_pagado - reembolsado


@router.post("/reembolsos", status_code=201)
def procesar_reembolso(body: ReembolsoBody, admin: dict = Depends(require_admin)):
    try:
        uuid.UUID(body.transaccion_id)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=404, detail="Transacción no encontrada")

    transaccion = query_one(TRANSACCION_POR_ID, {"transaccion_id": body.transaccion_id})
    if not transaccion:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")

    # FACT_TRANSACCION_PAGO.estado solo admite 'pendiente'/'exitosa'/'fallida'
    # (no existe 'cancelada' en el schema actual, pese a que spec.md la
    # mencione) — solo una transacción 'exitosa' representa dinero
    # efectivamente cobrado y reembolsable; esta regla más general subsume el
    # rechazo explícito de 'fallida'/'cancelada' que pide spec.md.
    if transaccion["estado"] != "exitosa":
        raise HTTPException(
            status_code=422,
            detail=f"No se puede reembolsar una transacción en estado '{transaccion['estado']}'",
        )

    if body.monto <= 0:
        raise HTTPException(status_code=422, detail="El monto a reembolsar debe ser mayor que 0")

    monto_pagado = float(transaccion["monto"])
    disponible = _monto_disponible_reembolso(body.transaccion_id, monto_pagado)
    if body.monto > disponible:
        raise HTTPException(
            status_code=422,
            detail=f"El monto solicitado supera el saldo disponible para reembolso ({round(disponible, 2)})",
        )

    reembolso_id = str(uuid.uuid4())
    admin_id = admin["record"]["id"]
    get_client().insert(
        "FACT_REEMBOLSO",
        [(reembolso_id, body.transaccion_id, body.monto, body.tipo, body.motivo, admin_id, "procesado")],
        column_names=["reembolso_id", "transaccion_id", "monto", "tipo", "motivo", "responsable_id", "estado"],
    )
    despues = {
        "reembolso_id": reembolso_id, "transaccion_id": body.transaccion_id, "monto": body.monto,
        "tipo": body.tipo, "motivo": body.motivo, "estado": "procesado",
    }
    audit.record(
        usuario_id=admin_id, accion="procesar_reembolso", tabla_afectada="FACT_REEMBOLSO",
        antes=None, despues=despues,
    )
    return {"status": "ok", **despues}


@router.get("/reembolsos")
def historial_reembolsos(
    transaccion_id: str | None = Query(None),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    admin: dict = Depends(require_admin),
):
    if transaccion_id is not None:
        return {"data": query_rows(REEMBOLSOS_POR_TRANSACCION, {"transaccion_id": transaccion_id})}
    if desde is not None and hasta is not None:
        rango_desde, rango_hasta = _rango_dt(desde, hasta)
        return {"data": query_rows(REEMBOLSOS_EN_RANGO, {"desde": rango_desde, "hasta": rango_hasta})}
    raise HTTPException(status_code=422, detail="Debe indicar transaccion_id, o un rango desde/hasta")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Dashboard financiero consolidado (CU-O83)
# ─────────────────────────────────────────────────────────────────────────────

def _calcular_metricas_periodo(desde: date, hasta: date) -> dict:
    """Compone `v1_pnl` (analitica) — reutiliza sus queries verbatim, no las
    reimplementa (design.md, Decisión 4.2) — y resta gastos operativos
    activos + reembolsos procesados para la utilidad y el margen reales."""
    rango_desde, rango_hasta = _rango_dt(desde, hasta)
    params = {"desde": rango_desde, "hasta": rango_hasta}

    ingreso_suscripciones = float((query_one(INGRESO_SUSCRIPCIONES_EN_RANGO, params) or {}).get("total") or 0)
    ingreso_publicitario = float((query_one(INGRESO_PUBLICITARIO_EN_RANGO, params) or {}).get("total") or 0)
    regalias_pagadas = float((query_one(REGALIAS_PAGADAS_EN_RANGO, params) or {}).get("total") or 0)
    retiros_procesados = float((query_one(RETIROS_PROCESADOS_EN_RANGO, params) or {}).get("total") or 0)
    reembolsos = float((query_one(REEMBOLSOS_PROCESADOS_EN_RANGO, params) or {}).get("total") or 0)
    gastos = float((query_one(GASTOS_ACTIVOS_EN_RANGO, {"desde": desde, "hasta": hasta}) or {}).get("total") or 0)

    ingreso_total = ingreso_suscripciones + ingreso_publicitario
    utilidad_estimada = ingreso_total - regalias_pagadas - gastos - reembolsos
    margen = round(utilidad_estimada / ingreso_total, 4) if ingreso_total else None

    return {
        "ingreso_suscripciones": round(ingreso_suscripciones, 2),
        "ingreso_publicitario": round(ingreso_publicitario, 2),
        "ingreso_total": round(ingreso_total, 2),
        "regalias_pagadas": round(regalias_pagadas, 2),
        "retiros_regalia_procesados": round(retiros_procesados, 2),
        "gastos_operativos": round(gastos, 2),
        "reembolsos_procesados": round(reembolsos, 2),
        "utilidad_estimada": round(utilidad_estimada, 2),
        "margen": margen,
    }


def _delta_pct(actual: dict, comparacion: dict) -> dict:
    out = {}
    for k, v in actual.items():
        if k == "margen" or not isinstance(v, (int, float)):
            continue
        base = comparacion.get(k)
        out[k] = round((v - base) / base * 100, 2) if base else None
    return out


@router.get("/dashboard")
def dashboard_financiero(
    desde: date = Query(...),
    hasta: date = Query(...),
    desde_comparacion: date | None = Query(None),
    hasta_comparacion: date | None = Query(None),
    admin: dict = Depends(require_admin),
):
    resultado = _calcular_metricas_periodo(desde, hasta)
    if desde_comparacion is not None and hasta_comparacion is not None:
        comparacion = _calcular_metricas_periodo(desde_comparacion, hasta_comparacion)
        resultado = {
            **resultado,
            "comparacion": comparacion,
            "delta_pct": _delta_pct(resultado, comparacion),
        }
    return resultado


# ─────────────────────────────────────────────────────────────────────────────
# 4. Cuentas por cobrar y por pagar (CU-O84)
# ─────────────────────────────────────────────────────────────────────────────

def _cuentas_por_cobrar_y_pagar() -> dict:
    invoices = query_rows(INVOICES_PENDIENTES_AGING)
    total_por_cobrar = sum(float(r["monto"]) + float(r["iva"]) for r in invoices)
    vencidas = [r for r in invoices if r["dias_desde_emision"] > DIAS_REGALIAS_PENDIENTES]
    total_vencido = sum(float(r["monto"]) + float(r["iva"]) for r in vencidas)
    pendientes_no_vencidas = [r for r in invoices if r["dias_desde_emision"] <= DIAS_REGALIAS_PENDIENTES]
    proximos_vencimientos = sorted(pendientes_no_vencidas, key=lambda r: r["dias_desde_emision"], reverse=True)[:10]

    retiros = query_rows(RETIROS_PENDIENTES)
    total_retiros_pendientes = sum(float(r["monto"]) for r in retiros)
    saldo_no_retirado = float((query_one(SALDO_REGALIAS_NO_RETIRADO_TOTAL) or {}).get("saldo_no_retirado") or 0)

    return {
        "cuentas_por_cobrar": {
            "total_por_cobrar": round(total_por_cobrar, 2),
            "total_vencido": round(total_vencido, 2),
            "num_invoices_pendientes": len(invoices),
            "num_invoices_vencidas": len(vencidas),
            "proximos_vencimientos": proximos_vencimientos,
        },
        "cuentas_por_pagar": {
            # "Por pagar" = obligaciones ya solicitadas/accionables (retiros
            # `pendiente`). `regalias_liquidadas_no_retiradas` es contexto
            # adicional (saldo liquidado que un rightsholder podría retirar
            # pero aún no ha solicitado) — ver nota de diseño en el resumen
            # final sobre esta interpretación de "regalías pendientes de
            # liquidar" (spec.md).
            "total_por_pagar": round(total_retiros_pendientes, 2),
            "retiros_pendientes": round(total_retiros_pendientes, 2),
            "num_retiros_pendientes": len(retiros),
            "regalias_liquidadas_no_retiradas": round(saldo_no_retirado, 2),
            "aging_retiros": retiros[:10],
        },
    }


@router.get("/cuentas")
def cuentas_por_cobrar_y_pagar(admin: dict = Depends(require_admin)):
    return _cuentas_por_cobrar_y_pagar()


# ─────────────────────────────────────────────────────────────────────────────
# 5. Presupuesto de campañas (CU-O87 / publicidad: pausa automática)
# ─────────────────────────────────────────────────────────────────────────────

def _pausar_campana_por_presupuesto(campana_id: int, admin_id: str) -> None:
    """Pausa automática al agotar presupuesto (design.md, Decisión 5 /
    capability `publicidad`, "Pausa automática de campaña por presupuesto
    agotado"). Solo se invoca cuando la fila de consumo, leída en la misma
    query que evalúa la alerta, ya trae `activa=1` — así una campaña que ya
    quedó `activa=0` no vuelve a auditarse (tasks.md 6.4/6.5)."""
    execute(
        "ALTER TABLE DIM_CAMPANA_PUBLICITARIA UPDATE activa = 0 WHERE campana_id = {id:UInt32}",
        {"id": campana_id},
    )
    audit.record(
        usuario_id=admin_id, accion="pausar_campana_presupuesto_agotado",
        tabla_afectada="DIM_CAMPANA_PUBLICITARIA",
        antes={"campana_id": campana_id, "activa": 1}, despues={"campana_id": campana_id, "activa": 0},
    )


def _evaluar_consumo_campana(row: dict, admin_id: str) -> dict:
    presupuesto_total = float(row["presupuesto_total"])
    consumido = float(row["consumido"])
    restante = presupuesto_total - consumido
    pct = round(consumido / presupuesto_total, 4) if presupuesto_total else None
    alerta_80 = bool(presupuesto_total > 0 and pct is not None and pct >= 0.8)
    alerta_agotado = bool(presupuesto_total > 0 and pct is not None and pct >= 1.0)
    impresiones = int(row["impresiones"])
    cpm_efectivo = round(consumido / impresiones * 1000, 4) if impresiones else None

    reciente = float((query_one(
        CONSUMO_RECIENTE_CAMPANA, {"campana_id": row["campana_id"], "dias": DIAS_RITMO_PROYECCION},
    ) or {}).get("total") or 0)
    ritmo_diario = reciente / DIAS_RITMO_PROYECCION
    fecha_agotamiento_estimada = None
    if ritmo_diario > 0 and restante > 0:
        dias_restantes = restante / ritmo_diario
        fecha_agotamiento_estimada = (date.today() + timedelta(days=round(dias_restantes, 1))).isoformat()

    activa_actual = bool(row["activa"])
    if alerta_agotado and activa_actual:
        _pausar_campana_por_presupuesto(row["campana_id"], admin_id)
        activa_actual = False

    return {
        "campana_id": row["campana_id"],
        "nombre": row["nombre"],
        "anunciante_id": row["anunciante_id"],
        "presupuesto_total": round(presupuesto_total, 2),
        "consumido": round(consumido, 2),
        "restante": round(restante, 2),
        "porcentaje_utilizado": pct,
        "impresiones": impresiones,
        "cpm": row["cpm"],
        "cpm_efectivo": cpm_efectivo,
        "fecha_agotamiento_estimada": fecha_agotamiento_estimada,
        "activa": activa_actual,
        "alerta_80": alerta_80,
        "alerta_agotado": alerta_agotado,
    }


@router.get("/campanas/presupuesto")
def listar_presupuesto_campanas(admin: dict = Depends(require_admin)):
    rows = query_rows(consumo_presupuesto_campana_sql(""))
    admin_id = admin["record"]["id"]
    return {"data": [_evaluar_consumo_campana(r, admin_id) for r in rows]}


@router.get("/campanas/{campana_id}/presupuesto")
def presupuesto_campana(campana_id: int, admin: dict = Depends(require_admin)):
    rows = query_rows(
        consumo_presupuesto_campana_sql("WHERE c.campana_id = {campana_id:UInt32}"),
        {"campana_id": campana_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")
    return _evaluar_consumo_campana(rows[0], admin["record"]["id"])


# ─────────────────────────────────────────────────────────────────────────────
# 6. Indicadores empresariales (CU-O88)
# ─────────────────────────────────────────────────────────────────────────────

async def _contar_usuarios_pago_activos() -> int:
    # Reutiliza PLANES_DE_PAGO ya definido en `analitica` (mismos planes que
    # usa v1_mrr_arr/v1_churn) — no se inventa una lista propia.
    from paquetes.analitica.router import PLANES_DE_PAGO
    conteos = await asyncio.gather(*[pb_client.contar_activas(p) for p in PLANES_DE_PAGO])
    return sum(conteos)


def _crecimiento_vs_periodo_anterior(desde: date, hasta: date) -> float | None:
    dias = (hasta - desde).days
    if dias <= 0:
        return None
    desde_anterior = desde - timedelta(days=dias)
    hasta_anterior = desde
    actual = _calcular_metricas_periodo(desde, hasta)["ingreso_total"]
    anterior = _calcular_metricas_periodo(desde_anterior, hasta_anterior)["ingreso_total"]
    if not anterior:
        return None
    return round((actual - anterior) / anterior * 100, 2)


async def _indicadores_financieros(desde: date, hasta: date) -> dict:
    metrics = _calcular_metricas_periodo(desde, hasta)
    ingreso_total = metrics["ingreso_total"]

    usuarios_pago = await _contar_usuarios_pago_activos()
    arpu = round(ingreso_total / usuarios_pago, 2) if usuarios_pago else None

    pct_regalias = round(metrics["regalias_pagadas"] / ingreso_total * 100, 2) if ingreso_total else None
    pct_gastos = round(metrics["gastos_operativos"] / ingreso_total * 100, 2) if ingreso_total else None

    gasto_por_categoria = query_rows(GASTOS_POR_CATEGORIA_EN_RANGO, {"desde": desde, "hasta": hasta})

    rango_desde, rango_hasta = _rango_dt(desde, hasta)
    ingresos_anunciante = query_rows(INGRESO_POR_ANUNCIANTE_EN_RANGO, {"desde": rango_desde, "hasta": rango_hasta})
    totales_anunciantes = [float(r["total"]) for r in ingresos_anunciante]
    ingreso_promedio_anunciante = round(sum(totales_anunciantes) / len(totales_anunciantes), 2) if totales_anunciantes else 0.0

    return {
        "arpu": arpu,
        "usuarios_pago_activos": usuarios_pago,
        "pct_ingresos_regalias": pct_regalias,
        "pct_ingresos_gastos": pct_gastos,
        "gasto_por_categoria": gasto_por_categoria,
        "ingreso_promedio_por_anunciante": ingreso_promedio_anunciante,
        "num_anunciantes_con_ingreso": len(totales_anunciantes),
        "crecimiento_ingreso_pct": _crecimiento_vs_periodo_anterior(desde, hasta),
    }


@router.get("/indicadores")
async def indicadores_financieros(desde: date = Query(...), hasta: date = Query(...), admin: dict = Depends(require_admin)):
    return await _indicadores_financieros(desde, hasta)


# ─────────────────────────────────────────────────────────────────────────────
# 7. Alertas financieras administrativas (CU-O89)
# ─────────────────────────────────────────────────────────────────────────────

def _alertas_financieras(desde: date, hasta: date, admin_id: str) -> list[dict]:
    alertas: list[dict] = []

    for row in query_rows(consumo_presupuesto_campana_sql("")):
        evaluado = _evaluar_consumo_campana(row, admin_id)
        if evaluado["alerta_agotado"]:
            alertas.append({
                "tipo": "campana_presupuesto_agotado", "campana_id": evaluado["campana_id"],
                "detalle": f"Campaña '{evaluado['nombre']}' agotó su presupuesto",
            })
        elif evaluado["alerta_80"]:
            pct = round((evaluado["porcentaje_utilizado"] or 0) * 100)
            alertas.append({
                "tipo": "campana_presupuesto_alto", "campana_id": evaluado["campana_id"],
                "detalle": f"Campaña '{evaluado['nombre']}' consumió {pct}% de su presupuesto",
            })

    for row in query_rows(INVOICES_PENDIENTES_AGING):
        if row["dias_desde_emision"] > DIAS_REGALIAS_PENDIENTES:
            # invoice_id es UUID en ClickHouse — se castea a str explícitamente
            # (clickhouse-connect lo devuelve como uuid.UUID, no comparable
            # directo contra un str en el consumidor de esta alerta).
            alertas.append({
                "tipo": "factura_vencida", "invoice_id": str(row["invoice_id"]),
                "detalle": f"Factura vencida hace {row['dias_desde_emision']} días",
            })

    for row in query_rows(RETIROS_PENDIENTES):
        alertas.append({
            "tipo": "retiro_regalia_pendiente", "retiro_id": row["retiro_id"],
            "detalle": f"Retiro de {round(float(row['monto']), 2)} pendiente de procesar",
        })

    for row in query_rows(REGALIAS_LIQUIDADAS_ANTIGUAS_POR_RIGHTSHOLDER, {"dias": DIAS_REGALIAS_PENDIENTES}):
        saldo = _saldo_disponible(row["tipo_rightsholder"], row["rightsholder_id"])
        if saldo > 0:
            alertas.append({
                "tipo": "regalias_sin_retiro", "rightsholder_id": row["rightsholder_id"],
                "detalle": f"Saldo de {round(saldo, 2)} sin retirar hace más de {DIAS_REGALIAS_PENDIENTES} días",
            })

    metrics = _calcular_metricas_periodo(desde, hasta)
    if metrics["gastos_operativos"] > metrics["ingreso_total"]:
        alertas.append({
            "tipo": "gasto_mayor_a_ingreso",
            "detalle": f"Gastos ({metrics['gastos_operativos']}) superan el ingreso ({metrics['ingreso_total']}) del periodo",
        })

    crecimiento = _crecimiento_vs_periodo_anterior(desde, hasta)
    if crecimiento is not None and crecimiento < 0:
        alertas.append({
            "tipo": "caida_ingreso",
            "detalle": f"El ingreso cayó {abs(crecimiento)}% vs. el periodo anterior equivalente",
        })

    rango_desde, rango_hasta = _rango_dt(desde, hasta)
    for row in query_rows(REEMBOLSOS_PROCESADOS_EN_RANGO_DETALLE, {"desde": rango_desde, "hasta": rango_hasta}):
        if float(row["monto"]) > REEMBOLSO_MONTO_ALTO_USD:
            alertas.append({
                "tipo": "reembolso_elevado", "reembolso_id": row["reembolso_id"],
                "detalle": f"Reembolso de {round(float(row['monto']), 2)} supera el umbral de {REEMBOLSO_MONTO_ALTO_USD}",
            })

    return alertas


@router.get("/alertas")
def alertas_financieras(
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    admin: dict = Depends(require_admin),
):
    hasta = hasta or date.today()
    desde = desde or (hasta - timedelta(days=DIAS_REGALIAS_PENDIENTES))
    alertas = _alertas_financieras(desde, hasta, admin["record"]["id"])
    return {"data": alertas, "desde": desde.isoformat(), "hasta": hasta.isoformat()}


# ─────────────────────────────────────────────────────────────────────────────
# 8. Reporte financiero por periodo (CU-O90)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/reporte")
async def reporte_financiero(desde: date = Query(...), hasta: date = Query(...), admin: dict = Depends(require_admin)):
    dashboard = _calcular_metricas_periodo(desde, hasta)
    cuentas = _cuentas_por_cobrar_y_pagar()
    indicadores = await _indicadores_financieros(desde, hasta)
    gasto_por_categoria = query_rows(GASTOS_POR_CATEGORIA_EN_RANGO, {"desde": desde, "hasta": hasta})

    return {
        "periodo": {"desde": desde.isoformat(), "hasta": hasta.isoformat()},
        "ingresos": {
            "suscripciones": dashboard["ingreso_suscripciones"],
            "publicitario": dashboard["ingreso_publicitario"],
            "total": dashboard["ingreso_total"],
        },
        "gastos": {
            "total": dashboard["gastos_operativos"],
            "por_categoria": gasto_por_categoria,
        },
        "regalias": {
            "pagadas": dashboard["regalias_pagadas"],
            "retiros_procesados": dashboard["retiros_regalia_procesados"],
        },
        "reembolsos_procesados": dashboard["reembolsos_procesados"],
        "cuentas_por_cobrar": cuentas["cuentas_por_cobrar"],
        "cuentas_por_pagar": cuentas["cuentas_por_pagar"],
        "utilidad_estimada": dashboard["utilidad_estimada"],
        "margen": dashboard["margen"],
        "indicadores": indicadores,
    }
