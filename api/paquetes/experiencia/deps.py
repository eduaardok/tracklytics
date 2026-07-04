from core.deps import get_current_user, require_b2c_user, verify_analytics_access
from paquetes.seguridad.deps import require_admin

# Re-exportado para que paquetes/experiencia/router.py tenga un único punto de
# import de dependencias propias de esta capability (mismo patrón que
# paquetes/facturacion/deps.py) — no se define ningún mecanismo de
# autorización nuevo (tasks.md 2.1).
__all__ = ["get_current_user", "require_admin", "require_b2c_user", "verify_analytics_access"]
