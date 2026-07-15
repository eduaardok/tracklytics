## ADDED Requirements

### Requirement: Pausa automática de campaña por presupuesto agotado
El sistema SHALL, al evaluar el consumo de presupuesto de una campaña (capability
`finanzas`) y determinar que el ingreso acumulado alcanzó o superó su `presupuesto_total`,
marcar la campaña como inactiva (`activa=0`) en `DIM_CAMPANA_PUBLICITARIA` si aún estaba
activa, y auditar la operación. Una campaña pausada por presupuesto agotado SHALL dejar
de ser elegible para nuevas impresiones, igual que una campaña pausada manualmente.

#### Scenario: Campaña activa alcanza el 100% de consumo y se pausa
- **WHEN** el consumo de presupuesto de una campaña `activa=1` alcanza o supera el 100% de su `presupuesto_total`
- **THEN** el sistema actualiza `activa=0` para esa campaña y registra la auditoría de la pausa automática

#### Scenario: Campaña ya pausada no se vuelve a auditar
- **WHEN** se evalúa el consumo de una campaña que ya tiene `activa=0`
- **THEN** el sistema no aplica ninguna actualización ni registra una nueva auditoría de pausa

#### Scenario: Campaña pausada por presupuesto no es elegible para nuevas impresiones
- **WHEN** una campaña fue pausada automáticamente por presupuesto agotado
- **THEN** el sistema no la selecciona como elegible para mostrar un nuevo anuncio, igual que cualquier otra campaña inactiva
