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

### Requirement: Backfill histórico de actividad de negocio

El sistema SHALL soportar la generación de actividad de negocio reproducible sobre una
ventana histórica de 24 meses (no solo la última hora), cubriendo usuarios, suscripciones,
publicidad, engagement, regalías, disponibilidad, llamadas de partners, comunidad,
producto y contenido — los dominios que agregan los 30 informes compuestos de la capability
`reportes`. El backfill SHALL ser idempotente por dominio: correrlo dos veces no SHALL
duplicar eventos. Las liquidaciones de regalías generadas por el backfill SHALL calcularse
con la misma fórmula real ya usada por la liquidación bajo demanda (mismo pool
rightsholders/plataforma, mismo split master/publishing), no una reimplementación separada.

#### Scenario: Ejecutar el backfill histórico
- **WHEN** un Lead Data Engineer/CTO dispara el backfill histórico de negocio
- **THEN** el sistema genera eventos reproducibles en las tablas `FACT_*` correspondientes
  para los 24 meses de ventana, con crecimiento progresivo y estacionalidad, sin tocar el
  catálogo musical

#### Scenario: Reintentar el backfill ya generado
- **WHEN** el backfill histórico se ejecuta una segunda vez sobre un dominio que ya fue
  generado
- **THEN** el sistema detecta que ese dominio ya tiene datos y no genera eventos duplicados

#### Scenario: Liquidar regalías sobre el período del backfill
- **WHEN** el backfill genera transacciones, ingresos publicitarios y reproducciones para
  un mes calendario dentro de la ventana histórica
- **THEN** el sistema liquida las regalías de ese mes usando la misma fórmula real de
  liquidación bajo demanda, no un monto generado por semilla fija

### Requirement: Generación bajo demanda con relleno de huecos

El sistema SHALL permitir disparar la generación de actividad de negocio para un rango de
períodos explícito (`periodo_inicio`/`periodo_fin`), rellenando ÚNICAMENTE los períodos
dentro de ese rango que todavía no tengan datos generados para el dominio pedido — un
período ya cubierto SHALL omitirse, no duplicarse. La operación SHALL encadenar, al
finalizar la generación, un refresco completo de la capa Gold (los 30 informes compuestos)
para que el resultado sea visible sin un paso manual aparte. El sistema SHALL exponer el
estado de la última corrida por dominio de negocio y por tabla Gold, y si hay una ejecución
en curso en este momento.

#### Scenario: Rellenar un hueco dentro de un rango ya parcialmente generado
- **WHEN** un Lead Data Engineer dispara la generación para un rango de períodos donde
  algunos meses ya tienen datos generados y otros no
- **THEN** el sistema genera actividad únicamente para los meses sin datos, deja los ya
  cubiertos sin tocar, y al finalizar dispara el refresco de la capa Gold

#### Scenario: Disparar la generación mientras otra corrida está en curso
- **WHEN** un Lead Data Engineer dispara la generación bajo demanda y ya hay una ejecución
  de la misma operación en curso
- **THEN** el sistema rechaza la nueva ejecución en vez de superponerla con la que sigue
  corriendo

#### Scenario: Consultar el estado de generación
- **WHEN** un Lead Data Engineer o superadmin consulta el estado de generación
- **THEN** el sistema responde con la última corrida registrada por cada dominio de negocio,
  la última corrida real de cada tabla Gold (con su resultado), y si hay una ejecución en
  curso ahora mismo

#### Scenario: Panel interno, nunca en superficies de negocio
- **WHEN** cualquier usuario (con o sin rol administrativo) navega por las superficies de
  negocio de la plataforma (informes compuestos, catálogo, biblioteca, panel B2B)
- **THEN** el sistema no expone en ningún punto el concepto de generación de actividad
  simulada, semillas, marcadores de origen sintético, ni nombres de DAGs — esa información
  queda exclusivamente en el panel interno de operaciones gateado por rol administrativo

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
