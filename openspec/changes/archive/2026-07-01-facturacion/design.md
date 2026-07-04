## Context

`suscripciones` ya registra la intención de compra (plan, monto, moneda, estado) en PocketBase (colección `suscripciones`), pero declara explícitamente "Facturación y generación de comprobantes fiscales" fuera de su alcance. `facturacion` cubre esa pieza faltante: un método de pago simulado por usuario, la simulación del cobro asociado a una suscripción ya existente, y el invoice resultante — sin integrar ninguna pasarela de pago real (no hay credenciales de Stripe/Adyen ni llamada saliente a un procesador).

A diferencia de `seguridad`, aquí no hay fricción con RT-05: un método de pago registrado no se edita una vez creado (no hay "editar tarjeta" en alcance), y una transacción o un invoice, una vez generados, son hechos ya ocurridos que no se modifican retroactivamente. Las tres tablas nuevas (`DIM_METODO_PAGO`, `FACT_TRANSACCION_PAGO`, `FACT_INVOICE`) son, por naturaleza, registros de solo escritura-al-crear (append-only), el mismo patrón ya usado sin fricción para `FACT_AUDIT_LOG`, `FACT_ERROR_SISTEMA` y `LOG_LLAMADAS_PARTNER`.

`FACT_SUSCRIPCION`/`DIM_PLAN_SUSCRIPCION` (modelo de negocio original, sección S6) no existen en el esquema ClickHouse desplegado (verificado en `init_clickhouse.py`) — la suscripción real vive únicamente en PocketBase, gestionada por `paquetes/suscripciones/pb_client.py`. `facturacion` no las duplica ni las inventa: consume PocketBase como dependencia de solo lectura para resolver, a partir de un `usuario_id`, si tiene una suscripción activa y su `id` de registro, igual que ya hace `biblioteca` y `analitica` reutilizando `suscripciones.pb_client.list_activas`.

## Goals / Non-Goals

**Goals:**
- Registrar métodos de pago simulados (tipo, últimos 4 dígitos, país) asociados al usuario autenticado.
- Simular el resultado de una transacción de cobro (éxito o fallo) asociada a una suscripción activa del propio usuario.
- Emitir un invoice (monto + IVA) automáticamente cuando la transacción es exitosa.
- Exponer historial de transacciones e invoices, con acceso propio por defecto y acceso ampliado para `admin`.

**Non-Goals:**
- Integrar una pasarela de pago real (Stripe/Adyen/PayPal) — no hay llamada saliente a ningún procesador; el resultado de la transacción se determina dentro de esta misma capability.
- Reintentos automáticos de una transacción fallida — el usuario debe iniciar una nueva transacción manualmente.
- Anulación, corrección o nota de crédito sobre un invoice ya emitido — un invoice emitido es terminal en este alcance.
- Tasas de IVA variables por país/región — se usa una única tasa fija, aunque `DIM_METODO_PAGO` capture país (dato descriptivo, no usado para tarificar en este cambio).
- Migrar `suscripciones` a ClickHouse o crear `FACT_SUSCRIPCION`/`DIM_PLAN_SUSCRIPCION` — quedan exactamente donde están hoy (PocketBase), fuera de alcance de este cambio.

## Decisions

### Las tres tablas nuevas viven enteramente en ClickHouse, sin fricción con RT-05
`DIM_METODO_PAGO`, `FACT_TRANSACCION_PAGO` y `FACT_INVOICE` se crean en ClickHouse (`MergeTree`, append-only). A diferencia de `DIM_USUARIO`/`FACT_SESION` en `seguridad`, ninguna de estas tres necesita representar una edición posterior: un método de pago no se modifica tras registrarse (si un método deja de sernos útil, simplemente no se vuelve a usar; no hay flujo de "eliminar/editar tarjeta" en este alcance), y una transacción/invoice son hechos consumados. No se requiere `ReplacingMergeTree` ni ningún patrón de versionado.

### Referencia a la suscripción como String (id de PocketBase), no como FK a una tabla ClickHouse inexistente
`FACT_TRANSACCION_PAGO.suscripcion_id` almacena el `id` del registro de la colección `suscripciones` de PocketBase, como texto plano — no hay `FACT_SUSCRIPCION` en ClickHouse contra la cual hacer join. Antes de simular una transacción, el endpoint resuelve la suscripción activa del usuario llamando a `paquetes.suscripciones.pb_client.list_activas(token, usuario_id)` (mismo cliente y patrón que ya usan `biblioteca` y `analitica`), y toma su `id` para la transacción. Alternativa descartada: crear `FACT_SUSCRIPCION` en ClickHouse ahora — se rechaza explícitamente porque el enunciado de este cambio prohíbe duplicar ese modelo; su eventual alimentación vía ETL sigue siendo responsabilidad futura de `suscripciones`/analítica, no de `facturacion`.

### Sin suscripción activa, no hay transacción posible
Si `list_activas` no devuelve ninguna suscripción vigente para el usuario, la simulación de transacción se rechaza antes de generar cualquier registro (ni transacción ni invoice) — no tiene sentido cobrar por algo que el usuario no está contratando.

