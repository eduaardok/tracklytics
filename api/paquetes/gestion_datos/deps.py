from paquetes.seguridad.deps import require_rol_admin

# Autorización administrativa segmentada (change roles-gestion-usuarios): toda
# la capability de gestión de datos / ingesta es competencia del Lead Data
# Engineer, mapeado al rol administrativo `admin_datos`. `superadmin` siempre
# pasa, así que el `admin` monolítico previo (mapeado a superadmin) conserva
# acceso. Antes exigía `role == "admin"` directo; ahora delega en el catálogo
# de roles por área.
require_lead_data_engineer = require_rol_admin("admin_datos")
