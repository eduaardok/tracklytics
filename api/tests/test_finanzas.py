"""Pruebas de `finanzas` (change mejoras-financieras-empresariales,
tasks.md secciones 2.6/3.6/4.5/5.4/6.5/7.7/8.3/9.2).

Corren contra un ClickHouse real (mismas credenciales que
`init_clickhouse.py`) — no hay mocks de base de datos: las queries mismas
son el objeto bajo prueba. Los router handlers se llaman como funciones
Python normales (no vía HTTP/TestClient), pasando un `admin` sintético en
vez de resolver `Depends(require_admin)` — evita depender de un login real
de PocketBase para pruebas que solo ejercitan la lógica de `finanzas`.

Excepción: `_contar_usuarios_pago_activos` (usado por ARPU/indicadores) sí
depende de PocketBase vía `pb_client`; se mockea explícitamente en las
pruebas de indicadores/reporte para no requerir PocketBase levantado.
"""
import asyncio
import json
import uuid
from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException

from core.database import get_client, query_one, query_rows
from paquetes.finanzas import router as finanzas_router
from paquetes.finanzas.deps import REEMBOLSO_MONTO_ALTO_USD
from paquetes.finanzas.router import (
    GastoBody,
    ReembolsoBody,
    _alertas_financieras,
    _cuentas_por_cobrar_y_pagar,
    _evaluar_consumo_campana,
    alertas_financieras,
    anular_gasto,
    crear_gasto,
    dashboard_financiero,
    editar_gasto,
    listar_gastos,
    presupuesto_campana,
    procesar_reembolso,
    reporte_financiero,
)


def _uid() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────────────────────
# 2.6 — Gastos operativos
# ─────────────────────────────────────────────────────────────────────────────

def test_gasto_crear_listar_editar_anular_excluido_de_rango(admin):
    fecha = date(2022, 3, 15)
    body = GastoBody(concepto="Servidor mensual", categoria="infraestructura", monto=100.0, fecha=fecha, descripcion="AWS")
    creado = crear_gasto(body, admin)
    gasto_id = creado["gasto_id"]
    assert creado["estado"] == "activo"

    listado = listar_gastos(categoria="infraestructura", desde=fecha, hasta=fecha + timedelta(days=1), estado="activo", admin=admin)
    assert any(g["gasto_id"] == gasto_id for g in listado["data"])

    antes_total = float((query_one(
        "SELECT coalesce(sum(monto),0) AS total FROM FACT_GASTO_OPERATIVO WHERE estado='activo' AND fecha={f:Date}",
        {"f": fecha},
    ) or {}).get("total") or 0)
    assert antes_total >= 100.0

    editado = editar_gasto(gasto_id, GastoBody(concepto="Servidor mensual v2", categoria="infraestructura", monto=150.0, fecha=fecha, descripcion="AWS actualizado"), admin)
    assert editado["monto"] == 150.0
    fila = query_one("SELECT monto, concepto FROM FACT_GASTO_OPERATIVO WHERE gasto_id={id:String}", {"id": gasto_id})
    assert fila["monto"] == 150.0
    assert fila["concepto"] == "Servidor mensual v2"

    anular_gasto(gasto_id, admin)
    fila = query_one("SELECT estado FROM FACT_GASTO_OPERATIVO WHERE gasto_id={id:String}", {"id": gasto_id})
    assert fila["estado"] == "anulado"

    despues_total = float((query_one(
        "SELECT coalesce(sum(monto),0) AS total FROM FACT_GASTO_OPERATIVO WHERE estado='activo' AND fecha={f:Date}",
        {"f": fecha},
    ) or {}).get("total") or 0)
    # El gasto anulado (150) ya no debe sumar en el agregado de activos.
    assert despues_total == pytest.approx(antes_total - 100.0)


def test_gasto_monto_invalido_rechazado(admin):
    with pytest.raises(HTTPException) as exc:
        crear_gasto(GastoBody(concepto="x", categoria="otros", monto=0, fecha=date.today()), admin)
    assert exc.value.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# 3.6 — Reembolsos
# ─────────────────────────────────────────────────────────────────────────────

