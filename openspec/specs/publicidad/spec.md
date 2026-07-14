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
| Operativo | Usuario B2C (free) | Publicidad | CU-O69 Recibir un anuncio display en pantalla | Como Usuario B2C del plan free, quiero ver un banner display al cargar catálogo u home, para que Tracklytics se financie también sin depender solo de anuncios de audio |

## Requirements

### Requirement: Administración de anunciantes y campañas
El sistema SHALL permitir a un usuario con rol `admin` registrar un anunciante y crear campañas
publicitarias asociadas, indicando un CPM (costo por mil impresiones) real, un rango de vigencia
y un tipo de anuncio (`audio` o `display`), exclusivo por campaña — una campaña se contrata para
un solo formato. Una campaña de tipo `display` SHALL además indicar una URL de destino a la que
se redirige al usuario si hace click. Solo una campaña activa y vigente SHALL ser elegible para
mostrarse.

#### Scenario: Admin crea un anunciante y una campaña de audio
- **WHEN** un usuario con rol `admin` registra un anunciante y crea una campaña de tipo `audio` con nombre, CPM y fecha de inicio
- **THEN** el sistema registra la campaña como activa y disponible para mostrarse entre canciones a usuarios free

#### Scenario: Admin crea una campaña de tipo display con URL de destino
- **WHEN** un usuario con rol `admin` crea una campaña de tipo `display` con nombre, CPM, fecha de inicio y una URL de destino
- **THEN** el sistema registra la campaña como activa y disponible para mostrarse como banner a usuarios free

#### Scenario: Campaña display sin URL de destino es rechazada
- **WHEN** un usuario con rol `admin` intenta crear una campaña de tipo `display` sin indicar una URL de destino
- **THEN** el sistema rechaza la creación con un mensaje de error

#### Scenario: Campaña fuera de vigencia no es elegible
- **WHEN** la fecha actual está fuera del rango de vigencia de una campaña
- **THEN** el sistema no la considera elegible para una nueva impresión, sin importar su tipo de anuncio

### Requirement: Impresión de anuncio a un usuario free
El sistema SHALL, cuando un Usuario B2C sin plan de pago reproduce un track, poder mostrarle un
anuncio de una campaña `audio` activa y vigente, y SHALL registrar esa impresión en
`FACT_IMPRESION_ANUNCIO` indicando si fue completada. Un usuario con plan de pago SHALL no
recibir anuncios de audio. Un usuario con una cuenta de artista en estado `aprobada`
(capability `creadores`) SHALL no recibir anuncios de audio, independientemente de su plan.

#### Scenario: Usuario free recibe un anuncio de audio
- **WHEN** un Usuario B2C sin plan de pago y sin cuenta de artista aprobada reproduce un track y hay al menos una campaña de tipo `audio` activa y vigente
- **THEN** el sistema selecciona una campaña `audio` elegible y registra la impresión

#### Scenario: Usuario premium no recibe anuncios
- **WHEN** un Usuario B2C con plan de pago activo reproduce un track
- **THEN** el sistema no le muestra ningún anuncio ni registra ninguna impresión

#### Scenario: Sin campañas de audio elegibles
- **WHEN** un Usuario B2C sin plan de pago reproduce un track y no hay ninguna campaña de tipo `audio` activa y vigente
- **THEN** el sistema permite la reproducción sin mostrar ningún anuncio

#### Scenario: Artista con cuenta aprobada no recibe anuncios de audio
- **WHEN** un usuario con una cuenta de artista en estado `aprobada` reproduce un track, sin importar su plan de suscripción
- **THEN** el sistema no le muestra ningún anuncio de audio ni registra ninguna impresión

### Requirement: Impresión de anuncio display al cargar una pantalla
El sistema SHALL, cuando un Usuario B2C sin plan de pago carga una pantalla de home o catálogo,
seleccionar una campaña `display` activa y vigente y registrar la impresión en
`FACT_IMPRESION_ANUNCIO` al renderizarse, de forma independiente del reproductor de audio. Un
usuario con plan de pago SHALL no recibir anuncios display. Un usuario con una cuenta de artista
en estado `aprobada` (capability `creadores`) SHALL no recibir anuncios display,
independientemente de su plan.

#### Scenario: Usuario free recibe un anuncio display al cargar catálogo o home
- **WHEN** un Usuario B2C sin plan de pago y sin cuenta de artista aprobada carga la pantalla de catálogo o de home y hay al menos una campaña de tipo `display` activa y vigente
- **THEN** el sistema selecciona una campaña `display` elegible, la muestra como banner y registra la impresión

#### Scenario: Usuario premium no recibe banner display
- **WHEN** un Usuario B2C con plan de pago activo carga la pantalla de catálogo o de home
- **THEN** el sistema no le muestra ningún banner display ni registra ninguna impresión

#### Scenario: Sin campañas display elegibles
- **WHEN** un Usuario B2C sin plan de pago carga catálogo o home y no hay ninguna campaña de tipo `display` activa y vigente
- **THEN** el sistema no muestra ningún banner, sin bloquear la carga de la pantalla

