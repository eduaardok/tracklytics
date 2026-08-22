"""Fixtures compartidas para las pruebas de `finanzas` (change
mejoras-financieras-empresariales). No existía una suite de pytest previa en
el proyecto (ver `requirements.txt`, sin `pytest`) — esta es la primera, así
que no hay una convención previa que igualar; se usa pytest estándar,
conectando directo contra el ClickHouse real de desarrollo (mismo patrón que
`init_clickhouse.py`: variables de entorno `CLICKHOUSE_*`, sin mocks) porque
las queries de `finanzas` son el objeto bajo prueba, no la conectividad."""
import functools
import uuid
from datetime import date, datetime, timedelta

import pytest

from core.database import execute, get_client, query_one


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


# Tablas que las pruebas insertan/consultan por fecha — una fecha candidata
# solo sirve como rango aislado si NO tiene filas preexistentes en ninguna de
# estas tablas (la carga sintética S12 ocupa fechas reales del calendario, así
# que "lejano en el pasado" ya no garantiza vacío).
_TABLAS_A_ISOLAR = (
    ("FACT_TRANSACCION_PAGO", "fecha"),
    ("FACT_INGRESO_PUBLICITARIO", "fecha"),
    ("FACT_LIQUIDACION_REGALIA", "fecha_calculo"),
    ("FACT_GASTO_OPERATIVO", "fecha"),
    ("FACT_REEMBOLSO", "fecha"),
)


@functools.lru_cache(maxsize=1)
def _horizonte_datos() -> date:
    """Última fecha con datos en las tablas aislables (cacheada por sesión).

    La carga sintética S12 ocupa casi todo el calendario histórico, así que
    buscar días vacíos hacia atrás es infructuoso: los rangos aislados deben
    vivir DESPUÉS del último dato cargado."""
    maximo = date.today()
    for tabla, columna in _TABLAS_A_ISOLAR:
        val = ((query_one(f"SELECT max(toDate({columna})) AS m FROM {tabla}") or {}).get("m"))
        if val and val > maximo:
            maximo = val
    return maximo


@pytest.fixture
def rango_unico():
    """Genera un rango de fechas [desde, hasta) único Y verificado vacío,
    para que cada test de dashboard/indicadores/reporte no vea datos ni de
    otros tests ni de la carga sintética que comparte la misma base.

    La ventana libre incluye los 12 días ANTERIORES al rango: los tests
    colocan ventanas auxiliares dentro de ella (comparación de dashboard en
    d-10/d-9, periodo previo de caída de ingreso en d-1) y las alertas de
    caída comparan contra el periodo inmediatamente anterior — todo eso debe
    estar libre de datos ajenos."""
    base = _horizonte_datos() + timedelta(days=14)
    ini_ventana = base - timedelta(days=12)
    fin_ventana = base + timedelta(days=1)
    for _ in range(120):
        ocupado = any(
            int((query_one(
                f"SELECT count() AS n FROM {tabla} "
                f"WHERE toDate({columna}) >= {{ini:Date}} AND toDate({columna}) < {{fin:Date}}",
                {"ini": ini_ventana, "fin": fin_ventana},
            ) or {}).get("n") or 0) > 0
            for tabla, columna in _TABLAS_A_ISOLAR
        )
        if not ocupado:
            return base, base + timedelta(days=1)
        base += timedelta(days=1)
        ini_ventana += timedelta(days=1)
        fin_ventana += timedelta(days=1)
    pytest.fail("No se encontró un día sin datos previos para aislar la prueba")
