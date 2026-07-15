# Capability: finanzas

## Purpose

Dar al Lead Data Engineer / CTO visibilidad y control sobre la salud financiera real de
la plataforma: cuánto cuesta operarla, cuánto se reembolsa, qué se debe cobrar y pagar,
cuánto consume cada campaña publicitaria de su presupuesto, y cuál es la utilidad real
resultante — todo compuesto sobre el dato transaccional que `facturacion`, `publicidad`
y `regalias` ya generan, sin duplicar su lógica.

## Objetivo

Dar al Lead Data Engineer / CTO visibilidad y control sobre la salud financiera real de
la plataforma: cuánto cuesta operarla, cuánto se reembolsa, qué se debe cobrar y pagar,
cuánto consume cada campaña publicitaria de su presupuesto, y cuál es la utilidad real
resultante — todo compuesto sobre el dato transaccional que `facturacion`, `publicidad`
y `regalias` ya generan, sin duplicar su lógica.

## Contexto

`analitica` ya expone MRR/ARR, churn, funnel de conversión y un P&L básico
(ingreso − regalías pagadas). Ese P&L no descuenta gasto operativo ni reembolsos, no hay
forma de registrar un gasto o procesar un reembolso, y `DIM_CAMPANA_PUBLICITARIA.presupuesto_total`
nunca se compara contra el ingreso real que genera cada campaña. `finanzas` cierra ese
vacío: agrega los dos hechos que faltaban (gasto operativo, reembolso) y compone vistas
nuevas (cuentas por cobrar/pagar, consumo de presupuesto, alertas, dashboard, indicadores,
reporte) sobre datos que ya existen en `facturacion`, `publicidad` y `regalias`.

## Actores

- **Lead Data Engineer / CTO** (`role=admin`): único actor de esta capability — registra
  gastos, procesa reembolsos, consulta dashboard, cuentas por cobrar/pagar, consumo de
  presupuesto de campañas, indicadores, alertas y el reporte financiero por periodo.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Lead Data Engineer / CTO | Finanzas | CU-O82 Gestionar gastos operativos | Como Lead Data Engineer/CTO, quiero registrar, editar y anular gastos operativos por categoría, para conocer el costo real de operar la plataforma |
| Operativo | Lead Data Engineer / CTO | Finanzas | CU-O83 Consultar dashboard financiero consolidado | Como Lead Data Engineer/CTO, quiero ver ingresos, regalías, gastos, reembolsos y utilidad en un solo panel, para evaluar la salud financiera del negocio |
| Operativo | Lead Data Engineer / CTO | Finanzas | CU-O84 Consultar cuentas por cobrar y por pagar | Como Lead Data Engineer/CTO, quiero ver qué facturas están pendientes de cobro y qué regalías/retiros están pendientes de pago, para gestionar el flujo de caja |
| Operativo | Lead Data Engineer / CTO | Finanzas | CU-O85 Procesar reembolso de una transacción | Como Lead Data Engineer/CTO, quiero reembolsar total o parcialmente una transacción de pago con validaciones, para atender reclamos de usuarios sin duplicar ni exceder el monto pagado |
| Operativo | Lead Data Engineer / CTO | Finanzas | CU-O86 Consultar historial de reembolsos | Como Lead Data Engineer/CTO, quiero consultar el historial de reembolsos por transacción o por rango de fechas, para auditar decisiones pasadas |
| Operativo | Lead Data Engineer / CTO | Finanzas | CU-O87 Monitorear consumo de presupuesto de campañas | Como Lead Data Engineer/CTO, quiero ver cuánto ha consumido cada campaña de su presupuesto y recibir alerta al 80%/100%, para controlar el gasto publicitario y evitar sobregiro |
| Operativo | Lead Data Engineer / CTO | Finanzas | CU-O88 Consultar indicadores empresariales | Como Lead Data Engineer/CTO, quiero ver ARPU, % de ingresos a regalías/gastos y crecimiento vs. periodo anterior, para evaluar la eficiencia financiera del negocio |
| Operativo | Lead Data Engineer / CTO | Finanzas | CU-O89 Consultar alertas financieras administrativas | Como Lead Data Engineer/CTO, quiero ver en un solo lugar facturas vencidas, retiros pendientes, campañas por agotarse y gastos que superan ingresos, para actuar a tiempo |
| Operativo | Lead Data Engineer / CTO | Finanzas | CU-O90 Consultar reporte financiero por periodo | Como Lead Data Engineer/CTO, quiero un reporte consolidado de ingresos, gastos, regalías, reembolsos y utilidad por rango de fechas, para presentar resultados del periodo |