#### Scenario: Artista con cuenta aprobada no recibe banner display
- **WHEN** un usuario con una cuenta de artista en estado `aprobada` carga la pantalla de catálogo o de home, sin importar su plan de suscripción
- **THEN** el sistema no le muestra ningún banner display ni registra ninguna impresión

### Requirement: Registro de click en anuncio display
El sistema SHALL, cuando un Usuario B2C hace click en un banner display activo, marcar la
impresión correspondiente con `click=1`, redirigirlo a la URL de destino de la campaña, y marcar
la impresión como completada (ver "Reconocimiento de ingreso publicitario real"). Un click sobre
una impresión ya completada SHALL no duplicar el ingreso registrado.

#### Scenario: Click en banner display marca la impresión y redirige
- **WHEN** un Usuario B2C hace click en un banner display cuya impresión aún no está completada
- **THEN** el sistema marca `click=1` en la impresión, la marca como completada, y redirige al usuario a la URL de destino de la campaña

#### Scenario: Click repetido sobre la misma impresión no duplica el ingreso
- **WHEN** un Usuario B2C hace click en un banner cuya impresión ya fue marcada como completada anteriormente
- **THEN** el sistema redirige a la URL de destino sin registrar un nuevo ingreso en `FACT_INGRESO_PUBLICITARIO`

### Requirement: Reconocimiento de ingreso publicitario real
El sistema SHALL, cuando una impresión de anuncio se marca como completada, calcular y registrar
de inmediato el ingreso real de esa impresión (`monto = cpm de la campaña / 1000`) en
`FACT_INGRESO_PUBLICITARIO`, asociado a esa impresión y a esa campaña, sin importar si la campaña
es de tipo `audio` o `display`. Una impresión no completada SHALL no generar ingreso. Para una
impresión de campaña `display`, completarse SHALL significar que el usuario hizo click y fue
redirigido a la URL de destino.

#### Scenario: Impresión de audio completada genera ingreso real
- **WHEN** una impresión de una campaña `audio` se marca como completada
- **THEN** el sistema calcula el monto real según el CPM de la campaña y lo registra en `FACT_INGRESO_PUBLICITARIO`

#### Scenario: Click en un anuncio display genera ingreso real
- **WHEN** un Usuario B2C hace click en un banner de una campaña `display` y es redirigido a la URL de destino
- **THEN** el sistema marca esa impresión como completada, calcula el monto real según el CPM de la campaña y lo registra en `FACT_INGRESO_PUBLICITARIO`

#### Scenario: Impresión no completada no genera ingreso
- **WHEN** una impresión de anuncio se marca como no completada (audio: el usuario la saltó o cerró antes de terminar; display: el usuario nunca hizo click)
- **THEN** el sistema no registra ningún ingreso para esa impresión

### Requirement: Consulta de ingreso publicitario
El sistema SHALL permitir a un usuario con rol `admin` consultar el ingreso publicitario real
agregado por campaña y por rango de fechas.

#### Scenario: Admin consulta ingreso de una campaña
- **WHEN** un usuario con rol `admin` solicita el ingreso publicitario de una campaña en un rango de fechas
- **THEN** el sistema retorna el monto total real reconocido en ese rango

## Entradas

- Nombre del anunciante, nombre/CPM/vigencia/tipo de anuncio/URL de destino de la campaña (administración).
- Identificador de usuario y su plan activo (selección de impresión, audio o display).
- Identificador de impresión y si fue completada, o si hubo click (display) (reconocimiento de ingreso).
- Identificador de campaña y rango de fechas (consulta de ingreso).

## Salidas

- Confirmación de anunciante/campaña creados, incluido el tipo de anuncio.
- Impresión asignada (audio o display, con URL de destino si aplica), o ausencia de campaña elegible.
- Confirmación del ingreso reconocido, con el monto calculado.
- Ingreso publicitario agregado por campaña y período.

## Dependencias

- **ClickHouse**: `DIM_ANUNCIANTE`, `DIM_CAMPANA_PUBLICITARIA`, `FACT_IMPRESION_ANUNCIO`,
  `FACT_INGRESO_PUBLICITARIO`.
- **Capability `suscripciones`**: plan activo del usuario (para determinar elegibilidad de anuncio).
- **Capability `seguridad`**: token de sesión autenticado, gating de `admin`.
- **Capability `regalias`**: consumidor de `FACT_INGRESO_PUBLICITARIO` para el pool de liquidación.
- **Capability `analitica`**: consumidor de `FACT_IMPRESION_ANUNCIO` para el funnel de conversión free → premium.

## Fuera de alcance

- Segmentación de campañas por audiencia/región (toda campaña vigente es elegible para cualquier usuario free).
- Formatos de anuncio distintos a audio y display (video, banner intersticial de app nativa).
- Facturación al anunciante (cobro real por la campaña).
