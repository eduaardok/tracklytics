from paquetes.analitica.deps import require_staff  # reutilizado, no se duplica
from paquetes.seguridad.deps import require_rol_admin

# Autorización administrativa segmentada (change roles-gestion-usuarios): todos
# los requirements de `finanzas` (gastos, reembolsos, cuentas por cobrar/pagar,
# presupuesto de campañas, dashboard) pertenecen al área financiera. Antes
# usaban el `require_admin` monolítico; ahora exigen el rol `admin_finanzas`.
# `superadmin` siempre pasa, así que las cuentas admin previas no pierden
# acceso. Se conserva `require_staff` reexportado (hoy sin uso en este router)
# para no romper su punto de entrada, ver design.md Context.
require_admin = require_rol_admin("admin_finanzas")

__all__ = ["require_admin", "require_staff"]

# Umbral de reembolso elevado (design.md, Decisión 7): monto fijo en vez de
# percentil histórico — no hay volumen histórico suficiente en un dataset
# académico para que un percentil sea significativo.
REEMBOLSO_MONTO_ALTO_USD = 500

# N días para "regalías pendientes de retiro" (design.md, Decisión 8): se
# alinea con el ciclo de liquidación mensual ya implícito en
# FACT_LIQUIDACION_REGALIA.periodo_inicio/periodo_fin. También se usa como
# ventana de aging por defecto para facturas pendientes en cuentas por cobrar.
DIAS_REGALIAS_PENDIENTES = 30
