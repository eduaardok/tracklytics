## Why

El modelo de dinero de Tracklytics ya cubre el flujo mínimo (suscripciones, publicidad, regalías),
pero tiene tres huecos que impiden demostrarlo como un negocio real: la liquidación de regalías
puede duplicarse si se dispara dos veces sobre el mismo período, una renovación de suscripción
fallida deja al usuario con acceso pagado indefinido sin haber cobrado, no existe ningún flujo de
retiro para que un artista o sello cobre lo que ya ganó, y no hay ninguna métrica de MRR/ARR — el
indicador más básico de salud de un negocio de suscripción. Además, evidenciar ese flujo de dinero
hoy exige reproducir canciones y crear suscripciones a mano una por una, lo que hace impráctico
demostrar ingresos a escala real.

## What Changes

- **Regalías — liquidación idempotente**: `POST /regalias/admin/liquidar` y el DAG semanal
  `finanzas_periodicas` dejan de poder duplicar una liquidación sobre el mismo rango de fechas.
- **Facturación — la renovación automática queda documentada, y una renovación fallida cierra el
  ciclo**: la renovación periódica de suscripciones de pago (ya implementada en el DAG semanal,
  pero nunca especificada) pasa a tener un requirement propio; si el cobro automático de una
  renovación falla, la suscripción se cancela de inmediato y queda registrada como churn
  involuntario, en vez de quedar "activa" sin haber cobrado.
- **Regalías — retiro de ganancias**: artista o sello pueden solicitar el retiro de su saldo
  disponible (ganancias liquidadas menos retiros ya procesados); un administrador lo procesa
  (simulado, sin pasarela bancaria real, mismo criterio que el resto del proyecto).
- **Analítica — MRR/ARR**: nuevo panel con el ingreso mensual recurrente actual y su proyección
  anual, con tendencia histórica.
- **Simulación de actividad de negocio** (capability nueva): panel administrativo que genera, en
  una sola acción, reproducciones, nuevas suscripciones y visualizaciones publicitarias de forma
  conjunta y liquida las regalías del período resultante — para poder demostrar el flujo de dinero
  completo (streams → ingreso → reparto) sin operar la aplicación manualmente a gran escala.

## Capabilities

### New Capabilities
- `simulacion`: panel administrativo para generar actividad de negocio simulada (streams,
  suscripciones, impresiones publicitarias) de forma conjunta y disparar la liquidación de
  regalías correspondiente, con fines de prueba y demostración del flujo de dinero de la
  plataforma.

### Modified Capabilities
- `regalias`: la liquidación de un período ya liquidado deja de generar filas duplicadas; nuevo
  requirement de solicitud y procesamiento de retiro de ganancias para artista/sello.
- `facturacion`: nuevo requirement de renovación automática de suscripción, incluyendo qué pasa
  cuando el cobro falla (cancela y registra el motivo, igual que ya ocurre cuando falla el cobro
  al expirar un período de prueba en `suscripciones`).
- `analitica`: nuevo requirement de MRR/ARR con tendencia histórica.

## Impact

- **Backend**: `api/paquetes/regalias` (router, queries, nueva tabla `FACT_RETIRO_REGALIA`),
  `etl/gold/regalias_liquidacion.py` (idempotencia), `etl/gold/facturacion_recurrente.py`
  (cancelación en cobro fallido), `api/paquetes/analitica` (router, queries), paquete nuevo
  `api/paquetes/simulacion`.
- **Frontend**: `frontend/src/packages/regalias` (flujo de retiro para artista/sello y panel admin
  de aprobación), `frontend/src/packages/analitica` (dashboard MRR/ARR), paquete nuevo
  `frontend/src/packages/simulacion` (panel admin-only).
- **Dependencias reutilizadas sin cambio de contrato**: `facturacion` (tasa de éxito simulada,
  IVA), `publicidad` (campañas elegibles para impresiones simuladas), mecanismo de token
  superusuario de PocketBase ya usado por `suscripciones/pb_client.py` para churn/funnel (se
  reutiliza para MRR).
