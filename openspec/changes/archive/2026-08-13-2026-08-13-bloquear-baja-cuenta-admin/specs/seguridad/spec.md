## MODIFIED Requirements

### Requirement: Baja de cuenta propia

El sistema SHALL permitir a un usuario autenticado **sin rol administrativo** solicitar la baja
de su propia cuenta. La baja SHALL fijar `estado_cuenta = 'eliminado'` en `DIM_USUARIO`,
invalidar todas sus sesiones activas en `FACT_SESION` y cancelar su suscripción activa si la
tuviera. El sistema NO SHALL borrar los datos históricos del usuario en ClickHouse (retención
analítica), pero SHALL rechazar todo inicio de sesión posterior igual que una cuenta suspendida.
Una cuenta con rol administrativo (superadmin o cualquiera de los roles de área vigentes en
`BRIDGE_USUARIO_ROL_ADMIN`) SHALL ser rechazada al intentar darse de baja a sí misma, sin
ejecutar ninguno de los efectos de la baja.

#### Scenario: Un usuario sin rol administrativo da de baja su cuenta

- **WHEN** un usuario autenticado sin rol administrativo confirma la baja de su cuenta
- **THEN** el sistema fija su `estado_cuenta = 'eliminado'`, cierra todas sus sesiones activas,
  cancela su suscripción activa si la tenía, y conserva sus datos históricos en ClickHouse

#### Scenario: Un usuario dado de baja no puede volver a entrar

- **WHEN** un usuario que dio de baja su cuenta intenta iniciar sesión de nuevo
- **THEN** el sistema rechaza el acceso con 403

#### Scenario: Una cuenta con rol administrativo intenta darse de baja a sí misma

- **WHEN** una cuenta con `record.role == 'admin'` o con algún rol vigente en
  `BRIDGE_USUARIO_ROL_ADMIN` solicita la baja de su propia cuenta
- **THEN** el sistema rechaza la operación con 403, sin cerrar sesiones, cancelar suscripciones
  ni cambiar `estado_cuenta`
