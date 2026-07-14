## Context

El dinero de Tracklytics circula hoy por tres capabilities independientes que nunca se coordinan
entre sí: `facturacion` (cobra suscripciones), `publicidad` (reconoce ingreso por impresión
completada) y `regalias` (reparte ambos ingresos entre rightsholders, ponderado por streams reales
de `FACT_ENGAGEMENT_USUARIO`). Los tres ya están implementados y funcionan; este change cierra
huecos puntuales de cada uno (liquidación duplicable, renovación fallida sin resolución, sin
retiro de ganancias, sin MRR/ARR) y agrega una capability nueva, `simulacion`, para poder
demostrar el flujo completo sin operar la aplicación manualmente miles de veces.

Todo el "dinero" del proyecto ya es simulado por diseño (transacciones con
`random.random() < TASA_EXITO_DEFAULT` en `facturacion/queries.py`, sin pasarela de pago real) —
`simulacion` no introduce una categoría de datos nueva, generaliza el mismo mecanismo que ya usan
`etl/engagement/generator.py` (streams de referencia) y `etl/gold/facturacion_recurrente.py`
(renovaciones), que escriben directo a ClickHouse en vez de pasar por PocketBase/FastAPI.

## Goals / Non-Goals

**Goals:**
- Que liquidar el mismo período de regalías dos veces sea un no-op seguro, no una duplicación.
- Que una renovación de suscripción fallida termine en un estado consistente (cancelada, con
  motivo registrado), no en un limbo de acceso pagado sin cobro.
- Dar a artista/sello una forma de retirar lo que ya ganaron.
- Exponer MRR/ARR como el indicador básico de salud de un negocio de suscripción.
- Permitir generar, en una sola acción administrativa, actividad de negocio suficiente (streams +
  ingreso por suscripción + ingreso publicitario) para que la liquidación de regalías tenga un
  pool real que repartir — y ver el resultado de inmediato en los dashboards ya existentes
  (P&L, MRR, churn).

**Non-Goals:**
- Pasarela de pago o transferencia bancaria real para el retiro de regalías — sigue simulado,
  mismo criterio que el resto del dinero del proyecto.
- Reintentos/dunning multi-día para renovaciones fallidas — una sola pasada, falla = cancela.
- Deduplicación automática entre el endpoint de liquidación y el DAG cuando corren con rangos de
  fecha que se *solapan parcialmente* (se resuelve el caso de rango idéntico, que es el
  documentado como limitación conocida; solapamientos parciales quedan fuera de alcance).
- Que `simulacion` reemplace a `engagement_referencia`/`finanzas_periodicas` (los DAGs académicos
  de crecimiento de catálogo por semana) — son mecanismos independientes con propósitos distintos
  (crecimiento de catálogo semana a semana vs. demostración puntual de flujo de dinero bajo
  demanda); `simulacion` no dispara Airflow en absoluto.

## Decisions

### 1. Por qué los streams por sí solos no generan dinero, y por qué `simulacion` genera tres cosas juntas

La fórmula de liquidación (`regalias/router.py::liquidar_periodo`, duplicada intencionalmente en
`etl/gold/regalias_liquidacion.py`) es:

```
pool_total = SUM(FACT_TRANSACCION_PAGO.monto WHERE estado='exitosa' EN [inicio, fin))
           + SUM(FACT_INGRESO_PUBLICITARIO.monto EN [inicio, fin))
pool_rightsholders = pool_total * 0.70
track_revenue(track) = pool_rightsholders * (streams(track) / streams_totales)
```

Los streams (`FACT_ENGAGEMENT_USUARIO`, `event_type='reproduccion'`) solo aparecen en el
denominador/ponderador de la última línea — determinan **cómo se reparte** `pool_rightsholders`
entre tracks, pero `pool_total` no depende de ellos en absoluto. Generar cien mil reproducciones
sin ingreso de suscripción ni publicitario en el mismo rango produce streams reales pero
`pool_total = 0`, y por lo tanto cero regalías que liquidar — nada que demostrar.

Por eso `POST /simulacion/generar-actividad` genera, en la misma ventana de tiempo (`fecha`/
`event_timestamp` = ahora, no atado al calendario académico de `week_number`/`WEEK1_START` que
usa `engagement_referencia`), los tres tipos de actividad a la vez: streams (determinan el
reparto), suscripciones nuevas (alimentan `pool_total` vía `FACT_TRANSACCION_PAGO`), e impresiones
publicitarias completadas (alimentan `pool_total` vía `FACT_INGRESO_PUBLICITARIO`). Solo así, al
disparar la liquidación inmediatamente después sobre ese mismo rango, hay un pool real que
repartir y streams reales para ponderar el reparto — el admin ve un número de dinero repartido
que no es cero.

