## MODIFIED Requirements

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
