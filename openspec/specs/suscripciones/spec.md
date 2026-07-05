# Capability: suscripciones

## Purpose

Permitir que un Usuario B2C se suscriba a un plan premium y que un Cliente B2B se suscriba a un plan B2B (básico/pro/enterprise), habilitando acceso a funciones extendidas según el tier contratado.

## Objetivo

Permitir que un Usuario B2C se suscriba a un plan premium y que un Cliente B2B se suscriba a un plan B2B (básico/pro/enterprise), habilitando acceso a funciones extendidas según el tier contratado.

## Contexto

La monetización de Tracklytics depende de la conversión freemium→premium (B2C) y de la venta de planes de suscripción analítica (B2B). Esta capability cubre el flujo operativo de alta de suscripción; el seguimiento agregado de ingresos (ARR/MRR) pertenece al nivel táctico/estratégico, fuera de esta capability.

## Actores

- **Usuario B2C**: puede suscribirse a plan premium.
- **Cliente B2B**: puede suscribirse a un tier de plan B2B.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Usuario B2C / Cliente B2B | Adquisición y suscripciones | CU-O06 Suscribirse a plan premium o plan B2B | Como Usuario B2C, quiero suscribirme a un plan premium, para acceder a funciones extendidas sin restricciones |

## Requirements

### Requirement: Mostrar planes disponibles
El sistema SHALL mostrar los planes disponibles (free, premium para B2C; básico, pro, enterprise para B2B) con su descripción y precio.

#### Scenario: Listar planes disponibles
- **WHEN** un Usuario B2C o Cliente B2B autenticado solicita ver los planes disponibles
- **THEN** el sistema muestra los planes correspondientes a su tipo de actor con descripción y precio

### Requirement: Selección de plan según tipo de actor
El sistema SHALL permitir seleccionar un plan y confirmar la suscripción. Un Cliente B2B solo puede elegir entre los tiers B2B (básico/pro/enterprise); un Usuario B2C solo entre free/premium.

#### Scenario: Usuario B2C selecciona un plan B2C
- **WHEN** un Usuario B2C selecciona el plan free o premium
- **THEN** el sistema acepta la selección y continúa con la confirmación de la suscripción

#### Scenario: Cliente B2B selecciona un plan B2B
- **WHEN** un Cliente B2B selecciona el tier básico, pro o enterprise
- **THEN** el sistema acepta la selección y continúa con la confirmación de la suscripción

### Requirement: Registro de la suscripción
El sistema SHALL registrar la suscripción con tipo de plan, monto, moneda, fecha de inicio y estado inicial "activa". El monto y la moneda de cada suscripción SHALL quedar registrados de forma auditable (no editable retroactivamente sin dejar rastro).

#### Scenario: Suscripción exitosa a plan premium
- **WHEN** el Usuario B2C está autenticado, selecciona el plan premium y confirma la suscripción con un método de pago válido
- **THEN** el sistema registra la suscripción con estado "activa" y actualiza el acceso del usuario a funciones premium

#### Scenario: Registro auditable de monto y moneda
- **WHEN** se registra una nueva suscripción con un monto y una moneda
- **THEN** el sistema conserva un rastro de auditoría de esos valores que impide su edición retroactiva sin dejar registro del cambio

### Requirement: Validación de método de pago antes de activar
El sistema SHALL impedir activar una suscripción de pago sin un método de pago válido asociado, mediante validación a nivel de formulario, sin procesar pagos reales en esta capability.

#### Scenario: Intento de suscripción sin método de pago
- **WHEN** un usuario o cliente selecciona un plan de pago e intenta confirmar sin un método de pago válido
- **THEN** el sistema muestra un mensaje de error y no activa la suscripción

### Requirement: Un único plan activo por usuario o cliente
El sistema SHALL garantizar que un usuario o cliente solo pueda tener un plan activo a la vez; al confirmar uno nuevo, el anterior SHALL pasar a estado "cancelada".

#### Scenario: Confirmar un nuevo plan cancela el anterior
- **WHEN** un usuario o cliente con una suscripción previa activa confirma un nuevo plan
- **THEN** el sistema activa la nueva suscripción y cambia automáticamente el estado de la suscripción anterior a "cancelada"

### Requirement: Consultar plan activo
El sistema SHALL permitir consultar el plan activo actual del usuario o cliente autenticado.

#### Scenario: Consultar el plan activo
- **WHEN** un usuario o cliente autenticado solicita ver su plan activo
- **THEN** el sistema muestra el detalle del plan vigente

### Requirement: Cancelar suscripción activa
El sistema SHALL permitir cancelar una suscripción activa, cambiando su estado a "cancelada".

#### Scenario: Cancelación de suscripción activa
- **WHEN** un usuario o cliente autenticado solicita cancelar su suscripción activa
- **THEN** el sistema cambia el estado de la suscripción a "cancelada"

### Requirement: Tiempo de confirmación de suscripción
La confirmación de una suscripción SHALL completarse en menos de 3 segundos en condiciones normales.

#### Scenario: Confirmación dentro del tiempo esperado
- **WHEN** un usuario o cliente confirma una suscripción con datos válidos
- **THEN** el sistema completa el registro y la confirmación en menos de 3 segundos

## Entradas

- Identificador del plan seleccionado.
- Identificador del usuario/cliente autenticado.

## Salidas

- Confirmación de suscripción activa con detalle del plan.
- Mensaje de error si falta método de pago válido o el plan no existe.

## Dependencias

- **PocketBase**: persistencia operativa de la suscripción (colección `suscripciones`), con reglas de acceso por propietario. La alimentación posterior de `FACT_SUSCRIPCION`/`DIM_PLAN_SUSCRIPCION`/`DIM_CLIENTE` en ClickHouse es responsabilidad del pipeline ETL existente, fuera del alcance operativo de esta capability (ver design.md).
- **Capability `catalogo`**: requiere usuario autenticado.

## Fuera de alcance

- Procesamiento real de pagos con pasarela externa (Stripe/Adyen); esta capability registra la intención y el resultado de la suscripción, no implementa la integración de cobro real.
- Facturación y generación de comprobantes fiscales.
- Soporte multi-divisa con conversión de tipo de cambio en tiempo real.