## ADDED Requirements

### Requirement: Registro y anulación de gastos operativos
El sistema SHALL permitir a un usuario con rol `admin` crear un gasto operativo indicando
concepto, categoría (`infraestructura`, `marketing`, `nomina`, `licencias`, `servicios`,
`soporte`, `legal`, `otros`), monto, fecha y descripción opcional, y SHALL registrarlo en
`FACT_GASTO_OPERATIVO` con estado `activo`. El sistema SHALL permitir editar un gasto
existente y anularlo (estado `anulado`), pero SHALL nunca eliminarlo físicamente. Un gasto
en estado `anulado` SHALL excluirse de todo cálculo financiero derivado (dashboard, P&L
compuesto, indicadores, reporte).

#### Scenario: Admin registra un gasto operativo
- **WHEN** un usuario con rol `admin` crea un gasto con concepto, categoría, monto y fecha
- **THEN** el sistema lo registra en `FACT_GASTO_OPERATIVO` con estado `activo` y audita la creación

#### Scenario: Admin anula un gasto
- **WHEN** un usuario con rol `admin` anula un gasto previamente activo
- **THEN** el sistema marca su estado como `anulado`, audita la anulación, y el gasto deja de sumar en cualquier cálculo financiero posterior

#### Scenario: Gasto anulado no afecta el dashboard
- **WHEN** se calcula el dashboard financiero o el reporte de un periodo que incluye un gasto en estado `anulado`
- **THEN** el sistema excluye ese gasto del total de gastos operativos del periodo

### Requirement: Listado y filtrado de gastos operativos
El sistema SHALL permitir a un usuario con rol `admin` listar gastos operativos filtrando
por categoría, rango de fechas y estado.

#### Scenario: Admin filtra gastos por categoría y rango de fechas
- **WHEN** un usuario con rol `admin` solicita el listado de gastos con `categoria=marketing` y un rango de fechas
- **THEN** el sistema retorna solo los gastos de esa categoría registrados dentro del rango

### Requirement: Procesamiento de reembolsos
El sistema SHALL permitir a un usuario con rol `admin` procesar un reembolso (total o
parcial) sobre una transacción de `FACT_TRANSACCION_PAGO`, registrando el reembolso en
`FACT_REEMBOLSO` con motivo y estado `procesado`. El sistema SHALL rechazar el reembolso
si la transacción no está en estado `exitosa` (`FACT_TRANSACCION_PAGO.estado` solo admite
`pendiente`/`exitosa`/`fallida` — no existe un estado `cancelada` en el modelo actual, por
lo que esta regla ya cubre transacciones `fallida` y `pendiente`), si el monto solicitado
excede el monto pagado menos la suma de reembolsos ya `procesado` sobre esa misma
transacción, o si el monto acumulado reembolsado ya alcanzó el monto pagado.

#### Scenario: Reembolso total válido
- **WHEN** un usuario con rol `admin` solicita reembolsar el monto completo de una transacción `exitosa` sin reembolsos previos
- **THEN** el sistema registra el reembolso en `FACT_REEMBOLSO` con estado `procesado` y audita la operación

#### Scenario: Reembolso parcial que no excede el saldo disponible
- **WHEN** un usuario con rol `admin` solicita reembolsar un monto menor al monto pagado de una transacción `exitosa`
- **THEN** el sistema registra el reembolso como `procesado`

