# Capability: regalias

## Purpose

Repartir el ingreso real de la plataforma (suscripciones + publicidad) entre los rightsholders de
cada track — sello, artista y productor — según contratos con vigencia, calculando el pago real de
cada período a partir de los streams reales de ese track, y permitir que artista y sello consulten
sus propias ganancias.

## Objetivo

Repartir el ingreso real de la plataforma (suscripciones + publicidad) entre los rightsholders de
cada track — sello, artista y productor — según contratos con vigencia, calculando el pago real de
cada período a partir de los streams reales de ese track, y permitir que artista y sello consulten
sus propias ganancias.

## Contexto

Hasta esta capability no existía ningún concepto de "a quién se le paga por un stream" — el
catálogo tenía sello como metadata de licenciamiento (`distribucion`) pero ningún flujo de dinero
saliente hacia rightsholders. `regalias` cierra ese vacío con el modelo real de la industria: dos
tipos de derecho (master/grabación y publishing/composición, sin `DIM_EDITORIAL` — decisión
explícita del usuario), repartidos pro-rata sobre el mismo pool de ingresos que financia la
plataforma (ver capability `publicidad`).

## Actores

- **Artista** (usuario con `DIM_CUENTA_ARTISTA.estado_cuenta='aprobada'`): consulta sus propias
  ganancias por período.
- **Sello** (usuario con `DIM_CUENTA_SELLO`, `role=analyst`): consulta las ganancias agregadas de
  su sello.
- **Lead Data Engineer / CTO** (`role=admin`): registra productores, crea contratos de reparto,
  da de alta cuentas de sello, y dispara/consulta liquidaciones.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Lead Data Engineer / CTO | Regalías | CU-O59 Registrar un productor | Como Lead Data Engineer/CTO, quiero registrar un productor musical, para poder incluirlo en contratos de reparto |
| Operativo | Lead Data Engineer / CTO | Regalías | CU-O60 Asignar un productor a un track | Como Lead Data Engineer/CTO, quiero asignar un productor existente a un track del catálogo, para reflejar quién lo produjo |
| Operativo | Lead Data Engineer / CTO | Regalías | CU-O61 Crear un contrato de reparto para un track | Como Lead Data Engineer/CTO, quiero definir qué porcentaje de master y de publishing le corresponde a cada rightsholder de un track, para que la liquidación sepa cómo repartir su ingreso |
| Operativo | Lead Data Engineer / CTO | Regalías | CU-O62 Dar de alta una cuenta de sello | Como Lead Data Engineer/CTO, quiero vincular un usuario real a un sello discográfico existente, para que ese sello pueda consultar sus propias ganancias |
| Operativo | Lead Data Engineer / CTO | Regalías | CU-O63 Liquidar regalías de un período | Como Lead Data Engineer/CTO, quiero calcular cuánto le corresponde a cada rightsholder por los streams reales de un período, para poder demostrar y auditar el pago |
| Operativo | Artista | Regalías | CU-O64 Consultar mis ganancias | Como Artista, quiero ver cuánto he ganado por período y por track, para conocer el retorno real de mi música en la plataforma |
| Operativo | Sello | Regalías | CU-O65 Consultar las ganancias de mi sello | Como Sello, quiero ver las ganancias agregadas de todos mis artistas por período, para reportar el desempeño de mi catálogo |

## Requirements

### Requirement: Registro de productores
El sistema SHALL permitir a un usuario con rol `admin` registrar un productor musical con un
nombre no vacío, y asignarlo a uno o más tracks existentes del catálogo.

#### Scenario: Admin registra un productor
- **WHEN** un usuario con rol `admin` registra un productor con un nombre no vacío
- **THEN** el sistema crea el productor y lo deja disponible para asignación a tracks

#### Scenario: Admin asigna un productor a un track existente
- **WHEN** un usuario con rol `admin` asigna un productor existente a un track existente en `FACT_TRACKS`
- **THEN** el sistema registra la relación en `BRIDGE_PRODUCTOR_TRACK`

#### Scenario: Intento de asignar un productor a un track inexistente
- **WHEN** un usuario con rol `admin` intenta asignar un productor a un track que no existe en `FACT_TRACKS`
- **THEN** el sistema rechaza la operación con un error de track no encontrado

### Requirement: Contrato de reparto por track
El sistema SHALL permitir a un usuario con rol `admin` crear un contrato de reparto para un track
existente, indicando el porcentaje de derecho de master y de publishing que le corresponde a
sello, artista y productor, con fecha de vigencia. Los porcentajes de master (`pct_master_sello +
pct_master_artista + pct_master_productor`) SHALL sumar 100, igual que los de publishing
(`pct_publishing_sello + pct_publishing_artista`). El sistema SHALL rechazar un contrato cuyos
porcentajes no sumen 100.

#### Scenario: Admin crea un contrato válido
- **WHEN** un usuario con rol `admin` crea un contrato para un track existente con porcentajes de master y publishing que suman 100 cada uno
- **THEN** el sistema registra el contrato como vigente desde la fecha indicada

#### Scenario: Contrato con porcentajes que no suman 100
- **WHEN** un usuario con rol `admin` intenta crear un contrato cuyos porcentajes de master o de publishing no suman 100
- **THEN** el sistema rechaza la operación indicando el desbalance

