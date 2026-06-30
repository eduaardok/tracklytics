import time

from fastapi import Request

from core.database import get_client

# RF-PAR-004/CA-PAR-004: registro operativo de cada llamada a /partners/v1,
# exitosa o rechazada. Escribe directo a LOG_LLAMADAS_PARTNER (mismo patrón
# que FACT_ENGAGEMENT_USUARIO en biblioteca/router.py) — nunca bloquea la
# respuesta real al partner si el log falla.
_DEFAULT_LOG = {"resultado": "error", "tier": None, "partner_id": None}


async def partner_call_logger(request: Request, call_next):
    if not request.url.path.startswith("/partners/v1"):
        return await call_next(request)

    start = time.perf_counter()
    response = await call_next(request)
    duracion_ms = (time.perf_counter() - start) * 1000

    log = getattr(request.state, "partner_log", None) or _DEFAULT_LOG
    registros = getattr(request.state, "registros", 0)
    api_key_used = getattr(request.state, "api_key_used", "") or ""

    try:
        get_client().insert(
            "LOG_LLAMADAS_PARTNER",
            [(
                log["partner_id"] or "",
                api_key_used,
                request.url.path,
                log["tier"] or "",
                log["resultado"],
                registros,
                duracion_ms,
            )],
            column_names=[
                "partner_id", "api_key_used", "endpoint",
                "tier_usado", "resultado", "registros", "duracion_ms",
            ],
        )
    except Exception:
        pass

    return response
