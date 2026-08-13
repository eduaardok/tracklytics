## MODIFIED Requirements

### Requirement: Recuperación de contraseña por token de un solo uso

El sistema SHALL permitir solicitar la recuperación de contraseña indicando un correo; si el
correo corresponde a un usuario existente, el sistema SHALL generar un token de un solo uso con
vencimiento, persistirlo en `FACT_TOKEN_RECUPERACION`, y en todo caso SHALL responder con un
mensaje genérico que no revele si el correo existe. Como no se envía correo real (patrón de
simulación del proyecto), el sistema SHALL incluir el token generado en la propia respuesta
cuando el correo corresponde a un usuario existente, para que el flujo de recuperación sea
completable sin un canal de entrega externo. El sistema SHALL permitir restablecer la contraseña
presentando un token válido (no vencido, no usado) y una nueva contraseña, delegando el cambio a
PocketBase y marcando el token como usado.

#### Scenario: Solicitud de recuperación no revela existencia del correo

- **WHEN** alguien solicita recuperar la contraseña de un correo, exista o no en el sistema
- **THEN** el sistema responde con un mensaje genérico de "si el correo existe, recibirás
  instrucciones", generando un token únicamente cuando el correo corresponde a un usuario real

#### Scenario: El token generado viaja en la respuesta

- **WHEN** el correo indicado corresponde a un usuario existente
- **THEN** la respuesta incluye el token de recuperación generado, para que el solicitante pueda
  usarlo de inmediato sin depender de un correo real

#### Scenario: Restablecer con token válido

- **WHEN** un usuario presenta un token de recuperación no vencido y no usado junto con una
  nueva contraseña
- **THEN** el sistema cambia la contraseña en PocketBase, marca el token como usado, y el
  usuario puede iniciar sesión con la nueva contraseña

#### Scenario: Restablecer con token vencido o ya usado

- **WHEN** un usuario presenta un token de recuperación vencido o previamente usado
- **THEN** el sistema rechaza el restablecimiento sin cambiar la contraseña