#### Scenario: Reembolso que excede el monto disponible es rechazado
- **WHEN** un usuario con rol `admin` solicita un reembolso cuyo monto, sumado a los reembolsos `procesado` previos sobre la misma transacción, excede el monto pagado
- **THEN** el sistema rechaza la solicitud con un mensaje de error y no inserta ningún registro en `FACT_REEMBOLSO`

#### Scenario: Reembolso sobre transacción fallida es rechazado
- **WHEN** un usuario con rol `admin` solicita reembolsar una transacción en estado `fallida`
- **THEN** el sistema rechaza la solicitud sin registrar ningún reembolso

#### Scenario: Reembolso sobre transacción pendiente es rechazado
- **WHEN** un usuario con rol `admin` solicita reembolsar una transacción en estado `pendiente` (aún no cobrada)
- **THEN** el sistema rechaza la solicitud sin registrar ningún reembolso

### Requirement: Historial de reembolsos
El sistema SHALL permitir a un usuario con rol `admin` consultar el historial de
reembolsos de una transacción específica o de un rango de fechas, incluyendo reembolsos
en cualquier estado presente en `FACT_REEMBOLSO`. El sistema SHALL nunca eliminar un
registro de `FACT_REEMBOLSO` una vez insertado. Nota de alcance: en este change, una
solicitud de reembolso inválida (excede saldo, transacción no `exitosa`) SHALL ser
rechazada antes de insertar ningún registro — no se crea una fila con estado `rechazado`.
Los estados `rechazado`/`cancelado` del enum quedan reservados en el modelo de datos
para un flujo de revisión manual posterior, fuera del alcance de este change.

#### Scenario: Consulta de historial por transacción
- **WHEN** un usuario con rol `admin` solicita el historial de reembolsos de una transacción específica
- **THEN** el sistema retorna todos los reembolsos asociados a esa transacción, sin importar su estado

#### Scenario: Consulta de historial por rango de fechas
- **WHEN** un usuario con rol `admin` solicita el historial de reembolsos en un rango de fechas
- **THEN** el sistema retorna todos los reembolsos registrados en ese rango, sin importar su estado

### Requirement: Cuentas por cobrar y por pagar
El sistema SHALL permitir a un usuario con rol `admin` consultar un resumen de cuentas
por cobrar (invoices de `FACT_INVOICE` no marcadas `pagada`) y cuentas por pagar
(saldo de regalías liquidadas no retiradas y retiros de regalía en estado `pendiente` de
`FACT_RETIRO_REGALIA`), incluyendo el total por cobrar, el total vencido, el total por
pagar y los próximos vencimientos. El sistema SHALL calcular estos totales on-read a
partir de las tablas existentes, sin persistir un estado propio de cobranza/pago. Dado
que `FACT_INVOICE.estado` en el flujo actual de `facturacion` solo asigna el valor
`emitido` (nunca `vencida`), el sistema SHALL derivar "vencida" por antigüedad: toda
invoice no `pagada` con más de 30 días desde `fecha_emision`.

#### Scenario: Admin consulta el resumen de cuentas por cobrar y por pagar
- **WHEN** un usuario con rol `admin` solicita el resumen de cuentas por cobrar y por pagar
- **THEN** el sistema retorna el total por cobrar, el total vencido, el total por pagar y los próximos vencimientos, calculados a partir del estado actual de `FACT_INVOICE` y `FACT_RETIRO_REGALIA`

### Requirement: Consumo de presupuesto de campaña y alerta
El sistema SHALL, al consultar el consumo de presupuesto de una campaña publicitaria,
calcular `presupuesto_consumido` como la suma de `FACT_INGRESO_PUBLICITARIO.monto` de
esa campaña, y retornar presupuesto total, consumido, restante, porcentaje utilizado,
impresiones, CPM efectivo y una fecha estimada de agotamiento proyectada linealmente
sobre el ritmo de consumo reciente. El sistema SHALL marcar la campaña con una alerta
cuando el consumo alcance el 80% del presupuesto, y con una alerta de agotamiento cuando
alcance el 100%.

