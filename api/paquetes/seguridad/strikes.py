"""Emisión y acumulación de strikes (change p2-descubrimiento-comunidad).

Conecta las denuncias (`social`, change p1-ciclos-vida) con la suspensión de
cuentas (`seguridad`, change roles-gestion-usuarios), que hasta ahora eran dos
mecanismos sin nada en medio: o no pasaba nada, o un admin suspendía la cuenta a
mano. El strike es esa memoria intermedia — registra la reincidencia y dispara
la suspensión sola al tercero.

Vive en `seguridad` (dueño de FACT_STRIKE_USUARIO y del estado de cuenta) y lo
importa `social` al resolver una denuncia, para que la regla de los 3 strikes
exista en un solo sitio y no se duplique por cada punto de emisión.
"""

import random
from datetime import datetime, timezone

from core.database import execute, get_client, query_one
from paquetes.seguridad import audit

# Umbral de suspensión automática. Cuenta strikes ACTIVOS: un strike revocado
# (activo=0) deja de sumar, de modo que revocar una sanción injusta devuelve al
# usuario por debajo del umbral.
STRIKES_PARA_SUSPENSION = 3

_FACT_STRIKE_COLS = [
    "strike_id", "usuario_id", "motivo", "origen_tipo", "origen_id",
    "emitido_por", "activo", "created_at", "actualizado_en",
]

STRIKES_ACTIVOS_COUNT = """
SELECT count() AS n FROM (
    SELECT strike_id, argMax(activo, actualizado_en) AS vigente
    FROM FACT_STRIKE_USUARIO
    WHERE usuario_id = {usuario_id:String}
    GROUP BY strike_id
) WHERE vigente = 1
"""

STRIKES_DE_USUARIO = """
SELECT
    strike_id,
    argMax(motivo, actualizado_en)      AS motivo,
    argMax(origen_tipo, actualizado_en) AS origen_tipo,
    argMax(origen_id, actualizado_en)   AS origen_id,
    argMax(emitido_por, actualizado_en) AS emitido_por,
    argMax(activo, actualizado_en)      AS activo,
    min(created_at)                     AS created_at
FROM FACT_STRIKE_USUARIO
WHERE usuario_id = {usuario_id:String}
GROUP BY strike_id
ORDER BY created_at DESC
"""


# Listado global de strikes activos (panel de moderación, no por usuario).
# FACT_STRIKE_USUARIO es ReplacingMergeTree(actualizado_en): `activo` se
# resuelve con argMax por strike_id antes de filtrar, mismo criterio que
# STRIKES_ACTIVOS_COUNT — leer `activo` crudo podría mostrar un strike ya
# revocado si la parte aún no fusionó. El LEFT JOIN a DIM_USUARIO va sin
# resolver (mismo patrón que AUDIT_LOG_RECIENTES/ERRORES_RECIENTES en
# queries.py): es solo para mostrar nombre/email, no gobierna ninguna regla.
def strikes_activos_global_sql() -> str:
    return """
    SELECT
        s.strike_id   AS strike_id,
        s.usuario_id  AS usuario_id,
        u.nombre      AS usuario_nombre,
        u.email       AS usuario_email,
        s.motivo      AS motivo,
        s.origen_tipo AS origen_tipo,
        s.origen_id   AS origen_id,
        s.emitido_por AS emitido_por,
        s.created_at  AS created_at
    FROM (
        SELECT
            strike_id,
            argMax(usuario_id, actualizado_en)  AS usuario_id,
            argMax(motivo, actualizado_en)      AS motivo,
            argMax(origen_tipo, actualizado_en) AS origen_tipo,
            argMax(origen_id, actualizado_en)   AS origen_id,
            argMax(emitido_por, actualizado_en) AS emitido_por,
            argMax(activo, actualizado_en)      AS activo,
            min(created_at)                     AS created_at
        FROM FACT_STRIKE_USUARIO
        GROUP BY strike_id
    ) s
    LEFT JOIN DIM_USUARIO u ON u.usuario_id = s.usuario_id
    WHERE s.activo = 1
    ORDER BY s.created_at DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
    """

STRIKES_ACTIVOS_GLOBAL_COUNT = """
SELECT count() AS n FROM (
    SELECT argMax(activo, actualizado_en) AS activo
    FROM FACT_STRIKE_USUARIO
    GROUP BY strike_id
) WHERE activo = 1
"""


def _gen_strike_id() -> int:
    # 50 bits (no 63): Number.MAX_SAFE_INTEGER en el cliente. Mismo patrón que
    # el resto de generadores de fact_id del repo.
    return random.getrandbits(50)


def emitir(
    usuario_id: str,
    motivo: str,
    emitido_por: str,
    origen_tipo: str = "manual",
    origen_id: str = "",
) -> dict:
    """Emite un strike y aplica la regla de acumulación.

    Devuelve el strike emitido, cuántos strikes activos acumula el usuario y si
    la emisión disparó la suspensión automática de la cuenta.
    """
    strike_id = _gen_strike_id()
    ahora = datetime.now(timezone.utc)
    get_client().insert(
        "FACT_STRIKE_USUARIO",
        [(strike_id, usuario_id, motivo, origen_tipo, origen_id, emitido_por, 1, ahora, ahora)],
        column_names=_FACT_STRIKE_COLS,
    )
    audit.record(
        usuario_id=emitido_por, accion="emitir_strike",
        tabla_afectada="FACT_STRIKE_USUARIO", antes=None,
        despues={
            "strike_id": strike_id, "usuario_id": usuario_id,
            "motivo": motivo, "origen_tipo": origen_tipo, "origen_id": origen_id,
        },
    )

    activos = (query_one(STRIKES_ACTIVOS_COUNT, {"usuario_id": usuario_id}) or {}).get("n", 0)
    suspendido = False
    if activos >= STRIKES_PARA_SUSPENSION:
        suspendido = _suspender_por_acumulacion(usuario_id, emitido_por, activos)

    return {
        "strike_id": strike_id,
        "strikes_activos": activos,
        "cuenta_suspendida": suspendido,
    }


def _suspender_por_acumulacion(usuario_id: str, emitido_por: str, activos: int) -> bool:
    """Suspende la cuenta reutilizando el mecanismo de P0 (`estado_cuenta`), que
    `core.deps.get_current_user` ya hace cumplir en cada request autenticada.

    Se audita con una acción propia (`suspender_cuenta_automatica`) y no con la
    de la suspensión manual: en la auditoría importa poder distinguir lo que
    decidió un admin de lo que disparó la regla sola.
    """
    execute(
        "ALTER TABLE DIM_USUARIO UPDATE estado_cuenta = 'suspendido' "
        "WHERE usuario_id = {usuario_id:String}",
        {"usuario_id": usuario_id},
    )
    audit.record(
        usuario_id=emitido_por, accion="suspender_cuenta_automatica",
        tabla_afectada="DIM_USUARIO", antes=None,
        despues={
            "usuario_id": usuario_id, "estado_cuenta": "suspendido",
            "motivo": f"acumulación de {activos} strikes activos",
        },
    )
    return True
