## ADDED Requirements

### Requirement: Retención fiscal en la liquidación de regalías
El sistema SHALL calcular y registrar una retención fiscal sobre cada monto liquidado a un
rightsholder (sello, artista o productor), separando el monto bruto calculado, el porcentaje de
retención aplicado, el monto retenido, y el monto neto efectivamente disponible para el
rightsholder. La tasa de retención SHALL resolverse según el país del rightsholder si tiene una
tasa propia configurada; si no, SHALL usar una tasa global de plataforma configurable. El monto
retenido SHALL tratarse como un pasivo pendiente de remitir a la autoridad fiscal, no como ingreso
de la plataforma.

#### Scenario: Liquidación con retención por país propio del rightsholder
- **WHEN** se liquida un período y el país del rightsholder tiene una tasa de retención fiscal
  propia configurada
- **THEN** el sistema calcula el monto retenido usando esa tasa propia, y registra por separado
  el monto bruto, el monto retenido y el monto neto

#### Scenario: Liquidación con retención por tasa global (sin tasa propia del país)
- **WHEN** se liquida un período y el país del rightsholder no tiene una tasa de retención fiscal
  propia configurada, o no se puede determinar su país
- **THEN** el sistema calcula el monto retenido usando la tasa global de plataforma

#### Scenario: El monto neto es el que queda disponible para retiro
- **WHEN** un rightsholder consulta su saldo disponible o solicita un retiro
- **THEN** el sistema calcula el saldo disponible sobre el monto neto (bruto menos retención), no
  sobre el monto bruto

#### Scenario: El monto retenido es visible en las ganancias del rightsholder
- **WHEN** un artista o sello consulta sus ganancias
- **THEN** el sistema muestra, además del monto neto, el monto bruto y el monto retenido de cada
  liquidación
