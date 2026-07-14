import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.database import execute, get_client, query_one, query_rows
from paquetes.creadores.queries import CUENTA_ACTUAL_POR_ID
from paquetes.distribucion.queries import SELLO_EXISTE
from paquetes.regalias.deps import require_admin, require_cuenta_sello
from paquetes.regalias.queries import (
    CONTRATO_EXISTE,
    CONTRATOS_LIST,
    CONTRATOS_VIGENTES_EN_PERIODO,
    CUENTA_SELLO_EXISTE_USUARIO,
    GANANCIAS_ARTISTA,
    GANANCIAS_SELLO,
    LIQUIDACION_YA_EXISTE_PERIODO,
    LIQUIDACIONES_POR_CONTRATO,
    PRODUCTOR_EXISTE,
    PRODUCTOR_ID_MAX,
    PRODUCTORES_LIST,
    RESUMEN_CONTRATO,
    RETIRO_POR_ID,
    RETIROS_POR_RIGHTSHOLDER,
    SALDO_DISPONIBLE_RIGHTSHOLDER,
    STREAMS_POR_TRACK_PERIODO,
    TOTAL_INGRESO_PUBLICITARIO_PERIODO,
    TOTAL_TRANSACCIONES_PERIODO,
    TRACK_EXISTE,
    retiros_admin_sql,
)
from paquetes.seguridad import audit
from core.deps import get_current_user

router = APIRouter(prefix="/app/v1/regalias", tags=["Regalias"])

# Ver design.md (Decisión 1): parámetros de negocio, mismo precedente que
# TASA_EXITO_DEFAULT/IVA_RATE en `facturacion` — no una tabla de una fila.
TASA_RIGHTSHOLDERS = 0.70   # % del pool total que va a rightsholders (el resto es margen de la plataforma)
PCT_MASTER = 0.80           # % del ingreso de un track que es derecho de master/grabación
PCT_PUBLISHING = 0.20       # % que es derecho de publishing/composición


# ─────────────────────────────────────────────────────────────────────────────
# 1. Productores (CU-O59/CU-O60)
# ─────────────────────────────────────────────────────────────────────────────

class ProductorBody(BaseModel):
    nombre: str


@router.post("/admin/productores", status_code=201)
def crear_productor(body: ProductorBody, admin: dict = Depends(require_admin)):
    if not body.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre del productor no puede estar vacío")
    nuevo_id = ((query_one(PRODUCTOR_ID_MAX) or {}).get("n") or 0) + 1
    get_client().insert(
        "DIM_PRODUCTOR", [(nuevo_id, body.nombre.strip())],
        column_names=["productor_id", "nombre"],
    )
    return {"status": "ok", "productor_id": nuevo_id, "nombre": body.nombre.strip()}


@router.get("/productores")
def listar_productores(user: dict = Depends(get_current_user)):
    return {"data": query_rows(PRODUCTORES_LIST)}


@router.post("/admin/productores/{productor_id}/tracks/{fact_id}", status_code=201)
def asignar_productor(productor_id: int, fact_id: int, admin: dict = Depends(require_admin)):
    if not (query_one(PRODUCTOR_EXISTE, {"productor_id": productor_id}) or {}).get("n"):
        raise HTTPException(status_code=404, detail="Productor no encontrado")
    if not (query_one(TRACK_EXISTE, {"fact_id": fact_id}) or {}).get("n"):
        raise HTTPException(status_code=404, detail="Track no encontrado")
    get_client().insert(
        "BRIDGE_PRODUCTOR_TRACK", [(fact_id, productor_id, "productor")],
        column_names=["fact_id_track", "productor_id", "rol"],
    )
    return {"status": "ok", "fact_id_track": fact_id, "productor_id": productor_id}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Contratos de reparto (CU-O61)
# ─────────────────────────────────────────────────────────────────────────────

class ContratoBody(BaseModel):
    fact_id_track: int
    sello_id: int | None = None
    cuenta_artista_id: str | None = None
    productor_id: int | None = None
    pct_master_sello: float = 0
    pct_master_artista: float = 0
    pct_master_productor: float = 0
    pct_publishing_sello: float = 0
    pct_publishing_artista: float = 0
    vigente_desde: date
    vigente_hasta: date | None = None


