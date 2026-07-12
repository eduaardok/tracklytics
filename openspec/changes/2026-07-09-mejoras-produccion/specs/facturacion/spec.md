## MODIFIED Requirements

### Requirement: Pago de una suscripción existente
El sistema SHALL permitir simular el pago de una suscripción activa del usuario autenticado usando uno de sus métodos de pago registrados, y SHALL registrar el resultado de la transacción como exitoso o fallido. Esta lógica de cobro SHALL ser reusable: además de invocarse de forma explícita, la capability `suscripciones` la invoca automáticamente al activar un plan de pago, de modo que activar y pagar ocurran en una sola operación desde la perspectiva del usuario.

#### Scenario: Pago simulado exitoso
- **WHEN** un usuario autenticado con una suscripción activa y un método de pago registrado inicia un pago, y la transacción simulada resulta exitosa
- **THEN** el sistema registra la transacción con estado exitoso, asociada a la suscripción y al método de pago utilizados

#### Scenario: Pago simulado fallido
- **WHEN** un usuario autenticado inicia un pago y la transacción simulada resulta fallida
- **THEN** el sistema registra la transacción con estado fallido, sin generar ningún invoice

#### Scenario: Cobro automático al activar una suscripción de pago
- **WHEN** la capability `suscripciones` activa un plan de pago con un método de pago válido
- **THEN** el sistema procesa el cobro con la misma lógica que un pago explícito, sin exigir una segunda operación separada del usuario

### Requirement: Consulta del propio historial de facturación
El sistema SHALL permitir a un usuario autenticado consultar su propio historial de transacciones e invoices. El detalle de una invoice individual SHALL incluir el nombre del plan asociado, los datos del método de pago utilizado y el nombre/correo del usuario, para soportar una vista imprimible con formato profesional.

#### Scenario: Consultar el propio historial
- **WHEN** un usuario autenticado consulta su historial de transacciones o invoices sin especificar `usuario_id`
- **THEN** el sistema retorna únicamente las transacciones/invoices asociadas a ese usuario

#### Scenario: Consultar el detalle de una invoice propia
- **WHEN** un usuario autenticado consulta el detalle de una invoice que le pertenece
- **THEN** el sistema retorna el monto, IVA, estado, nombre del plan, datos del método de pago y sus propios datos de contacto
