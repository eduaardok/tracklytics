## ADDED Requirements

### Requirement: Renovación automática de suscripción
El sistema SHALL renovar periódicamente cualquier suscripción de pago activa cuyo último cobro
exitoso (o su fecha de alta, si nunca se cobró) tenga 30 días o más, simulando un nuevo cobro con
el último método de pago del usuario. Si el usuario no tiene ningún método de pago registrado, el
sistema SHALL omitir esa renovación sin cancelar la suscripción. Si el cobro simulado de la
renovación falla, el sistema SHALL cancelar la suscripción de inmediato (ver capability
`suscripciones`, "Cancelar suscripción activa") y registrar el motivo como churn involuntario, en
vez de dejarla activa sin haber cobrado.

#### Scenario: Renovación exitosa de una suscripción vencida
- **WHEN** una suscripción de pago activa tiene 30 días o más desde su último cobro exitoso, y el usuario tiene un método de pago registrado
- **THEN** el sistema simula un nuevo cobro por el monto del plan y, si resulta exitoso, registra la transacción y emite el invoice correspondiente

#### Scenario: Renovación fallida cancela la suscripción
- **WHEN** el cobro simulado de una renovación resulta fallido
- **THEN** el sistema registra la transacción fallida, cancela la suscripción y registra la cancelación como involuntaria, sin dejarla activa

#### Scenario: Suscripción vencida sin método de pago registrado
- **WHEN** una suscripción de pago activa tiene 30 días o más desde su último cobro y el usuario no tiene ningún método de pago registrado
- **THEN** el sistema omite la renovación de esa suscripción sin cancelarla ni generar ninguna transacción

#### Scenario: Suscripción aún no vencida
- **WHEN** una suscripción de pago activa tiene menos de 30 días desde su último cobro exitoso
- **THEN** el sistema no genera ninguna renovación para esa suscripción todavía
