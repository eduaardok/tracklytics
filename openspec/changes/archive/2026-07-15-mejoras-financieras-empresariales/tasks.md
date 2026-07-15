## 1. Schema y fundamentos del paquete

- [x] 1.1 Agregar tabla `FACT_GASTO_OPERATIVO` a `init_clickhouse.py` (concepto, categoria enum, monto, fecha, descripcion, estado enum activo/anulado, responsable_id, fecha_registro), MergeTree, ORDER BY (fecha).
- [x] 1.2 Agregar tabla `FACT_REEMBOLSO` a `init_clickhouse.py` (reembolso_id, transaccion_id, monto, tipo enum total/parcial, motivo, fecha, responsable_id, estado enum procesado/rechazado/cancelado), MergeTree, ORDER BY (transaccion_id, fecha).
- [x] 1.3 Correr `python init_clickhouse.py` contra el ClickHouse local y confirmar que ambas tablas existen (`DESCRIBE TABLE`).
- [x] 1.4 Crear el paquete `api/paquetes/finanzas/` con `__init__.py` vacío, `deps.py` (reexporta `require_admin` de `seguridad`, define `require_staff` reutilizando el patrón de `analitica/deps.py` o importándolo si se decide moverlo — documentar la decisión tomada), `queries.py` y `router.py` con `router = APIRouter(prefix="/app/v1/finanzas", tags=["Finanzas"])`.
- [x] 1.5 Registrar `finanzas_router` en `api/main.py` (import + `app.include_router`).

## 2. Gastos operativos (prioridad 1)

- [x] 2.1 Query/insert `CREAR_GASTO_OPERATIVO` en `queries.py` y endpoint `POST /app/v1/finanzas/gastos` (rol `admin`), body Pydantic con concepto/categoria/monto/fecha/descripcion, estado inicial `activo`, `audit.record(accion="crear_gasto_operativo", ...)`.
- [x] 2.2 Endpoint `GET /app/v1/finanzas/gastos` con filtros `categoria`, `desde`/`hasta`, `estado`.
- [x] 2.3 Endpoint `PUT /app/v1/finanzas/gastos/{gasto_id}` (editar concepto/categoria/monto/fecha/descripcion), captura antes/despues para `audit.record(accion="editar_gasto_operativo", ...)`.
- [x] 2.4 Endpoint `POST /app/v1/finanzas/gastos/{gasto_id}/anular` (soft delete, `estado='anulado'`, nunca DELETE), `audit.record(accion="anular_gasto_operativo", ...)`.
- [x] 2.5 Query `GASTOS_ACTIVOS_EN_RANGO` (excluye `estado='anulado'`) — punto único de verdad reusado por dashboard/indicadores/reporte.
- [x] 2.6 Pruebas: crear, listar con filtros, editar, anular, y confirmar que un gasto anulado no aparece en `GASTOS_ACTIVOS_EN_RANGO`.

## 3. Reembolsos (prioridad 4 en el documento original, implementado antes del dashboard por dependencia técnica)

- [x] 3.1 Query `MONTO_REEMBOLSADO_PROCESADO` (suma de `FACT_REEMBOLSO.monto` con `estado='procesado'` por `transaccion_id`) y helper `_monto_disponible_reembolso(transaccion_id)` en `router.py`, análogo a `_saldo_disponible` de `regalias`.
- [x] 3.2 Endpoint `POST /app/v1/finanzas/reembolsos` (rol `admin`): valida que la transacción exista y no esté `fallida`/`cancelada`, valida que `monto <= _monto_disponible_reembolso(transaccion_id)`, inserta en `FACT_REEMBOLSO` con `estado='procesado'`, `audit.record(accion="procesar_reembolso", ...)`.
- [x] 3.3 Endpoint `POST /app/v1/finanzas/reembolsos/{reembolso_id}/rechazar` — solo aplica a flujos donde el reembolso quede pendiente de revisión si se decide agregar ese estado intermedio; si el diseño final es procesar-o-rechazar en el mismo request, documentar y omitir este endpoint (dejar constancia en el resumen final).
- [x] 3.4 Endpoint `GET /app/v1/finanzas/reembolsos?transaccion_id=...` y `GET /app/v1/finanzas/reembolsos?desde=...&hasta=...` para historial (todos los estados, nunca se excluyen).
- [x] 3.5 Query `REEMBOLSOS_PROCESADOS_EN_RANGO` — punto único de verdad reusado por dashboard/indicadores/reporte.
- [x] 3.6 Pruebas: reembolso total válido, reembolso parcial válido, reembolso que excede saldo disponible (rechazado, no inserta), reembolso sobre transacción `fallida` (rechazado), reembolso sobre transacción `cancelada` (rechazado), reembolso doble que en conjunto excede el monto pagado (rechazado el segundo).

