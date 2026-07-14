from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from paquetes.regalias.router import liquidar_periodo_interno
from paquetes.seguridad.deps import require_admin
from paquetes.simulacion.generador import (
    generar_impresiones_publicitarias,
    generar_reproducciones,
    generar_suscripciones,
)

router = APIRouter(prefix="/app/v1/simulacion", tags=["Simulacion"], dependencies=[Depends(require_admin)])

# Defaults sensatos (CU-O78): suficiente streams para ponderar el reparto
# entre varios tracks, y suscripciones/impresiones suficientes para que el
# pool de liquidación tenga un monto real que no sea trivial.
N_STREAMS_DEFAULT = 5000
N_SUSCRIPCIONES_DEFAULT = 50
N_IMPRESIONES_DEFAULT = 200


class GenerarActividadBody(BaseModel):
    n_streams: int = N_STREAMS_DEFAULT
    n_suscripciones: int = N_SUSCRIPCIONES_DEFAULT
    n_impresiones: int = N_IMPRESIONES_DEFAULT


@router.post("/generar-actividad", status_code=201)
def generar_actividad(body: GenerarActividadBody):
    """CU-O78: genera streams + suscripciones + impresiones publicitarias en
    la misma ventana de tiempo reciente, y liquida automáticamente el
    período resultante — ver design.md, Decisión 1: los streams solos no
    generan dinero, el pool sale de suscripciones + publicidad."""
    ahora = datetime.utcnow()

    streams_generados = generar_reproducciones(body.n_streams, ahora)
    ingreso_suscripciones = generar_suscripciones(body.n_suscripciones, ahora)
    ingreso_publicitario = generar_impresiones_publicitarias(body.n_impresiones, ahora)

    # Liquidación diaria (mismo grano que el resto de `regalias`, que opera
    # en `date`, no en `datetime`) — cubre todo lo generado en esta corrida.
    # Si ya se simuló actividad hoy, la liquidación de este período ya
    # corrió antes (idempotencia, ver design.md decisión 4): el ingreso
    # nuevo queda igual reflejado en P&L/MRR (leen las tablas de ingreso
    # directamente), pero no se vuelve a repartir a rightsholders hasta el
    # día siguiente.
    hoy = ahora.date()
    resultado_liquidacion = liquidar_periodo_interno(hoy, hoy + timedelta(days=1))

    return {
        "status": "ok",
        "streams_generados": streams_generados,
        "ingreso_suscripciones_generado": ingreso_suscripciones,
        "ingreso_publicitario_generado": ingreso_publicitario,
        "liquidacion": resultado_liquidacion,
    }
