## Context

Tracklytics distingue datos operativos (estado vivo de la aplicación, mutado por usuarios) de datos analíticos (hechos históricos, alimentados por ETL desde Python, nunca mutados directamente por el cliente). La capability `suscripciones` introduce una entidad operativa nueva (la suscripción de un usuario/cliente) que debe soportar alta, consulta y cancelación con baja latencia, y que además es la fuente de un hecho de negocio (FACT_SUSCRIPCION) usado en reportes tácticos/estratégicos de ingresos (ARR/MRR), fuera del alcance de esta capability.

Esta capability depende de la capability `catalogo` para la autenticación: tanto Usuario B2C como Cliente B2B llegan ya autenticados con un token de sesión emitido por PocketBase.

## Goals / Non-Goals

**Goals:**
- Mostrar los planes disponibles según el tipo de actor (free/premium para B2C; básico/pro/enterprise para B2B).
- Permitir confirmar una suscripción, registrarla con monto, moneda, fecha de inicio y estado, y reflejar el cambio de acceso del usuario/cliente.
- Garantizar que solo exista un plan activo por usuario/cliente en todo momento.
- Permitir consultar el plan activo y cancelarlo.
- Dejar rastro auditable de monto y moneda registrados.

**Non-Goals:**
- Procesar pagos reales contra una pasarela externa (Stripe/Adyen).
- Generar facturación o comprobantes fiscales.
- Soportar conversión de moneda en tiempo real.
- Calcular o exponer métricas agregadas de ingresos (ARR/MRR) — eso es responsabilidad del nivel táctico/estratégico, leyendo desde FACT_SUSCRIPCION en ClickHouse.

## Decisions

### Dónde vive la suscripción: PocketBase como sistema de registro operativo

La suscripción (estado activo/cancelada, monto, moneda, fecha de inicio) se persiste en **PocketBase**, no directamente en ClickHouse, por las mismas razones ya establecidas para otras entidades operativas de usuario (favoritos, playlists, historial en la capability `catalogo`):
- Requiere mutaciones frecuentes y de bajo volumen por usuario/cliente (activar, cancelar), no aptas para el patrón append-only de ClickHouse.
- PocketBase aplica reglas de acceso por registro (un usuario/cliente solo ve y modifica su propia suscripción) sin lógica adicional.
- ClickHouse permanece como la única fuente analítica (RT-05): el hecho `FACT_SUSCRIPCION` (con `DIM_PLAN_SUSCRIPCION`, `DIM_CLIENTE`) se alimenta desde PocketBase a través del pipeline ya establecido en el proyecto (PocketBase → Python ETL → Parquet → ClickHouse), igual que el resto de hechos de negocio. Esta capability no inserta en ClickHouse directamente; la ingesta hacia `FACT_SUSCRIPCION` es responsabilidad del proceso ETL, fuera del alcance operativo de `suscripciones`.

Alternativa descartada: escribir la suscripción directamente en ClickHouse (`FACT_SUSCRIPCION`) desde el endpoint de confirmación. Se rechaza porque violaría RT-01 (todo movimiento de datos ocurre desde Python/ETL, no desde la API operativa) y porque ClickHouse no está pensado para updates frecuentes de un mismo registro (cancelar/reactivar).

### Invariante de un único plan activo

Al confirmar una nueva suscripción, el backend ejecuta, dentro de la misma operación, la cancelación de cualquier suscripción previa activa del mismo usuario/cliente antes de crear la nueva en estado "activa" (RN-SUS-001). Alternativa descartada: dejar ambas suscripciones activas y resolver el conflicto en lectura (p. ej. "la más reciente gana") — se rechaza porque complica la auditoría y el cálculo de acceso a funciones extendidas, y contradice la regla de negocio explícita de un único plan activo.

### Validación de método de pago sin gateway real

El formulario de confirmación exige que el usuario/cliente tenga un método de pago marcado como válido antes de permitir la confirmación de un plan de pago (RN-SUS-002). Esta validación es una verificación de datos a nivel de aplicación (existencia de un método de pago asociado al perfil), no una integración con una pasarela de cobro real — el procesamiento de pago real queda fuera de alcance (sección 13 de la spec). Alternativa descartada: integrar un stub de pasarela de pago (p. ej. Stripe en modo test) — se rechaza porque excede el alcance definido por el usuario para esta capability.

### Auditoría de monto y moneda

Cada suscripción registra monto y moneda en el momento de creación; estos valores no se editan in-place. Cualquier corrección requiere un nuevo registro de suscripción (p. ej. cancelar y volver a suscribir), preservando el historial completo de suscripciones del usuario/cliente como rastro auditable (RNF-SUS-002). Alternativa descartada: permitir editar monto/moneda de una suscripción existente — se rechaza porque rompe la trazabilidad exigida por el requisito.

## Risks / Trade-offs

- [Riesgo] Condición de carrera si el usuario confirma dos suscripciones casi simultáneamente desde distintas pestañas → Mitigación: la cancelación de la suscripción anterior y la creación de la nueva se ejecutan como una operación atómica en el backend antes de responder al cliente.
- [Riesgo] Retraso entre la creación de la suscripción en PocketBase y su disponibilidad en `FACT_SUSCRIPCION` (ClickHouse) por la latencia del pipeline ETL → Mitigación: el acceso a funciones extendidas se decide consultando el estado operativo en PocketBase (fuente de verdad en tiempo real), no el hecho analítico en ClickHouse.
- [Riesgo] Un Cliente B2B intenta seleccionar un plan B2C o viceversa → Mitigación: el backend valida el tipo de actor contra el tipo de plan antes de aceptar la selección (RN-SUS-003).

## Migration Plan

No aplica migración de datos existentes: esta capability introduce una colección nueva de suscripciones en PocketBase y endpoints nuevos en FastAPI; no modifica el modelo de datos técnico de catálogo en ClickHouse. La alimentación de `FACT_SUSCRIPCION` en ClickHouse se incorpora al pipeline ETL existente como una fuente adicional, sin cambios estructurales al pipeline. Despliegue vía `docker compose up` sin pasos manuales adicionales.

## Open Questions

Ninguna pendiente: el motor de persistencia operativa (PocketBase) y la relación con el hecho analítico `FACT_SUSCRIPCION` quedan resueltos en este documento.