@router.post("/admin/contratos", status_code=201)
def crear_contrato(body: ContratoBody, admin: dict = Depends(require_admin)):
    if not (query_one(TRACK_EXISTE, {"fact_id": body.fact_id_track}) or {}).get("n"):
        raise HTTPException(status_code=404, detail="Track no encontrado")

    suma_master = body.pct_master_sello + body.pct_master_artista + body.pct_master_productor
    suma_publishing = body.pct_publishing_sello + body.pct_publishing_artista
    if abs(suma_master - 100) > 0.01:
        raise HTTPException(status_code=422, detail=f"Los porcentajes de master deben sumar 100 (suman {suma_master})")
    if abs(suma_publishing - 100) > 0.01:
        raise HTTPException(status_code=422, detail=f"Los porcentajes de publishing deben sumar 100 (suman {suma_publishing})")

    if (body.pct_master_sello or body.pct_publishing_sello) and not body.sello_id:
        raise HTTPException(status_code=422, detail="Se asignó porcentaje al sello sin indicar sello_id")
    if body.sello_id and not (query_one(SELLO_EXISTE, {"sello_id": body.sello_id}) or {}).get("n"):
        raise HTTPException(status_code=404, detail="Sello no encontrado")

    if (body.pct_master_artista or body.pct_publishing_artista) and not body.cuenta_artista_id:
        raise HTTPException(status_code=422, detail="Se asignó porcentaje al artista sin indicar cuenta_artista_id")
    if body.cuenta_artista_id:
        cuenta = query_one(CUENTA_ACTUAL_POR_ID, {"cuenta_artista_id": body.cuenta_artista_id})
        if not cuenta or cuenta["estado_cuenta"] != "aprobada":
            raise HTTPException(status_code=404, detail="Cuenta de artista no encontrada o no aprobada")

    if body.pct_master_productor and not body.productor_id:
        raise HTTPException(status_code=422, detail="Se asignó porcentaje al productor sin indicar productor_id")
    if body.productor_id and not (query_one(PRODUCTOR_EXISTE, {"productor_id": body.productor_id}) or {}).get("n"):
        raise HTTPException(status_code=404, detail="Productor no encontrado")

    contrato_id = str(uuid.uuid4())
    get_client().insert(
        "DIM_CONTRATO_REGALIA",
        [(
            contrato_id, body.fact_id_track, body.sello_id, body.cuenta_artista_id, body.productor_id,
            body.pct_master_sello, body.pct_master_artista, body.pct_master_productor,
            body.pct_publishing_sello, body.pct_publishing_artista,
            body.vigente_desde, body.vigente_hasta,
        )],
        column_names=[
            "contrato_id", "fact_id_track", "sello_id", "cuenta_artista_id", "productor_id",
            "pct_master_sello", "pct_master_artista", "pct_master_productor",
            "pct_publishing_sello", "pct_publishing_artista", "vigente_desde", "vigente_hasta",
        ],
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="crear_contrato_regalia",
        tabla_afectada="DIM_CONTRATO_REGALIA", antes=None,
        despues={"contrato_id": contrato_id, "fact_id_track": body.fact_id_track},
    )
    return {"status": "ok", "contrato_id": contrato_id}


@router.get("/admin/contratos")
def listar_contratos(admin: dict = Depends(require_admin)):
    return {"data": query_rows(CONTRATOS_LIST)}


def _contrato_o_404(contrato_id: str) -> None:
    if not (query_one(CONTRATO_EXISTE, {"contrato_id": contrato_id}) or {}).get("n"):
        raise HTTPException(status_code=404, detail="Contrato no encontrado")


@router.get("/admin/contratos/{contrato_id}/liquidaciones")
def listar_liquidaciones_contrato(contrato_id: str, admin: dict = Depends(require_admin)):
    _contrato_o_404(contrato_id)
    return {"data": query_rows(LIQUIDACIONES_POR_CONTRATO, {"contrato_id": contrato_id})}