def test_reembolso_total_valido(admin, transaccion_exitosa):
    transaccion_id = transaccion_exitosa(100.0)
    resultado = procesar_reembolso(ReembolsoBody(transaccion_id=transaccion_id, monto=100.0, tipo="total", motivo="reclamo"), admin)
    assert resultado["estado"] == "procesado"
    fila = query_one(
        "SELECT count() AS n FROM FACT_REEMBOLSO WHERE transaccion_id={id:UUID} AND estado='procesado'",
        {"id": transaccion_id},
    )
    assert fila["n"] == 1


def test_reembolso_parcial_valido(admin, transaccion_exitosa):
    transaccion_id = transaccion_exitosa(100.0)
    resultado = procesar_reembolso(ReembolsoBody(transaccion_id=transaccion_id, monto=40.0, tipo="parcial", motivo="parcial"), admin)
    assert resultado["estado"] == "procesado"
    assert resultado["monto"] == 40.0


def test_reembolso_excede_saldo_disponible_rechazado(admin, transaccion_exitosa):
    transaccion_id = transaccion_exitosa(100.0)
    with pytest.raises(HTTPException) as exc:
        procesar_reembolso(ReembolsoBody(transaccion_id=transaccion_id, monto=150.0, tipo="total", motivo="excede"), admin)
    assert exc.value.status_code == 422
    fila = query_one("SELECT count() AS n FROM FACT_REEMBOLSO WHERE transaccion_id={id:UUID}", {"id": transaccion_id})
    assert fila["n"] == 0


def test_reembolso_transaccion_fallida_rechazado(admin, transaccion_con_estado):
    transaccion_id = transaccion_con_estado("fallida", 100.0)
    with pytest.raises(HTTPException) as exc:
        procesar_reembolso(ReembolsoBody(transaccion_id=transaccion_id, monto=10.0, tipo="parcial", motivo="x"), admin)
    assert exc.value.status_code == 422
    fila = query_one("SELECT count() AS n FROM FACT_REEMBOLSO WHERE transaccion_id={id:UUID}", {"id": transaccion_id})
    assert fila["n"] == 0


def test_reembolso_transaccion_no_exitosa_rechazado(admin, transaccion_con_estado):
    # FACT_TRANSACCION_PAGO.estado no tiene un valor 'cancelada' en el schema
    # actual (solo pendiente/exitosa/fallida) — 'pendiente' es el estado
    # práctico equivalente: dinero no cobrado, no reembolsable, mismo motivo
    # de rechazo que 'fallida'/'cancelada' pediría spec.md (ver router.py,
    # comentario en `procesar_reembolso`).
    transaccion_id = transaccion_con_estado("pendiente", 100.0)
    with pytest.raises(HTTPException) as exc:
        procesar_reembolso(ReembolsoBody(transaccion_id=transaccion_id, monto=10.0, tipo="parcial", motivo="x"), admin)
    assert exc.value.status_code == 422


def test_reembolso_doble_excede_en_conjunto_rechaza_el_segundo(admin, transaccion_exitosa):
    transaccion_id = transaccion_exitosa(100.0)
    primero = procesar_reembolso(ReembolsoBody(transaccion_id=transaccion_id, monto=60.0, tipo="parcial", motivo="1"), admin)
    assert primero["estado"] == "procesado"
    with pytest.raises(HTTPException) as exc:
        procesar_reembolso(ReembolsoBody(transaccion_id=transaccion_id, monto=50.0, tipo="parcial", motivo="2"), admin)
    assert exc.value.status_code == 422
    total_procesado = query_one(
        "SELECT coalesce(sum(monto),0) AS total FROM FACT_REEMBOLSO WHERE transaccion_id={id:UUID} AND estado='procesado'",
        {"id": transaccion_id},
    )["total"]
    assert total_procesado == pytest.approx(60.0)


# ─────────────────────────────────────────────────────────────────────────────
# 4.5 — Dashboard financiero
# ─────────────────────────────────────────────────────────────────────────────

