## Context

`facturacion`, `publicidad` y `regalias` ya escriben todo su dato transaccional en
ClickHouse (`FACT_TRANSACCION_PAGO`, `FACT_INVOICE`, `FACT_INGRESO_PUBLICITARIO`,
`FACT_LIQUIDACION_REGALIA`, `FACT_RETIRO_REGALIA`). `analitica` expone `v1_pnl`
(ingreso − regalías), `v1_mrr_arr`, `v1_churn` y `v1_funnel_conversion`, todos
gateados por `require_staff` (definido localmente en `analitica/deps.py`, no en
`seguridad/deps.py`). No existe ningún gasto operativo, reembolso, ni tracking de
consumo de presupuesto publicitario — `DIM_CAMPANA_PUBLICITARIA.presupuesto_total`
se guarda pero nunca se compara contra gasto real.

Este change agrega ese dato faltante (gasto, reembolso) y compone vistas nuevas
sobre datos ya existentes (cuentas por cobrar/pagar, consumo de presupuesto,
alertas) sin tocar la lógica de `analitica`, `regalias` o `publicidad` salvo un
hook puntual de pausa automática de campaña.

## Goals / Non-Goals

**Goals:**
- Registrar gasto operativo y reembolso como hechos nuevos en ClickHouse, con
  soft-delete/estado, nunca hard delete.
- Componer utilidad y margen reales (ingreso − regalías − gastos − reembolsos)
  sobre `v1_pnl` sin reimplementar su cálculo.
- Exponer cuentas por cobrar/pagar y alertas financieras calculadas on-read,
  sin tablas de estado adicionales cuando el dato ya existe en otra tabla.
- Trackear consumo de presupuesto por campaña on-read, con alerta 80%/100% y
  pausa automática de campaña al agotar presupuesto.
- Auditar toda mutación (`audit.record`) igual que `facturacion`.

**Non-Goals:**
- Contabilidad de doble partida o contabilidad fiscal/bancaria completa.
- Notificaciones externas (correo, push) para alertas — solo panel admin.
- Exportación PDF/Excel del reporte financiero (tarea opcional, fuera del
  camino crítico).
- Reimplementar MRR/ARR/churn/funnel — se consumen tal cual existen hoy.
- Modificar el modelo de datos técnico (`FACT_TRACKS` y dimensiones de catálogo).

## Decisions

**1. Paquete nuevo `finanzas`, no extensión de `facturacion`.**
`facturacion` cubre el ciclo de cobro B2C/B2B (transacciones, invoices, métodos de
pago, datos de empresa). Gastos, reembolsos y agregados financieros son un dominio
distinto (control de costos y salud financiera, no cobro). Seguir el mismo patrón de
paquete que `facturacion`/`publicidad`/`regalias` (`__init__.py`, `deps.py`,
`queries.py`, `router.py`, `prefix="/app/v1/finanzas"`) mantiene la separación de
responsabilidades por paquete ya establecida en el proyecto, en vez de sobrecargar
`facturacion/router.py` con 8 áreas nuevas.

**2. `FACT_GASTO_OPERATIVO` y `FACT_REEMBOLSO` en ClickHouse, no PocketBase.**
Son hechos transaccionales de alto volumen potencial y se agregan junto a las demás
tablas FACT de negocio (RT-05: ClickHouse es la única fuente analítica). PocketBase
queda reservado a entidades operativas de la app y a los datos ya modelados ahí
(suscripciones activas, usuarios). Ninguna de las dos tablas nuevas necesita reglas
de acceso por usuario de PocketBase — son de uso exclusivamente admin.

**3. Cuentas por cobrar/pagar: on-read, sin tabla nueva de estado.**
`FACT_INVOICE.estado` ya distingue pendiente/pagada/vencida; `FACT_RETIRO_REGALIA.estado`
ya distingue pendiente/procesado/rechazado; el saldo pendiente de liquidar por
rightsholder ya se deriva con el patrón `_saldo_disponible` de `regalias`. Agregar una
tabla de seguimiento de estado duplicaría una fuente de verdad que ya existe y
arriesgaría desincronización. El endpoint de `finanzas` solo compone estas tres
queries existentes (invoices por estado/vencimiento, retiros pendientes, saldo
agregado de regalías) — no inserta ni actualiza nada.