@router.get("/admin/contratos/{contrato_id}/resumen")
def resumen_contrato(contrato_id: str, admin: dict = Depends(require_admin)):
    _contrato_o_404(contrato_id)
    fila = query_one(RESUMEN_CONTRATO, {"contrato_id": contrato_id}) or {}
    num_liquidaciones = int(fila.get("num_liquidaciones") or 0)
    return {
        "total_liquidado":    round(float(fila.get("total_liquidado") or 0), 2),
        "ultima_liquidacion": fila.get("ultima_liquidacion") if num_liquidaciones else None,
        "num_liquidaciones":  num_liquidaciones,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Cuentas de sello (CU-O62)
# ─────────────────────────────────────────────────────────────────────────────

class CuentaSelloBody(BaseModel):
    usuario_id: str
    sello_id: int


@router.post("/admin/cuentas-sello", status_code=201)
def crear_cuenta_sello(body: CuentaSelloBody, admin: dict = Depends(require_admin)):
    if not (query_one(SELLO_EXISTE, {"sello_id": body.sello_id}) or {}).get("n"):
        raise HTTPException(status_code=404, detail="Sello no encontrado")
    if (query_one(CUENTA_SELLO_EXISTE_USUARIO, {"usuario_id": body.usuario_id}) or {}).get("n"):
        raise HTTPException(status_code=409, detail="Este usuario ya tiene una cuenta de sello activa")

    cuenta_sello_id = str(uuid.uuid4())
    get_client().insert(
        "DIM_CUENTA_SELLO", [(cuenta_sello_id, body.usuario_id, body.sello_id)],
        column_names=["cuenta_sello_id", "usuario_id", "sello_id"],
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="crear_cuenta_sello",
        tabla_afectada="DIM_CUENTA_SELLO", antes=None,
        despues={"cuenta_sello_id": cuenta_sello_id, "usuario_id": body.usuario_id, "sello_id": body.sello_id},
    )
    return {"status": "ok", "cuenta_sello_id": cuenta_sello_id}


@router.get("/sello/mi-cuenta")
def mi_cuenta_sello(cuenta: dict = Depends(require_cuenta_sello)):
    return cuenta


# ─────────────────────────────────────────────────────────────────────────────
# 4. Liquidación (CU-O63) — ver design.md, Decisión 1, para la fórmula completa
# ─────────────────────────────────────────────────────────────────────────────

class LiquidarBody(BaseModel):
    periodo_inicio: date
    periodo_fin: date


def liquidar_periodo_interno(periodo_inicio: date, periodo_fin: date) -> dict:
    """Núcleo de la liquidación (CU-O63) — reutilizado tanto por
    `POST /admin/liquidar` como por `simulacion` (ver design.md,
    Decisión 5 de `modelo-financiero-simulacion`). Idempotente por rango de
    fechas exacto: si ese período ya fue liquidado, no vuelve a insertar
    (design.md, Decisión 4)."""
    if periodo_fin <= periodo_inicio:
        raise HTTPException(status_code=422, detail="periodo_fin debe ser posterior a periodo_inicio")

    if (query_one(LIQUIDACION_YA_EXISTE_PERIODO, {"inicio": periodo_inicio, "fin": periodo_fin}) or {}).get("n"):
        return {"status": "ya_liquidado", "liquidaciones": 0}

    inicio_dt = datetime.combine(periodo_inicio, datetime.min.time())
    fin_dt = datetime.combine(periodo_fin, datetime.min.time())

    total_transacciones = float((query_one(TOTAL_TRANSACCIONES_PERIODO, {"inicio": inicio_dt, "fin": fin_dt}) or {}).get("total") or 0)
    total_publicidad = float((query_one(TOTAL_INGRESO_PUBLICITARIO_PERIODO, {"inicio": inicio_dt, "fin": fin_dt}) or {}).get("total") or 0)
    pool_total = total_transacciones + total_publicidad
    pool_rightsholders = pool_total * TASA_RIGHTSHOLDERS

    streams_rows = query_rows(STREAMS_POR_TRACK_PERIODO, {"inicio": inicio_dt, "fin": fin_dt})
    streams_por_track = {r["fact_id_track"]: r["streams"] for r in streams_rows}
    total_streams = sum(streams_por_track.values())

    resumen = {
        "pool_total": round(pool_total, 2),
        "pool_rightsholders": round(pool_rightsholders, 2),
        "total_streams": total_streams,
    }

    if pool_rightsholders <= 0 or total_streams == 0:
        return {"status": "ok", "liquidaciones": 0, **resumen}

    contratos_rows = query_rows(CONTRATOS_VIGENTES_EN_PERIODO, {
        "fin_date": periodo_fin, "inicio_date": periodo_inicio,
    })
    # Un contrato por track: el primero (ya viene ordenado por vigente_desde DESC).
    contrato_por_track: dict[int, dict] = {}
    for c in contratos_rows:
        contrato_por_track.setdefault(c["fact_id_track"], c)

    filas = []
    for fact_id_track, contrato in contrato_por_track.items():
        track_streams = streams_por_track.get(fact_id_track, 0)
        if track_streams == 0:
            continue
        track_revenue = pool_rightsholders * (track_streams / total_streams)
        master_pool = track_revenue * PCT_MASTER
        publishing_pool = track_revenue * PCT_PUBLISHING

        candidatos = [
            ("sello", contrato.get("sello_id"),
             master_pool * (contrato["pct_master_sello"] / 100) + publishing_pool * (contrato["pct_publishing_sello"] / 100)),
            ("artista", contrato.get("cuenta_artista_id"),
             master_pool * (contrato["pct_master_artista"] / 100) + publishing_pool * (contrato["pct_publishing_artista"] / 100)),
            ("productor", contrato.get("productor_id"),
             master_pool * (contrato["pct_master_productor"] / 100)),
        ]
        for tipo, rightsholder_id, monto in candidatos:
            if rightsholder_id is None or monto <= 0:
                continue
            filas.append((
                str(uuid.uuid4()), contrato["contrato_id"], fact_id_track, tipo, str(rightsholder_id),
                periodo_inicio, periodo_fin, track_streams, round(monto, 2), "USD",
            ))

    if filas:
        get_client().insert(
            "FACT_LIQUIDACION_REGALIA", filas,
            column_names=[
                "liquidacion_id", "contrato_id", "fact_id_track", "tipo_rightsholder", "rightsholder_id",
                "periodo_inicio", "periodo_fin", "streams_periodo", "monto", "moneda",
            ],
        )
    return {"status": "ok", "liquidaciones": len(filas), **resumen}


@router.post("/admin/liquidar", status_code=201)
def liquidar_periodo(body: LiquidarBody, admin: dict = Depends(require_admin)):
    resultado = liquidar_periodo_interno(body.periodo_inicio, body.periodo_fin)
    audit.record(
        usuario_id=admin["record"]["id"], accion="liquidar_regalias",
        tabla_afectada="FACT_LIQUIDACION_REGALIA", antes=None,
        despues={
            "periodo_inicio": str(body.periodo_inicio), "periodo_fin": str(body.periodo_fin),
            "filas": resultado["liquidaciones"], "status": resultado["status"],
        },
    )
    return resultado


# ─────────────────────────────────────────────────────────────────────────────
# 5. Ganancias propias (CU-O64/CU-O65)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/artista/mis-ganancias")
def mis_ganancias_artista(user: dict = Depends(get_current_user)):
    from paquetes.creadores.queries import CUENTA_ACTUAL_POR_USUARIO
    cuenta = query_one(CUENTA_ACTUAL_POR_USUARIO, {"usuario_id": user["record"]["id"]})
    if not cuenta or cuenta["estado_cuenta"] != "aprobada":
        raise HTTPException(status_code=403, detail="Se requiere una cuenta de artista aprobada")
    filas = query_rows(GANANCIAS_ARTISTA, {"rightsholder_id": cuenta["cuenta_artista_id"]})
    return {"data": filas, "total": round(sum(f["monto"] for f in filas), 2)}


@router.get("/sello/mis-ganancias")
def mis_ganancias_sello(cuenta: dict = Depends(require_cuenta_sello)):
    filas = query_rows(GANANCIAS_SELLO, {"rightsholder_id": str(cuenta["sello_id"])})
    return {"data": filas, "total": round(sum(f["monto"] for f in filas), 2)}


# ─────────────────────────────────────────────────────────────────────────────
# 6. Retiro de ganancias (CU-O75/CU-O76, modelo-financiero-simulacion)
# ─────────────────────────────────────────────────────────────────────────────

class RetiroBody(BaseModel):
    monto: float


def _saldo_disponible(tipo: str, rightsholder_id: str) -> float:
    row = query_one(SALDO_DISPONIBLE_RIGHTSHOLDER, {"tipo": tipo, "rightsholder_id": rightsholder_id})
    return float((row or {}).get("saldo_disponible") or 0)


def _solicitar_retiro(tipo: str, rightsholder_id: str, monto: float) -> dict:
    if monto <= 0:
        raise HTTPException(status_code=422, detail="El monto a retirar debe ser mayor que 0")
    saldo = _saldo_disponible(tipo, rightsholder_id)
    if monto > saldo:
        raise HTTPException(
            status_code=422,
            detail=f"El monto solicitado supera el saldo disponible ({round(saldo, 2)})",
        )
    retiro_id = str(uuid.uuid4())
    get_client().insert(
        "FACT_RETIRO_REGALIA",
        [(retiro_id, tipo, rightsholder_id, round(monto, 2), "pendiente")],
        column_names=["retiro_id", "tipo_rightsholder", "rightsholder_id", "monto", "estado"],
    )
    return {"status": "ok", "retiro_id": retiro_id, "monto": round(monto, 2), "estado": "pendiente"}


@router.get("/artista/saldo")
def saldo_artista(user: dict = Depends(get_current_user)):
    from paquetes.creadores.queries import CUENTA_ACTUAL_POR_USUARIO
    cuenta = query_one(CUENTA_ACTUAL_POR_USUARIO, {"usuario_id": user["record"]["id"]})
    if not cuenta or cuenta["estado_cuenta"] != "aprobada":
        raise HTTPException(status_code=403, detail="Se requiere una cuenta de artista aprobada")
    saldo = _saldo_disponible("artista", str(cuenta["cuenta_artista_id"]))
    retiros = query_rows(RETIROS_POR_RIGHTSHOLDER, {"tipo": "artista", "rightsholder_id": str(cuenta["cuenta_artista_id"])})
    return {"saldo_disponible": round(saldo, 2), "retiros": retiros}


@router.post("/artista/retiros", status_code=201)
def solicitar_retiro_artista(body: RetiroBody, user: dict = Depends(get_current_user)):
    from paquetes.creadores.queries import CUENTA_ACTUAL_POR_USUARIO
    cuenta = query_one(CUENTA_ACTUAL_POR_USUARIO, {"usuario_id": user["record"]["id"]})
    if not cuenta or cuenta["estado_cuenta"] != "aprobada":
        raise HTTPException(status_code=403, detail="Se requiere una cuenta de artista aprobada")
    return _solicitar_retiro("artista", str(cuenta["cuenta_artista_id"]), body.monto)


@router.get("/sello/saldo")
def saldo_sello(cuenta: dict = Depends(require_cuenta_sello)):
    saldo = _saldo_disponible("sello", str(cuenta["sello_id"]))
    retiros = query_rows(RETIROS_POR_RIGHTSHOLDER, {"tipo": "sello", "rightsholder_id": str(cuenta["sello_id"])})
    return {"saldo_disponible": round(saldo, 2), "retiros": retiros}


@router.post("/sello/retiros", status_code=201)
def solicitar_retiro_sello(body: RetiroBody, cuenta: dict = Depends(require_cuenta_sello)):
    return _solicitar_retiro("sello", str(cuenta["sello_id"]), body.monto)


@router.get("/admin/retiros")
def listar_retiros_admin(estado: str | None = None, admin: dict = Depends(require_admin)):
    where = "WHERE estado = {estado:String}" if estado else ""
    params = {"estado": estado} if estado else {}
    return {"data": query_rows(retiros_admin_sql(where), params)}


def _retiro_o_404(retiro_id: str) -> dict:
    retiro = query_one(RETIRO_POR_ID, {"retiro_id": retiro_id})
    if not retiro:
        raise HTTPException(status_code=404, detail="Retiro no encontrado")
    if retiro["estado"] != "pendiente":
        raise HTTPException(status_code=422, detail=f"El retiro ya está en estado '{retiro['estado']}'")
    return retiro


@router.post("/admin/retiros/{retiro_id}/procesar")
def procesar_retiro(retiro_id: str, admin: dict = Depends(require_admin)):
    _retiro_o_404(retiro_id)
    execute(
        "ALTER TABLE FACT_RETIRO_REGALIA UPDATE estado = 'procesado', fecha_procesado = now() "
        "WHERE retiro_id = {id:String}",
        {"id": retiro_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="procesar_retiro_regalia",
        tabla_afectada="FACT_RETIRO_REGALIA", antes=None, despues={"retiro_id": retiro_id, "estado": "procesado"},
    )
    return {"status": "ok", "retiro_id": retiro_id, "estado": "procesado"}


@router.post("/admin/retiros/{retiro_id}/rechazar")
def rechazar_retiro(retiro_id: str, admin: dict = Depends(require_admin)):
    _retiro_o_404(retiro_id)
    execute(
        "ALTER TABLE FACT_RETIRO_REGALIA UPDATE estado = 'rechazado', fecha_procesado = now() "
        "WHERE retiro_id = {id:String}",
        {"id": retiro_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="rechazar_retiro_regalia",
        tabla_afectada="FACT_RETIRO_REGALIA", antes=None, despues={"retiro_id": retiro_id, "estado": "rechazado"},
    )
    return {"status": "ok", "retiro_id": retiro_id, "estado": "rechazado"}
