## Purpose

Garantizar que la base de contratos de regalías tenga cobertura suficiente sobre las
contrapartes reales del catálogo (sellos, cuentas de artista, productores) para que la
liquidación por período refleje una serie histórica real, sin inventar contrapartes que no
existen en el catálogo.

## Objetivo

Garantizar que la base de contratos de regalías tenga cobertura suficiente sobre las
contrapartes reales del catálogo (sellos, cuentas de artista, productores) para que la
liquidación por período refleje una serie histórica real, sin inventar contrapartes que no
existen en el catálogo.

## ADDED Requirements

### Requirement: Cobertura de contratos sobre contrapartes reales del catálogo

El sistema SHALL permitir que la base de contratos de regalías (`DIM_CONTRATO_REGALIA`)
cubra una porción representativa de las contrapartes reales ya existentes en el catálogo
(sellos discográficos, cuentas de artista, productores) — un contrato NUNCA SHALL
referenciar una contraparte (`sello_id`, `cuenta_artista_id`, `productor_id`) que no exista
como fila real en su dimensión correspondiente. La vigencia de los contratos SHALL
distribuirse en el tiempo (no concentrada en una única fecha), para que la liquidación por
período tenga cobertura histórica real en vez de un puñado de contratos aislados en una
ventana angosta.

#### Scenario: Ampliar la base de contratos
- **WHEN** se agregan contratos nuevos a la base para dar cobertura histórica a la
  liquidación de regalías
- **THEN** cada contrato nuevo referencia un sello, cuenta de artista o productor que ya
  existe como fila real en su dimensión — ninguno se inventa sin contraparte real

#### Scenario: Liquidar un período con cobertura de contratos distribuida
- **WHEN** se liquida un período histórico dentro de la ventana de contratos vigentes
- **THEN** el sistema encuentra al menos un contrato vigente para ese período (si hubo
  streams reales de algún track contratado), en vez de depender de una ventana de vigencia
  angosta que deja la mayoría de los períodos sin ningún contrato aplicable