**4. Presupuesto consumido: on-read agregando `FACT_INGRESO_PUBLICITARIO`, sin
columna materializada en `DIM_CAMPANA_PUBLICITARIA`.**
`presupuesto_consumido` = `sum(monto)` de `FACT_INGRESO_PUBLICITARIO` por
`campana_id`. Materializarlo como columna en la DIM requeriría mantenerlo
sincronizado en cada inserción de ingreso publicitario (dos escrituras por cada
impresión completada, con riesgo de drift). Como el volumen de campañas es bajo
comparado con `FACT_TRACKS`, el agregado on-read es barato y siempre consistente.
La revisión de umbral (80%/100%) se ejecuta en el mismo request que calcula el
consumo — no hay job separado ni tabla de alertas persistida.

**5. Pausa automática de campaña: evaluación lazy en el endpoint de consumo de
presupuesto, no un job de Airflow nuevo.**
Cuando el endpoint `GET /app/v1/finanzas/campanas/{id}/presupuesto` (o el listado
agregado) calcula que `presupuesto_consumido >= presupuesto_total`, si la campaña
sigue `activa=1` se ejecuta `ALTER TABLE DIM_CAMPANA_PUBLICITARIA UPDATE activa=0`
y se registra auditoría (`accion="pausar_campana_presupuesto_agotado"`). Esto evita
introducir un nuevo DAG de Airflow solo para esto; el costo es que la pausa ocurre
en el primer request posterior al agotamiento, no instantáneamente — aceptable dado
que no hay SLA de tiempo real para esto.

**6. Alertas financieras: calculadas on-read en el dashboard, sin tabla de alertas.**
Igual razonamiento que cuentas por cobrar/pagar — persistir alertas duplicaría
`FACT_AUDIT_LOG` como bitácora y requeriría un proceso de resolución/expiración que
no aporta valor a este alcance académico. El dashboard evalúa las condiciones
(campaña ≥80%, factura vencida, retiro pendiente, regalías pendientes >30 días,
gasto > ingreso del periodo, caída de ingreso vs. periodo anterior, reembolso sobre
umbral) en cada request y las devuelve como lista.

**7. Umbral de reembolso elevado: monto fijo configurable, no percentil histórico.**
Un percentil requeriría suficiente volumen histórico de reembolsos para ser
significativo, lo cual no está garantizado en un dataset académico. Se usa un
umbral fijo (`REEMBOLSO_MONTO_ALTO_USD`, default 500) definido como constante en
`finanzas/deps.py`, más simple de razonar y de probar.

**8. N días para "regalías pendientes" = 30.**
Se alinea con el ciclo de liquidación mensual ya implícito en
`FACT_LIQUIDACION_REGALIA.periodo_inicio/periodo_fin`.

**9. Requisitos no calculables con datos actuales.**
"Saldos B2B pendientes" fuera de `FACT_INVOICE` no tienen tabla propia — no hay un
concepto de contrato/factura B2B distinto de `FACT_INVOICE` en `facturacion` ni en
`partners`. Se documenta como cobertura parcial (cuentas por cobrar = solo
`FACT_INVOICE`) en vez de inventar una fuente. "Ingreso promedio por anunciante"
sí es calculable (`FACT_INGRESO_PUBLICITARIO` join `DIM_CAMPANA_PUBLICITARIA.anunciante_id`).

## Risks / Trade-offs

- [Riesgo] Agregar `presupuesto_consumido` on-read sobre `FACT_INGRESO_PUBLICITARIO`
  puede ser costoso si el volumen de impresiones crece mucho → Mitigación: la query
  agrega por `campana_id` con filtro, y el número de campañas activas es bajo; se
  puede envolver en `@cached(ttl=...)` como ya hace `analitica` en sus endpoints de
  dashboard si el volumen lo justifica.
- [Riesgo] Pausa automática lazy significa que una campaña puede seguir `activa=1`
  y acumulando ingreso por encima del 100% del presupuesto hasta el próximo request
  al endpoint de consumo → Mitigación: aceptado explícitamente (ver Decisión 5);
  documentar en spec.md que no es un límite de gasto en tiempo real.
  Documentado.
- [Riesgo] Reembolsos y gastos anulados deben excluirse consistentemente de
  P&L/dashboard/reporte en los tres lugares → Mitigación: centralizar el filtro
  (`WHERE estado != 'anulado'` / `estado = 'procesado'`) en las queries de
  `finanzas/queries.py`, un único punto de verdad reusado por dashboard, reporte e
  indicadores.
- [Riesgo] Sin tabla de estado para cuentas por cobrar/pagar, si `facturacion` o
  `regalias` cambian su enum de `estado` en el futuro, `finanzas` puede romperse
  silenciosamente → Mitigación aceptada: es el trade-off de no duplicar fuente de
  verdad; se documenta la dependencia en spec.md.
