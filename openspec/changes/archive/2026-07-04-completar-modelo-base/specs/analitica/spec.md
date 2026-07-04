## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Data Analyst / BI Lead | Analítica | CU-O54 Consultar adquisición de usuarios por canal | Como Data Analyst/BI Lead, quiero ver cuántos usuarios nuevos se adquieren por canal de marketing y semana, para evaluar qué canal está funcionando mejor |
| Operativo | Lead Data Engineer / CTO | Analítica | CU-O55 Consultar disponibilidad de infraestructura por componente | Como Lead Data Engineer/CTO, quiero ver el porcentaje de disponibilidad de cada componente del sistema por semana, para detectar degradaciones antes de que afecten a los usuarios |

## ADDED Requirements

### Requirement: Adquisición de usuarios por canal
El sistema SHALL registrar cada alta de usuario nuevo con su canal de adquisición y región, y SHALL exponer un conteo de usuarios nuevos agrupado por canal y semana a Data Analyst/BI Lead y Lead Data Engineer/CTO.

#### Scenario: Consulta de adquisición con datos disponibles
- **WHEN** un Data Analyst/BI Lead o Lead Data Engineer/CTO con suscripción B2B activa consulta la vista de adquisición
- **THEN** el sistema devuelve el conteo de usuarios nuevos agrupado por canal de marketing y semana, cubriendo al menos las últimas semanas con datos cargados

#### Scenario: Acceso sin suscripción B2B activa
- **WHEN** un usuario sin suscripción B2B activa intenta acceder a la vista de adquisición
- **THEN** el sistema deniega el acceso con el mismo mecanismo ya usado en el resto de vistas tácticas de `analitica`

### Requirement: Disponibilidad de infraestructura por componente
El sistema SHALL registrar eventos de disponibilidad por componente de infraestructura (ej. API, ClickHouse, PocketBase, Airflow) y SHALL exponer el porcentaje de disponibilidad por componente y semana a Lead Data Engineer/CTO. Este requisito es independiente de la restricción geográfica de reproducción de contenido licenciado (`distribucion`, "Restricción de reproducción por país") — ambos conceptos no deben conflactarse en ningún artefacto ni componente de interfaz.

#### Scenario: Consulta de disponibilidad con datos disponibles
- **WHEN** un Lead Data Engineer/CTO con suscripción B2B activa consulta la vista de disponibilidad de infraestructura
- **THEN** el sistema devuelve el porcentaje de disponibilidad por componente y semana, cubriendo al menos las últimas semanas con datos cargados

#### Scenario: Acceso sin suscripción B2B activa
- **WHEN** un usuario sin suscripción B2B activa intenta acceder a la vista de disponibilidad de infraestructura
- **THEN** el sistema deniega el acceso con el mismo mecanismo ya usado en el resto de vistas tácticas de `analitica`
