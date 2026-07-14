# Capability: creadores

## Purpose

Permitir que un usuario autenticado solicite convertirse en artista, que `admin` apruebe o rechace esa cuenta, y que un artista con cuenta aprobada suba tracks que `admin` revisa y aprueba individualmente — promoviéndolos al catálogo real (`FACT_TRACKS`) al aprobarlos.

## Objetivo

Permitir que un usuario autenticado solicite convertirse en artista, que `admin` apruebe o rechace esa cuenta, y que un artista con cuenta aprobada suba tracks que `admin` revisa y aprueba individualmente — promoviéndolos al catálogo real (`FACT_TRACKS`) al aprobarlos.

## Contexto

Hoy el único camino para que un track exista en `FACT_TRACKS` es la carga por lotes de `ingesta` sobre el dataset base de streaming. No existe ningún flujo para que un usuario final publique su propia música. Esta capability introduce ese flujo con dos niveles de aprobación independientes: la cuenta de artista (una vez) y cada track subido (uno por uno).

## Actores

- **Usuario B2C** (`role=user`): solicita una cuenta de artista y consulta su propio estado de solicitud.
- **Artista** (usuario con `DIM_CUENTA_ARTISTA.estado_cuenta='aprobada'`): sube tracks y consulta el estado de sus propias subidas.
- **Lead Data Engineer / CTO** (`role=admin`): aprueba/rechaza cuentas de artista, aprueba/rechaza tracks individuales (con promoción real a `FACT_TRACKS` al aprobar), y consulta cuentas/subidas de cualquier usuario.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Usuario B2C | Creadores y catálogo de artistas | CU-O24 Solicitar una cuenta de artista | Como Usuario B2C, quiero solicitar una cuenta de artista con mi nombre artístico, para poder publicar mi música en la plataforma |
| Operativo | Lead Data Engineer / CTO | Creadores y catálogo de artistas | CU-O25 Aprobar o rechazar una cuenta de artista | Como Lead Data Engineer/CTO, quiero revisar y aprobar o rechazar cada solicitud de cuenta de artista, para controlar quién puede publicar contenido |
| Operativo | Artista | Creadores y catálogo de artistas | CU-O26 Subir un track | Como Artista, quiero subir un track con su metadata, para someterlo a revisión y publicarlo en el catálogo |
| Operativo | Lead Data Engineer / CTO | Creadores y catálogo de artistas | CU-O27 Aprobar o rechazar un track subido | Como Lead Data Engineer/CTO, quiero revisar y aprobar o rechazar cada track subido por un artista, para mantener la calidad del catálogo antes de publicarlo |
| Operativo | Artista / Lead Data Engineer / CTO | Creadores y catálogo de artistas | CU-O28 Consultar el estado de cuentas y subidas | Como Artista, quiero ver el estado de mi cuenta y de mis tracks subidos, para saber si ya puedo publicar o si un track fue aprobado |

## Requirements

### Requirement: Solicitud de cuenta de artista
El sistema SHALL permitir a un usuario autenticado solicitar una cuenta de artista indicando un nombre artístico, quedando en estado `pendiente` hasta que `admin` la resuelva. Un usuario SHALL tener como máximo una cuenta de artista.

#### Scenario: Solicitud exitosa de cuenta de artista
- **WHEN** un usuario autenticado sin cuenta de artista previa envía un nombre artístico válido
- **THEN** el sistema crea su cuenta de artista en estado `pendiente`, asociada a ese usuario

#### Scenario: Usuario con cuenta ya solicitada intenta solicitar de nuevo
- **WHEN** un usuario autenticado que ya tiene una cuenta de artista (en cualquier estado) intenta solicitar otra
- **THEN** el sistema rechaza la nueva solicitud indicando que ya existe una cuenta asociada a ese usuario

#### Scenario: El nombre artístico llega precargado desde el registro
- **WHEN** un visitante se registra eligiendo la opción "Artista" (no un rol de backend nuevo — sigue creando una cuenta `user` normal, ver capability `seguridad`) y es redirigido a solicitar su cuenta de artista
- **THEN** el formulario de solicitud aparece con el nombre ingresado en el registro precargado como nombre artístico, editable antes de enviar