Alternativa descartada: generar solo streams y dejar que el admin dispare
`facturacion_recurrente`/`engagement_referencia` por separado — se rechaza porque esos dos DAGs
usan calendarios de tiempo distintos entre sí (`facturacion_recurrente` usa el reloj real,
`engagement_referencia` usa el calendario académico `week_number`), así que sus eventos casi nunca
caen en el mismo rango de fechas por accidente, y coordinarlos manualmente es exactamente la
fricción que este change busca eliminar.

### 2. `simulacion` escribe directo a ClickHouse, no pasa por PocketBase/FastAPI

Igual que `etl/engagement/generator.py` y `etl/gold/facturacion_recurrente.py`, los tres
generadores de `simulacion` insertan directamente en `FACT_ENGAGEMENT_USUARIO`,
`FACT_TRANSACCION_PAGO`/`FACT_INVOICE` y `FACT_IMPRESION_ANUNCIO`/`FACT_INGRESO_PUBLICITARIO`, con
un `usuario_id` sintético (`sim_user_XXXX`, misma convención que `ref_user_XXXX` de
`engagement_referencia`) — sin crear cuentas reales de PocketBase. `procesar_pago`
(`facturacion/router.py`) exige un método de pago real y una suscripción real en PocketBase; para
volumen de demo eso implicaría crear cientos de cuentas y suscripciones reales solo para
descartarlas, sin aportar nada que el pool de liquidación necesite (que solo lee ClickHouse).

Alternativa descartada: reutilizar `confirmar_suscripcion`/`procesar_pago`/`completar_impresion`
en un loop HTTP contra la propia API — se rechaza por el mismo motivo que
`facturacion_recurrente.py` ya documenta para no llamar a la API por HTTP desde Airflow (overhead
de N requests reales, autenticación por usuario sintético que no existe) y porque no cambia el
resultado en ClickHouse, que es lo único que el pool de liquidación consume.

### 3. `simulacion` es un endpoint síncrono de FastAPI, no un DAG de Airflow

A diferencia de `engagement_referencia`/`facturacion_recurrente` (pensados para crecimiento
periódico de catálogo o cron real), `simulacion` está pensado como una acción puntual bajo demanda
("quiero ver dinero moverse ahora, para la demo") — agregar un salto a Airflow (trigger vía REST,
esperar el DAG run, poll de estado) introduce latencia y un paso más de UI sin necesidad real,
dado que el volumen generado (miles de filas, no cientos de miles) corre en segundos dentro de un
único request de FastAPI con `client.insert()` en batch.

Alternativa descartada: un DAG nuevo triggereable desde `gestion_datos` (parametrizando
`AIRFLOW_DAG_ID`, hoy fijo) — se rechaza por la latencia/complejidad de UI adicional sin beneficio
para un caso de uso que es literalmente "un botón, resultado inmediato".

### 4. Idempotencia de liquidación: por rango de fechas exacto, en ambos caminos

Antes de insertar `FACT_LIQUIDACION_REGALIA`, tanto `POST /regalias/admin/liquidar` como
`run_liquidacion_regalias` (DAG) consultan si ya existe alguna fila con el mismo
`(periodo_inicio, periodo_fin)` exacto; si existe, no vuelven a liquidar y responden indicando que
ese período ya estaba liquidado. Se resuelve por rango exacto (no por solapamiento parcial) porque
es el caso real documentado como limitación conocida (llamar dos veces con el mismo rango) y
porque resolver solapamientos parciales requeriría un modelo de "liquidación parcial ya cubierta"
que no aporta valor para el alcance de este change.

### 5. Retiro de regalías: tabla nueva `FACT_RETIRO_REGALIA`, saldo calculado, no almacenado

