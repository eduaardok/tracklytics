## Purpose

Exponer una vista de nivel estratégico (Balanced Scorecard, Kaplan & Norton) que resuma en 4
perspectivas la salud del negocio, calculada sobre datos reales ya poblados en la capa Gold, sin
introducir una nueva conexión de datos ni una tabla de metas editable (fuera de alcance de esta
sesión — la meta por KPI es un valor de referencia fijo, documentado en el código).

## ADDED Requirements

### Requirement: Balanced Scorecard estratégico

El sistema SHALL exponer `GET /analitica/bsc/resumen` con 4 perspectivas (Financiera, Cliente,
Procesos Internos, Aprendizaje y Crecimiento), cada una con 2 indicadores. Cada indicador SHALL
incluir el valor actual, la unidad, una meta de referencia, el porcentaje de esa meta alcanzado,
un semáforo (verde ≥80%, amarillo 50-79%, rojo <50%) y una serie de tendencia de hasta 6 períodos
mensuales — todo calculado desde tablas Gold reales (`GOLD_FINANCIERO_PERIODO`,
`GOLD_ADQUISICION_PERIODO`, `GOLD_INFRAESTRUCTURA_PERIODO`, `GOLD_PIPELINE_PERIODO`,
`GOLD_PRODUCTO_PERIODO`, `GOLD_CONTENIDO_PERIODO`), nunca con valores sintéticos. El acceso SHALL
estar restringido a staff interno (`require_staff`) — el mismo criterio que ya usan reporte
diario operativo, churn, funnel de conversión, P&L y MRR/ARR; un Cliente B2B (`analyst`) SHALL
recibir 403, sin excepción para este endpoint.

#### Scenario: Superadmin consulta el Balanced Scorecard
- **WHEN** una cuenta con `record.role == 'admin'` o un rol `superadmin` vigente en
  `BRIDGE_USUARIO_ROL_ADMIN` solicita `GET /analitica/bsc/resumen`
- **THEN** el sistema devuelve las 4 perspectivas con sus KPIs, semáforos y tendencias calculados
  sobre datos reales

#### Scenario: Cliente B2B intenta acceder al Balanced Scorecard
- **WHEN** una cuenta `analyst` (Cliente B2B, sin rol administrativo) solicita
  `GET /analitica/bsc/resumen`
- **THEN** el sistema responde 403, igual que para reporte diario/churn/funnel/P&L/MRR-ARR

#### Scenario: Rol de área (no superadmin) intenta acceder al Balanced Scorecard
- **WHEN** una cuenta con un rol de `BRIDGE_USUARIO_ROL_ADMIN` distinto de `superadmin` (ej.
  `admin_finanzas`) solicita `GET /analitica/bsc/resumen`
- **THEN** el sistema responde 403 — el Balanced Scorecard es una herramienta de staff interno
  (`require_staff`), no de un área administrativa específica
