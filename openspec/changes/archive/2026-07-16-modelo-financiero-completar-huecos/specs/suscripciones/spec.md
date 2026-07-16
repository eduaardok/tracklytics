## ADDED Requirements

### Requirement: Cambio de plan con prorrateo
El sistema SHALL permitir a un usuario o cliente con una suscripción activa cambiarla a otro
`tipo_plan` válido para su tipo de actor, sin cancelar la suscripción existente. El sistema SHALL
calcular un ajuste prorrateado sobre los días restantes del ciclo de facturación de 30 días
vigente: si el nuevo plan es más caro, SHALL cobrar la diferencia proporcional usando el método de
pago ya registrado en la suscripción; si es más barato, SHALL registrar un crédito informativo sin
procesar ningún cobro. Si el cobro del ajuste (en un upgrade) falla, el sistema SHALL rechazar el
cambio de plan completo, dejando la suscripción en su plan anterior.

#### Scenario: Upgrade de plan con cobro del ajuste exitoso
- **WHEN** un usuario o cliente con una suscripción activa cambia a un plan más caro y el cobro
  del ajuste prorrateado se procesa exitosamente
- **THEN** el sistema actualiza la suscripción al nuevo plan, conservando su fecha de inicio
  original, y registra la transacción del ajuste

#### Scenario: Downgrade de plan sin cobro
- **WHEN** un usuario o cliente con una suscripción activa cambia a un plan más barato
- **THEN** el sistema actualiza la suscripción al nuevo plan y registra un crédito informativo
  del ajuste, sin procesar ningún cobro

#### Scenario: Upgrade de plan con cobro del ajuste fallido
- **WHEN** un usuario o cliente intenta cambiar a un plan más caro y el cobro del ajuste
  prorrateado falla
- **THEN** el sistema rechaza el cambio de plan y la suscripción permanece en su plan anterior

#### Scenario: Cambio a un plan no válido para el tipo de actor
- **WHEN** un Cliente B2B intenta cambiar a un plan B2C, o un Usuario B2C intenta cambiar a un
  plan B2B
- **THEN** el sistema rechaza el cambio de plan

### Requirement: Gestión de cobro fallido con reintentos (dunning)
El sistema SHALL, cuando un intento de cobro de una suscripción de pago falla, registrar el
intento fallido y mover la suscripción a un estado intermedio visible (`pago_pendiente`) en vez de
cancelarla de inmediato. El sistema SHALL permitir hasta 3 intentos de cobro antes de degradar la
suscripción: para un Usuario B2C, degradar automáticamente al plan free manteniendo el acceso a la
plataforma; para un Cliente B2B, cancelar la suscripción, suspendiendo el acceso a los paneles
analíticos. El sistema SHALL permitir reintentar el cobro en cualquier momento antes de agotar los
3 intentos.

#### Scenario: Primer cobro fallido de una suscripción activa
- **WHEN** un intento de cobro de una suscripción activa falla por primera vez
- **THEN** el sistema registra el intento fallido, cambia el estado de la suscripción a
  `pago_pendiente`, y no la cancela

#### Scenario: Reintento de cobro exitoso antes de agotar los intentos
- **WHEN** una suscripción en estado `pago_pendiente` reintenta el cobro y este se procesa
  exitosamente
- **THEN** el sistema regresa la suscripción a estado `activa` y reinicia el contador de intentos
  fallidos

#### Scenario: Se agotan los 3 intentos de cobro para un Usuario B2C
- **WHEN** una suscripción B2C acumula 3 intentos de cobro fallidos
- **THEN** el sistema degrada la suscripción al plan free, manteniendo el acceso del usuario a la
  plataforma sin funciones premium

#### Scenario: Se agotan los 3 intentos de cobro para un Cliente B2B
- **WHEN** una suscripción B2B acumula 3 intentos de cobro fallidos
- **THEN** el sistema cancela la suscripción, registrando la cancelación como involuntaria, y el
  Cliente B2B pierde acceso a los paneles analíticos

### Requirement: Precio de plan configurable por administrador
El sistema SHALL permitir a un usuario con rol `admin` editar el precio base (en USD) de cualquier
plan, sin requerir cambios de código ni redespliegue. El precio efectivo mostrado y cobrado SHALL
usar el valor configurado más reciente. Esta configuración de precio SHALL ser independiente del
nivel de acceso asociado a cada tier B2B, que permanece fijo.

#### Scenario: Administrador edita el precio de un plan
- **WHEN** un usuario con rol `admin` actualiza el precio base de un plan existente
- **THEN** el sistema usa ese nuevo precio en cualquier consulta o confirmación de suscripción
  posterior a ese plan, sin requerir reinicio del sistema

#### Scenario: Editar el precio de un plan no cambia su nivel de acceso
- **WHEN** un administrador edita el precio de un plan B2B (básico, pro o enterprise)
- **THEN** el nivel de acceso a los paneles analíticos de ese tier permanece sin cambios
