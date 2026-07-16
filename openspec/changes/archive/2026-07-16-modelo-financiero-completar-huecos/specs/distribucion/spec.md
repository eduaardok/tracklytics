## ADDED Requirements

### Requirement: Configuración de país (moneda, tasa de cambio, IVA y retención fiscal)
El sistema SHALL permitir a un usuario con rol `admin` crear, editar y desactivar países del
catálogo, cada uno con su código de moneda, una tasa de cambio de referencia respecto a USD, y
opcionalmente su propia tasa de IVA y su propia tasa de retención fiscal, sin requerir cambios de
código ni redespliegue. Un país sin tasa de IVA o de retención fiscal propia SHALL usar la
configuración global de la plataforma. La tasa de cambio SHALL tratarse como un valor de
referencia simulado, no una cotización de mercado en tiempo real.

#### Scenario: Administrador crea un país nuevo con su configuración
- **WHEN** un usuario con rol `admin` crea un país nuevo con su moneda, tasa de cambio, y
  opcionalmente su IVA y retención fiscal propios
- **THEN** el sistema agrega el país al catálogo, disponible inmediatamente para cualquier cálculo
  de moneda/IVA/retención

#### Scenario: País sin IVA propio usa la tasa global
- **WHEN** se calcula el IVA de una transacción para un usuario cuyo país no tiene una tasa de
  IVA propia configurada
- **THEN** el sistema usa la tasa de IVA global de la plataforma

#### Scenario: Administrador desactiva un país existente
- **WHEN** un usuario con rol `admin` desactiva un país del catálogo
- **THEN** ese país deja de estar disponible para selección en flujos nuevos, sin afectar
  registros históricos que ya lo referencian
