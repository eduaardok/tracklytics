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
| Operativo | Usuario B2C / Cliente B2B | Adquisición y suscripciones | CU-O70 Cancelar suscripción indicando motivo | Como Usuario B2C o Cliente B2B, quiero indicar por qué cancelo mi suscripción, para que Tracklytics pueda entender y reducir la fuga de clientes |
| Operativo | Usuario B2C | Adquisición y suscripciones | CU-O71 Iniciar período de prueba gratuito y suscribirse al plan estudiante | Como Usuario B2C, quiero probar el plan premium gratis por unos días o acceder a una tarifa reducida si soy estudiante, para decidir suscribirme con menos fricción |

## Requirements

### Requirement: Mostrar planes disponibles
El sistema SHALL mostrar los planes disponibles (free, premium, estudiante para B2C; básico, pro, enterprise para B2B) con su descripción y precio.

#### Scenario: Listar planes disponibles
- **WHEN** un Usuario B2C o Cliente B2B autenticado solicita ver los planes disponibles
- **THEN** el sistema muestra los planes correspondientes a su tipo de actor con descripción y precio

### Requirement: Selección de plan según tipo de actor
El sistema SHALL permitir seleccionar un plan y confirmar la suscripción. Un Cliente B2B solo
puede elegir entre los tiers B2B (básico/pro/enterprise); un Usuario B2C solo entre
free/premium/estudiante. La selección del plan `estudiante` SHALL exigir un email institucional
válido (que contenga el dominio configurado, p. ej. `.edu`) como condición para confirmar la
suscripción.

#### Scenario: Usuario B2C selecciona un plan B2C
- **WHEN** un Usuario B2C selecciona el plan free o premium
- **THEN** el sistema acepta la selección y continúa con la confirmación de la suscripción

#### Scenario: Cliente B2B selecciona un plan B2B
- **WHEN** un Cliente B2B selecciona el tier básico, pro o enterprise
- **THEN** el sistema acepta la selección y continúa con la confirmación de la suscripción

#### Scenario: Usuario B2C selecciona el plan estudiante con email institucional válido
- **WHEN** un Usuario B2C selecciona el plan estudiante e indica un email institucional válido
- **THEN** el sistema acepta la selección y continúa con la confirmación de la suscripción

#### Scenario: Usuario B2C intenta seleccionar el plan estudiante sin email institucional válido
- **WHEN** un Usuario B2C selecciona el plan estudiante sin indicar un email institucional válido
- **THEN** el sistema rechaza la selección con un mensaje de error y no confirma la suscripción

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
El sistema SHALL permitir cancelar una suscripción activa, cambiando su estado a "cancelada" y
registrando el motivo de la cancelación (precio, no uso, competencia u otro) como un hecho
auditable, en la misma operación. Si no se especifica un motivo, el sistema SHALL registrar
"otro" por defecto.

#### Scenario: Cancelación de suscripción activa con motivo explícito
- **WHEN** un usuario o cliente autenticado solicita cancelar su suscripción activa indicando un motivo
- **THEN** el sistema cambia el estado de la suscripción a "cancelada" y registra el motivo indicado como un hecho auditable

#### Scenario: Cancelación de suscripción activa sin motivo especificado
- **WHEN** un usuario o cliente autenticado solicita cancelar su suscripción activa sin indicar un motivo
- **THEN** el sistema cambia el estado de la suscripción a "cancelada" y registra el motivo por defecto ("otro") como hecho auditable

### Requirement: Período de prueba gratuito al confirmar el plan premium por primera vez
El sistema SHALL, cuando un Usuario B2C confirma el plan premium y no tiene ninguna suscripción
previa a ese plan (activa o cancelada), activar un período de prueba de 7 días sin procesar el
cobro correspondiente durante ese período. Si el usuario no cancela antes de que el período de
prueba termine, el sistema SHALL procesar el cobro automáticamente al detectarlo en el siguiente
acceso autenticado y continuar la suscripción como plan premium normal. Este período de prueba
SHALL aplicar únicamente al plan premium, no al plan estudiante ni a los planes B2B. Antes de que
el usuario confirme el plan premium por primera vez, el sistema SHALL mostrarle la fecha en que
terminará el período de prueba y a partir de la cual se procesará el cobro.

