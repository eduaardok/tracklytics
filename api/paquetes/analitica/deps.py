from fastapi import Depends, HTTPException

from core.deps import get_current_user
from paquetes.seguridad.deps import roles_admin_vigentes
from paquetes.suscripciones import pb_client

# Escalera de acceso B2B (b2b-tier-access-analitica): cada tier paga más y
# gana acceso a más paneles — ver design.md, decisión 1, por qué esto es un
# dict estático en código y no una tabla asignable en runtime (a diferencia
# de los permisos granulares de `seguridad`, CU-O17).
_TIER_RANK: dict[str, int] = {"basico": 0, "pro": 1, "enterprise": 2}


def _es_staff_interno(user: dict) -> bool:
    """Staff interno = `record.role == "admin"` en PocketBase, IGUAL que el
    auto-backfill de `require_rol_admin` (paquetes/seguridad/deps.py), MÁS el
    mismo fallback a `superadmin` vigente en `BRIDGE_USUARIO_ROL_ADMIN` que
    usa esa dependencia. Antes de este fix, este módulo solo miraba
    `record.role`, sin ese fallback — una cuenta que ya es `superadmin` por
    BRIDGE (ej. asignada por otro superadmin, o cuyo campo `role` de
    PocketBase quedó desincronizado por cualquier motivo posterior a la
    creación) pasaba `require_rol_admin` en cualquier otra capability pero
    caía en 403 acá ("Los paneles analíticos son exclusivos de Cliente B2B"),
    una inconsistencia real detectada en verificación S14 contra el stack
    vivo (la cuenta `superadmin@demo.tracklytics.com` de S14-P4 tiene fila
    `superadmin` en BRIDGE_USUARIO_ROL_ADMIN pero `record.role == "user"`)."""
    role = user.get("record", {}).get("role", "")
    if role == "admin":
        return True
    usuario_id = user.get("record", {}).get("id", "")
    return bool(usuario_id) and "superadmin" in roles_admin_vigentes(usuario_id)


async def require_b2b_panel_access(user: dict = Depends(get_current_user)) -> dict:
    """Gating para los paneles analíticos B2B (RN-ANA-003 / CA-ANA-003).

    Staff interno (role=admin, Data Analyst/BI Lead, o superadmin vigente por
    BRIDGE_USUARIO_ROL_ADMIN — ver `_es_staff_interno`) accede sin
    suscripción, con tier "enterprise" implícito (ya bypassaba todo, esto
    evita una rama especial en `require_tier`). Cliente B2B (role=analyst)
    requiere una suscripción activa, verificada contra PocketBase vía la
    capability `suscripciones` (no se redefine su lógica, solo se reutiliza
    pb_client.list_activas); el `tipo_plan` de esa suscripción viaja junto al
    `user` como `tier`, para que `require_tier` lo compare sin un round-trip
    adicional a PocketBase (FastAPI cachea esta dependencia dentro del mismo
    request).
    """
    if _es_staff_interno(user):
        return {**user, "tier": "enterprise"}

    role = user.get("record", {}).get("role", "")
    if role != "analyst":
        raise HTTPException(
            status_code=403,
            detail="Los paneles analíticos son exclusivos de Cliente B2B",
        )

    token = user["token"]
    user_id = user["record"]["id"]
    activas = await pb_client.list_activas(token, user_id)
    if not activas:
        raise HTTPException(
            status_code=403,
            detail="Se requiere una suscripción activa para acceder a los paneles analíticos",
        )
    return {**user, "tier": activas[0].get("tipo_plan", "basico")}


def require_tier(minimo: str):
    """Factory de dependency: exige un tier B2B mínimo (b2b-tier-access-analitica).

    `minimo` SHALL ser una clave de `_TIER_RANK`. El 403 devuelve un `detail`
    estructurado (no solo texto) para que el frontend arme el estado
    "disponible desde el plan X" sin adivinar por mensaje (design.md, decisión 4)."""
    async def _dependency(user: dict = Depends(require_b2b_panel_access)) -> dict:
        tier = user.get("tier", "basico")
        if _TIER_RANK.get(tier, 0) < _TIER_RANK[minimo]:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "tier_insuficiente",
                    "tier_requerido": minimo,
                    "tier_actual": tier,
                    "mensaje": f"Este panel está disponible desde el plan {minimo.capitalize()}",
                },
            )
        return user

    return _dependency


def require_staff(user: dict = Depends(get_current_user)) -> dict:
    """Gating para el reporte diario operativo (CU-O16): exclusivo de
    Data Analyst/BI Lead / superadmin (ver `_es_staff_interno`), no de
    Cliente B2B."""
    if not _es_staff_interno(user):
        raise HTTPException(
            status_code=403,
            detail="El reporte diario operativo es exclusivo de Data Analyst/BI Lead",
        )
    return user