El saldo disponible de un rightsholder (artista o sello) se calcula en el momento de la consulta
(`SUM(FACT_LIQUIDACION_REGALIA.monto) - SUM(FACT_RETIRO_REGALIA.monto WHERE estado='procesado')`
para ese `rightsholder_id`), no se mantiene como un campo persistido — evita el riesgo de que un
saldo cacheado se desincronice de las liquidaciones reales, mismo criterio de "fuente de verdad
por agregación" que ya usa el resto de `analitica`. Un retiro solicitado (`estado='pendiente'`) no
descuenta el saldo hasta que un admin lo procesa (`estado='procesado'`) o lo rechaza
(`estado='rechazado'`, no descuenta nunca) — evita que un usuario pida el mismo dinero dos veces
mientras el primer retiro sigue pendiente (el saldo disponible ya debe restar los `pendiente` +
`procesado`, no solo los `procesado`, para que esa doble-solicitud no sea posible).

### 6. Renovación fallida = cancelación inmediata, mismo criterio que el trial

`facturacion_recurrente.py` ya calcula `estado = 'exitosa' if random.random() < TASA_EXITO_DEFAULT
else 'fallida'` y hoy no hace nada más si falla. Se agrega: si `estado == 'fallida'`, además de
insertar la transacción fallida, se cancela la suscripción en PocketBase
(`estado='cancelada'`) y se registra `FACT_CANCELACION_SUSCRIPCION` con `motivo='precio',
voluntaria=0` — exactamente el mismo patrón ya implementado en
`suscripciones/router.py::_resolver_trial_vencido` para un trial que expira sin poder cobrarse.
Sin este cambio, un usuario cuya renovación falla queda con acceso premium indefinido sin haber
pagado, lo que además distorsiona MRR (se contaría como ingreso recurrente una suscripción que ya
no se está cobrando).

### 7. MRR/ARR: cálculo en vivo desde PocketBase, no una serie histórica real

MRR = suma de `monto` de todas las suscripciones de pago (`tipo_plan` distinto de `free`) con
`estado='activa'` en PocketBase, vía el mismo mecanismo de token superusuario que ya usa
`pb_client.py` para churn/funnel (`contar_activas`/`_admin_count`, generalizado a una suma en vez
de un conteo). ARR = MRR × 12. La tendencia histórica que acompaña al número actual **no es MRR
reconstruido punto-en-el-tiempo** (PocketBase no guarda ese historial, mismo problema ya
documentado para churn) — se aproxima con `SUM(FACT_TRANSACCION_PAGO.monto WHERE estado='exitosa')`
agrupado por mes, que es un proxy razonable de ingreso recurrente cobrado por mes, no de
suscripciones activas en ese momento. Se documenta la diferencia explícitamente en la respuesta
del endpoint (mismo patrón de campo `nota` ya usado en `/analitica/churn`).

## Risks / Trade-offs

- [Riesgo] El pool generado por `simulacion` es indistinguible del pool real en los dashboards de
  negocio (P&L, MRR) una vez liquidado — un admin podría inflar artificialmente sus propias
  métricas sin darse cuenta de que está viendo datos de simulación → Mitigación: el `usuario_id`
  sintético (`sim_user_XXXX`) queda identificable en las tablas subyacentes para quien audite los
  datos crudos, y la respuesta del endpoint deja explícito cuánto se generó recién, aunque los
  dashboards agregados no lo distingan visualmente (fuera de alcance de este change diferenciar
  visualmente actividad simulada vs. real en cada dashboard existente).
- [Riesgo] Retiro de regalías sin pasarela real podría interpretarse como una promesa de pago que
  el sistema no cumple → Mitigación: mismo framing que el resto del dinero simulado del proyecto
  (`estado='procesado'` es una simulación de éxito, no una transferencia real), documentado igual
  que `TASA_EXITO_DEFAULT` en facturación.
- [Riesgo] Cancelar la suscripción en una renovación fallida podría sorprender a un usuario real
  que solo tuvo mala suerte con la tasa de éxito simulada (10%) → Mitigación: es el mismo
  comportamiento ya aceptado para el trial fallido; consistencia del modelo pesa más que evitar
  una cancelación ocasional en un sistema donde el fallo de cobro es, de por sí, simulado.

## Migration Plan

Sin migración de datos existentes. Cambios de esquema: `CREATE TABLE FACT_RETIRO_REGALIA` nueva en
`init_clickhouse.py`. Sin cambios a tablas existentes. Despliegue vía `docker compose up` sin pasos
manuales adicionales.

## Open Questions

Ninguna pendiente — las decisiones de por qué streams no generan dinero, dónde vive cada pieza
nueva, y el criterio de idempotencia/cancelación quedan resueltas en este documento.
