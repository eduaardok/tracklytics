# distribucion Specification

## Purpose

Administrar sellos discográficos, licencias de distribución por país y restricciones de
reproducción por track/país/canal, y verificar automáticamente esas restricciones cuando un
Usuario B2C intenta reproducir o consultar disponibilidad.

## Objetivo

Administrar sellos discográficos, licencias de distribución por país y restricciones de
reproducción por track/país/canal, y verificar automáticamente esas restricciones cuando un
Usuario B2C intenta reproducir o consultar disponibilidad.

## Contexto

Hasta esta capability, el catálogo se mostraba igual a cualquier oyente en cualquier país y el
sello discográfico era una etiqueta de texto sin relación estructurada. `distribucion` introduce
el mercado real detrás del catálogo: qué sello respalda a cada artista/álbum, en qué países tiene
licencia ese sello, y qué tracks tienen una restricción de reproducción vigente.

## Actores

- **Usuario B2C**: consulta disponibilidad de un track por país y sufre el bloqueo de
  reproducción cuando aplica una restricción.
- **Cliente B2B**: beneficiario indirecto (sello discográfico); no opera esta capability
  directamente.
- **Lead Data Engineer / CTO** (`role=admin`): administra sellos, licencias y restricciones de
  reproducción.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Lead Data Engineer / CTO | Distribución | CU-O36 Administrar sellos discográficos | Como Lead Data Engineer/CTO, quiero crear y editar sellos discográficos, para mantener el catálogo de sellos que respaldan a los artistas |
| Operativo | Lead Data Engineer / CTO | Distribución | CU-O37 Asignar sello a artista o álbum | Como Lead Data Engineer/CTO, quiero asignar un sello existente a un artista o álbum, para reflejar quién respalda ese contenido |
| Operativo | Lead Data Engineer / CTO | Distribución | CU-O38 Administrar licencias de distribución por país | Como Lead Data Engineer/CTO, quiero registrar la licencia de un sello para distribuir en un país durante un período determinado, para reflejar los acuerdos comerciales reales |
| Operativo | Lead Data Engineer / CTO | Distribución | CU-O39 Consultar licencias por sello o por país | Como Lead Data Engineer/CTO, quiero consultar las licencias vigentes o vencidas de un sello, o todas las licencias de un país, para dar seguimiento a los acuerdos |
| Operativo | Lead Data Engineer / CTO | Distribución | CU-O40 Administrar restricciones de reproducción | Como Lead Data Engineer/CTO, quiero crear o desactivar una restricción de reproducción sobre un track en un país y canal, para reflejar limitaciones de derechos vigentes |
| Operativo | Usuario B2C | Distribución | CU-O41 Consultar disponibilidad de un track por país | Como Usuario B2C, quiero saber si un track está disponible en mi país antes de reproducirlo, para entender por qué algunos tracks no se reproducen |
| Operativo | Usuario B2C | Distribución | CU-O80 Explorar disponibilidad del catálogo por país en una lista | Como Usuario B2C, quiero ver una lista filtrable del catálogo con su estado de disponibilidad en mi país, para explorar qué está disponible o bloqueado sin tener que conocer de antemano el nombre de cada track |
## Requirements
### Requirement: Administración de sellos discográficos
El sistema SHALL permitir a un usuario con rol admin crear y editar sellos discográficos. Esta operación SHALL estar restringida exclusivamente a usuarios con rol admin y SHALL registrarse en `FACT_AUDIT_LOG`.

#### Scenario: Admin crea un sello discográfico
- **WHEN** un usuario con rol admin crea un sello discográfico con un nombre no vacío
- **THEN** el sistema registra el sello, lo deja disponible para asignación y registra la acción en `FACT_AUDIT_LOG`

#### Scenario: Admin edita un sello discográfico existente
- **WHEN** un usuario con rol admin edita el nombre de un sello discográfico existente
- **THEN** el sistema actualiza el sello y registra el estado antes/después en `FACT_AUDIT_LOG`

#### Scenario: Usuario sin rol admin intenta administrar sellos
- **WHEN** un usuario con rol distinto de admin intenta crear o editar un sello discográfico
- **THEN** el sistema rechaza la operación indicando que es exclusiva de admin

