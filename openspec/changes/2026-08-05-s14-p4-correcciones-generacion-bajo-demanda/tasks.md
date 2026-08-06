## 1. Credenciales fuera del código

- [x] 1.1 `SUPERADMIN_DEMO_EMAIL`/`SUPERADMIN_DEMO_PASSWORD` por variable de entorno en `backfill_negocio.py`
- [x] 1.2 Declaradas en `docker-compose.yml` (servicio `airflow`) con default demo explícito
- [x] 1.3 Auditoría del resto del repo — sin otros hallazgos de credenciales reales en duro

## 2. Siembra automática de cuentas demo

- [x] 2.1 `seed_cuentas_demo.py` + `seed_cuentas_demo_Dockerfile`
- [x] 2.2 Healthcheck en `api` (Python, sin curl/wget) + `depends_on: condition: service_healthy`
- [x] 2.3 Idempotente — probado contra un stack donde las 7 cuentas ya existían (sin duplicar, sin fallar)

## 3. Mapeo monto→plan robusto

- [x] 3.1 `etl/gold_ch/adquisicion.py` — `DIM_PLAN` sin filtro `activo=1`
- [x] 3.2 Contador `transacciones_no_mapeadas`, registrado en `GOLD_ETL_LOG.detalle` y en el `print` siempre

## 4. Volumen de regalías

- [x] 4.1 `etl/gold/expandir_contratos_regalias.py` — retrofecha 3 contratos existentes, inserta 19 nuevos (8 sello + 11 artista) sobre contrapartes reales
- [x] 4.2 Regenera liquidaciones vía `POST /admin/liquidar` (mismo mecanismo del backfill)
- [x] 4.3 `etl/gold_ch/regalias.py` — bucketing por `periodo_inicio`, no `fecha_calculo`

## 5. Generación bajo demanda

- [x] 5.1 `backfill_negocio.py` — `clave_control` en las 13 funciones de dominio (idempotencia parametrizable)
- [x] 5.2 `generar_actividad_rango()` — relleno de huecos a granularidad de mes, 10 dominios soportados (documentados los 3 excluidos y por qué)
- [x] 5.3 `dag_generar_bajo_demanda.py` — genera + encadena `dag_gold_aggregations` (`TriggerDagRunOperator`, `wait_for_completion=True`)
- [x] 5.4 `POST /simulacion/generar-historico` + `GET /simulacion/estado` — router propio, `admin_datos` o `superadmin`
- [x] 5.5 `SimulacionPage.tsx` — sección de generación histórica + estado, panel interno únicamente

## 6. Verificación

- [x] 6.1 Prueba de arranque limpio (clon nuevo, `docker compose up --build -p ...`)
- [x] 6.2 `sum(es_estimado) = 0` en las 12 tablas × 5 granularidades, tras los cambios
- [x] 6.3 Contador de transacciones no mapeadas reportado
- [x] 6.4 Informes de regalías sin períodos vacíos en `mes`/`trimestre`
- [x] 6.5 Circuito de relleno de huecos probado de punta a punta (borrar → disparar → confirmar)
- [x] 6.6 `npm run build`

## 7. Documentación

- [x] 7.1 `docs/BITACORA_S14.md` (S14-P4)
- [x] 7.2 `docs/CUENTAS_DEMO.md` actualizado
- [x] 7.3 Delta de OpenSpec (`simulacion`, `seguridad`, `regalias`)
