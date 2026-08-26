## Purpose

Extender el control de idempotencia ya establecido para la ingesta del catálogo musical al
backfill de eventos de negocio, sin introducir un mecanismo de control paralelo — mismo
patrón, mismo registro de auditoría.

## Objetivo

Extender el control de idempotencia ya establecido para la ingesta del catálogo musical al
backfill de eventos de negocio, sin introducir un mecanismo de control paralelo — mismo
patrón, mismo registro de auditoría.

## MODIFIED Requirements

### Requirement: Control de idempotencia

El sistema SHALL verificar, antes de insertar, si el período/lote ya fue cargado
previamente, y SHALL evitar duplicación si ya existe. El pipeline SHALL ser idempotente:
volver a ejecutar la carga de un período ya procesado no debe duplicar registros. Un
período/lote ya marcado como cargado no puede volver a insertarse sin una acción explícita
de recarga forzada por el Lead Data Engineer. El mismo mecanismo de control
(`ETL_BATCH_CONTROL`, distinguido por un `checksum` propio del proceso) SHALL aplicarse a
procesos de generación de datos reproducibles fuera de la ingesta de catálogo (backfill de
eventos de negocio), sin introducir una tabla de control paralela.

#### Scenario: Intento de recarga de un período ya cargado
- **WHEN** un período ya fue cargado exitosamente con anterioridad y el Lead Data Engineer
  intenta ejecutar la ingesta de ese mismo período sin marcar recarga forzada
- **THEN** el sistema detecta la duplicidad mediante el control de idempotencia y no inserta
  los registros nuevamente

#### Scenario: Reintentar un backfill de negocio ya generado
- **WHEN** un proceso de backfill de eventos de negocio (distinto de la ingesta de catálogo)
  se ejecuta dos veces sobre el mismo dominio
- **THEN** el sistema usa el mismo `ETL_BATCH_CONTROL`, distinguido por su propio
  `checksum`, para detectar que ese dominio ya fue generado y no duplica eventos
