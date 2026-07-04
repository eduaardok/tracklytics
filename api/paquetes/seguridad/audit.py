import json

from core.database import get_client

# Helper de escritura a FACT_AUDIT_LOG (design.md, decisión "FACT_AUDIT_LOG y
# FACT_ERROR_SISTEMA son append-only puro"). Reutilizable por otras
# capabilities en el futuro; hoy solo se llama desde dentro de `seguridad`
# (Non-Goal: no se instrumenta retroactivamente en otros paquetes).


def record(usuario_id: str, accion: str, tabla_afectada: str, antes: dict | None, despues: dict | None) -> None:
    get_client().insert(
        "FACT_AUDIT_LOG",
        [(
            usuario_id,
            accion,
            tabla_afectada,
            json.dumps(antes or {}, default=str),
            json.dumps(despues or {}, default=str),
        )],
        column_names=["usuario_id", "accion", "tabla_afectada", "antes", "despues"],
    )
