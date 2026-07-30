import hashlib
import time
import uuid

import httpx

from core.config import PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, PB_URL

COLLECTION = "partners"


def hash_api_key(api_key: str) -> str:
    """SHA-256 hex de una API key (change p1-ciclos-vida). La key nunca se
    guarda en claro: se almacena su hash y la autenticación hashea la key
    recibida antes de comparar."""
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def generar_api_key() -> str:
    """Genera una API key aleatoria (32 hex) que cumple el formato aceptado por
    `deps._API_KEY_RE` (^[A-Za-z0-9_-]{16,128}$)."""
    return uuid.uuid4().hex

# Token de superusuario cacheado en memoria: la colección `partners` es
# admin-only (no hay sesión de "usuario partner" en PocketBase), así que
# FastAPI se autentica una sola vez y reutiliza el token mientras dure.
_admin_token: str | None = None
_admin_token_exp: float = 0.0
_ADMIN_TOKEN_TTL = 3600  # segundos


async def _get_admin_token() -> str:
    global _admin_token, _admin_token_exp
    if _admin_token and time.time() < _admin_token_exp:
        return _admin_token

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{PB_URL}/api/collections/_superusers/auth-with-password",
            json={"identity": PB_ADMIN_EMAIL, "password": PB_ADMIN_PASSWORD},
        )
    resp.raise_for_status()
    _admin_token = resp.json()["token"]
    _admin_token_exp = time.time() + _ADMIN_TOKEN_TTL
    return _admin_token


async def _records_get(params: dict) -> list[dict]:
    """GET a la colección `partners` con reintento único ante 401 (token de
    superusuario revocado/expirado antes de tiempo)."""
    token = await _get_admin_token()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params=params, headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code == 401:
        global _admin_token
        _admin_token = None
        token = await _get_admin_token()
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{PB_URL}/api/collections/{COLLECTION}/records",
                params=params, headers={"Authorization": f"Bearer {token}"},
            )
    resp.raise_for_status()
    return resp.json().get("items", [])


async def find_by_api_key(api_key: str) -> dict | None:
    """Busca un partner por su API key. La key se guarda como hash SHA-256
    (change p1-ciclos-vida): se hashea la key recibida y se busca por
    `api_key_hash`. Fallback a `api_key` en claro para los partners demo
    legados que aún no tienen hash. El llamador valida el formato de `api_key`
    antes de invocar esto (ver deps.py)."""
    key_hash = hash_api_key(api_key)
    items = await _records_get({"filter": f'api_key_hash="{key_hash}"', "page": 1, "perPage": 1})
    if items:
        return items[0]
    # Legacy: partners sembrados antes del change guardan la key en claro.
    items = await _records_get({"filter": f'api_key="{api_key}"', "page": 1, "perPage": 1})
    return items[0] if items else None


async def _records_write(method: str, path: str, json_body: dict | None = None) -> dict:
    """POST/PATCH a la colección `partners` con reintento único ante 401."""
    token = await _get_admin_token()
    url = f"{PB_URL}/api/collections/{COLLECTION}/{path}".rstrip("/")
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.request(method, url, json=json_body, headers={"Authorization": f"Bearer {token}"})
    if resp.status_code == 401:
        global _admin_token
        _admin_token = None
        token = await _get_admin_token()
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.request(method, url, json=json_body, headers={"Authorization": f"Bearer {token}"})
    resp.raise_for_status()
    return resp.json()


# Campos seguros para exponer en el listado admin — nunca la key ni su hash.
_SAFE_FIELDS = ("id", "nombre", "tier", "estado", "email_contacto", "fecha_expiracion", "created")


def _safe(record: dict) -> dict:
    return {k: record.get(k) for k in _SAFE_FIELDS}


async def crear_partner(nombre: str, tier: str, email_contacto: str, api_key: str) -> dict:
    """Crea un partner guardando SOLO el hash de la API key. El campo `api_key`
    (requerido por el esquema) recibe un placeholder no-recuperable — la key en
    claro nunca se persiste, solo se devuelve una vez al llamador."""
    record = await _records_write("POST", "records", {
        "nombre": nombre,
        "tier": tier,
        "email_contacto": email_contacto,
        "estado": "vigente",
        "api_key": f"managed-{uuid.uuid4().hex}",   # placeholder no-recuperable
        "api_key_hash": hash_api_key(api_key),
    })
    return _safe(record)


async def listar_partners() -> list[dict]:
    items = await _records_get({"page": 1, "perPage": 200, "sort": "-created"})
    return [_safe(it) for it in items]


async def get_partner(partner_id: str) -> dict | None:
    items = await _records_get({"filter": f'id="{partner_id}"', "page": 1, "perPage": 1})
    return items[0] if items else None


async def rotar_api_key(partner_id: str, api_key: str) -> dict:
    """Reemplaza el hash de la API key del partner (invalida la anterior)."""
    record = await _records_write("PATCH", f"records/{partner_id}", {"api_key_hash": hash_api_key(api_key)})
    return _safe(record)


async def desactivar_partner(partner_id: str) -> dict:
    record = await _records_write("PATCH", f"records/{partner_id}", {"estado": "inactivo"})
    return _safe(record)


async def actualizar_partner(partner_id: str, campos: dict) -> dict:
    """Editar partner (S13-P2): solo los campos reales del esquema de
    PocketBase (`_SAFE_FIELDS` menos `id`/`created`, que no se editan) —
    `notas`/`contacto` que pedía el enunciado original no existen en la
    colección `partners` y no se fabrican acá; el formulario del frontend solo
    ofrece nombre/tier/email_contacto/estado, que sí son reales."""
    record = await _records_write("PATCH", f"records/{partner_id}", campos)
    return _safe(record)


async def list_por_ids(ids: list[str]) -> dict[str, dict]:
    """Resuelve nombre/tier de un conjunto de partners por id de PocketBase,
    para enriquecer una agregación de `LOG_LLAMADAS_PARTNER` (que solo guarda
    `partner_id`, no el nombre). Pensado para conjuntos chicos (decenas de
    partners, no miles) — una sola llamada con filtro `id?=` en vez de N
    llamadas individuales."""
    if not ids:
        return {}

    token = await _get_admin_token()
    filtro = " || ".join(f'id="{pid}"' for pid in ids)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": len(ids)},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return {item["id"]: item for item in resp.json().get("items", [])}