### El `usuario_id` de escritura siempre se deriva del token, nunca del cuerpo de la solicitud
Los endpoints de registro de método de pago y de simulación de transacción obtienen el `usuario_id` exclusivamente de `core.deps.get_current_user` (el mismo mecanismo que usa el resto de la API, incluida `seguridad`). Ningún endpoint de escritura acepta un `usuario_id` de otro usuario en el body — así se impide que un usuario autenticado registre un método de pago o dispare una transacción a nombre de otra persona. Alternativa descartada: permitir que `admin` cree transacciones en nombre de otros usuarios — no está en el alcance solicitado (que es de solo lectura para `admin`) y se rechaza para no ampliar la superficie de escritura sin un requisito explícito.

### Autorización propio/admin en los endpoints de lectura, reutilizando el patrón ya establecido en `seguridad`
Los endpoints de historial (`GET /transacciones`, `GET /invoices`) aceptan un `usuario_id` opcional en query string. Si se omite o coincide con el usuario autenticado, se listan sus propios registros. Si se especifica un `usuario_id` distinto, se exige rol `admin` (dependencia `require_admin`, reutilizada de `paquetes.seguridad.deps`) — de lo contrario, 403. Alternativa descartada: duplicar `require_admin` dentro de `facturacion` — se reutiliza la ya existente de `seguridad` (dependencia entre capabilities ya establecida, ej. `biblioteca` reutiliza `suscripciones.pb_client`).

### Auditoría de operaciones de pago vía el helper ya existente en `seguridad`
El registro de un método de pago y cada intento de pago (exitoso o fallido) se auditan en `FACT_AUDIT_LOG` llamando a `paquetes.seguridad.audit.record(...)` — el mismo helper que ya usa `seguridad` para el otorgamiento/revocación de permisos. No se crea un log de auditoría propio de `facturacion`: mover dinero (aunque sea simulado) es tan sensible como cambiar un permiso, y ya existe un mecanismo de auditoría genérico pensado exactamente para esto (`audit.py` se documentó explícitamente como "reutilizable por otras capabilities" al construirse). Se audita tanto el éxito como el fallo del pago — un intento fallido también es información relevante para auditoría (ej. detectar abuso o errores repetidos), no solo el camino feliz. Alternativa descartada: crear un log de auditoría específico de facturación — se rechaza porque duplicaría infraestructura ya resuelta sin una razón de dominio que lo justifique.

### Simulación de resultado de transacción (detalle técnico, no de negocio)
La transacción se marca `exitosa` o `fallida` mediante una regla de simulación interna (no una pasarela real): por defecto, un resultado probabilístico con una tasa de éxito fija; opcionalmente, el request puede incluir un indicador de prueba para forzar el resultado de forma determinística (usado en pruebas automatizadas/manuales, nunca expuesto como una capacidad de negocio en la spec funcional). El invoice solo se genera cuando el resultado simulado es `exitosa`.

### Cálculo de IVA con tasa fija
El invoice calcula `iva` como una tasa fija sobre el `monto` de la transacción (constante en código, no configurable por país pese a que `DIM_METODO_PAGO` capture país). El invoice queda en estado terminal `emitido` al crearse; no hay transición de estado posterior en este alcance (ver Non-Goals).

## Risks / Trade-offs

- [Riesgo] La simulación de éxito/fallo no reproduce el comportamiento real de una pasarela (reintentos, códigos de error específicos, 3-D Secure, etc.) → Mitigación: aceptado explícitamente como Non-Goal; el foco de esta capability es el modelo de datos y el flujo de facturación, no la fidelidad de un procesador de pagos real.
- [Riesgo] Resolver la suscripción activa contra PocketBase en cada transacción agrega una llamada de red por solicitud → Mitigación: mismo patrón y orden de magnitud de latencia ya aceptado hoy en `biblioteca`/`analitica` (red interna de Docker Compose).
- [Riesgo] Sin anulación de invoices, un error operativo (ej. simular una transacción de prueba en el ambiente equivocado) deja un invoice "real" permanente → Mitigación: aceptado como Non-Goal; un flujo de corrección contable queda para una capability futura si se requiere.
- [Riesgo] La tasa de IVA fija no refleja variación real por país/región → Mitigación: aceptado como Non-Goal explícito; `DIM_METODO_PAGO.pais` queda como dato descriptivo para uso analítico futuro, no para tarificación en este cambio.

## Migration Plan

No aplica migración de datos previos: `facturacion` no tiene historial preexistente que backfillear (a diferencia de `seguridad`, que sí necesitaba reflejar usuarios ya registrados en PocketBase antes de esta capability). Se agregan las 3 tablas nuevas en `init_clickhouse.py` (idempotente, `CREATE TABLE IF NOT EXISTS`) y el paquete `api/paquetes/facturacion/` se monta en `main.py`. Despliegue vía `docker compose up`, sin pasos manuales adicionales.

## Open Questions

- Si en el futuro se requiere IVA variable por país/región, `DIM_METODO_PAGO.pais` ya está disponible como insumo — la lógica de tarificación por región queda fuera de este cambio.
- Un mecanismo de reintento automático de transacciones fallidas (ej. reintento a las 24h) no está definido; hoy el usuario debe iniciar una nueva transacción manualmente.
