## Purpose

Retirar la fabricación de datos en la capa de agregación Gold: los 30 informes compuestos
deben agregar exclusivamente eventos de negocio reales, con `es_estimado` conservado en el
esquema como garantía de esquema, no como mecanismo activo de relleno.

## Objetivo

Retirar la fabricación de datos en la capa de agregación Gold: los 30 informes compuestos
deben agregar exclusivamente eventos de negocio reales, con `es_estimado` conservado en el
esquema como garantía de esquema, no como mecanismo activo de relleno.

## MODIFIED Requirements

### Requirement: Indicador de dato estimado

El sistema SHALL conservar la columna `es_estimado` en las 12 tablas `GOLD_*_PERIODO` como
garantía de esquema: si en el futuro un hecho de negocio deja de tener respaldo real en el
catálogo, la fila correspondiente SHALL marcarse `es_estimado = 1` en vez de omitirse o
fabricarse sin marca. El sistema NO SHALL completar ninguna fila con un valor generado por
semilla fija en la capa de agregación Gold (`etl/gold_ch/*.py`) — un período o dimensión sin
hecho de negocio real en el catálogo SHALL omitirse, nunca rellenarse. El sistema SHALL
marcar con `es_estimado = 0` las filas cuyo valor provenga de datos reales, incluso si ese
valor real resulta ser cero.

#### Scenario: Hecho fuente inexistente para un período
- **WHEN** el catálogo no tiene el hecho de negocio necesario para calcular una métrica de
  un período determinado
- **THEN** la tabla Gold correspondiente NO registra ninguna fila para esa combinación de
  período y dimensión, en vez de fabricar un valor

#### Scenario: Hecho fuente real disponible
- **WHEN** el catálogo sí tiene el hecho de negocio necesario para un período
- **THEN** la tabla Gold registra el valor agregado real con `es_estimado = 0`, incluso si
  ese valor real resulta ser cero (un cero real no se reemplaza por una estimación)

#### Scenario: Columna derivada sin fuente real en el esquema actual
- **WHEN** una métrica no tiene ninguna columna de origen real en el catálogo para
  calcularse (ej. una métrica de impacto de un experimento sin columna de resultado)
- **THEN** el sistema deriva la métrica de una señal real correlacionada cuando existe una
  disponible, o la deja en su valor neutro (cero/vacío) documentado en vez de generarla con
  semilla fija