#### Scenario: Consulta de consumo de una campaña por debajo del 80%
- **WHEN** un usuario con rol `admin` consulta el consumo de una campaña cuyo ingreso acumulado es menor al 80% de su presupuesto total
- **THEN** el sistema retorna el consumo actual sin marcar ninguna alerta

#### Scenario: Campaña alcanza el 80% de consumo
- **WHEN** el ingreso acumulado de una campaña alcanza o supera el 80% de su presupuesto total
- **THEN** el sistema marca la campaña con una alerta de consumo alto en la respuesta de consulta

#### Scenario: Campaña agota su presupuesto
- **WHEN** el ingreso acumulado de una campaña alcanza o supera el 100% de su presupuesto total
- **THEN** el sistema marca la campaña con una alerta de presupuesto agotado en la respuesta de consulta

### Requirement: Dashboard financiero consolidado
El sistema SHALL permitir a un usuario con rol `admin` consultar un dashboard financiero
para un rango de fechas que consolide ingreso por suscripciones (B2C), ingreso
publicitario, regalías generadas y pagadas, retiros de regalía procesados, gastos
operativos activos, reembolsos procesados, y la utilidad estimada resultante
(ingreso − regalías pagadas − gastos operativos − reembolsos procesados). El sistema
SHALL permitir comparar dos rangos de fechas y retornar el delta porcentual de cada
métrica entre ambos.

#### Scenario: Admin consulta el dashboard de un periodo
- **WHEN** un usuario con rol `admin` solicita el dashboard financiero de un rango de fechas
- **THEN** el sistema retorna ingresos por origen, regalías, retiros, gastos, reembolsos y utilidad estimada de ese rango

#### Scenario: Admin compara dos periodos
- **WHEN** un usuario con rol `admin` solicita el dashboard financiero indicando un periodo actual y uno de comparación
- **THEN** el sistema retorna, además de las métricas del periodo actual, el delta porcentual de cada métrica respecto al periodo de comparación

#### Scenario: Utilidad descuenta gastos y reembolsos
- **WHEN** un periodo consultado tiene gastos operativos activos y reembolsos procesados registrados
- **THEN** la utilidad estimada del dashboard resta ambos montos del ingreso reconocido en ese periodo

### Requirement: Indicadores empresariales financieros
El sistema SHALL permitir a un usuario con rol `admin` consultar indicadores financieros
derivados para un rango de fechas: ARPU (ingreso total del periodo dividido entre
usuarios de pago activos), regalías como porcentaje de ingresos, gastos operativos como
porcentaje de ingresos, gastos operativos agrupados por categoría, ingreso promedio por
anunciante, y crecimiento de ingreso respecto al periodo anterior equivalente.

#### Scenario: Admin consulta indicadores de un periodo
- **WHEN** un usuario con rol `admin` solicita los indicadores financieros de un rango de fechas
- **THEN** el sistema retorna ARPU, % de ingresos a regalías, % de ingresos a gastos, gasto por categoría, ingreso promedio por anunciante y crecimiento vs. el periodo anterior equivalente

### Requirement: Alertas financieras administrativas
El sistema SHALL permitir a un usuario con rol `admin` consultar una lista de alertas
financieras activas, calculadas on-read, cubriendo: campañas con consumo de presupuesto
≥80% o agotado, facturas vencidas, retiros de regalía en estado `pendiente`, regalías
liquidadas cuyo rightsholder no ha solicitado retiro en más de 30 días, gastos
operativos del periodo que superan el ingreso del mismo periodo, caída de ingreso
respecto al periodo anterior, y reembolsos individuales que superan un monto
configurable. El sistema SHALL mostrar estas alertas únicamente en el panel
administrativo, sin enviar ninguna notificación externa.