def _insertar_ingreso_periodo(d1: date, monto_suscripcion: float, monto_ads: float, monto_regalias: float):
    fecha_dt = datetime.combine(d1, datetime.min.time()) + timedelta(hours=6)
    if monto_suscripcion:
        get_client().insert(
            "FACT_TRANSACCION_PAGO",
            [(_uid(), "test-user", _uid(), _uid(), monto_suscripcion, "USD", "exitosa", fecha_dt)],
            column_names=["transaccion_id", "usuario_id", "metodo_pago_id", "suscripcion_id", "monto", "moneda", "estado", "fecha"],
        )
    if monto_ads:
        get_client().insert(
            "FACT_INGRESO_PUBLICITARIO",
            [(_uid(), _uid(), 1, monto_ads, fecha_dt)],
            column_names=["ingreso_id", "impresion_id", "campana_id", "monto", "fecha"],
        )
    if monto_regalias:
        get_client().insert(
            "FACT_LIQUIDACION_REGALIA",
            [(_uid(), _uid(), 1, "artista", _uid(), d1, d1 + timedelta(days=1), 10, monto_regalias, "USD", fecha_dt)],
            column_names=["liquidacion_id", "contrato_id", "fact_id_track", "tipo_rightsholder", "rightsholder_id",
                           "periodo_inicio", "periodo_fin", "streams_periodo", "monto", "moneda", "fecha_calculo"],
        )


def test_dashboard_sin_gastos_ni_reembolsos_coincide_con_formula_pnl(admin, rango_unico):
    d1, d2 = rango_unico
    _insertar_ingreso_periodo(d1, monto_suscripcion=200.0, monto_ads=50.0, monto_regalias=30.0)

    resultado = dashboard_financiero(desde=d1, hasta=d2, desde_comparacion=None, hasta_comparacion=None, admin=admin)
    assert resultado["ingreso_suscripciones"] == pytest.approx(200.0)
    assert resultado["ingreso_publicitario"] == pytest.approx(50.0)
    assert resultado["regalias_pagadas"] == pytest.approx(30.0)
    # Formula de v1_pnl: ingreso_suscripciones + ingreso_publicitario - regalias_pagadas
    margen_neto_pnl = 200.0 + 50.0 - 30.0
    assert resultado["utilidad_estimada"] == pytest.approx(margen_neto_pnl)


def test_dashboard_resta_gastos_y_reembolsos_de_la_utilidad(admin, rango_unico):
    d1, d2 = rango_unico
    _insertar_ingreso_periodo(d1, monto_suscripcion=300.0, monto_ads=0, monto_regalias=0)

    gasto = crear_gasto(GastoBody(concepto="Marketing", categoria="marketing", monto=40.0, fecha=d1), admin)
    transaccion_id = _uid()
    fecha_dt = datetime.combine(d1, datetime.min.time()) + timedelta(hours=6)
    get_client().insert(
        "FACT_TRANSACCION_PAGO",
        [(transaccion_id, "test-user", _uid(), _uid(), 300.0, "USD", "exitosa", fecha_dt)],
        column_names=["transaccion_id", "usuario_id", "metodo_pago_id", "suscripcion_id", "monto", "moneda", "estado", "fecha"],
    )
    get_client().insert(
        "FACT_REEMBOLSO",
        [(_uid(), transaccion_id, 20.0, "parcial", "test", fecha_dt, admin["record"]["id"], "procesado")],
        column_names=["reembolso_id", "transaccion_id", "monto", "tipo", "motivo", "fecha", "responsable_id", "estado"],
    )

    resultado = dashboard_financiero(desde=d1, hasta=d2, desde_comparacion=None, hasta_comparacion=None, admin=admin)
    # ingreso_suscripciones = 300 (del helper) + 300 (de esta transacción) = 600
    ingreso_total_esperado = 600.0
    utilidad_esperada = ingreso_total_esperado - 0 - 40.0 - 20.0
    assert resultado["gastos_operativos"] == pytest.approx(40.0)
    assert resultado["reembolsos_procesados"] == pytest.approx(20.0)
    assert resultado["utilidad_estimada"] == pytest.approx(utilidad_esperada)


def test_dashboard_comparacion_calcula_delta_esperado(admin, rango_unico):
    d1, d2 = rango_unico
    d1_comp, d2_comp = d1 - timedelta(days=10), d1 - timedelta(days=9)
    _insertar_ingreso_periodo(d1, monto_suscripcion=200.0, monto_ads=0, monto_regalias=0)
    _insertar_ingreso_periodo(d1_comp, monto_suscripcion=100.0, monto_ads=0, monto_regalias=0)

    resultado = dashboard_financiero(desde=d1, hasta=d2, desde_comparacion=d1_comp, hasta_comparacion=d2_comp, admin=admin)
    assert "delta_pct" in resultado
    delta_esperado = round((200.0 - 100.0) / 100.0 * 100, 2)
    assert resultado["delta_pct"]["ingreso_suscripciones"] == pytest.approx(delta_esperado)


