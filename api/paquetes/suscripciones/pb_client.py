import time
from datetime import datetime

import httpx

from core.config import PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, PB_URL

COLLECTION = "suscripciones"


async def list_activas(token: str, user_id: str) -> list[dict]:
    # `pago_pendiente` (dunning, CU-O95) SHALL contar como "vigente" acá, no
    # solo `activa` — es la suscripción que `GET /activa` debe seguir
    # devolviendo mientras el usuario reintenta el cobro (para que el
    # frontend muestre el banner de dunning en vez de "sin plan activo"), y
    # la que `require_b2b_panel_access` debe seguir aceptando: el acceso
    # continúa durante los reintentos, solo se corta al agotar
    # MAX_INTENTOS_COBRO y degradar (bug real encontrado en verificación:
    # antes de este fix, `estado="pago_pendiente"` hacía que esta función no
    # devolviera nada, dejando al usuario sin plan visible ni acceso B2B
    # desde el primer cobro fallido, no solo al agotar los 3 intentos).
    filtro = f'usuario_o_cliente="{user_id}" && (estado="activa" || estado="pago_pendiente")'
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 10},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json().get("items", [])


async def obtener_por_id(token: str, user_id: str, record_id: str) -> dict | None:
    """Busca una suscripción del usuario por id, sin filtrar por `estado`
    (a diferencia de `list_activas`) — necesario para dunning (CU-O95): una
    suscripción en `pago_pendiente` debe poder reintentar el cobro, y
    `list_activas` no la encontraría."""
    filtro = f'usuario_o_cliente="{user_id}" && id="{record_id}"'
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 1},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return items[0] if items else None


async def crear(
    token: str, user_id: str, tipo_plan: str, monto: float, moneda: str,
    en_prueba: bool = False, fecha_fin_trial: datetime | None = None,
    metodo_pago_id: str | None = None,
) -> dict:
    """`en_prueba`/`fecha_fin_trial`/`metodo_pago_id` (monetizacion-retencion-
    mejoras): soportan el período de prueba gratuito — `metodo_pago_id` se
    guarda para poder cobrar automáticamente al expirar el trial sin volver a
    pedirlo (ver design.md, decisión 6)."""
    body = {
        "usuario_o_cliente": user_id,
        "tipo_plan": tipo_plan,
        "monto": monto,
        "moneda": moneda,
        "estado": "activa",
        "en_prueba": en_prueba,
    }
    if fecha_fin_trial is not None:
        body["fecha_fin_trial"] = fecha_fin_trial.isoformat(sep=" ")
    if metodo_pago_id is not None:
        body["metodo_pago_id"] = metodo_pago_id

    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def cancelar(token: str, record_id: str) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.patch(
            f"{PB_URL}/api/collections/{COLLECTION}/records/{record_id}",
            json={"estado": "cancelada"},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def actualizar_campos(token: str, record_id: str, campos: dict) -> dict:
    """PATCH genérico sobre una suscripción — usado por cambio de plan
    (modelo-financiero-completar-huecos, CU-O94: actualiza `tipo_plan`/
    `monto`/`moneda` in-place, conservando `created`) y por dunning (CU-O95:
    `estado`/`intentos_fallidos`), en vez de cancelar+crear un registro
    nuevo (design.md, decisión 1)."""
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.patch(
            f"{PB_URL}/api/collections/{COLLECTION}/records/{record_id}",
            json=campos,
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def marcar_trial_cobrado(token: str, record_id: str) -> dict:
    """Al expirar el trial y cobrarse exitosamente (ver design.md, decisión
    6) — apaga `en_prueba` sin tocar `estado` (sigue "activa")."""
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.patch(
            f"{PB_URL}/api/collections/{COLLECTION}/records/{record_id}",
            json={"en_prueba": False},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def list_historial_por_plan(token: str, user_id: str, tipo_plan: str) -> list[dict]:
    """Todas las suscripciones históricas del usuario para un plan dado,
    cualquier `estado` (el registro nunca se borra, ver design.md original de
    `suscripciones`) — usado para determinar elegibilidad de trial ("primera
    vez", monotizacion-retencion-mejoras)."""
    filtro = f'usuario_o_cliente="{user_id}" && tipo_plan="{tipo_plan}"'
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 1},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json().get("items", [])


# ── Acceso admin de solo lectura (analitica: churn, funnel de conversión) ──
# Mismo patrón de token de superusuario cacheado que `paquetes.partners.
# pb_client` — la colección `suscripciones` tiene `listRule` restringido al
# propio dueño del registro (`usuario_o_cliente = @request.auth.id`), así que
# una consulta agregada cross-usuario (ej. "cuántas suscripciones de pago se
# crearon antes de tal fecha") no es posible con el token de un usuario
# normal, ni siquiera admin — necesita el superusuario de PocketBase.
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


async def list_activas_admin(user_id: str) -> list[dict]:
    """Como `list_activas` pero con el token de superusuario, para que un
    `superadmin` pueda ver la suscripción vigente de OTRO usuario en la vista
    360° de gestión de usuarios (change roles-gestion-usuarios) — el token del
    propio usuario objetivo no está disponible en una sesión administrativa."""
    token = await _get_admin_token()
    filtro = f'usuario_o_cliente="{user_id}" && (estado="activa" || estado="pago_pendiente")'
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 10},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json().get("items", [])


async def _admin_count(filtro: str) -> int:
    token = await _get_admin_token()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 1},
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code == 401:
        global _admin_token
        _admin_token = None
        token = await _get_admin_token()
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{PB_URL}/api/collections/{COLLECTION}/records",
                params={"filter": filtro, "page": 1, "perPage": 1},
                headers={"Authorization": f"Bearer {token}"},
            )
    resp.raise_for_status()
    return resp.json().get("totalItems", 0)


