## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Período de prueba gratuito al confirmar el plan premium por primera vez
El sistema SHALL, cuando un Usuario B2C confirma el plan premium y no tiene ninguna suscripción
previa a ese plan (activa o cancelada), activar un período de prueba de 7 días sin procesar el
cobro correspondiente durante ese período. Si el usuario no cancela antes de que el período de
prueba termine, el sistema SHALL procesar el cobro automáticamente al detectarlo en el siguiente
acceso autenticado y continuar la suscripción como plan premium normal. Este período de prueba
SHALL aplicar únicamente al plan premium, no al plan estudiante ni a los planes B2B.

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