# ─────────────────────────────────────────────────────────────────────────────
# 5.4 — Cuentas por cobrar y por pagar
# ─────────────────────────────────────────────────────────────────────────────

def test_invoice_vencida_se_refleja_en_total_vencido(admin):
    fecha_vieja = datetime.now() - timedelta(days=45)
    invoice_id = _uid()
    get_client().insert(
        "FACT_INVOICE",
        [(invoice_id, "test-user", _uid(), 100.0, 15.0, fecha_vieja, "emitido")],
        column_names=["invoice_id", "usuario_id", "transaccion_id", "monto", "iva", "fecha_emision", "estado"],
    )
    resultado = _cuentas_por_cobrar_y_pagar()
    assert resultado["cuentas_por_cobrar"]["total_vencido"] >= 115.0 - 1e-6
    fila = query_one("SELECT dateDiff('day', fecha_emision, now()) AS dias FROM FACT_INVOICE WHERE invoice_id={id:UUID}", {"id": invoice_id})
    assert fila["dias"] > 30


def test_retiro_pendiente_se_refleja_en_total_por_pagar(admin):
    retiro_id = _uid()
    get_client().insert(
        "FACT_RETIRO_REGALIA",
        [(retiro_id, "artista", _uid(), 75.0, "pendiente")],
        column_names=["retiro_id", "tipo_rightsholder", "rightsholder_id", "monto", "estado"],
    )
    resultado = _cuentas_por_cobrar_y_pagar()
    assert resultado["cuentas_por_pagar"]["total_por_pagar"] >= 75.0 - 1e-6


# ─────────────────────────────────────────────────────────────────────────────
# 6.5 — Presupuesto de campañas + pausa automática
# ─────────────────────────────────────────────────────────────────────────────

def test_campana_bajo_80_no_marca_alerta(admin, campana_con_ingreso):
    campana_id = campana_con_ingreso(1000.0, 0.5)
    resultado = presupuesto_campana(campana_id, admin)
    assert resultado["alerta_80"] is False
    assert resultado["alerta_agotado"] is False
    assert resultado["activa"] is True


def test_campana_cruza_80_marca_alerta_80(admin, campana_con_ingreso):
    campana_id = campana_con_ingreso(1000.0, 0.85)
    resultado = presupuesto_campana(campana_id, admin)
    assert resultado["alerta_80"] is True
    assert resultado["alerta_agotado"] is False
    assert resultado["activa"] is True


def test_campana_alcanza_100_marca_agotado_y_se_pausa(admin, campana_con_ingreso):
    campana_id = campana_con_ingreso(1000.0, 1.0)
    resultado = presupuesto_campana(campana_id, admin)
    assert resultado["alerta_agotado"] is True
    assert resultado["activa"] is False

    fila = query_one("SELECT activa FROM DIM_CAMPANA_PUBLICITARIA WHERE campana_id={id:UInt32}", {"id": campana_id})
    assert fila["activa"] == 0

    audit_rows = query_rows(
        "SELECT despues FROM FACT_AUDIT_LOG WHERE accion='pausar_campana_presupuesto_agotado'",
    )
    matches = [r for r in audit_rows if json.loads(r["despues"]).get("campana_id") == campana_id]
    assert len(matches) == 1

    # Segunda consulta sobre una campaña ya pausada no debe duplicar la auditoría.
    resultado2 = presupuesto_campana(campana_id, admin)
    assert resultado2["activa"] is False
    audit_rows2 = query_rows(
        "SELECT despues FROM FACT_AUDIT_LOG WHERE accion='pausar_campana_presupuesto_agotado'",
    )
    matches2 = [r for r in audit_rows2 if json.loads(r["despues"]).get("campana_id") == campana_id]
    assert len(matches2) == 1


# ─────────────────────────────────────────────────────────────────────────────
# 7.7 — Indicadores empresariales
# ─────────────────────────────────────────────────────────────────────────────

