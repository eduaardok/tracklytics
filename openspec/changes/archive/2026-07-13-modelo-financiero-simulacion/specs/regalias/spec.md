## MODIFIED Requirements

### Requirement: Liquidación de regalías por período
El sistema SHALL calcular, para un rango de fechas dado, el monto real que le corresponde a cada
rightsholder de cada track con contrato vigente, a partir de: el ingreso real de la plataforma en
ese período (suscripciones exitosas más ingreso publicitario), la porción de ese ingreso destinada
a rightsholders, y la participación real de cada track en el total de streams del período. El
sistema SHALL registrar una fila por rightsholder por track liquidado en `FACT_LIQUIDACION_REGALIA`.
Un track reproducido sin contrato vigente en el período SHALL contar en el total de streams pero
SHALL no generar ninguna liquidación. Si el rango de fechas exacto ya fue liquidado previamente, el
sistema SHALL no volver a generar liquidaciones para ese rango, indicándolo explícitamente en la
respuesta.

#### Scenario: Liquidación de un período con streams reales
- **WHEN** se ejecuta la liquidación para un período que tiene transacciones exitosas, ingreso publicitario y streams reales de tracks con contrato vigente
- **THEN** el sistema calcula el monto de cada rightsholder proporcional a los streams reales de su track dentro del total del período, y lo registra en `FACT_LIQUIDACION_REGALIA`

#### Scenario: Track sin contrato vigente no genera liquidación
- **WHEN** un track fue reproducido en el período pero no tiene ningún contrato vigente
- **THEN** el sistema no genera ninguna fila de liquidación para ese track, aunque sus streams sí cuenten en el total del período

#### Scenario: Período sin ningún ingreso
- **WHEN** se ejecuta la liquidación para un período sin transacciones exitosas ni ingreso publicitario
- **THEN** el sistema no genera ninguna liquidación, sin producir un error

#### Scenario: Intento de liquidar un período ya liquidado
- **WHEN** se solicita liquidar un rango de fechas cuyo `periodo_inicio` y `periodo_fin` exactos ya tienen liquidaciones registradas
- **THEN** el sistema no genera liquidaciones duplicadas y responde indicando que ese período ya fue liquidado

## ADDED Requirements

### Requirement: Solicitud y procesamiento de retiro de ganancias
El sistema SHALL permitir a un Artista o Sello solicitar el retiro de su saldo disponible (suma de
sus liquidaciones en `FACT_LIQUIDACION_REGALIA` menos sus retiros ya solicitados o procesados), y
SHALL permitir a un usuario con rol `admin` procesar (simulado) o rechazar cada solicitud de
retiro. Un retiro solicitado SHALL descontar del saldo disponible de inmediato, para impedir que se
solicite el mismo saldo dos veces mientras la primera solicitud sigue pendiente. Un retiro rechazado
SHALL devolver ese monto al saldo disponible.

#### Scenario: Artista o sello solicita un retiro dentro de su saldo disponible
- **WHEN** un Artista o Sello solicita el retiro de un monto menor o igual a su saldo disponible
- **THEN** el sistema registra la solicitud en estado "pendiente" y descuenta ese monto del saldo disponible mostrado

#### Scenario: Solicitud de retiro por encima del saldo disponible
- **WHEN** un Artista o Sello solicita el retiro de un monto mayor a su saldo disponible
- **THEN** el sistema rechaza la solicitud indicando el saldo disponible real

#### Scenario: Admin procesa una solicitud de retiro
- **WHEN** un usuario con rol `admin` marca una solicitud de retiro pendiente como procesada
- **THEN** el sistema cambia su estado a "procesado" y ese monto no vuelve a estar disponible para un nuevo retiro

#### Scenario: Admin rechaza una solicitud de retiro
- **WHEN** un usuario con rol `admin` rechaza una solicitud de retiro pendiente
- **THEN** el sistema cambia su estado a "rechazado" y devuelve ese monto al saldo disponible del rightsholder
