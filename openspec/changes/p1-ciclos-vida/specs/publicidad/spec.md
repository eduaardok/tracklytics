## ADDED Requirements

### Requirement: Edición de una campaña publicitaria
El sistema SHALL permitir a un usuario con rol `admin_finanzas` editar el nombre, presupuesto total, fechas de inicio/fin y formato (`audio` | `display` | `banner`) de una campaña existente. El formato SHALL persistir en `DIM_CAMPANA_PUBLICITARIA.formato`; al fijar `audio` o `display` el sistema SHALL sincronizar el canal de servido (`tipo_anuncio`), y `banner` SHALL servirse por el canal display. La edición SHALL auditarse.

#### Scenario: Editar presupuesto y formato de una campaña
- **WHEN** un `admin_finanzas` envía nuevos valores de presupuesto y formato para una campaña existente
- **THEN** el sistema actualiza la campaña, sincroniza el canal de servido y registra la acción en la auditoría

### Requirement: Pausa y reanudación manual de una campaña
El sistema SHALL permitir pausar manualmente una campaña (`estado_manual = 'pausada'`) y reanudarla (`estado_manual = ''`), de forma independiente del agotamiento de presupuesto (`activa`). Una campaña SHALL ser elegible para servirse solo si `activa = 1` **y** `estado_manual = ''`. Reanudar una campaña finalizada SHALL rechazarse.

#### Scenario: Pausar una campaña con presupuesto disponible
- **WHEN** un `admin_finanzas` pausa una campaña que aún tiene presupuesto
- **THEN** la campaña deja de servirse aunque `activa = 1`, y puede reanudarse después

#### Scenario: Reanudar una campaña finalizada es rechazado
- **WHEN** un `admin_finanzas` intenta reanudar una campaña con `estado_manual = 'finalizada'`
- **THEN** el sistema rechaza la operación con 409

### Requirement: Finalización definitiva de una campaña
El sistema SHALL permitir finalizar una campaña (`estado_manual = 'finalizada'`), estado terminal e irreversible que la retira permanentemente del servido. La acción SHALL auditarse.

#### Scenario: Finalizar una campaña
- **WHEN** un `admin_finanzas` finaliza una campaña
- **THEN** la campaña queda en estado finalizado, no se sirve más y no puede reanudarse

### Requirement: Edición y desactivación de anunciantes
El sistema SHALL permitir a un `admin_finanzas` editar el nombre y sector de un anunciante y desactivarlo. Un anunciante desactivado SHALL marcarse como inactivo. Ambas acciones SHALL auditarse.

#### Scenario: Desactivar un anunciante
- **WHEN** un `admin_finanzas` desactiva un anunciante
- **THEN** el anunciante queda marcado como inactivo y la acción se audita