#### Scenario: Admin consulta alertas activas
- **WHEN** un usuario con rol `admin` solicita las alertas financieras vigentes
- **THEN** el sistema retorna cada condición cumplida actualmente (campaña por agotarse, factura vencida, retiro pendiente, regalía sin retiro hace más de 30 días, gasto mayor a ingreso, caída de ingreso, reembolso elevado)

#### Scenario: Sin condiciones de alerta
- **WHEN** un usuario con rol `admin` solicita las alertas financieras y ninguna condición se cumple actualmente
- **THEN** el sistema retorna una lista vacía

### Requirement: Reporte financiero por periodo
El sistema SHALL permitir a un usuario con rol `admin` obtener un reporte financiero
consolidado para un rango de fechas, integrando en un solo payload: ingresos por origen,
gastos por categoría, regalías generadas y pagadas, reembolsos procesados, cuentas por
cobrar, cuentas por pagar, utilidad estimada, margen, y los indicadores principales del
periodo.

#### Scenario: Admin genera el reporte financiero de un periodo
- **WHEN** un usuario con rol `admin` solicita el reporte financiero de un rango de fechas
- **THEN** el sistema retorna un único payload con ingresos, gastos, regalías, reembolsos, cuentas por cobrar/pagar, utilidad, margen e indicadores de ese rango

## Entradas

- Concepto, categoría, monto, fecha, descripción del gasto (registro/edición/anulación).
- Filtros de categoría, rango de fechas y estado (listado de gastos).
- Identificador de transacción, monto, tipo, motivo (procesamiento de reembolso).
- Identificador de transacción o rango de fechas (historial de reembolsos).
- Rango de fechas, opcionalmente un segundo rango de comparación (dashboard, indicadores, reporte).
- Identificador de campaña (consumo de presupuesto).

## Salidas

- Confirmación de gasto creado/editado/anulado.
- Listado de gastos filtrado.
- Confirmación de reembolso procesado, o rechazo con motivo.
- Historial de reembolsos por transacción o rango de fechas.
- Resumen de cuentas por cobrar y por pagar.
- Consumo de presupuesto por campaña, con alertas de 80%/100% cuando aplique.
- Dashboard financiero consolidado, con delta entre periodos si se solicitó comparación.
- Indicadores empresariales financieros del periodo.
- Lista de alertas financieras administrativas activas.
- Reporte financiero consolidado por periodo.

## Dependencias

- **ClickHouse**: `FACT_GASTO_OPERATIVO`, `FACT_REEMBOLSO` (nuevas), `FACT_TRANSACCION_PAGO`,
  `FACT_INVOICE`, `FACT_LIQUIDACION_REGALIA`, `FACT_RETIRO_REGALIA`, `DIM_CAMPANA_PUBLICITARIA`,
  `FACT_INGRESO_PUBLICITARIO` (existentes).
- **Capability `facturacion`**: fuente de transacciones e invoices para reembolsos y cuentas por cobrar.
- **Capability `regalias`**: fuente de liquidaciones y retiros para cuentas por pagar; reutiliza el patrón de saldo disponible.
- **Capability `publicidad`**: fuente de ingreso publicitario y campañas para el tracking de presupuesto.
- **Capability `analitica`**: `v1_pnl` como base compuesta del dashboard financiero.
- **Capability `seguridad`**: token de sesión autenticado, gating de `admin`, `audit.record` para toda mutación.

## Fuera de alcance

- Contabilidad de doble partida o contabilidad fiscal/bancaria completa.
- Notificaciones externas (correo, push) para alertas financieras.
- Exportación a PDF/Excel del reporte financiero (evaluada como tarea opcional fuera del camino crítico).
- Cuentas por cobrar B2B fuera de `FACT_INVOICE` (no existe una fuente de saldo B2B distinta en el sistema actual).
- Pausa/reactivación manual de campañas por presupuesto (ver capability `publicidad` para la pausa automática al agotar presupuesto).