#### Scenario: Primera confirmación de premium activa el período de prueba
- **WHEN** un Usuario B2C sin ninguna suscripción previa al plan premium confirma el plan premium con un método de pago válido
- **THEN** el sistema activa la suscripción en período de prueba de 7 días sin procesar ningún cobro en ese momento

#### Scenario: Confirmar premium de nuevo no activa un segundo período de prueba
- **WHEN** un Usuario B2C que ya tuvo una suscripción previa al plan premium (activa o cancelada) confirma el plan premium nuevamente
- **THEN** el sistema activa la suscripción y procesa el cobro de inmediato, sin período de prueba

#### Scenario: El período de prueba expira sin cancelación previa
- **WHEN** un Usuario B2C con una suscripción premium en período de prueba accede a la aplicación después de que el período de prueba haya terminado, sin haberla cancelado antes
- **THEN** el sistema procesa el cobro correspondiente en ese acceso y la suscripción continúa como plan premium normal

#### Scenario: Cancelación durante el período de prueba no genera cobro
- **WHEN** un Usuario B2C cancela su suscripción premium mientras todavía está en período de prueba
- **THEN** el sistema cancela la suscripción sin haber procesado ningún cobro

#### Scenario: El usuario ve la fecha de cobro antes de confirmar el trial
- **WHEN** un Usuario B2C sin ninguna suscripción previa al plan premium abre el formulario de confirmación del plan premium
- **THEN** el sistema le muestra, antes de que confirme, la fecha en que terminará el período de prueba de 7 días y comenzará el cobro real

### Requirement: Tiempo de confirmación de suscripción
La confirmación de una suscripción SHALL completarse en menos de 3 segundos en condiciones normales.

#### Scenario: Confirmación dentro del tiempo esperado
- **WHEN** un usuario o cliente confirma una suscripción con datos válidos
- **THEN** el sistema completa el registro y la confirmación en menos de 3 segundos

## Entradas

- Identificador del plan seleccionado.
- Identificador del usuario/cliente autenticado.
- Email institucional (solo para el plan estudiante).
- Motivo de cancelación (opcional, al cancelar).

## Salidas

- Confirmación de suscripción activa con detalle del plan, incluido si está en período de prueba y cuándo termina.
- Mensaje de error si falta método de pago válido, el plan no existe, o el email institucional no es válido para el plan estudiante.

## Dependencias

- **PocketBase**: persistencia operativa de la suscripción (colección `suscripciones`), con reglas de acceso por propietario. La alimentación posterior de `FACT_SUSCRIPCION`/`DIM_PLAN_SUSCRIPCION`/`DIM_CLIENTE` en ClickHouse es responsabilidad del pipeline ETL existente, fuera del alcance operativo de esta capability (ver design.md).
- **Capability `catalogo`**: requiere usuario autenticado.
- **ClickHouse**: `FACT_CANCELACION_SUSCRIPCION` — hecho auditable de cada cancelación (motivo, si fue voluntaria), escrito síncronamente desde esta capability, consumido por `analitica` para el reporte de churn.
- **Capability `facturacion`**: `procesar_pago`, tanto para el cobro inmediato al confirmar un plan de pago como para el cobro diferido al expirar un período de prueba.

## Fuera de alcance

- Procesamiento real de pagos con pasarela externa (Stripe/Adyen); esta capability registra la intención y el resultado de la suscripción, no implementa la integración de cobro real.
- Facturación y generación de comprobantes fiscales.
- Soporte multi-divisa con conversión de tipo de cambio en tiempo real.
- Verificación real de la titularidad del email institucional (envío de correo de confirmación); la validación del plan estudiante es una verificación de formato de punto de venta.
- Un scheduler/cron real para expirar períodos de prueba; se resuelve en el siguiente acceso autenticado del usuario.
