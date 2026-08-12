## ADDED Requirements

### Requirement: Eliminación de método de pago

El sistema SHALL permitir a un usuario autenticado eliminar un método de pago que le pertenece.
El sistema SHALL rechazar la eliminación con un error de "no encontrado" si el método de pago no
existe o pertenece a otro usuario, sin distinguir entre ambos casos. El sistema SHALL rechazar la
eliminación si ese método de pago respalda un cobro exitoso de suscripción cuyo período de
facturación todavía está vigente, para no dejar una suscripción activa sin forma de pago a mitad
de período. El sistema SHALL registrar cada eliminación exitosa en el log de auditoría con los
datos del método eliminado.

#### Scenario: Eliminación exitosa de un método de pago propio

- **WHEN** un usuario autenticado solicita eliminar un método de pago que le pertenece y que no
  respalda ningún período de facturación vigente
- **THEN** el sistema elimina el método de pago, deja de aparecer en el listado del usuario y
  registra la eliminación en el log de auditoría

#### Scenario: Intento de eliminar un método de pago inexistente o ajeno

- **WHEN** un usuario autenticado solicita eliminar un método de pago que no existe, o que
  pertenece a otro usuario
- **THEN** el sistema rechaza la operación indicando que el método de pago no fue encontrado, sin
  revelar si pertenece a otro usuario

#### Scenario: Intento de eliminar el método de pago de una suscripción con período vigente

- **WHEN** un usuario autenticado solicita eliminar un método de pago que respalda un cobro
  exitoso de su suscripción cuyo período de facturación todavía no vence
- **THEN** el sistema rechaza la eliminación indicando que ese método cubre el período de
  facturación en curso
