## 1. Inventario y ventana histórica

- [x] 1.1 Inventario de las 19 llamadas reales a `rng_for()` (no 26) en 9 módulos (no 11), con tabla `FACT_*` destino y conteo real de filas
- [x] 1.2 Revisión de `modelo_negocio_sync_dag.py` — no es una sincronización PocketBase→ClickHouse (premisa falsa del prompt); decisión: materializar suscripciones directo en ClickHouse vía `backfill_negocio.py`
- [x] 1.3 Constantes de negocio confirmadas reales en el código (IVA 15%, retención 10%, precios de plan, splits de regalías 70/30 y 80/20, dunning 3 intentos, 3 strikes)
- [x] 1.4 `inicio_plataforma()` — 24 meses exactos hacia atrás, anclado al primer día del mes

## 2. Backfill de negocio

- [x] 2.1 `etl/gold/backfill_negocio.py` — 13 dominios en orden de dependencia estricto
- [x] 2.2 Idempotencia vía `ETL_BATCH_CONTROL` + `checksum` propio por dominio (mismo patrón que `modelo_negocio_sync.py`)
- [x] 2.3 Regalías: llamada real a `POST /admin/liquidar` (no reimplementación de la fórmula) — requiere cuenta `superadmin` ya creada
- [x] 2.4 `etl/dags/dag_backfill_negocio.py` — un solo `PythonOperator`, disparo manual
- [x] 2.5 Prueba en ventana corta (10 días) antes de la corrida completa; limpieza de datos de prueba
- [x] 2.6 Corrida completa de 24 meses (13/13 dominios, ~24 min)

## 3. Limpieza de la capa Gold

- [x] 3.1 `adquisicion.py` — suscripciones activas/conversiones por plan derivadas de `FACT_TRANSACCION_PAGO` real (antes: siempre demo)
- [x] 3.2 `producto.py` — `metrica_impacto` derivada de engagement real correlacionado (antes: siempre demo aun con `es_estimado=0`, bug de diseño corregido)
- [x] 3.3 Los 7 módulos restantes con `rng_for()` condicional — rama demo eliminada
- [x] 3.4 `base.py` — `rng_for`/`permite_relleno_demo`/`PERIODOS_RELLENO_DEMO` retirados (sin llamadores)

## 4. Cuentas de referencia

- [x] 4.1 7 cuentas creadas vía `POST /auth/registro` + `POST /admin/usuarios/{id}/rol-admin`
- [x] 4.2 `docs/CUENTAS_DEMO.md`
- [x] 4.3 Matriz de gating completa (7 cuentas × 9 departamentos + sin auth) — sin fallos de seguridad

## 5. Verificación

- [x] 5.1 `dag_gold_aggregations` (60 tareas) corrido con los módulos limpios
- [x] 5.2 `sum(es_estimado)` por granularidad en las 12 tablas Gold
- [x] 5.3 `curl` a los 30 informes en granularidad `mes`
- [x] 5.4 `npm run build`

## 6. Documentación

- [x] 6.1 `docs/BITACORA_S14.md` (S14-P3)
- [x] 6.2 `docs/NOTA_METODOLOGICA.md` (nuevo)
- [x] 6.3 Delta de OpenSpec (`reportes`, `simulacion`, `seguridad`, `ingesta`)