### Requirement: Asignación de sello a artista o álbum
El sistema SHALL permitir a un usuario con rol admin asignar un sello discográfico existente a un artista o a un álbum existente del catálogo, actualizando su cobertura de licencia. Esta operación SHALL estar restringida exclusivamente a usuarios con rol admin y SHALL registrarse en `FACT_AUDIT_LOG`.

#### Scenario: Admin asigna un sello a un artista
- **WHEN** un usuario con rol admin asigna un sello discográfico existente a un artista existente del catálogo
- **THEN** el sistema actualiza el sello del artista y registra la acción en `FACT_AUDIT_LOG`

#### Scenario: Admin asigna un sello a un álbum
- **WHEN** un usuario con rol admin asigna un sello discográfico existente a un álbum existente del catálogo
- **THEN** el sistema actualiza el sello del álbum y registra la acción en `FACT_AUDIT_LOG`

#### Scenario: Intento de asignar un sello inexistente
- **WHEN** un usuario con rol admin intenta asignar un sello que no existe a un artista o álbum
- **THEN** el sistema rechaza la operación con un error de sello no encontrado

### Requirement: Administración de licencias de distribución
El sistema SHALL permitir a un usuario con rol admin crear una licencia de distribución para un sello discográfico en un país, con fecha de inicio, fecha de fin opcional y estado. Esta operación SHALL estar restringida exclusivamente a usuarios con rol admin y SHALL registrarse en `FACT_AUDIT_LOG`. Una licencia cubre la totalidad del catálogo del sello en ese país.

#### Scenario: Admin crea una licencia con vigencia definida
- **WHEN** un usuario con rol admin crea una licencia indicando sello, país, fecha de inicio y fecha de fin
- **THEN** el sistema registra la licencia como activa para todo el catálogo de ese sello en ese país, y registra la acción en `FACT_AUDIT_LOG`

#### Scenario: Admin crea una licencia sin fecha de fin
- **WHEN** un usuario con rol admin crea una licencia sin indicar fecha de fin
- **THEN** el sistema registra la licencia como activa e indefinida hasta que se le asigne una fecha de fin o se cambie su estado

#### Scenario: Usuario sin rol admin intenta crear una licencia
- **WHEN** un usuario con rol distinto de admin intenta crear una licencia de distribución
- **THEN** el sistema rechaza la operación indicando que es exclusiva de admin

### Requirement: Consulta de licencias por sello o por país
El sistema SHALL permitir a un usuario con rol admin consultar las licencias existentes filtradas por sello o por país, incluyendo aquellas cuyo estado sea vencida.

#### Scenario: Admin consulta licencias de un sello
- **WHEN** un usuario con rol admin solicita las licencias de un sello discográfico específico
- **THEN** el sistema retorna todas las licencias de ese sello, incluyendo las vencidas, con su país y vigencia

#### Scenario: Admin consulta licencias de un país
- **WHEN** un usuario con rol admin solicita las licencias vigentes en un país específico
- **THEN** el sistema retorna todas las licencias de ese país, incluyendo las vencidas, con su sello y vigencia

### Requirement: Administración de restricciones de reproducción
El sistema SHALL permitir a un usuario con rol admin crear una restricción de reproducción para un track existente, indicando país, canal de distribución y tipo de restricción, quedando la restricción activa de inmediato. Esta operación SHALL estar restringida exclusivamente a usuarios con rol admin y SHALL registrarse en `FACT_AUDIT_LOG`.

#### Scenario: Admin crea una restricción de reproducción
- **WHEN** un usuario con rol admin crea una restricción indicando un track existente, un país, un canal de distribución y un tipo de restricción válido
- **THEN** el sistema registra la restricción como activa y la aplica de inmediato a los intentos de reproducción de ese track en ese país y canal, y registra la acción en `FACT_AUDIT_LOG`

#### Scenario: Intento de crear una restricción sobre un track inexistente
- **WHEN** un usuario con rol admin intenta crear una restricción para un track que no existe en `FACT_TRACKS`
- **THEN** el sistema rechaza la operación con un error de track no encontrado

#### Scenario: Usuario sin rol admin intenta crear una restricción
- **WHEN** un usuario con rol distinto de admin intenta crear una restricción de reproducción
- **THEN** el sistema rechaza la operación indicando que es exclusiva de admin

