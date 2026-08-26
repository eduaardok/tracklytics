## Purpose

Extender la simulación de actividad de negocio para que un Lead Data Engineer pueda rellenar
huecos de un rango de períodos concreto (no solo generar actividad de la última hora) y
refrescar la capa Gold a continuación en la misma operación, con estado visible de qué se
generó y cuándo.

## Objetivo

Extender la simulación de actividad de negocio para que un Lead Data Engineer pueda rellenar
huecos de un rango de períodos concreto (no solo generar actividad de la última hora) y
refrescar la capa Gold a continuación en la misma operación, con estado visible de qué se
generó y cuándo.

## ADDED Requirements

### Requirement: Generación bajo demanda con relleno de huecos

El sistema SHALL permitir disparar la generación de actividad de negocio para un rango de
períodos explícito (`periodo_inicio`/`periodo_fin`), rellenando ÚNICAMENTE los períodos
dentro de ese rango que todavía no tengan datos generados para el dominio pedido — un
período ya cubierto SHALL omitirse, no duplicarse. La operación SHALL encadenar, al
finalizar la generación, un refresco completo de la capa Gold (los 30 informes compuestos)
para que el resultado sea visible sin un paso manual aparte. El sistema SHALL exponer el
estado de la última corrida por dominio de negocio y por tabla Gold, y si hay una ejecución
en curso en este momento.

#### Scenario: Rellenar un hueco dentro de un rango ya parcialmente generado
- **WHEN** un Lead Data Engineer dispara la generación para un rango de períodos donde
  algunos meses ya tienen datos generados y otros no
- **THEN** el sistema genera actividad únicamente para los meses sin datos, deja los ya
  cubiertos sin tocar, y al finalizar dispara el refresco de la capa Gold

#### Scenario: Disparar la generación mientras otra corrida está en curso
- **WHEN** un Lead Data Engineer dispara la generación bajo demanda y ya hay una ejecución
  de la misma operación en curso
- **THEN** el sistema rechaza la nueva ejecución en vez de superponerla con la que sigue
  corriendo

#### Scenario: Consultar el estado de generación
- **WHEN** un Lead Data Engineer o superadmin consulta el estado de generación
- **THEN** el sistema responde con la última corrida registrada por cada dominio de negocio,
  la última corrida real de cada tabla Gold (con su resultado), y si hay una ejecución en
  curso ahora mismo

#### Scenario: Panel interno, nunca en superficies de negocio
- **WHEN** cualquier usuario (con o sin rol administrativo) navega por las superficies de
  negocio de la plataforma (informes compuestos, catálogo, biblioteca, panel B2B)
- **THEN** el sistema no expone en ningún punto el concepto de generación de actividad
  simulada, semillas, marcadores de origen sintético, ni nombres de DAGs — esa información
  queda exclusivamente en el panel interno de operaciones gateado por rol administrativo