def test_arpu_e_indicadores_con_usuarios_activos_mockeados(admin, rango_unico, monkeypatch):
    d1, d2 = rango_unico
    _insertar_ingreso_periodo(d1, monto_suscripcion=500.0, monto_ads=0, monto_regalias=100.0)
    crear_gasto(GastoBody(concepto="Nomina", categoria="nomina", monto=50.0, fecha=d1), admin)

    async def _fake_usuarios_activos():
        return 10

    monkeypatch.setattr(finanzas_router, "_contar_usuarios_pago_activos", _fake_usuarios_activos)

    resultado = asyncio.run(finanzas_router._indicadores_financieros(d1, d2))
    assert resultado["usuarios_pago_activos"] == 10
    assert resultado["arpu"] == pytest.approx(500.0 / 10)
    assert resultado["pct_ingresos_regalias"] == pytest.approx(100.0 / 500.0 * 100, rel=1e-3)
    assert resultado["pct_ingresos_gastos"] == pytest.approx(50.0 / 500.0 * 100, rel=1e-3)


# ─────────────────────────────────────────────────────────────────────────────
# 8.3 — Alertas financieras
# ─────────────────────────────────────────────────────────────────────────────

def test_alerta_campana_presupuesto_agotado(admin, campana_con_ingreso, rango_unico):
    d1, d2 = rango_unico
    campana_id = campana_con_ingreso(500.0, 1.0)
    alertas = _alertas_financieras(d1, d2, admin["record"]["id"])
    assert any(a["tipo"] == "campana_presupuesto_agotado" and a["campana_id"] == campana_id for a in alertas)


def test_alerta_factura_vencida(admin, rango_unico):
    d1, d2 = rango_unico
    invoice_id = _uid()
    get_client().insert(
        "FACT_INVOICE",
        [(invoice_id, "test-user", _uid(), 90.0, 10.0, datetime.now() - timedelta(days=40), "emitido")],
        column_names=["invoice_id", "usuario_id", "transaccion_id", "monto", "iva", "fecha_emision", "estado"],
    )
    alertas = _alertas_financieras(d1, d2, admin["record"]["id"])
    assert any(a["tipo"] == "factura_vencida" and a["invoice_id"] == invoice_id for a in alertas)


def test_alerta_retiro_pendiente(admin, rango_unico):
    d1, d2 = rango_unico
    retiro_id = _uid()
    get_client().insert(
        "FACT_RETIRO_REGALIA",
        [(retiro_id, "sello", _uid(), 25.0, "pendiente")],
        column_names=["retiro_id", "tipo_rightsholder", "rightsholder_id", "monto", "estado"],
    )
    alertas = _alertas_financieras(d1, d2, admin["record"]["id"])
    assert any(a["tipo"] == "retiro_regalia_pendiente" and a["retiro_id"] == retiro_id for a in alertas)


def test_alerta_regalias_sin_retiro(admin, rango_unico):
    d1, d2 = rango_unico
    rightsholder_id = _uid()
    fecha_vieja = datetime.now() - timedelta(days=40)
    get_client().insert(
        "FACT_LIQUIDACION_REGALIA",
        [(_uid(), _uid(), 1, "artista", rightsholder_id, date(2020, 1, 1), date(2020, 2, 1), 10, 50.0, "USD", fecha_vieja)],
        column_names=["liquidacion_id", "contrato_id", "fact_id_track", "tipo_rightsholder", "rightsholder_id",
                       "periodo_inicio", "periodo_fin", "streams_periodo", "monto", "moneda", "fecha_calculo"],
    )
    alertas = _alertas_financieras(d1, d2, admin["record"]["id"])
    assert any(a["tipo"] == "regalias_sin_retiro" and a["rightsholder_id"] == rightsholder_id for a in alertas)


def test_alerta_gasto_mayor_a_ingreso(admin, rango_unico):
    d1, d2 = rango_unico
    crear_gasto(GastoBody(concepto="Sobregasto", categoria="otros", monto=500.0, fecha=d1), admin)
    # Sin ingreso alguno insertado en este rango.
    alertas = _alertas_financieras(d1, d2, admin["record"]["id"])
    assert any(a["tipo"] == "gasto_mayor_a_ingreso" for a in alertas)


def test_alerta_caida_de_ingreso(admin, rango_unico):
    d1, d2 = rango_unico
    d1_prev, d2_prev = d1 - timedelta(days=1), d1
    _insertar_ingreso_periodo(d1_prev, monto_suscripcion=1000.0, monto_ads=0, monto_regalias=0)
    _insertar_ingreso_periodo(d1, monto_suscripcion=100.0, monto_ads=0, monto_regalias=0)
    alertas = _alertas_financieras(d1, d2, admin["record"]["id"])
    assert any(a["tipo"] == "caida_ingreso" for a in alertas)


