## Why

La monetización de Tracklytics depende de la conversión freemium→premium (B2C) y de la venta de planes de suscripción analítica (B2B). Hoy no existe un flujo operativo que permita a un Usuario B2C o Cliente B2B suscribirse a un plan y obtener acceso a funciones extendidas según el tier contratado.

## What Changes

- Visualización de los planes disponibles (free/premium para B2C; básico/pro/enterprise para B2B) con descripción y precio.
- Selección de un plan y confirmación de la suscripción.
- Registro de la suscripción con tipo de plan, monto, moneda, fecha de inicio y estado inicial "activa".
- Consulta del plan activo actual del usuario o cliente autenticado.
- Cancelación de una suscripción activa, cambiando su estado a "cancelada".
- Al confirmar un nuevo plan, cancelación automática de la suscripción anterior activa (un único plan activo a la vez).
- Validación de método de pago válido antes de activar una suscripción de pago, sin procesar pagos reales (ver Fuera de alcance en la spec).

## Capabilities

### New Capabilities
- `suscripciones`: alta, consulta y cancelación de suscripciones a planes premium (B2C) y planes B2B por tier (básico/pro/enterprise), con registro auditable de monto y moneda.

### Modified Capabilities
(ninguna; no se modifican requisitos de capabilities existentes)

## Impact

- **Persistencia**: nueva entidad operativa de suscripción; el motor (PocketBase vs ClickHouse: FACT_SUSCRIPCION, DIM_PLAN_SUSCRIPCION, DIM_CLIENTE) se decide en design.md.
- **FastAPI**: nuevos endpoints de planes y suscripciones.
- **Dependencia**: requiere usuario autenticado vía la capability `catalogo`.
- **Frontend**: nueva vista de planes y gestión de suscripción dentro del perfil del usuario/cliente.
