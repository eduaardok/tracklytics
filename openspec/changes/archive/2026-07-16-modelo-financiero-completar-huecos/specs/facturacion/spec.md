## MODIFIED Requirements

### Requirement: Registro de método de pago
El sistema SHALL permitir a un usuario autenticado registrar un método de pago simulado (tipo,
últimos 4 dígitos, país, nombre del titular, dirección de facturación), asociado únicamente a su
propia cuenta. El sistema SHALL además aceptar un número de tarjeta simulado completo y una fecha
de expiración simulada, ambos validados en formato, para derivar los últimos 4 dígitos — ninguno
de los dos SHALL persistirse completo en ningún almacenamiento.

#### Scenario: Registro exitoso de un método de pago
- **WHEN** un usuario autenticado envía tipo, país, nombre del titular, dirección y datos válidos
  para registrar un método de pago
- **THEN** el sistema registra el método de pago asociado a ese usuario y queda disponible para
  pagar una suscripción

#### Scenario: Registro exitoso con tarjeta simulada válida
- **WHEN** un usuario registra un método de pago con un número de tarjeta simulado de formato
  válido y una fecha de expiración futura
- **THEN** el sistema registra el método de pago conservando solo los últimos 4 dígitos, sin
  persistir el número completo ni la expiración

#### Scenario: Rechazo por formato de tarjeta inválido
- **WHEN** un usuario intenta registrar un método de pago con un número de tarjeta que no cumple
  el formato esperado
- **THEN** el sistema rechaza el registro sin persistir ningún dato del método de pago

## ADDED Requirements

### Requirement: IVA configurable con override por país
El sistema SHALL calcular el IVA de cada invoice usando la tasa de IVA propia del país del usuario
si está configurada; si no, SHALL usar una tasa de IVA global de la plataforma, editable por un
usuario con rol `admin` sin requerir cambios de código.

#### Scenario: Cálculo de IVA con tasa global
- **WHEN** se emite un invoice para un usuario cuyo país no tiene una tasa de IVA propia
  configurada
- **THEN** el sistema calcula el IVA usando la tasa de IVA global vigente

#### Scenario: Administrador actualiza la tasa de IVA global
- **WHEN** un usuario con rol `admin` actualiza la tasa de IVA global de la plataforma
- **THEN** los invoices emitidos después de ese cambio usan la nueva tasa

### Requirement: Notificación simulada de factura enviada por correo
El sistema SHALL registrar, al emitir cada invoice, una notificación simulada de correo con
destinatario, asunto y cuerpo, sin integrar un proveedor de correo real. El usuario dueño de la
factura, y un administrador para cualquier usuario, SHALL poder consultar el historial de estas
notificaciones simuladas.

#### Scenario: Se registra la notificación al emitir un invoice
- **WHEN** el sistema emite un invoice exitosamente
- **THEN** el sistema registra una notificación simulada de correo asociada a ese invoice, visible
  en el historial de notificaciones del usuario

#### Scenario: Consultar el historial de notificaciones de factura
- **WHEN** un usuario autenticado solicita su historial de notificaciones de factura
- **THEN** el sistema muestra cada notificación simulada con su destinatario, asunto y fecha de
  envío
