## MODIFIED Requirements

### Requirement: Validación de método de pago antes de activar
El sistema SHALL impedir activar una suscripción de pago sin un método de pago real y previamente registrado (`DIM_METODO_PAGO`) asociado al usuario o cliente. Un identificador de método de pago que no exista para ese usuario SHALL ser rechazado, incluso si el formato es válido. Al activar un plan de pago con un método válido, el sistema SHALL cobrar automáticamente en la misma operación (ver capability `facturacion`, "Pago de una suscripción existente"), sin requerir un paso separado.

#### Scenario: Intento de suscripción sin método de pago
- **WHEN** un usuario o cliente selecciona un plan de pago e intenta confirmar sin especificar un método de pago
- **THEN** el sistema muestra un mensaje de error y no activa la suscripción

#### Scenario: Intento de suscripción con un método de pago que no existe
- **WHEN** un usuario o cliente confirma un plan de pago con un `metodo_pago_id` que no está registrado para su cuenta
- **THEN** el sistema rechaza la operación indicando que el método de pago no fue encontrado, sin activar la suscripción

#### Scenario: Confirmar un plan de pago con un método de pago válido
- **WHEN** un usuario o cliente confirma un plan de pago con un `metodo_pago_id` real y previamente registrado
- **THEN** el sistema activa la suscripción y, en la misma operación, procesa el cobro y emite la transacción/invoice correspondiente
