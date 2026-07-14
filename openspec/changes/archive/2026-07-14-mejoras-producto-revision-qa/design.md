## Context

Los tres cambios de este documento tocan puntos de decisión ya existentes (quién ve un anuncio, qué
se muestra antes de confirmar un trial, cómo se consulta disponibilidad por país) sin introducir
ninguna capability nueva ni tabla nueva. Cada uno vive en una capability distinta (`publicidad`,
`suscripciones`, `distribucion`) y no tiene dependencia entre sí — se documentan juntos porque
surgieron de la misma revisión manual, no porque compartan una decisión de arquitectura común.

## Goals / Non-Goals

**Goals:**
- Que una cuenta de artista aprobada quede exenta de anuncios sin necesidad de una suscripción paga.
- Que el usuario sepa, antes de confirmar un trial, cuándo empezará el cobro real.
- Que consultar disponibilidad por país no dependa de conocer de antemano el nombre exacto de un track.

**Non-Goals:**
- No se agrega la opción de "pagar ahora y que el período pagado empiece tras el trial" — solo el
  disclosure informativo de la fecha de cobro (fuera de alcance explícito, per confirmación del
  usuario).
- No se cambia el sistema de pago simulado (últimos 4 dígitos, sin dirección/CVV) — es un mock
  documentado, no parte de esta revisión.
- No se agrega conversión de moneda a la lista de disponibilidad ni a ningún otro artefacto de esta
  change — la corrección de la moneda hardcodeada en facturación se resuelve directamente en código,
  sin requirement nuevo, porque es un bug de implementación (la spec de `facturacion` ya exige
  mostrar el monto correcto) y no un cambio de comportamiento especificado.

## Decisions

### 1. Exención de ads: se resuelve junto al plan, no como un chequeo aparte
`publicidad/router.py::_plan_de_usuario` ya es el único punto de decisión que consultan tanto
`/publicidad/impresion` como `/publicidad/impresion-display`. En vez de agregar un segundo chequeo
independiente en cada endpoint, `_plan_de_usuario` (o una función hermana que la envuelva) también
resuelve si el usuario tiene una cuenta de artista aprobada, reutilizando
`CUENTA_ACTUAL_POR_USUARIO` de `paquetes/creadores/queries.py` (cross-package import de queries, ya
un patrón aceptado en este proyecto — ej. `simulacion` reutiliza queries de `regalias`/`facturacion`).
Si la cuenta está aprobada, el resultado se trata como exento de ads independientemente del
`tipo_plan` real, sin necesidad de escribir ningún registro falso en `suscripciones`.

**Alternativa descartada**: dar a un artista aprobado una suscripción `free` especial o un
`tipo_plan` nuevo tipo `"artista"`. Se descartó porque mezclaría dos modelos independientes
(identidad de creador vs. plan de consumo pagado) y rompería la semántica ya establecida de
`suscripciones` como "planes que un usuario contrata y paga".

### 2. Disclosure de trial: fecha calculada en frontend, elegibilidad resuelta por el backend
La FECHA de fin de trial es un cálculo trivial y determinista (`hoy + DIAS_TRIAL_PREMIUM`, la misma
constante que ya usa `suscripciones/router.py`) — el frontend la calcula localmente con una
constante espejo, sin necesidad de ningún endpoint nuevo.

La ELEGIBILIDAD al trial ("nunca tuvo una suscripción previa a premium, activa o cancelada") sí
depende de estado del servidor (`pb_client.list_historial_por_plan`) que el frontend no tiene forma
de replicar sin duplicar esa consulta. En vez de agregar un endpoint dedicado, `GET
/suscripciones/planes` (ya se consulta al cargar la página) se amplía para incluir
`elegible_trial: bool` en el plan `premium`, calculado con exactamente la misma condición que ya usa
`confirmar_suscripcion` al decidir `en_trial` — una sola fuente de verdad, sin duplicar la regla de
negocio en el cliente. El disclosure solo se muestra cuando `elegible_trial` es `true`.

**Alternativa descartada**: agregar un endpoint `GET /suscripciones/preview-trial` dedicado. Se
descartó porque `GET /planes` ya se consulta al entrar a la página y ya devuelve el objeto del plan
premium — agregarle un campo es más simple que una llamada de red adicional para el mismo propósito.

**Alternativa descartada (calcular elegibilidad en el cliente)**: replicar `historial_premium` sin
consultar el backend. Se descartó porque el frontend no tiene visibilidad de suscripciones
canceladas pasadas (`activaQuery` solo trae la activa actual) — mostrar el disclosure sin esta
verificación podría prometer un trial a un usuario que en realidad va a ser cobrado de inmediato.

### 3. Disponibilidad por país: nuevo endpoint de lista, el existente de un track se mantiene
Se agrega `GET /app/v1/distribucion/disponibilidad` (sin `{fact_id_track}`) que devuelve una página
de tracks con su estado de disponibilidad para un país (el del usuario por defecto, o uno indicado),
filtrable por `disponible`/`bloqueado`/todos y con búsqueda opcional por nombre — mismo patrón de
paginación y filtro ya usado en `gestion_datos` (`GET /facts`, `GET /dim/{table}`). El endpoint
puntual `GET /disponibilidad/{fact_id_track}` no se modifica ni se elimina: sigue sirviendo para
consultar un track específico desde otros flujos (ej. desde la página del track en el catálogo).

**Alternativa descartada**: convertir el endpoint puntual en el único endpoint, forzando siempre a
pasar una lista de `fact_id_track`. Se descartó porque cambiaría el contrato de un endpoint ya usado
por otras páginas (breaking change innecesario) cuando agregar uno nuevo resuelve el caso de uso sin
tocar el existente.

## Risks / Trade-offs

- **[Riesgo]** La query de disponibilidad por país sobre el catálogo completo (hasta ~1.6M tracks al
  final del semestre) podría ser costosa sin paginación. → **Mitigación**: mismo patrón de
  `LIMIT/OFFSET` con `page`/`limit` ya usado en `facts_list`/`dim_list` de `gestion_datos`.
- **[Trade-off]** La constante de días de trial duplicada en frontend (sin endpoint que la sirva)
  puede desincronizarse si cambia el backend sin actualizar el frontend. Aceptado porque agregar un
  endpoint solo para servir un número estático sería sobre-ingeniería para el alcance de esta
  change; el comentario en el código deja explícita la dependencia para quien la cambie después.
