## Why

Los 12 módulos de agregación de la capa Gold (`etl/gold_ch/*.py`) fabricaban números con
`rng_for()` cuando el catálogo no tenía el hecho de negocio necesario (19 puntos de
fabricación en 9 módulos), marcando esas filas `es_estimado=1`. La fabricación vivía en la
capa de presentación/agregación, no en el mecanismo de simulación académica ya documentado
del proyecto (RT-07) — y `es_estimado` no se filtraba a ninguna superficie de negocio, así
que buena parte de los 30 informes compuestos mostraba cifras sin ningún evento real detrás,
sin que nadie consultando el informe pudiera saberlo.

## What Changes

- **Backfill de negocio real** (`etl/gold/backfill_negocio.py`, `etl/dags/dag_backfill_negocio.py`):
  genera 24 meses de eventos de negocio reales (usuarios, suscripciones, publicidad,
  engagement, regalías vía el endpoint real de liquidación, disponibilidad, partners,
  comunidad, producto, contenido, auditoría) directo en las tablas `FACT_*` del catálogo —
  mismo principio que ya usaba `api/paquetes/simulacion/generador.py`, extendido a una
  ventana histórica de 24 meses y a todos los dominios de negocio de la capa Gold, no solo
  los 3 originales.
- **Capa Gold limpia**: los 12 módulos de `etl/gold_ch/*.py` ya no llaman a `rng_for()` —
  un período/dimensión sin evento real simplemente no tiene fila. `es_estimado` se conserva
  en el esquema (garantía a futuro) pero vale 0 en las 12 tablas tras este cambio.
- **Cuentas de referencia por rol administrativo**: una cuenta por cada uno de los 6 roles
  de `DIM_ROL_ADMINISTRATIVO` más una cuenta `analyst` (B2B), creadas por los endpoints
  reales de `seguridad` (nunca por INSERT directo), con matriz de gating verificada
  end-to-end contra los 9 departamentos de los 30 informes compuestos.

## Capabilities

### Modified Capabilities

- `reportes`: el requisito "Indicador de dato estimado" cambia — ya no se fabrica ningún
  valor en la capa Gold; el flag queda como garantía de esquema, no como mecanismo activo.
- `simulacion`: se extiende de "generar actividad reciente bajo demanda" a también cubrir
  un backfill histórico de 24 meses sobre todos los dominios de negocio de la capa Gold.
- `seguridad`: se agrega el escenario de cuenta de referencia verificable por cada rol
  administrativo del catálogo.
- `ingesta`: el control de idempotencia (`ETL_BATCH_CONTROL`) se extiende al backfill de
  eventos de negocio, con el mismo mecanismo ya usado por `gold/modelo_negocio_sync.py`.

## Impact

- **Código ETL**: `etl/gold/backfill_negocio.py` (nuevo), `etl/dags/dag_backfill_negocio.py`
  (nuevo), los 12 módulos de `etl/gold_ch/*.py` (limpieza de `rng_for()`), `etl/gold_ch/base.py`
  (retiro de `rng_for`/`permite_relleno_demo`, sin más llamadores).
- **Datos**: ~24 meses de eventos de negocio reales en `FACT_TRANSACCION_PAGO`,
  `FACT_INVOICE`, `FACT_REEMBOLSO`, `FACT_CANCELACION_SUSCRIPCION`, `FACT_IMPRESION_ANUNCIO`,
  `FACT_INGRESO_PUBLICITARIO`, `FACT_ENGAGEMENT_USUARIO`, `FACT_LIQUIDACION_REGALIA`,
  `FACT_DISPONIBILIDAD`, `LOG_LLAMADAS_PARTNER`, `FACT_COMENTARIO`, `FACT_COMPARTICION`,
  `BRIDGE_SEGUIMIENTO_ARTISTA`, `FACT_DENUNCIA`, `FACT_STRIKE_USUARIO`,
  `FACT_TICKET_SOPORTE`, `FACT_IMPRESION_RECOMENDACION`, `FACT_AB_TEST_EXPOSICION`,
  `FACT_NOTIFICACION`, `STG_ARTIST_UPLOADS`, `FACT_SUBIDA_TRACK`, `FACT_AUDIT_LOG`,
  `DIM_USUARIO`. El catálogo musical (`FACT_TRACKS`/dimensiones de audio) no se toca.
- **Cuentas**: 7 cuentas de demostración nuevas (`docs/CUENTAS_DEMO.md`), creadas vía los
  endpoints reales de `seguridad`.
- **Compatibilidad**: los 30 endpoints de informes compuestos no cambian de contrato — solo
  cambia de dónde sale el dato que agregan.