def _filtro_tipos_plan(tipos_plan: tuple[str, ...]) -> str:
    return "(" + " || ".join(f'tipo_plan="{t}"' for t in tipos_plan) + ")"


async def contar_altas_antes_de(fecha: datetime, tipos_plan: tuple[str, ...]) -> int:
    """Cuenta suscripciones (cualquier estado) creadas antes de `fecha` para
    alguno de `tipos_plan` — usado como aproximación de "activas al inicio
    del período" en churn (ver design.md, decisión 5)."""
    filtro = f'created < "{fecha.isoformat(sep=" ")}" && {_filtro_tipos_plan(tipos_plan)}'
    return await _admin_count(filtro)


async def contar_altas_en_rango(desde: datetime, hasta: datetime, tipos_plan: tuple[str, ...]) -> int:
    """Cuenta suscripciones (cualquier estado) creadas en [desde, hasta) para
    alguno de `tipos_plan` — usado por el funnel de conversión."""
    filtro = (
        f'created >= "{desde.isoformat(sep=" ")}" && created < "{hasta.isoformat(sep=" ")}" '
        f'&& {_filtro_tipos_plan(tipos_plan)}'
    )
    return await _admin_count(filtro)


async def contar_activas(tipo_plan: str) -> int:
    """Cuenta suscripciones actualmente activas de un plan dado — usado como
    denominador de usuarios free activos en el funnel de conversión."""
    return await _admin_count(f'estado="activa" && tipo_plan="{tipo_plan}"')


async def contar_pago_pendiente() -> int:
    """Suscripciones en dunning (CU-O95, modelo-financiero-completar-huecos)
    — usado por la alerta financiera "cobro pendiente de resolución"
    (CU-O89, `finanzas`)."""
    return await _admin_count('estado="pago_pendiente"')


async def sumar_montos_activos(tipos_plan: tuple[str, ...]) -> float:
    """Suma `monto` de todas las suscripciones activas de alguno de
    `tipos_plan` — usado para MRR (modelo-financiero-simulacion). La API de
    listado de PocketBase no agrega server-side, así que se pagina trayendo
    solo el campo `monto` (volumen esperado: cientos de suscripciones, no
    miles — una sola página de 500 alcanza para el alcance de este
    proyecto)."""
    token = await _get_admin_token()
    filtro = f'estado="activa" && {_filtro_tipos_plan(tipos_plan)}'
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 500, "fields": "monto"},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return sum(float(i.get("monto") or 0) for i in items)
