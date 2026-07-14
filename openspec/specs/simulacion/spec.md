# Capability: simulacion

## Purpose

Permitir a un Lead Data Engineer/CTO generar, en una sola acción, actividad de negocio de la
plataforma (reproducciones, nuevas suscripciones e impresiones publicitarias) y liquidar
automáticamente las regalías del período resultante — para poder demostrar y auditar el flujo
completo de dinero de Tracklytics (streams → ingreso → reparto) sin operar la aplicación
manualmente a gran escala.

## Objetivo

Permitir a un Lead Data Engineer/CTO generar, en una sola acción, actividad de negocio de la
plataforma (reproducciones, nuevas suscripciones e impresiones publicitarias) y liquidar
automáticamente las regalías del período resultante — para poder demostrar y auditar el flujo
completo de dinero de Tracklytics (streams → ingreso → reparto) sin operar la aplicación
manualmente a gran escala.

## Contexto

Las tres capabilities que mueven dinero real (`suscripciones`/`facturacion`, `publicidad`,
`regalias`) ya funcionan de forma independiente, pero demostrar el flujo completo entre ellas
requiere generar streams, suscripciones e impresiones publicitarias por separado y en el mismo
rango de fechas — algo impráctico de hacer a mano en volumen suficiente para que la liquidación de
regalías tenga un pool real que repartir. `simulacion` genera las tres cosas juntas y dispara la
liquidación, dejando el resultado visible de inmediato en los paneles ya existentes de `analitica`
(P&L, MRR/ARR, funnel de conversión).

## Actores

- **Lead Data Engineer / CTO** (`role=admin`): único actor de esta capability; genera actividad
  de negocio simulada para pruebas y demostración.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Lead Data Engineer / CTO | Simulación | CU-O78 Generar actividad de negocio simulada | Como Lead Data Engineer/CTO, quiero generar reproducciones, suscripciones e impresiones publicitarias de forma conjunta y liquidar el período resultante, para demostrar y auditar el flujo de dinero de la plataforma sin operarla manualmente a gran escala |

## Requirements

### Requirement: Generación conjunta de actividad de negocio simulada
El sistema SHALL permitir exclusivamente a un usuario con rol `admin` generar, en una sola
operación, una cantidad configurable de reproducciones, nuevas suscripciones de pago y
visualizaciones publicitarias completadas, todas dentro de la misma ventana de tiempo, y SHALL
disparar automáticamente la liquidación de regalías sobre esa ventana al finalizar. El sistema
SHALL aplicar valores por defecto razonables cuando el admin no especifica cantidades. El sistema
SHALL retornar un resumen con la cantidad de reproducciones generadas, el ingreso por suscripciones
generado, el ingreso publicitario generado, el pool total resultante y el número de liquidaciones
creadas.

#### Scenario: Generar actividad con valores por defecto
- **WHEN** un usuario con rol `admin` solicita generar actividad de negocio simulada sin especificar cantidades
- **THEN** el sistema genera reproducciones, suscripciones e impresiones publicitarias con cantidades por defecto, liquida el período resultante, y retorna el resumen de lo generado y liquidado

#### Scenario: Generar actividad con cantidades personalizadas
- **WHEN** un usuario con rol `admin` solicita generar actividad de negocio simulada indicando cantidades específicas de reproducciones, suscripciones e impresiones publicitarias
- **THEN** el sistema genera esas cantidades, liquida el período resultante, y retorna el resumen correspondiente

#### Scenario: Sin campañas publicitarias elegibles
- **WHEN** un usuario con rol `admin` solicita generar actividad de negocio simulada y no existe ninguna campaña publicitaria activa y vigente
- **THEN** el sistema omite la generación de impresiones publicitarias sin error, y continúa generando reproducciones, suscripciones y la liquidación resultante

#### Scenario: Usuario sin rol admin intenta generar actividad simulada
- **WHEN** un usuario autenticado con un rol distinto de `admin` intenta generar actividad de negocio simulada
- **THEN** el sistema rechaza la operación indicando que es exclusiva de `admin`

## Entradas

- Cantidad de reproducciones, cantidad de suscripciones nuevas y cantidad de impresiones
  publicitarias a generar (todas opcionales, con valores por defecto).

## Salidas

- Resumen de la actividad generada: reproducciones, ingreso por suscripciones, ingreso
  publicitario, pool total resultante y número de liquidaciones de regalías creadas.

## Dependencias

- **ClickHouse**: `FACT_ENGAGEMENT_USUARIO`, `FACT_TRANSACCION_PAGO`, `FACT_INVOICE`,
  `FACT_IMPRESION_ANUNCIO`, `FACT_INGRESO_PUBLICITARIO`, `FACT_TRACKS` (para ponderar
  reproducciones por popularidad), `DIM_CAMPANA_PUBLICITARIA` (campañas elegibles).
- **Capability `regalias`**: reutiliza la misma lógica de liquidación de
  "Liquidación de regalías por período" (con la idempotencia de este mismo change).
- **Capability `facturacion`**: mismas constantes de tasa de éxito simulada e IVA ya usadas para
  transacciones reales.
- **Capability `publicidad`**: mismo cálculo de ingreso por impresión (`monto = cpm / 1000`).
- **Capability `seguridad`**: token de sesión autenticado, gating de `admin`.

## Fuera de alcance

- Crear cuentas reales de usuario en PocketBase para la actividad simulada — se identifica con un
  `usuario_id` sintético reconocible, sin sesión ni perfil real detrás.
- Disparar o coordinarse con los DAGs académicos de Airflow (`engagement_referencia`,
  `finanzas_periodicas`) — es un mecanismo independiente, síncrono, bajo demanda.
- Simular cancelaciones, reembolsos o actividad negativa — solo genera actividad de ingreso.
- Deshacer o revertir actividad ya generada.
