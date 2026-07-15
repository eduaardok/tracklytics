from paquetes.analitica.deps import require_staff  # reutilizado, no se duplica
from paquetes.seguridad.deps import require_admin  # reutilizado, no se duplica

# Re-exportado para que paquetes/finanzas/router.py tenga un único punto de
# import de dependencias propias de esta capability, mismo precedente que
# `paquetes/facturacion/deps.py`.
#
# Decisión de diseño (tasks.md 1.4): `require_staff` vive hoy en
# `analitica/deps.py`, no en `seguridad/deps.py` (ver design.md, Context).
# Todos los requirements de `finanzas` (spec.md) son exclusivos de
# `role=admin` — funcionalmente `require_admin` (seguridad) y `require_staff`
# (analitica) son equivalentes (ambos exigen `role == "admin"`), así que los
# endpoints de este router usan `require_admin` como el resto de capabilities
# administrativas del proyecto (facturacion, regalias, publicidad). Se
# importa y reexporta `require_staff` en vez de reimplementarlo, únicamente
# para dejar disponible el mismo punto de entrada que usa `analitica` si en
# el futuro un endpoint de `finanzas` necesita ese gating específico en vez
# de `require_admin`.
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