## 4. Dashboard financiero consolidado (prioridad 2)

- [x] 4.1 Endpoint `GET /app/v1/finanzas/dashboard` (rol `admin`), params `desde`/`hasta` y opcionalmente `desde_comparacion`/`hasta_comparacion`.
- [x] 4.2 Componer sobre `v1_pnl` (reutilizar sus queries `INGRESO_SUSCRIPCIONES_EN_RANGO`, `INGRESO_PUBLICITARIO_EN_RANGO`, `REGALIAS_PAGADAS_EN_RANGO` desde `analitica/queries.py`, sin reescribirlas) y restar `GASTOS_ACTIVOS_EN_RANGO` + `REEMBOLSOS_PROCESADOS_EN_RANGO` para la utilidad estimada y el margen.
- [x] 4.3 Agregar retiros de regalía procesados (`FACT_RETIRO_REGALIA` estado `procesado` en rango) y regalías pendientes (liquidadas menos retiradas) al payload.
- [x] 4.4 Si se pasa un periodo de comparación, calcular cada métrica también para ese rango y el delta porcentual.
- [x] 4.5 Pruebas: dashboard de un periodo sin gastos/reembolsos coincide con `v1_pnl`; dashboard con gastos y reembolsos registrados resta ambos correctamente de la utilidad; comparación de dos periodos calcula el delta esperado.

## 5. Cuentas por cobrar y por pagar (prioridad 3)

- [x] 5.1 Query `INVOICES_PENDIENTES_Y_VENCIDAS` sobre `FACT_INVOICE` (agrupado por estado, con antigüedad respecto a `fecha_emision`).
- [x] 5.2 Reutilizar `_saldo_disponible`/`SALDO_DISPONIBLE_RIGHTSHOLDER` de `regalias` (importar, no duplicar) para el agregado de regalías pendientes de pago; query propia solo para retiros en estado `pendiente`.
- [x] 5.3 Endpoint `GET /app/v1/finanzas/cuentas` (rol `admin`): retorna total por cobrar, total vencido, total por pagar, próximos vencimientos, aging de las obligaciones más antiguas.
- [x] 5.4 Pruebas: invoice vencida se refleja en `total_vencido`; retiro pendiente se refleja en `total_por_pagar`.

## 6. Tracking de presupuesto de campañas + alertas de campaña (prioridad 5)

- [x] 6.1 Query `CONSUMO_PRESUPUESTO_CAMPANA` (suma `FACT_INGRESO_PUBLICITARIO.monto` e impresiones por `campana_id`, join con `DIM_CAMPANA_PUBLICITARIA` para `presupuesto_total`/`cpm`).
- [x] 6.2 Endpoint `GET /app/v1/finanzas/campanas/presupuesto` (todas las campañas) y `GET /app/v1/finanzas/campanas/{campana_id}/presupuesto` (una campaña): retorna consumido, restante, % utilizado, CPM efectivo, impresiones, proyección lineal de fecha de agotamiento a partir del ritmo de consumo de los últimos N días.
- [x] 6.3 Marcar `alerta_80` cuando `consumido/presupuesto_total >= 0.8` y `alerta_agotado` cuando `>= 1.0` en la respuesta.
- [x] 6.4 Cuando `alerta_agotado=True` y la campaña sigue `activa=1`, ejecutar `ALTER TABLE DIM_CAMPANA_PUBLICITARIA UPDATE activa=0 WHERE campana_id=...` y `audit.record(accion="pausar_campana_presupuesto_agotado", tabla_afectada="DIM_CAMPANA_PUBLICITARIA", ...)`; si ya estaba `activa=0`, no reejecutar el UPDATE ni la auditoría.
- [x] 6.5 Pruebas: campaña bajo 80% no marca alerta; campaña que cruza 80% marca `alerta_80`; campaña que alcanza 100% marca `alerta_agotado` y queda `activa=0`; segunda consulta sobre una campaña ya pausada no duplica el registro de auditoría.

