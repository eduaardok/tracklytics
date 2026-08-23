## MODIFIED Requirements

### Requirement: Verificación de correo electrónico en el registro
El sistema SHALL marcar como no verificados los correos de las cuentas registradas a partir de ahora, generando un token de verificación de un solo uso y con caducidad. El sistema SHALL enviar ese token por un canal de correo real además de incluirlo en la respuesta del registro/reenvío (esto último se conserva por conveniencia de entorno de demostración, sin credenciales de un proveedor externo). El sistema SHALL permitir verificar el correo presentando ese token, y SHALL permitir solicitar el reenvío del token, invalidando el anterior. Un fallo al enviar el correo real SHALL registrarse sin interrumpir el registro/reenvío — el token sigue siendo válido y utilizable por la vía de respuesta. Los usuarios registrados con anterioridad SHALL considerarse verificados.

#### Scenario: Verificar el correo con el token
- **WHEN** un usuario recién registrado presenta su token de verificación
- **THEN** el sistema marca su correo como verificado

#### Scenario: El registro envía un correo real con el token
- **WHEN** un usuario se registra con un correo válido
- **THEN** el sistema envía un correo real a ese destinatario con el token de verificación, además de incluirlo en la respuesta del registro

#### Scenario: Reenviar la verificación invalida el token previo
- **WHEN** un usuario solicita el reenvío de su verificación
- **THEN** el sistema genera un token nuevo, lo envía por correo real, y el token anterior deja de ser válido

#### Scenario: Un fallo de envío no bloquea el registro
- **WHEN** el envío del correo real falla (ej. el servidor SMTP no responde)
- **THEN** el registro/reenvío se completa igual, con el token disponible en la respuesta

#### Scenario: Token inválido, caducado o ya usado
- **WHEN** un usuario presenta un token de verificación inválido, caducado o ya utilizado
- **THEN** el sistema rechaza la verificación indicando el motivo

#### Scenario: Un token de verificación no sirve para restablecer contraseña
- **WHEN** alguien intenta restablecer una contraseña usando un token de verificación de correo
- **THEN** el sistema rechaza la operación
