## Why

Auditoría real del manejo de dinero (`facturacion`, `regalias`, `publicidad`, `suscripciones`,
`finanzas`) confirma que el modelo financiero de Tracklytics ya cubre trial, IVA en invoices,
pool de regalías 70/30 con split 80/20, retiros con aprobación, campañas con pausa automática por
presupuesto, y un panel de finanzas consolidado — pero le faltan 4 piezas que un negocio real tipo
Spotify sí tiene: cambio de plan, manejo real de cobro fallido (dunning), retención fiscal a
rightsholders, y configuración de país/moneda/IVA/checkout sin tocar código. Hoy: no existe upgrade/
downgrade de plan sin cancelar y perder continuidad; un cobro fallido en la renovación cancela de
inmediato sin ningún reintento ni aviso; `regalias` paga el 100% del monto calculado sin ningún
concepto de retención; y precios/IVA/moneda están hardcodeados en Python (`planes.py`,
`facturacion/queries.py`), con `DIM_PAIS` como catálogo cerrado sin moneda ni tasa de cambio ni CRUD
admin.

## What Changes

- **Cambio de plan con prorrateo** (`suscripciones`): nuevo endpoint para mover una suscripción
  activa de un `tipo_plan` a otro sin cancelarla, con ajuste prorrateado (crédito o cobro
  diferencial) registrado como una transacción propia.
- **Dunning real** (`suscripciones` + DAG `facturacion_recurrente`): un cobro fallido pasa a un
  estado intermedio (`pago_pendiente`) con reintentos contables (hasta 3), visible para el usuario
  y en las alertas de `finanzas` (CU-O89); solo tras agotar los reintentos se degrada (B2C → free,
  B2B → cancelada).
- **Retención fiscal en regalías**: `FACT_LIQUIDACION_REGALIA` gana monto bruto/retenido/neto,
  resuelto por país del rightsholder (override) o una tasa global de plataforma (fallback),
  visible en "Mis ganancias" y en la liquidación admin.
- **País como configuración real** (`distribucion`, dueño de `DIM_PAIS`): moneda, tasa de cambio
  congelada, IVA propio y retención fiscal propia por país, con CRUD admin (antes solo lectura).
- **Precios de plan configurables** (`suscripciones`): tabla `DIM_PLAN` editable por admin,
  desacoplada del `_TIER_RANK` de acceso por tier (`analitica`) que sigue fijo en código.
- **IVA global + override por país** (`facturacion`): reemplaza la constante `IVA_RATE` fija por
  una tasa global editable (`DIM_EMPRESA`) con override opcional por país.
- **Checkout más realista** (`facturacion`): captura número de tarjeta simulado y expiración
  (truncados/descartados tras validar, nunca persistidos completos) y conversión de precio a la
  moneda del país del usuario.
- **Factura "enviada por correo" simulada** (`facturacion`): registro visible de notificación de
  invoice, sin integrar un proveedor de email real.

## Capabilities

### New Capabilities
(ninguna — extiende `suscripciones`, `facturacion`, `regalias` y `distribucion`)

### Modified Capabilities
- `suscripciones`: nuevo CU de cambio de plan con prorrateo (CU-O94), nuevo CU de dunning/cobro
  fallido (CU-O95), precios de plan configurables (CU-O98).
- `regalias`: nuevo CU de retención fiscal en liquidación (CU-O96).
- `distribucion`: nuevo CU de configuración de país (moneda/tasa/IVA/retención) (CU-O97).
- `facturacion`: nuevo CU de checkout realista + notificación de factura simulada (CU-O99); IVA
  pasa de constante fija a configurable con override por país.

## Impact

- **Backend**: `api/paquetes/suscripciones/{router.py,pb_client.py}` (endpoint de cambio de plan,
  dunning), `etl/gold/facturacion_recurrente.py` (dunning en el DAG), `api/paquetes/regalias/
  {router.py,queries.py}` (retención en liquidación), `api/paquetes/distribucion/{router.py,
  queries.py}` (CRUD de país extendido), `api/paquetes/facturacion/{router.py,queries.py}` (IVA
  configurable, checkout, notificación simulada), `init_clickhouse.py` (columnas nuevas en
  `DIM_PAIS`/`DIM_EMPRESA`/`FACT_LIQUIDACION_REGALIA`/`FACT_TRANSACCION_PAGO`, tabla nueva
  `DIM_PLAN`, tabla nueva de notificaciones de email), `pb_init.py` (campo `intentos_fallidos` en
  `suscripciones`).
- **Frontend**: `PlanesPage.tsx` (cambio de plan, precio convertido a moneda local),
  `FacturacionPage.tsx` (checkout con tarjeta/expiración, notificaciones de factura), nueva pantalla
  de configuración global (países/precios/IVA) en un área admin existente.
- **Sin cambios**: gating por tier B2B (`_TIER_RANK`/`require_tier`), modelo de pool de regalías
  70/30 ni split master/publishing 80/20, integraciones reales de forex/email (siguen simuladas).
