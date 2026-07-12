# Capability: publicidad

## Purpose

Financiar el tier free mostrando anuncios reales entre canciones a usuarios sin plan de pago,
reconociendo el ingreso publicitario real de cada impresión completada, para que ese ingreso
alimente el mismo pool que reparte `regalias`.

## Objetivo

Financiar el tier free mostrando anuncios reales entre canciones a usuarios sin plan de pago,
reconociendo el ingreso publicitario real de cada impresión completada, para que ese ingreso
alimente el mismo pool que reparte `regalias`.

## Contexto

El plan free nunca tuvo ninguna fuente de ingreso propia — el modelo de negocio solo capturaba
dinero vía `facturacion` (suscripciones de pago). `publicidad` introduce el otro lado real del
negocio freemium: anunciantes que pagan por impresión (CPM) a cambio de exposición entre
canciones, con el ingreso resultante entrando al mismo pool que `regalias` reparte a
rightsholders — igual que en el modelo real de la industria.

## Actores

- **Usuario B2C con plan free**: recibe anuncios entre canciones.
- **Lead Data Engineer / CTO** (`role=admin`): administra anunciantes y campañas, consulta el
  ingreso publicitario por campaña y período.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Lead Data Engineer / CTO | Publicidad | CU-O66 Administrar anunciantes y campañas | Como Lead Data Engineer/CTO, quiero registrar anunciantes y sus campañas con un CPM real, para poder monetizar el tier free |
| Operativo | Usuario B2C (free) | Publicidad | CU-O67 Recibir un anuncio entre canciones | Como Usuario B2C del plan free, quiero que se me muestre un anuncio entre canciones, para poder seguir escuchando música sin pagar |
| Operativo | Lead Data Engineer / CTO | Publicidad | CU-O68 Consultar ingreso publicitario | Como Lead Data Engineer/CTO, quiero consultar el ingreso publicitario real por campaña y período, para medir el desempeño comercial de publicidad |

## Requirements

### Requirement: Administración de anunciantes y campañas
El sistema SHALL permitir a un usuario con rol `admin` registrar un anunciante y crear campañas
publicitarias asociadas, indicando un CPM (costo por mil impresiones) real y un rango de vigencia.
Solo una campaña activa y vigente SHALL ser elegible para mostrarse.

#### Scenario: Admin crea un anunciante y una campaña
- **WHEN** un usuario con rol `admin` registra un anunciante y crea una campaña con nombre, CPM y fecha de inicio
- **THEN** el sistema registra la campaña como activa y disponible para mostrarse a usuarios free

#### Scenario: Campaña fuera de vigencia no es elegible
- **WHEN** la fecha actual está fuera del rango de vigencia de una campaña
- **THEN** el sistema no la considera elegible para una nueva impresión

### Requirement: Impresión de anuncio a un usuario free
El sistema SHALL, cuando un Usuario B2C sin plan de pago reproduce un track, poder mostrarle un
anuncio de una campaña activa y vigente, y SHALL registrar esa impresión en
`FACT_IMPRESION_ANUNCIO` indicando si fue completada. Un usuario con plan de pago SHALL no recibir
anuncios.

#### Scenario: Usuario free recibe un anuncio
- **WHEN** un Usuario B2C sin plan de pago reproduce un track y hay al menos una campaña activa y vigente
- **THEN** el sistema selecciona una campaña elegible y registra la impresión

#### Scenario: Usuario premium no recibe anuncios
- **WHEN** un Usuario B2C con plan de pago activo reproduce un track
- **THEN** el sistema no le muestra ningún anuncio ni registra ninguna impresión

#### Scenario: Sin campañas elegibles
- **WHEN** un Usuario B2C sin plan de pago reproduce un track y no hay ninguna campaña activa y vigente
- **THEN** el sistema permite la reproducción sin mostrar ningún anuncio

### Requirement: Reconocimiento de ingreso publicitario real
El sistema SHALL, cuando una impresión de anuncio se marca como completada, calcular y registrar
de inmediato el ingreso real de esa impresión (`monto = cpm de la campaña / 1000`) en
`FACT_INGRESO_PUBLICITARIO`, asociado a esa impresión y a esa campaña. Una impresión no completada
SHALL no generar ingreso.

#### Scenario: Impresión completada genera ingreso real
- **WHEN** una impresión de anuncio se marca como completada
- **THEN** el sistema calcula el monto real según el CPM de la campaña y lo registra en `FACT_INGRESO_PUBLICITARIO`

#### Scenario: Impresión no completada no genera ingreso
- **WHEN** una impresión de anuncio se marca como no completada (el usuario la saltó o cerró antes de terminar)
- **THEN** el sistema no registra ningún ingreso para esa impresión

### Requirement: Consulta de ingreso publicitario
El sistema SHALL permitir a un usuario con rol `admin` consultar el ingreso publicitario real
agregado por campaña y por rango de fechas.

#### Scenario: Admin consulta ingreso de una campaña
- **WHEN** un usuario con rol `admin` solicita el ingreso publicitario de una campaña en un rango de fechas
- **THEN** el sistema retorna el monto total real reconocido en ese rango

## Entradas

- Nombre del anunciante, nombre/CPM/vigencia de la campaña (administración).
- Identificador de usuario y su plan activo (selección de impresión).
- Identificador de impresión y si fue completada (reconocimiento de ingreso).
- Identificador de campaña y rango de fechas (consulta de ingreso).

## Salidas

- Confirmación de anunciante/campaña creados.
- Impresión asignada (o ausencia de campaña elegible).
- Confirmación del ingreso reconocido, con el monto calculado.
- Ingreso publicitario agregado por campaña y período.

## Dependencias

- **ClickHouse**: `DIM_ANUNCIANTE`, `DIM_CAMPANA_PUBLICITARIA`, `FACT_IMPRESION_ANUNCIO`,
  `FACT_INGRESO_PUBLICITARIO`.
- **Capability `suscripciones`**: plan activo del usuario (para determinar elegibilidad de anuncio).
- **Capability `seguridad`**: token de sesión autenticado, gating de `admin`.
- **Capability `regalias`**: consumidor de `FACT_INGRESO_PUBLICITARIO` para el pool de liquidación.

## Fuera de alcance

- Segmentación de campañas por audiencia/región (toda campaña vigente es elegible para cualquier usuario free).
- Formatos de anuncio distintos a audio entre canciones (video, display, banner).
- Facturación al anunciante (cobro real por la campaña).