## 7. Indicadores empresariales (prioridad 6)

- [x] 7.1 Endpoint `GET /app/v1/finanzas/indicadores` (rol `admin`), params `desde`/`hasta`.
- [x] 7.2 Calcular ARPU = ingreso total del rango / usuarios de pago activos (reutilizar el conteo de activos que ya usa `v1_mrr_arr`/`v1_churn` vía `pb_client`).
- [x] 7.3 Calcular regalías como % de ingresos, gastos operativos como % de ingresos, y gasto agrupado por categoría (reutilizar `GASTOS_ACTIVOS_EN_RANGO`).
- [x] 7.4 Calcular ingreso promedio por anunciante (`FACT_INGRESO_PUBLICITARIO` join `DIM_CAMPANA_PUBLICITARIA.anunciante_id`, agrupado y promediado).
- [x] 7.5 Calcular crecimiento de ingreso vs. el periodo anterior equivalente (mismo tamaño de rango, inmediatamente anterior).
- [x] 7.6 Documentar en el resumen final cualquier indicador del documento original que no se pueda calcular con los datos actuales (ej. si algún desglose por línea de negocio pedido no tiene columna que lo distinga).
- [x] 7.7 Pruebas: ARPU con datos conocidos de PocketBase/transacciones da el valor esperado; % de ingresos a gastos/regalías suma correctamente.

## 8. Alertas financieras administrativas (prioridad 7)

- [x] 8.1 Endpoint `GET /app/v1/finanzas/alertas` (rol `admin`), calculado on-read, sin tabla nueva.
- [x] 8.2 Evaluar: campañas con `alerta_80`/`alerta_agotado` (reutiliza 6.3), facturas vencidas (reutiliza 5.1), retiros `pendiente` (reutiliza 5.2), regalías liquidadas sin retiro hace más de 30 días, gasto del periodo actual > ingreso del periodo actual, caída de ingreso vs. periodo anterior (reutiliza 7.5), reembolso individual sobre el umbral `REEMBOLSO_MONTO_ALTO_USD` (constante en `finanzas/deps.py`, default 500).
- [x] 8.3 Pruebas: cada condición dispara su alerta correspondiente de forma aislada; sin condiciones cumplidas, la lista es vacía.

## 9. Reporte financiero por periodo (prioridad 8)

- [x] 9.1 Endpoint `GET /app/v1/finanzas/reporte` (rol `admin`), params `desde`/`hasta`: compone dashboard (4), cuentas por cobrar/pagar (5), indicadores (7) en un único payload.
- [x] 9.2 Prueba: el reporte de un periodo contiene todos los campos esperados y sus totales coinciden con los endpoints individuales para el mismo rango.

## 10. Frontend (si el tiempo lo permite, estilo Impeccable)

- [ ] 10.1 Panel admin de finanzas: vista de dashboard consolidado con gráficos (Plotly.js) de ingreso/gasto/utilidad.
- [ ] 10.2 Vista de gestión de gastos operativos (crear/listar/editar/anular).
- [ ] 10.3 Vista de reembolsos (procesar + historial).
- [ ] 10.4 Vista de cuentas por cobrar/pagar y alertas financieras.
- [ ] 10.5 Vista de consumo de presupuesto por campaña.

## 11. Verificación end-to-end

- [x] 11.1 Levantar el stack (`docker compose up` o entorno local equivalente) y ejecutar `pytest` sobre las pruebas nuevas de `finanzas`.
- [x] 11.2 Verificar con `curl` real cada endpoint nuevo contra una instancia corriendo: gastos (crear/listar/editar/anular), reembolsos (procesar válido, procesar inválido x3), dashboard, cuentas, presupuesto de campaña, indicadores, alertas, reporte.
- [x] 11.3 Confirmar en ClickHouse (`SELECT` directo) que las mutaciones de gasto/reembolso/pausa de campaña quedaron escritas y que `FACT_AUDIT_LOG` registró cada una.
- [x] 11.4 Documentar en el resumen final el resultado real de cada verificación (qué pasó, qué no, y por qué).

## 12. Exportación PDF/Excel del reporte financiero (OPCIONAL — fuera del camino crítico)

- [ ] 12.1 Solo si las secciones 1-9 quedaron completas y verificadas sin fricción: agregar `GET /app/v1/finanzas/reporte/exportar?formato=pdf|excel` que reutiliza el payload de 9.1.
