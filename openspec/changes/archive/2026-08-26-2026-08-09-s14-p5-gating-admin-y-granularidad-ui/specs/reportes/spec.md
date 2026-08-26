## Purpose

Exponer en la interfaz de los 30 informes compuestos el control de granularidad temporal que
la capa Gold y la API ya soportan desde S14-P2 (`granularidad=dia|semana|mes|trimestre|anio`)
— hasta este cambio, el parámetro solo era alcanzable por API directa, sin ningún control en
pantalla.

## ADDED Requirements

### Requirement: Selector de granularidad en los informes compuestos

Cada uno de los 30 informes compuestos SHALL mostrar un control para elegir la granularidad
temporal (Día, Semana, Mes, Trimestre, Año), con Mes como valor por defecto. Al cambiar de
granularidad, el sistema SHALL volver a solicitar los datos del informe con la nueva
granularidad y SHALL limpiar cualquier filtro de rango de período (Desde/Hasta) previamente
seleccionado, porque el formato de la etiqueta de período (`2026-W20` en semana, `2026-08` en
mes, `2026-Q3` en trimestre, ...) no es comparable entre granularidades distintas.

#### Scenario: Cambiar la granularidad de un informe compuesto
- **WHEN** un usuario con acceso a un informe compuesto selecciona una granularidad distinta
  a la actual
- **THEN** el sistema recarga el informe con datos agregados en la nueva granularidad y
  reinicia el filtro Desde/Hasta a "sin filtro"

#### Scenario: Cargar un informe compuesto por primera vez
- **WHEN** un usuario abre un informe compuesto sin haber elegido ninguna granularidad antes
- **THEN** el sistema lo carga con granularidad Mes
