"""Autorización de los 30 endpoints de informes compuestos (S13-P3a) —
reusa `require_rol_admin` de `seguridad` (change roles-gestion-usuarios),
mismo criterio que el resto de los endpoints /admin/* de cada capability.

Mapeo departamento -> rol administrativo más cercano (`DIM_ROL_ADMINISTRATIVO`
solo tiene 6 roles para 9 departamentos de negocio — Tecnología, Seguridad y
Producto no tienen un rol propio, se gatean con el más afín o `superadmin`):
- Comercial          -> admin_comercial (capabilities: suscripciones, partners)
- Tecnología         -> admin_datos (más afín: monitoreo de infraestructura/API,
                        no hay rol de "CTO" propio en el catálogo de 6 roles)
- Financiero         -> admin_finanzas (facturacion, finanzas, regalias, publicidad)
- Ingeniería de Datos -> admin_datos (gestion_datos, analitica)
- Analítica y BI     -> admin_datos (analitica)
- Contenido y A&R    -> admin_contenido (creadores, distribucion, catalogo)
- Comunidad y Soporte -> admin_comunidad (social, experiencia)
- Seguridad          -> superadmin (sin rol propio — auditoría/sanciones es
                        terreno de `seguridad` transversal, ya `superadmin`-only
                        en el resto de sus endpoints)
- Producto           -> admin_comunidad (recomendaciones/A-B/notificaciones
                        viven en `experiencia`/`social`, capabilities de ese rol)

`superadmin` siempre pasa (ver `require_rol_admin`), así que ninguna cuenta
con acceso total pierde acceso a ningún informe por este mapeo.
"""

from paquetes.seguridad.deps import require_admin, require_rol_admin

require_comercial   = require_rol_admin("admin_comercial")
require_tecnologia  = require_rol_admin("admin_datos")
require_financiero  = require_rol_admin("admin_finanzas")
require_datos       = require_rol_admin("admin_datos")
require_analitica   = require_rol_admin("admin_datos")
require_contenido   = require_rol_admin("admin_contenido")
require_comunidad   = require_rol_admin("admin_comunidad")
require_seguridad   = require_admin
require_producto    = require_rol_admin("admin_comunidad")