### Requirement: Aprobación o rechazo de una cuenta de artista
El sistema SHALL permitir a un usuario con rol `admin` aprobar o rechazar una cuenta de artista en estado `pendiente`, registrando quién resolvió la solicitud y cuándo. Solo con la cuenta en estado `aprobada` el usuario SHALL poder subir tracks.

#### Scenario: Admin aprueba una cuenta de artista
- **WHEN** un usuario con rol `admin` aprueba una cuenta de artista en estado `pendiente`
- **THEN** el sistema marca la cuenta como `aprobada`, registra el administrador resolutor y la fecha de resolución, y el artista queda habilitado para subir tracks

#### Scenario: Admin rechaza una cuenta de artista
- **WHEN** un usuario con rol `admin` rechaza una cuenta de artista en estado `pendiente`
- **THEN** el sistema marca la cuenta como `rechazada`, registra el administrador resolutor y la fecha de resolución, y el usuario no queda habilitado para subir tracks

#### Scenario: Usuario sin rol admin intenta resolver una cuenta de artista
- **WHEN** un usuario con rol distinto de `admin` intenta aprobar o rechazar una cuenta de artista
- **THEN** el sistema rechaza la operación indicando que es exclusiva de `admin`

### Requirement: Subida de un track por un artista con cuenta aprobada
El sistema SHALL permitir a un usuario cuya cuenta de artista esté en estado `aprobada` subir un track (nombre, álbum opcional, género existente, duración y marca de contenido explícito), quedando registrado en `STG_ARTIST_UPLOADS` y su revisión en estado `pendiente`. El sistema SHALL rechazar la subida si el usuario no tiene una cuenta de artista aprobada. Las características de audio de partida del track SHALL calibrarse contra el perfil típico del género elegido (mismo perfil empírico por género que usa la ingesta), en vez de un valor neutro fijo idéntico para cualquier género; si el género no tiene una muestra mínima de tracks de origen, el sistema SHALL usar el perfil general del catálogo como respaldo.

#### Scenario: Subida exitosa de un track
- **WHEN** un usuario con cuenta de artista `aprobada` envía nombre, género válido, duración y marca de contenido explícito para un nuevo track
- **THEN** el sistema registra el track subido asociado a esa cuenta de artista, con su revisión en estado `pendiente`

#### Scenario: Usuario sin cuenta de artista aprobada intenta subir un track
- **WHEN** un usuario sin cuenta de artista, o con cuenta `pendiente` o `rechazada`, intenta subir un track
- **THEN** el sistema rechaza la subida indicando que se requiere una cuenta de artista aprobada

#### Scenario: Las características de audio de partida se calibran contra el género elegido
- **WHEN** un artista sube un track eligiendo un género que cuenta con suficientes tracks de origen para calcular su perfil de audio
- **THEN** el sistema guarda como valores de partida del track características de audio dentro del perfil típico de ese género

#### Scenario: Género sin muestra suficiente usa el perfil general como respaldo
- **WHEN** un artista sube un track eligiendo un género que no cuenta con una muestra mínima de tracks de origen
- **THEN** el sistema guarda como valores de partida del track características de audio dentro del perfil general del catálogo

### Requirement: Aprobación o rechazo de un track individual
El sistema SHALL permitir a un usuario con rol `admin` aprobar o rechazar, de forma independiente, cada track subido en estado `pendiente`, sin que esa resolución afecte el estado de la cuenta de artista ni de otros tracks de la misma cuenta. Al aprobar, el sistema SHALL promover el track a `FACT_TRACKS` marcado con `source_type='user_uploaded'`, quedando disponible en el catálogo. Al rechazar, el track SHALL permanecer en `STG_ARTIST_UPLOADS` sin promoverse.

#### Scenario: Admin aprueba un track y se promueve al catálogo
- **WHEN** un usuario con rol `admin` aprueba un track en estado `pendiente`
- **THEN** el sistema marca su revisión como `aprobado`, registra el administrador resolutor y la fecha de resolución, y crea el registro correspondiente en `FACT_TRACKS` con `source_type='user_uploaded'`

#### Scenario: Admin rechaza un track y no se promueve
- **WHEN** un usuario con rol `admin` rechaza un track en estado `pendiente`
- **THEN** el sistema marca su revisión como `rechazado`, registra el administrador resolutor y la fecha de resolución, y el track no se crea en `FACT_TRACKS`

