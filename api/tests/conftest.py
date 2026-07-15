"""Fixtures compartidas para las pruebas de `finanzas` (change
mejoras-financieras-empresariales). No existía una suite de pytest previa en
el proyecto (ver `requirements.txt`, sin `pytest`) — esta es la primera, así
que no hay una convención previa que igualar; se usa pytest estándar,
conectando directo contra el ClickHouse real de desarrollo (mismo patrón que
`init_clickhouse.py`: variables de entorno `CLICKHOUSE_*`, sin mocks) porque
las queries de `finanzas` son el objeto bajo prueba, no la conectividad."""
import uuid
from datetime import date, datetime, timedelta

import pytest

from core.database import execute, get_client


@pytest.fixture(scope="session")
def admin():
    """Actor admin sintético — mismo shape que `get_current_user` produce
    (`user["record"]["id"]`), sin pasar por PocketBase (las pruebas llaman
    las funciones del router directamente, no vía HTTP)."""
    return {"record": {"id": f"test-admin-{uuid.uuid4().hex[:8]}", "role": "admin"}}


def _uuid() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def transaccion_exitosa():
    """Inserta una transacción `exitosa` de monto conocido en
    FACT_TRANSACCION_PAGO y la retorna (id, monto) — insumo para las
    pruebas de reembolsos."""
    def _crear(monto: float = 100.0):
        transaccion_id = _uuid()
        get_client().insert(
            "FACT_TRANSACCION_PAGO",
            [(transaccion_id, "test-user", _uuid(), _uuid(), monto, "USD", "exitosa")],
            column_names=["transaccion_id", "usuario_id", "metodo_pago_id", "suscripcion_id", "monto", "moneda", "estado"],
        )
        return transaccion_id
    return _crear


@pytest.fixture
def transaccion_con_estado():
    def _crear(estado: str, monto: float = 100.0):
        transaccion_id = _uuid()
        get_client().insert(
            "FACT_TRANSACCION_PAGO",
            [(transaccion_id, "test-user", _uuid(), _uuid(), monto, "USD", estado)],
            column_names=["transaccion_id", "usuario_id", "metodo_pago_id", "suscripcion_id", "monto", "moneda", "estado"],
        )
        return transaccion_id
    return _crear


@pytest.fixture
def campana_con_ingreso():
    """Crea un anunciante + campaña con `presupuesto_total` conocido y le
    inyecta ingreso publicitario acumulado hasta un porcentaje dado del
    presupuesto — insumo para las pruebas de consumo de presupuesto."""
    def _crear(presupuesto_total: float, pct_consumido: float, campana_id: int | None = None) -> int:
        campana_id = campana_id or int(uuid.uuid4().int % 2_000_000_000)
        anunciante_id = int(uuid.uuid4().int % 2_000_000_000)
        get_client().insert(
            "DIM_ANUNCIANTE", [(anunciante_id, f"Anunciante {campana_id}", "")],
            column_names=["anunciante_id", "nombre", "sector"],
        )
        get_client().insert(
            "DIM_CAMPANA_PUBLICITARIA",
            [(campana_id, anunciante_id, f"Campana {campana_id}", 5.0, presupuesto_total, date(2020, 1, 1), None, 1)],
            column_names=["campana_id", "anunciante_id", "nombre", "cpm", "presupuesto_total", "fecha_inicio", "fecha_fin", "activa"],
        )
        monto_objetivo = presupuesto_total * pct_consumido
        if monto_objetivo > 0:
            impresion_id = _uuid()
            ingreso_id = _uuid()
            get_client().insert(
                "FACT_IMPRESION_ANUNCIO",
                [(impresion_id, campana_id, "test-user", 1)],
                column_names=["impresion_id", "campana_id", "usuario_id", "completado"],
            )
            get_client().insert(
                "FACT_INGRESO_PUBLICITARIO",
                [(ingreso_id, impresion_id, campana_id, monto_objetivo)],
                column_names=["ingreso_id", "impresion_id", "campana_id", "monto"],
            )
        return campana_id
    return _crear


@pytest.fixture
def rango_unico():
    """Genera un rango de fechas [desde, hasta) único y lejano en el pasado
    para que cada test de dashboard/indicadores/reporte no vea datos de
    otros tests corridos en la misma base compartida."""
    base = date(2021, 1, 1) + timedelta(days=(uuid.uuid4().int % 3000))
    return base, base + timedelta(days=1)
