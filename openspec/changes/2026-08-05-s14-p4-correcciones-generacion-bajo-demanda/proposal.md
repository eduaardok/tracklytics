## Why

La verificación de S14-P3 dejó cuatro problemas reales sin resolver: credenciales en texto
plano commiteadas al repositorio, cuentas demo que solo existían si alguien las creaba a
mano (rompiendo un `docker compose up` limpio), un mapeo monto→plan que descartaba
transacciones sin traza si el monto no coincidía con ningún plan activo, y una base de solo
3 contratos de regalías que dejaba la mayoría de los períodos de los informes en cero.
Además, no había forma de generar más actividad ni refrescar los informes desde la
aplicación una vez que aparecía un hueco nuevo.

## What Changes

- **Credenciales fuera del código** (`etl/gold/backfill_negocio.py`): `SUPERADMIN_DEMO_EMAIL`/
  `SUPERADMIN_DEMO_PASSWORD` se leen de variables de entorno, con el mismo valor demo como
  default explícito en `docker-compose.yml`.
- **Siembra automática de cuentas** (`seed_cuentas_demo.py`, servicio `seed-cuentas-demo`):
  corre en cada `docker compose up`, después de que `api` esté saludable (healthcheck nuevo
  + `depends_on`, sin `sleep`), idempotente.
- **Mapeo monto→plan robusto** (`etl/gold_ch/adquisicion.py`): sin filtro `activo=1` (un plan
  retirado sigue teniendo historia válida); las transacciones sin plan mapeado se cuentan y
  se registran siempre (`GOLD_ETL_LOG.detalle`), nunca se descartan en silencio.
- **Volumen de regalías real** (`etl/gold/expandir_contratos_regalias.py`, corrida única):
  22 contratos (3 retrofechados + 19 nuevos sobre contrapartes reales — 8 sellos + 11 cuentas
  de artista, todas ya existentes en el catálogo), distribuidos en la ventana de 24 meses.
  `etl/gold_ch/regalias.py` bucketea por `periodo_inicio` (el período que la liquidación
  cubre) en vez de `fecha_calculo` (cuándo se calculó) — sin este cambio, correr el backfill
  otra vez seguía dejando casi todo en cero pese a tener datos reales.
- **Generación bajo demanda con relleno de huecos** (`gold.backfill_negocio.
  generar_actividad_rango`, `dag_generar_bajo_demanda`, `POST /simulacion/generar-historico`,
  `GET /simulacion/estado`, panel en `SimulacionPage`): idempotente por dominio+mes
  (`ETL_BATCH_CONTROL`), rellena períodos faltantes dentro de un rango en vez de solo agregar
  al final, y encadena el refresco completo de la capa Gold.

## Capabilities

### Modified Capabilities

- `simulacion`: se agrega la generación bajo demanda con relleno de huecos, distinta en
  alcance del `generar-actividad` original (última hora) — un router propio en el mismo
  paquete, gateado por `admin_datos` (más permisivo que el `superadmin`-only original).
- `seguridad`: las credenciales de servicio (no las de usuarios) SHALL leerse de variables
  de entorno, nunca hardcodeadas; la siembra de las cuentas de referencia por rol pasa de
  manual a automática en el arranque.
- `regalias`: la base de contratos SHALL cubrir una porción representativa de las
  contrapartes reales del catálogo (sellos, cuentas de artista, productores) — nunca
  contrapartes inventadas sin fila real en las dimensiones correspondientes.

## Impact

- **Código ETL**: `etl/gold/backfill_negocio.py` (credenciales por env, `clave_control` en
  las 13 funciones de dominio, `generar_actividad_rango`), `etl/gold_ch/adquisicion.py`
  (mapeo sin filtro `activo`, contador de no mapeadas), `etl/gold_ch/regalias.py` (bucketing
  por `periodo_inicio`), `etl/gold/expandir_contratos_regalias.py` (nuevo, corrida única),
  `etl/dags/dag_generar_bajo_demanda.py` (nuevo).
- **Código API**: `api/paquetes/simulacion/router.py` (+2 endpoints), `api/main.py`.
- **Infraestructura**: `seed_cuentas_demo.py` + `seed_cuentas_demo_Dockerfile` (nuevos),
  `docker-compose.yml` (healthcheck en `api`, servicio `seed-cuentas-demo`, variables de
  entorno de credenciales demo).
- **Frontend**: `packages/simulacion/{pages/SimulacionPage.tsx,api/simulacion.api.ts,types.ts}`
  — sección nueva de generación histórica + estado, mismo panel interno, mismo gating.
- **Datos**: `DIM_CONTRATO_REGALIA` pasa de 3 a 22 contratos; `FACT_LIQUIDACION_REGALIA` gana
  liquidaciones reales distribuidas en la ventana de 24 meses.
- **Compatibilidad**: `POST /simulacion/generar-actividad` (CU-O78 original) no cambia de
  contrato. Los 30 informes compuestos no cambian de contrato.
