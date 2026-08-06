## Purpose

Garantizar que ninguna credencial de servicio quede hardcodeada en el código fuente, y que
las cuentas de referencia por rol administrativo existan sin un paso manual en cualquier
entorno recién levantado — sin lo segundo, procesos que dependen de una cuenta administrativa
(como el backfill de regalías) fallan en cualquier máquina que no sea la que las creó a mano.

## Objetivo

Garantizar que ninguna credencial de servicio quede hardcodeada en el código fuente, y que
las cuentas de referencia por rol administrativo existan sin un paso manual en cualquier
entorno recién levantado — sin lo segundo, procesos que dependen de una cuenta administrativa
(como el backfill de regalías) fallan en cualquier máquina que no sea la que las creó a mano.

## ADDED Requirements

### Requirement: Credenciales de servicio por variable de entorno

El sistema SHALL leer toda credencial de una cuenta de servicio (usada por procesos internos
para autenticarse contra la propia API, no credenciales de usuarios finales) desde variables
de entorno, nunca hardcodeada en texto plano en el código fuente. Un valor por defecto
explícito para entornos de demostración SHALL declararse en la configuración de despliegue
(`docker-compose.yml`), no en el código de la aplicación, para que el sistema siga
funcionando sin configuración manual en un entorno de desarrollo/demostración.

#### Scenario: Proceso interno se autentica con una cuenta de servicio
- **WHEN** un proceso interno (por ejemplo, el backfill de negocio liquidando regalías)
  necesita autenticarse contra la API con una cuenta de servicio
- **THEN** el sistema toma esas credenciales de variables de entorno, con un default de
  demostración declarado en la configuración de despliegue, nunca de una constante en el
  código fuente

### Requirement: Siembra automática de cuentas de referencia por rol

El sistema SHALL crear, en el arranque de un entorno nuevo (sin intervención manual), una
cuenta de referencia por cada rol de `DIM_ROL_ADMINISTRATIVO` y una cuenta de cliente B2B,
usando los mismos endpoints reales de registro y asignación de rol que usaría un
administrador humano. La siembra SHALL ser idempotente: si una cuenta ya existe, el sistema
no la duplica ni falla, y SHALL ejecutarse solo después de que la API esté saludable
(verificado por health check, no por una espera fija).

#### Scenario: Arrancar un entorno nuevo desde cero
- **WHEN** se levanta el sistema completo en una máquina donde ninguna cuenta administrativa
  existe todavía
- **THEN** al terminar el arranque, las cuentas de referencia de los 6 roles administrativos
  y la cuenta B2B existen y pueden autenticarse, sin que nadie las haya creado a mano

#### Scenario: Reiniciar un entorno donde las cuentas ya existen
- **WHEN** se levanta el sistema en un entorno donde las cuentas de referencia ya fueron
  sembradas en un arranque anterior
- **THEN** el sistema detecta que ya existen y no falla ni las duplica
