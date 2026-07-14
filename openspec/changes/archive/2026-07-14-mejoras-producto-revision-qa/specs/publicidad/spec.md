## MODIFIED Requirements

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
