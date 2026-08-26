## Purpose

Extender el mecanismo de simulación de actividad de negocio, hasta ahora acotado a "la
última hora" bajo demanda, a un backfill histórico de 24 meses que cubra todos los dominios
de negocio que agregan los 30 informes compuestos — para que la capa Gold tenga eventos
reales que agregar en vez de fabricar cifras en tiempo de agregación.

## Objetivo

Extender el mecanismo de simulación de actividad de negocio, hasta ahora acotado a "la
última hora" bajo demanda, a un backfill histórico de 24 meses que cubra todos los dominios
de negocio que agregan los 30 informes compuestos — para que la capa Gold tenga eventos
reales que agregar en vez de fabricar cifras en tiempo de agregación.

## ADDED Requirements

### Requirement: Backfill histórico de actividad de negocio

El sistema SHALL soportar la generación de actividad de negocio reproducible sobre una
ventana histórica de 24 meses (no solo la última hora), cubriendo usuarios, suscripciones,
publicidad, engagement, regalías, disponibilidad, llamadas de partners, comunidad,
producto y contenido — los dominios que agregan los 30 informes compuestos de la capability
`reportes`. El backfill SHALL ser idempotente por dominio: correrlo dos veces no SHALL
duplicar eventos. Las liquidaciones de regalías generadas por el backfill SHALL calcularse
con la misma fórmula real ya usada por la liquidación bajo demanda (mismo pool
rightsholders/plataforma, mismo split master/publishing), no una reimplementación separada.

#### Scenario: Ejecutar el backfill histórico
- **WHEN** un Lead Data Engineer/CTO dispara el backfill histórico de negocio
- **THEN** el sistema genera eventos reproducibles en las tablas `FACT_*` correspondientes
  para los 24 meses de ventana, con crecimiento progresivo y estacionalidad, sin tocar el
  catálogo musical

#### Scenario: Reintentar el backfill ya generado
- **WHEN** el backfill histórico se ejecuta una segunda vez sobre un dominio que ya fue
  generado
- **THEN** el sistema detecta que ese dominio ya tiene datos y no genera eventos duplicados

#### Scenario: Liquidar regalías sobre el período del backfill
- **WHEN** el backfill genera transacciones, ingresos publicitarios y reproducciones para
  un mes calendario dentro de la ventana histórica
- **THEN** el sistema liquida las regalías de ese mes usando la misma fórmula real de
  liquidación bajo demanda, no un monto generado por semilla fija
