## Contexto

Ver `proposal.md`. Este documento cubre las decisiones técnicas no obvias.

## Decisión 1 — Fórmula de liquidación (pool real, pro-rata por streams reales)

Réplica simplificada del modelo "market-centric" real de streaming (Spotify, entre otros):

```
pool_total(periodo)        = Σ FACT_TRANSACCION_PAGO.monto WHERE estado='exitosa' AND fecha ∈ periodo
                            + Σ FACT_INGRESO_PUBLICITARIO.monto WHERE fecha ∈ periodo
pool_rightsholders(periodo) = pool_total(periodo) × TASA_RIGHTSHOLDERS   # 0.70, constante Python
                                                                          # (mismo precedente que
                                                                          # TASA_EXITO_DEFAULT en
                                                                          # facturacion/queries.py)

total_streams(periodo)     = Σ streams de TODOS los tracks reproducidos en el periodo
                              (FACT_ENGAGEMENT_USUARIO, event_type='reproduccion')

# Por cada track CON contrato vigente en el periodo:
track_streams               = streams del track en el periodo
track_revenue                = pool_rightsholders × (track_streams / total_streams)
master_pool                  = track_revenue × 0.80   # PCT_MASTER, constante Python
publishing_pool               = track_revenue × 0.20   # PCT_PUBLISHING, constante Python

monto_sello      = master_pool × pct_master_sello/100     + publishing_pool × pct_publishing_sello/100
monto_artista    = master_pool × pct_master_artista/100   + publishing_pool × pct_publishing_artista/100
monto_productor  = master_pool × pct_master_productor/100
```

Tracks reproducidos SIN contrato vigente cuentan en `total_streams` (bajan la porción de todos)
pero no generan ninguna fila en `FACT_LIQUIDACION_REGALIA` — equivalente real a "regalías no
reclamadas" (unclaimed royalties), no un bug: nadie definió quién cobra por ese track todavía.

**Por qué constantes Python y no una tabla `DIM_TASA_REGALIA`**: mismo criterio que
`TASA_EXITO_DEFAULT`/`IVA_RATE` en `facturacion` — son parámetros de negocio que cambian por
decisión editorial, no datos transaccionales; una tabla de una fila no aporta nada que el
código no documente ya.

## Decisión 2 — Grano del contrato: por track, no por álbum

Todo el modelo de negocio ya usa `fact_id`/`fact_id_track` como grano atómico en cualquier tabla
transaccional (`FACT_RESTRICCION_REPRODUCCION`, `FACT_SUBIDA_TRACK`,
`BRIDGE_TRACK_PLAYLIST_USUARIO`), nunca `album_id`. Mantener `DIM_CONTRATO_REGALIA` a nivel track
evita introducir el único punto del modelo con doble grano (álbum y track) y su ambigüedad de
resolución cuando ambos existen para el mismo track.

## Decisión 3 — Cuenta de sello: alta exclusiva de admin, no autoservicio

`DIM_CUENTA_ARTISTA` es autoservicio porque cualquier usuario puede reclamar ser artista y queda
en `pendiente` hasta que admin lo apruebe. Un sello discográfico **ya existe** como entidad de
catálogo (`DIM_SELLO_DISCOGRAFICO`, administrada exclusivamente por admin en `distribucion`) antes
de que cualquier persona pida representarlo — vincular un usuario real a ese sello es una
operación de onboarding B2B (como firmar un contrato), no una solicitud abierta. `DIM_CUENTA_SELLO`
se crea solo vía `POST /regalias/admin/cuentas-sello` (admin). El usuario vinculado inicia sesión
como cualquier Cliente B2B (`role=analyst`, capability `seguridad`, sin rol nuevo) — esta tabla
solo resuelve a qué `sello_id` corresponde ese `usuario_id` para sus reportes de ganancias.

## Decisión 4 — Ingreso publicitario en tiempo real, no por lote

`FACT_INGRESO_PUBLICITARIO` se escribe en el mismo request que registra una impresión completada
(`monto = campaña.cpm / 1000`), no en un job periódico agregado. Así una impresión real genera de
inmediato una fila real de ingreso (demostrable con un solo curl), y la liquidación de regalías
solo necesita sumar esta tabla por rango de fecha — no hay una segunda tubería de agregación que
mantener sincronizada con `FACT_IMPRESION_ANUNCIO`.

## Decisión 5 — Por qué el DAG no llama a la API por HTTP

`etl/dags/finanzas_periodicas_dag.py` corre en el contenedor `airflow`, que monta `./etl` (no
`./api`) — no tiene el paquete `api` en su `PYTHONPATH ni acceso directo a `procesar_pago()`.
Se evaluaron dos opciones:

1. Llamar `POST /facturacion/transacciones` vía HTTP interno (`http://api:8000/...`, misma red
   Docker) — requiere resolver un token de sesión válido para cada usuario a renovar, sin que
   exista ningún concepto de "usuario de sistema" en `seguridad` hoy. Añadir uno solo para este
   caso es más superficie nueva que el problema que resuelve.
2. Reimplementar el cálculo (tasa de éxito 90%, IVA) directamente en
   `etl/gold/facturacion_recurrente.py` contra ClickHouse/PocketBase, con los mismos
   `utils/clickhouse_client.py`/`utils/pocketbase_client.py` que ya usa el resto de `gold/`.

Se eligió la opción 2 — mismo precedente ya aceptado en el proyecto (`creadores/promocion.py`
duplica lógica de resolución de dimensiones que también existe en `etl/gold/loader.py`, ver
`docs/PENDIENTES.md`). Sigue siendo 100% Python (RT-01); solo cambia el proceso que lo ejecuta.

## Decisión 6 — Idempotencia de la renovación (sin tabla de control nueva)

Una suscripción de pago se renueva si han pasado ≥30 días desde su última
`FACT_TRANSACCION_PAGO` con `estado='exitosa'` (o desde `suscripcion.created` si nunca se cobró).
No hace falta una tabla de control adicional: la propia `FACT_TRANSACCION_PAGO` ya es la fuente
de verdad de cuándo se cobró por última vez. Si el usuario no tiene ningún `DIM_METODO_PAGO`
registrado, la renovación de esa suscripción se omite (se loguea, no se fuerza un cobro sin
método) — mismo criterio de "no autocobrar sin método real" que ya rige `confirmar_suscripcion`.

## Decisión 7 — `require_active_subscription`: se conecta, no se elimina

La auditoría encontró este dependency ya escrito pero sin ningún router que lo use (código
muerto), y con un defecto de diseño: una suscripción free también queda `estado="activa"` en
PocketBase, así que no distingue free/premium tal como está. Se ajusta para aceptar un
`plan_minimo` explícito y se aplica a un límite adicional real (ver tasks.md capability
`suscripciones`) en vez de borrarlo — ya resolvía correctamente "¿hay alguna suscripción activa
del usuario?", que sigue siendo útil como bloque de construcción.