### Requirement: Desactivación de una restricción de reproducción
El sistema SHALL permitir a un usuario con rol admin desactivar una restricción de reproducción existente mediante soft-delete (`activo=0`), sin eliminar el registro histórico. Esta operación SHALL estar restringida exclusivamente a usuarios con rol admin y SHALL registrarse en `FACT_AUDIT_LOG`.

#### Scenario: Admin desactiva una restricción existente
- **WHEN** un usuario con rol admin desactiva una restricción de reproducción activa
- **THEN** el sistema marca la restricción como inactiva, deja de aplicarla a nuevos intentos de reproducción, conserva el registro histórico, y registra la acción en `FACT_AUDIT_LOG`

#### Scenario: Intento de desactivar una restricción ya inactiva
- **WHEN** un usuario con rol admin intenta desactivar una restricción que ya está inactiva
- **THEN** el sistema rechaza la operación indicando que la restricción ya no está activa

### Requirement: Bloqueo de reproducción por restricción activa
El sistema SHALL verificar, al registrar un intento de reproducción de un Usuario B2C, si existe una restricción activa para el país del usuario y el canal de la reproducción. Si existe, el sistema SHALL bloquear la reproducción, no registrar el evento en el historial normal de reproducción, y SHALL registrar el intento bloqueado en `FACT_RESTRICCION_REPRODUCCION`.

#### Scenario: Reproducción bloqueada por restricción activa
- **WHEN** un Usuario B2C autenticado intenta reproducir un track que tiene una restricción activa para su país y el canal de streaming
- **THEN** el sistema rechaza la reproducción, indica el tipo de restricción como motivo, y registra el intento en `FACT_RESTRICCION_REPRODUCCION`

#### Scenario: Reproducción permitida sin restricción activa
- **WHEN** un Usuario B2C autenticado intenta reproducir un track que no tiene ninguna restricción activa para su país y canal
- **THEN** el sistema permite la reproducción y la registra normalmente en el historial del usuario, sin generar un evento en `FACT_RESTRICCION_REPRODUCCION`

#### Scenario: País del usuario no reconocido
- **WHEN** un Usuario B2C autenticado cuyo país de perfil no coincide con ningún país conocido por el sistema intenta reproducir un track
- **THEN** el sistema permite la reproducción sin aplicar ninguna restricción geográfica, al no poder determinar de forma confiable el país del usuario

### Requirement: Consulta de disponibilidad de un track por país
El sistema SHALL permitir a un Usuario B2C autenticado consultar si un track está disponible en su país antes de reproducirlo, localizando el track mediante una búsqueda por nombre de track o de artista en vez de un identificador interno escrito manualmente. Esta consulta SHALL ser de solo lectura y no SHALL bloquear ni registrar ningún intento de reproducción. La determinación del país del usuario SHALL depender del país declarado en su perfil; si ese valor no coincide con ningún país conocido por el sistema, el track SHALL considerarse disponible.

#### Scenario: Buscar el track por nombre o artista antes de consultar su disponibilidad
- **WHEN** un Usuario B2C autenticado escribe parte del nombre de un track o de un artista para consultar disponibilidad
- **THEN** el sistema muestra las coincidencias encontradas para que el usuario seleccione el track exacto, sin requerir que conozca ni escriba su identificador interno

#### Scenario: Consultar disponibilidad de un track disponible
- **WHEN** un Usuario B2C autenticado consulta la disponibilidad de un track que no tiene restricciones activas en su país
- **THEN** el sistema indica que el track está disponible, sin registrar ningún evento de restricción

#### Scenario: Consultar disponibilidad de un track restringido
- **WHEN** un Usuario B2C autenticado consulta la disponibilidad de un track que tiene una restricción activa en su país
- **THEN** el sistema indica que el track no está disponible junto con el tipo de restricción, sin bloquear nada ni registrar un evento en `FACT_RESTRICCION_REPRODUCCION`

#### Scenario: País del usuario no reconocido al consultar disponibilidad
- **WHEN** un Usuario B2C autenticado cuyo país de perfil no coincide con ningún país conocido por el sistema consulta la disponibilidad de un track
- **THEN** el sistema indica que el track está disponible, al no poder determinar de forma confiable el país del usuario

