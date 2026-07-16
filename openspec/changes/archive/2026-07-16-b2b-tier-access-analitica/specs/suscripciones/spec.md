## MODIFIED Requirements

### Requirement: Mostrar planes disponibles
El sistema SHALL mostrar los planes disponibles (free, premium, estudiante para B2C; básico, pro,
enterprise para B2B) con su descripción y precio. Para los planes B2B, el sistema SHALL además
listar explícitamente las features/paneles incluidos en cada tier, de forma que un Cliente B2B
pueda comparar qué gana al elegir un tier sobre otro antes de confirmar la suscripción.

#### Scenario: Listar planes disponibles
- **WHEN** un Usuario B2C o Cliente B2B autenticado solicita ver los planes disponibles
- **THEN** el sistema muestra los planes correspondientes a su tipo de actor con descripción y
  precio

#### Scenario: Listar features incluidas de un plan B2B
- **WHEN** un Cliente B2B autenticado solicita ver los planes disponibles
- **THEN** el sistema muestra, para cada tier B2B (básico, pro, enterprise), la lista de
  features/paneles analíticos incluidos en ese tier