#### Scenario: La resolución de un track no afecta la cuenta de artista ni otros tracks
- **WHEN** un track de una cuenta de artista aprobada es aprobado o rechazado
- **THEN** el estado de la cuenta de artista y el estado de revisión de los demás tracks de esa cuenta permanecen sin cambios

#### Scenario: Usuario sin rol admin intenta resolver un track
- **WHEN** un usuario con rol distinto de `admin` intenta aprobar o rechazar un track subido
- **THEN** el sistema rechaza la operación indicando que es exclusiva de `admin`

### Requirement: Consulta del propio estado de cuenta y subidas
El sistema SHALL permitir a un usuario autenticado consultar el estado de su propia cuenta de artista y el estado de revisión de sus propios tracks subidos.

#### Scenario: Consultar mi propia cuenta y mis subidas
- **WHEN** un usuario autenticado solicita el estado de su cuenta de artista o de sus tracks subidos
- **THEN** el sistema retorna únicamente los registros asociados a ese usuario

### Requirement: Acceso administrativo a todas las cuentas y subidas
El sistema SHALL permitir a un usuario con rol `admin` consultar las cuentas de artista y los tracks subidos de cualquier usuario, incluyendo una cola filtrable por estado `pendiente` para su revisión.

#### Scenario: Admin consulta cuentas o subidas de cualquier artista
- **WHEN** un usuario con rol `admin` solicita las cuentas de artista o los tracks subidos de un usuario específico, o la cola de pendientes
- **THEN** el sistema retorna los registros solicitados

#### Scenario: Usuario sin rol admin intenta consultar cuentas o subidas de terceros
- **WHEN** un usuario con rol distinto de `admin` intenta consultar la cuenta de artista o las subidas de otro usuario
- **THEN** el sistema rechaza la operación indicando que esa consulta es exclusiva de `admin`

### Requirement: Auditoría de aprobaciones de cuenta y de track
El sistema SHALL registrar en `FACT_AUDIT_LOG` cada aprobación o rechazo de una cuenta de artista y de un track subido, incluyendo el administrador que ejecutó la acción, la tabla afectada y el estado antes/después.

#### Scenario: Registro de auditoría al resolver una cuenta o un track
- **WHEN** un usuario con rol `admin` aprueba o rechaza una cuenta de artista o un track subido
- **THEN** el sistema registra en `FACT_AUDIT_LOG` el administrador que ejecutó el cambio, la acción realizada, la tabla afectada y el estado antes/después

## Entradas

- Nombre artístico (solicitud de cuenta de artista).
- Decisión de aprobación o rechazo y, opcionalmente, identificador de la cuenta o del track (resolución administrativa).
- Nombre del track, álbum (opcional), género existente, duración y marca de contenido explícito (subida de track).
- Identificador de usuario o de cuenta de artista objetivo, opcional (consultas administrativas; por defecto el propio usuario autenticado).

## Salidas

- Confirmación de la solicitud de cuenta de artista y su estado (`pendiente`/`aprobada`/`rechazada`).
- Confirmación de la subida de un track y su estado de revisión (`pendiente`/`aprobado`/`rechazado`).
- Identificador del registro creado en `FACT_TRACKS` cuando un track es aprobado.
- Listado del propio estado de cuenta y subidas, o de cualquier artista para `admin`.
- Mensaje de error si falta cuenta aprobada, si la operación administrativa no está autorizada, o si ya existe una cuenta de artista para el usuario.

## Dependencias

- **ClickHouse**: `DIM_CUENTA_ARTISTA`, `FACT_SUBIDA_TRACK`, `DIM_ESTADO_REVISION`, `STG_ARTIST_UPLOADS`, `FACT_TRACKS` (escritura al promover), `DIM_ARTISTS`, `DIM_ALBUMS`, `DIM_GENRES`, `DIM_DATE` (lectura/escritura al resolver dimensiones durante la promoción).
- **Capability `seguridad`**: token de sesión autenticado (`core.deps.get_current_user`), gating de `admin` (`require_admin`) y auditoría (`audit.record`).

## Fuera de alcance

- Extracción real de features de audio (análisis de señal) a partir del archivo subido.
- Almacenamiento del archivo de audio en sí.
- Re-solicitud de una cuenta de artista tras un rechazo.
- Edición o eliminación de un track ya subido o ya revisado.
- Preservar tracks `user_uploaded` frente a una recarga completa del pipeline de `ingesta`.