### Requirement: Explorar disponibilidad del catálogo por país en una lista
El sistema SHALL permitir a un Usuario B2C autenticado consultar una lista paginada del catálogo
con su estado de disponibilidad (disponible o bloqueado) para su país o para un país indicado, sin
requerir que conozca de antemano el nombre de ningún track. La lista SHALL ser filtrable por estado
(disponible, bloqueado, todos) y SHALL admitir una búsqueda opcional por nombre de track o artista
para acotarla. Esta consulta SHALL ser de solo lectura y no SHALL bloquear ni registrar ningún
intento de reproducción, con el mismo criterio de determinación de país ya vigente para la consulta
de un track puntual.

#### Scenario: Explorar la lista de disponibilidad sin buscar un track específico
- **WHEN** un Usuario B2C autenticado abre la vista de disponibilidad sin escribir ningún término de búsqueda
- **THEN** el sistema muestra una página del catálogo con el estado de disponibilidad (disponible o bloqueado) de cada track para su país

#### Scenario: Filtrar la lista por estado de disponibilidad
- **WHEN** un Usuario B2C autenticado filtra la lista de disponibilidad por "bloqueado"
- **THEN** el sistema muestra únicamente los tracks bloqueados en su país

#### Scenario: Acotar la lista con una búsqueda por nombre
- **WHEN** un Usuario B2C autenticado escribe parte del nombre de un track o artista mientras explora la lista de disponibilidad
- **THEN** el sistema acota la lista a los tracks cuyo nombre o artista coincide, manteniendo el filtro de estado activo

#### Scenario: País del usuario no reconocido al explorar la lista
- **WHEN** un Usuario B2C autenticado cuyo país de perfil no coincide con ningún país conocido por el sistema abre la vista de disponibilidad
- **THEN** el sistema muestra todos los tracks de la página como disponibles, al no poder determinar de forma confiable el país del usuario

### Requirement: Auditoría de acciones administrativas de distribución
El sistema SHALL registrar en `FACT_AUDIT_LOG` cada acción CRUD de administración de sellos, licencias y restricciones, incluyendo el administrador que la ejecutó, la tabla afectada y el estado antes/después.

#### Scenario: Registro de auditoría al administrar licencias o restricciones
- **WHEN** un usuario con rol admin crea, edita o desactiva un sello, una licencia o una restricción de reproducción
- **THEN** el sistema registra en `FACT_AUDIT_LOG` el administrador que ejecutó el cambio, la acción realizada, la tabla afectada y el estado antes/después

### Requirement: Catálogo público de países
El sistema SHALL exponer el catálogo de países conocidos (`DIM_PAIS`) sin requerir autenticación, para que las pantallas de registro de cuenta y de edición de perfil puedan ofrecer un selector de país antes de que exista una sesión de usuario o sin depender de un rol administrativo. Este endpoint SHALL ser de solo lectura.

#### Scenario: Consultar el catálogo de países sin sesión
- **WHEN** cualquier cliente, autenticado o no, solicita el catálogo público de países
- **THEN** el sistema retorna la lista completa de países conocidos con su nombre y código ISO

#### Scenario: El país declarado por el usuario proviene del catálogo conocido
- **WHEN** un usuario selecciona su país de este catálogo al registrarse o editar su perfil
- **THEN** el valor declarado coincide exactamente con un país conocido por el sistema, de modo que la consulta de disponibilidad por país (`Consulta de disponibilidad de un track por país`) pueda resolverlo de forma confiable en vez de caer en el caso de "país no reconocido"

### Requirement: Panel administrativo de métricas de distribución
El sistema SHALL exponer a un usuario con rol `admin` un panel con métricas operativas agregadas de la capability `distribucion`: conteo de restricciones de reproducción activas por país, y total de licencias en estado activo.

#### Scenario: Admin consulta el panel de métricas de distribución
- **WHEN** un usuario con rol `admin` solicita el dashboard de distribución
- **THEN** el sistema retorna el conteo de restricciones agrupado por país y el total de licencias activas, calculados sobre `FACT_RESTRICCION_REPRODUCCION`/`DIM_LICENCIA`

#### Scenario: Usuario sin rol admin intenta consultar el panel de distribución
- **WHEN** un usuario sin rol `admin` intenta consultar el dashboard de distribución
- **THEN** el sistema rechaza la operación

