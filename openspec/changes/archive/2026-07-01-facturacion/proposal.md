## Why

Hoy `suscripciones` registra la intención de compra (plan, monto, moneda, estado) pero explícitamente deja fuera de alcance el cobro y la facturación ("Facturación y generación de comprobantes fiscales" figura en su sección "Fuera de alcance"). No existe ninguna capability que registre un método de pago, simule el resultado de un cobro asociado a una suscripción, ni emita un comprobante (invoice) — piezas necesarias para que el modelo de negocio de monetización B2C/B2B tenga un rastro de facturación auditable en el almacén analítico.

## What Changes

- Registro de métodos de pago simulados por usuario (tipo, últimos 4 dígitos, país) — sin integrar ninguna pasarela de pago real.
- Simulación de una transacción de pago asociada a una suscripción existente del usuario, con resultado exitoso o fallido.
- Emisión automática de un invoice (con IVA) cuando la transacción resulta exitosa.
- Consulta de historial de transacciones e invoices, restringida al propio usuario salvo para `admin`, que puede consultar las de cualquier usuario.

## Capabilities

### New Capabilities
- `facturacion`: registro de métodos de pago, simulación de transacciones de cobro asociadas a una suscripción existente, emisión de invoices y consulta de historial de facturación, con autorización propietario/admin.

### Modified Capabilities
(ninguna; `suscripciones` ya declara la facturación explícitamente fuera de su alcance — `facturacion` la consume como dependencia de solo lectura sin alterar sus requisitos)

## Impact

- **ClickHouse**: nuevas tablas `DIM_METODO_PAGO`, `FACT_TRANSACCION_PAGO`, `FACT_INVOICE`.
- **FastAPI**: nuevo paquete `api/paquetes/facturacion/` (router, deps, queries) montado en `main.py`.
- **PocketBase**: ninguna colección nueva; `facturacion` lee (nunca escribe) la colección `suscripciones` ya existente para validar que la suscripción referenciada por una transacción pertenece al usuario y está vigente.
- **Frontend**: stub `frontend/src/packages/facturacion/` se completa como parte de este mismo cambio (páginas de autoservicio y de auditoría admin, siguiendo el patrón ya usado por `seguridad`/`analitica` y el sistema de diseño establecido con Impeccable).
- **Dependencia externa**: ninguna — a diferencia de `partners` (CU-T03 pendiente), aquí `suscripciones` ya está implementada y en producción.
