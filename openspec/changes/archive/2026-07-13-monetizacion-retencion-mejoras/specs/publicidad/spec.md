## MODIFIED Requirements

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
recibir anuncios de audio.

#### Scenario: Usuario free recibe un anuncio de audio
- **WHEN** un Usuario B2C sin plan de pago reproduce un track y hay al menos una campaña de tipo `audio` activa y vigente
- **THEN** el sistema selecciona una campaña `audio` elegible y registra la impresión

#### Scenario: Usuario premium no recibe anuncios
- **WHEN** un Usuario B2C con plan de pago activo reproduce un track
- **THEN** el sistema no le muestra ningún anuncio ni registra ninguna impresión

#### Scenario: Sin campañas de audio elegibles
- **WHEN** un Usuario B2C sin plan de pago reproduce un track y no hay ninguna campaña de tipo `audio` activa y vigente
- **THEN** el sistema permite la reproducción sin mostrar ningún anuncio

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

## ADDED Requirements

### Requirement: Impresión de anuncio display al cargar una pantalla
El sistema SHALL, cuando un Usuario B2C sin plan de pago carga una pantalla de home o catálogo,
seleccionar una campaña `display` activa y vigente y registrar la impresión en
`FACT_IMPRESION_ANUNCIO` al renderizarse, de forma independiente del reproductor de audio. Un
usuario con plan de pago SHALL no recibir anuncios display.

#### Scenario: Usuario free recibe un anuncio display al cargar catálogo o home
- **WHEN** un Usuario B2C sin plan de pago carga la pantalla de catálogo o de home y hay al menos una campaña de tipo `display` activa y vigente
- **THEN** el sistema selecciona una campaña `display` elegible, la muestra como banner y registra la impresión

#### Scenario: Usuario premium no recibe banner display
- **WHEN** un Usuario B2C con plan de pago activo carga la pantalla de catálogo o de home
- **THEN** el sistema no le muestra ningún banner display ni registra ninguna impresión

#### Scenario: Sin campañas display elegibles
- **WHEN** un Usuario B2C sin plan de pago carga catálogo o home y no hay ninguna campaña de tipo `display` activa y vigente
- **THEN** el sistema no muestra ningún banner, sin bloquear la carga de la pantalla

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
