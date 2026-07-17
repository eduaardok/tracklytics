from core.deps import get_current_user, require_b2c_user, verify_analytics_access
from paquetes.seguridad.deps import require_rol_admin

# Autorización administrativa segmentada (change roles-gestion-usuarios): la
# moderación operativa de `experiencia` (tickets de soporte, gestión de planes
# familiares, dashboard, sincronización de playlists) pertenece al área de
# comunidad. `superadmin` siempre pasa. Re-exportado para que
# experiencia/router.py tenga un único punto de import.
require_admin = require_rol_admin("admin_comunidad")

__all__ = ["get_current_user", "require_admin", "require_b2c_user", "verify_analytics_access"]
