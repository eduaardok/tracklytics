import re
import time
from datetime import date, datetime

from fastapi import HTTPException, Request

from paquetes.partners import pb_client

# Formato esperado de una API key (alfanumérico + guiones/guiones bajos).
# Se valida ANTES de usar el valor en un filtro de PocketBase: el header lo
# controla un llamador externo no autenticado, así que esto cierra cualquier
# intento de inyección en el filtro sin depender de un escaping manual frágil.
_API_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{16,128}$")

TIER_RANK = {"basico": 1, "pro": 2, "enterprise": 3}

# Caché TTL de resolución partner/tier por api_key (Decisions: "para evitar
# una consulta repetida al directorio de partners en cada llamada"). No se
# reutiliza core/cache.py porque ese decorador envuelve funciones síncronas;
# la resolución acá requiere un await a PocketBase.
_CACHE_TTL = 30  # segundos — corto a propósito (ver Risks: llave revocada)
_partner_cache: dict[str, tuple[dict | None, float]] = {}


def _cache_get(api_key: str):
    entry = _partner_cache.get(api_key)
    if not entry:
        return None, False
    partner, ts = entry
    if time.time() - ts > _CACHE_TTL:
        return None, False
    return partner, True


def _cache_set(api_key: str, partner: dict | None) -> None:
    _partner_cache[api_key] = (partner, time.time())


def _is_vigente(record: dict) -> bool:
    if record.get("estado") != "vigente":
        return False
    fecha_exp = record.get("fecha_expiracion")
    if fecha_exp:
        try:
            exp = datetime.fromisoformat(fecha_exp.replace("Z", "+00:00")).date()
        except ValueError:
            return False
        if exp < date.today():
            return False
    return True


async def _resolve(api_key: str) -> dict | None:
    cached, hit = _cache_get(api_key)
    if hit:
        return cached
    record = await pb_client.find_by_api_key(api_key)
    partner = record if (record and _is_vigente(record)) else None
    _cache_set(api_key, partner)
    return partner


def require_partner(min_tier: str = "basico"):
    """Dependencia de autorización por tier (RF-PAR-003/RN-PAR-002): cada
    endpoint declara su tier mínimo; esta dependencia valida la API key
    (RF-PAR-001/RN-PAR-001) y luego compara el tier del partner contra el
    requerido, antes de que el handler ejecute cualquier consulta."""

    async def _dep(request: Request) -> dict:
        # RNF-PAR-002: la llave de API solo se acepta por header. Cualquier
        # intento de enviarla por query string se rechaza explícitamente,
        # incluso si el header también está presente.
        for qp in ("api_key", "apikey", "key", "X-API-Key"):
            if qp in request.query_params:
                request.state.partner_log = {"resultado": "auth_rejected", "tier": None, "partner_id": None}
                raise HTTPException(
                    status_code=400,
                    detail="La llave de API debe enviarse por header (X-API-Key), no por query string",
                )

        api_key = request.headers.get("X-API-Key", "")
        request.state.api_key_used = api_key

        def _reject_auth():
            request.state.partner_log = {"resultado": "auth_rejected", "tier": None, "partner_id": None}
            # RN-PAR-001: error genérico, sin distinguir si no existe, expiró
            # o el partner está inactivo.
            raise HTTPException(status_code=401, detail="Llave de API inválida o expirada")

        if not api_key or not _API_KEY_RE.match(api_key):
            _reject_auth()

        partner = await _resolve(api_key)
        if not partner:
            _reject_auth()

        partner_tier = partner.get("tier", "")
        if TIER_RANK.get(partner_tier, 0) < TIER_RANK.get(min_tier, 0):
            request.state.partner_log = {
                "resultado": "tier_rejected", "tier": partner_tier, "partner_id": partner["id"],
            }
            raise HTTPException(
                status_code=403,
                detail=f"Este endpoint requiere tier '{min_tier}' o superior (tier actual: '{partner_tier}')",
            )

        request.state.partner_log = {
            "resultado": "success", "tier": partner_tier, "partner_id": partner["id"],
        }
        return partner

    return _dep
