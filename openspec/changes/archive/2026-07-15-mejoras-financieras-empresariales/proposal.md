## Why

Tracklytics ya reporta ingresos, regalías y churn (`analitica`), pero el Lead Data
Engineer / CTO no tiene forma de ver el costo operativo de la plataforma, de
procesar un reembolso, de saber qué facturas o regalías están pendientes de cobro/pago,
ni de controlar cuándo una campaña publicitaria agota su presupuesto. Sin esto, el
panel financiero es solo ingresos brutos: no hay utilidad real, no hay control de gasto
publicitario, y no hay visibilidad de obligaciones pendientes. Se necesita ahora porque
`publicidad`, `facturacion` y `regalias` ya generan suficiente dato transaccional real
para calcular estas métricas sin inventar fuentes nuevas.

## What Changes

- Nuevo paquete `finanzas` (`api/paquetes/finanzas/`) con CRUD de gastos operativos
  (`FACT_GASTO_OPERATIVO`), soft-delete únicamente, excluidos de todo cálculo aguas
  abajo cuando están anulados.
- Nuevo flujo de reembolsos vinculado a `FACT_TRANSACCION_PAGO`: tabla
  `FACT_REEMBOLSO`, validación de monto disponible (pagado − reembolsado previo),
  bloqueo de reembolso sobre transacciones `fallida`/`cancelada`, historial
  inmutable (rechazo/cancelación se marca, nunca se borra).
- Nuevo endpoint agregado de cuentas por cobrar y por pagar, calculado on-read sobre
  `FACT_INVOICE`, `FACT_LIQUIDACION_REGALIA` y `FACT_RETIRO_REGALIA` — sin tabla de
  estado nueva.
- Tracking de consumo de presupuesto por campaña publicitaria: endpoint que agrega
  `FACT_INGRESO_PUBLICITARIO` por `campana_id` on-read (sin nueva columna materializada),
  con alertas de 80%/100% y pausa automática (`activa=0`) al agotar presupuesto.
- Dashboard financiero consolidado (`GET /finanzas/dashboard`) que compone `v1_pnl`
  existente con gastos operativos y reembolsos para calcular utilidad y margen reales,
  con comparación entre dos periodos.
- Indicadores empresariales nuevos (ARPU, regalías/gastos como % de ingreso, ingreso
  promedio por anunciante, crecimiento vs. periodo anterior) que reutilizan MRR/ARR/churn
  ya existentes en `analitica`.
- Alertas financieras administrativas calculadas on-read (sin tabla nueva), visibles
  solo en panel admin.
- Reporte financiero consolidado por periodo (`GET /finanzas/reporte`); exportación
  PDF/Excel queda fuera del alcance crítico de este change (tarea opcional).
- Auditoría (`audit.record`) en cada mutación: crear/anular gasto, procesar/rechazar
  reembolso.

## Capabilities

### New Capabilities
- `finanzas`: gastos operativos, reembolsos, cuentas por cobrar/pagar, dashboard
  financiero consolidado, indicadores empresariales derivados, alertas financieras
  administrativas, reporte financiero por periodo, tracking de consumo de presupuesto
  publicitario y su ciclo de alerta/pausa automática.

### Modified Capabilities
- `publicidad`: `DIM_CAMPANA_PUBLICITARIA.activa` ahora también se apaga
  automáticamente al agotar `presupuesto_total` (regla nueva sobre un campo existente,
  no solo edición manual del anunciante/admin).

## Impact

- Backend: nuevo paquete `api/paquetes/finanzas/` (`__init__.py`, `deps.py`,
  `queries.py`, `router.py`), registrado en `api/main.py`.
- Schema: nuevas tablas `FACT_GASTO_OPERATIVO` y `FACT_REEMBOLSO` en
  `init_clickhouse.py`. Sin cambios de columnas en tablas existentes.
- `publicidad/router.py`: hook en el flujo de registro de ingreso publicitario
  (o job de verificación) para evaluar consumo de presupuesto y aplicar
  alerta/pausa.
- `analitica`: sin cambios de código, solo se compone `v1_pnl` desde `finanzas`.
- Frontend: nuevo panel de finanzas dentro del área admin (estilo Impeccable),
  fuera del alcance de este proposal si no hay tiempo — el foco crítico es la API.