def test_alerta_reembolso_elevado(admin, rango_unico, transaccion_exitosa):
    d1, d2 = rango_unico
    fecha_dt = datetime.combine(d1, datetime.min.time()) + timedelta(hours=6)
    transaccion_id = _uid()
    monto_alto = REEMBOLSO_MONTO_ALTO_USD + 100
    get_client().insert(
        "FACT_TRANSACCION_PAGO",
        [(transaccion_id, "test-user", _uid(), _uid(), monto_alto, "USD", "exitosa", fecha_dt)],
        column_names=["transaccion_id", "usuario_id", "metodo_pago_id", "suscripcion_id", "monto", "moneda", "estado", "fecha"],
    )
    reembolso_id = _uid()
    get_client().insert(
        "FACT_REEMBOLSO",
        [(reembolso_id, transaccion_id, monto_alto, "total", "elevado", fecha_dt, admin["record"]["id"], "procesado")],
        column_names=["reembolso_id", "transaccion_id", "monto", "tipo", "motivo", "fecha", "responsable_id", "estado"],
    )
    alertas = _alertas_financieras(d1, d2, admin["record"]["id"])
    assert any(a["tipo"] == "reembolso_elevado" and a["reembolso_id"] == reembolso_id for a in alertas)


def test_alertas_periodo_scoped_vacias_sin_condiciones(admin, rango_unico):
    """No hay tabla de estado para alertas (design.md, Decisión 6): las
    condiciones de campaña/factura/retiro/regalías son globales, no
    acotadas por rango de fechas, así que no se puede garantizar una lista
    globalmente vacía contra una base compartida entre pruebas. Se verifica
    en cambio que, en un rango sin datos propios, las 3 condiciones que sí
    están acotadas por `desde`/`hasta` (gasto>ingreso, caída de ingreso,
    reembolso elevado) no se disparan — cobertura parcial del escenario
    "Sin condiciones de alerta" de spec.md."""
    d1, d2 = rango_unico
    alertas = _alertas_financieras(d1, d2, admin["record"]["id"])
    tipos_period_scoped = {"gasto_mayor_a_ingreso", "caida_ingreso", "reembolso_elevado"}
    assert not any(a["tipo"] in tipos_period_scoped for a in alertas)


# ─────────────────────────────────────────────────────────────────────────────
# 9.2 — Reporte financiero por periodo
# ─────────────────────────────────────────────────────────────────────────────

def test_reporte_coincide_con_endpoints_individuales(admin, rango_unico, monkeypatch):
    d1, d2 = rango_unico
    _insertar_ingreso_periodo(d1, monto_suscripcion=400.0, monto_ads=20.0, monto_regalias=60.0)
    crear_gasto(GastoBody(concepto="Soporte", categoria="soporte", monto=30.0, fecha=d1), admin)

    async def _fake_usuarios_activos():
        return 5

    monkeypatch.setattr(finanzas_router, "_contar_usuarios_pago_activos", _fake_usuarios_activos)

    dashboard = dashboard_financiero(desde=d1, hasta=d2, desde_comparacion=None, hasta_comparacion=None, admin=admin)
    cuentas = _cuentas_por_cobrar_y_pagar()
    indicadores = asyncio.run(finanzas_router._indicadores_financieros(d1, d2))
    reporte = asyncio.run(reporte_financiero(desde=d1, hasta=d2, admin=admin))

    assert reporte["ingresos"]["total"] == pytest.approx(dashboard["ingreso_total"])
    assert reporte["gastos"]["total"] == pytest.approx(dashboard["gastos_operativos"])
    assert reporte["utilidad_estimada"] == pytest.approx(dashboard["utilidad_estimada"])
    assert reporte["margen"] == dashboard["margen"]
    assert reporte["cuentas_por_cobrar"]["total_vencido"] == pytest.approx(cuentas["cuentas_por_cobrar"]["total_vencido"])
    assert reporte["cuentas_por_pagar"]["total_por_pagar"] == pytest.approx(cuentas["cuentas_por_pagar"]["total_por_pagar"])
    assert reporte["indicadores"]["arpu"] == pytest.approx(indicadores["arpu"])