#### Scenario: Contrato sobre un track inexistente
- **WHEN** un usuario con rol `admin` intenta crear un contrato para un track que no existe en `FACT_TRACKS`
- **THEN** el sistema rechaza la operación con un error de track no encontrado

### Requirement: Alta de cuenta de sello
El sistema SHALL permitir a un usuario con rol `admin` vincular un usuario existente a un sello
discográfico existente (`DIM_SELLO_DISCOGRAFICO`), creando su cuenta de sello. Esta operación
SHALL estar restringida exclusivamente a `admin`.

#### Scenario: Admin vincula un usuario a un sello
- **WHEN** un usuario con rol `admin` vincula un usuario existente a un sello discográfico existente
- **THEN** el sistema crea la cuenta de sello activa, y ese usuario queda habilitado para consultar las ganancias de ese sello

#### Scenario: Vincular a un sello inexistente
- **WHEN** un usuario con rol `admin` intenta vincular un usuario a un sello que no existe
- **THEN** el sistema rechaza la operación con un error de sello no encontrado

### Requirement: Liquidación de regalías por período
El sistema SHALL calcular, para un rango de fechas dado, el monto real que le corresponde a cada
rightsholder de cada track con contrato vigente, a partir de: el ingreso real de la plataforma en
ese período (suscripciones exitosas más ingreso publicitario), la porción de ese ingreso destinada
a rightsholders, y la participación real de cada track en el total de streams del período. El
sistema SHALL registrar una fila por rightsholder por track liquidado en `FACT_LIQUIDACION_REGALIA`.
Un track reproducido sin contrato vigente en el período SHALL contar en el total de streams pero
SHALL no generar ninguna liquidación.

#### Scenario: Liquidación de un período con streams reales
- **WHEN** se ejecuta la liquidación para un período que tiene transacciones exitosas, ingreso publicitario y streams reales de tracks con contrato vigente
- **THEN** el sistema calcula el monto de cada rightsholder proporcional a los streams reales de su track dentro del total del período, y lo registra en `FACT_LIQUIDACION_REGALIA`

#### Scenario: Track sin contrato vigente no genera liquidación
- **WHEN** un track fue reproducido en el período pero no tiene ningún contrato vigente
- **THEN** el sistema no genera ninguna fila de liquidación para ese track, aunque sus streams sí cuenten en el total del período

#### Scenario: Período sin ningún ingreso
- **WHEN** se ejecuta la liquidación para un período sin transacciones exitosas ni ingreso publicitario
- **THEN** el sistema no genera ninguna liquidación, sin producir un error

### Requirement: Consulta de ganancias propias
El sistema SHALL permitir a un Artista consultar sus propias ganancias liquidadas por período y por
track, y a un Sello consultar las ganancias liquidadas agregadas de su sello, restringidas
exclusivamente a sus propios registros.

#### Scenario: Artista consulta sus ganancias
- **WHEN** un usuario con cuenta de artista consulta sus ganancias
- **THEN** el sistema retorna únicamente las liquidaciones donde ese artista es el rightsholder

#### Scenario: Sello consulta sus ganancias
- **WHEN** un usuario con cuenta de sello consulta sus ganancias
- **THEN** el sistema retorna únicamente las liquidaciones donde ese sello es el rightsholder

#### Scenario: Usuario sin cuenta de artista ni de sello intenta consultar ganancias
- **WHEN** un usuario autenticado sin cuenta de artista ni de sello intenta consultar ganancias
- **THEN** el sistema rechaza la operación indicando que no tiene ninguna cuenta de rightsholder asociada

## Entradas

- Nombre del productor; identificador de track y de productor (asignación).
- Identificador de track, porcentajes de master/publishing por rightsholder, fecha de vigencia (contrato).
- Identificador de usuario y de sello (alta de cuenta de sello).
- Rango de fechas (liquidación).

## Salidas

- Confirmación de productor registrado y asignado.
- Confirmación del contrato creado, o error de porcentajes desbalanceados.
- Confirmación de la cuenta de sello creada.
- Resultado de la liquidación: número de rightsholders liquidados y monto total del período.
- Listado de ganancias propias (artista o sello) por período y por track.

## Dependencias

- **ClickHouse**: `DIM_PRODUCTOR`, `BRIDGE_PRODUCTOR_TRACK`, `DIM_CONTRATO_REGALIA`,
  `FACT_LIQUIDACION_REGALIA`, `DIM_CUENTA_SELLO`, `FACT_TRACKS`, `FACT_ENGAGEMENT_USUARIO`
  (streams reales), `FACT_TRANSACCION_PAGO` (ingreso de suscripciones), `DIM_SELLO_DISCOGRAFICO`.
- **Capability `publicidad`**: `FACT_INGRESO_PUBLICITARIO` (ingreso publicitario del período).
- **Capability `creadores`**: `DIM_CUENTA_ARTISTA` (resolución de artista rightsholder).
- **Capability `seguridad`**: token de sesión autenticado, gating de `admin`.

## Fuera de alcance

- `DIM_EDITORIAL`/gestión de composición separada del artista (decisión explícita del usuario).
- Pago real (transferencia bancaria) a un rightsholder — la liquidación calcula el monto, no lo desembolsa.
- Disputas o correcciones sobre una liquidación ya calculada.
- Contratos a nivel álbum (ver design.md, Decisión 2).
