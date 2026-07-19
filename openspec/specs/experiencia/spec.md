# Capability: experiencia

## Purpose

Capturar telemetría de consumo real (reproducción enriquecida, recomendaciones), dar a
Usuario B2C un canal de soporte, reflejar las playlists del usuario en el motor analítico para
consulta táctica, permitir agrupar suscriptores bajo un plan familiar, y completar las dos
piezas de experiencia diferidas en capabilities anteriores: portada real de álbum/artista/track
y reproducción de audio real.

## Objetivo

Capturar telemetría de consumo real (reproducción enriquecida, recomendaciones), dar a
Usuario B2C un canal de soporte, reflejar las playlists del usuario en el motor analítico para
consulta táctica, permitir agrupar suscriptores bajo un plan familiar, y completar las dos
piezas de experiencia diferidas en capabilities anteriores: portada real de álbum/artista/track
y reproducción de audio real.

## Contexto

Tracklytics ya resuelve exploración de catálogo, biblioteca personal, suscripciones, analítica
táctica, partners e ingesta de datos. Lo que falta es la capa de telemetría fina de consumo que
sostiene el modelo data-flywheel (saber no solo qué se reprodujo, sino desde qué dispositivo,
en qué sesión y qué tanto se escuchó), un canal de soporte para Usuario B2C, un reflejo
analítico de las playlists (que hoy viven exclusivamente en el almacén operativo) para consulta
táctica, la posibilidad de compartir una suscripción entre varios usuarios, y dos piezas de
experiencia visual/auditiva que quedaron explícitamente fuera de alcance en `catalogo` (portada
real, reproducción real) a la espera de esta capability.

## Actores

- **Usuario B2C** (`role=user`): genera el evento de reproducción enriquecido al escuchar un
  track, ve recomendaciones (y su reproducción se registra como resultado de la recomendación),
  crea y consulta sus propios tickets de soporte, y es quien puede pertenecer a un plan
  familiar como titular o miembro.
- **Cliente B2B** (`role=analyst`): consulta el reflejo analítico de playlists (tracks más
  agregados) como parte de su trabajo táctico habitual sobre el catálogo.
- **Lead Data Engineer / CTO** (`role=admin`): consulta y actualiza el estado de los tickets de
  soporte, fuerza una resincronización del reflejo de playlists fuera de la corrida semanal, y
  administra la relación titular/miembros de un plan familiar.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Usuario B2C | Experiencia | CU-O45 Crear ticket de soporte | Como Usuario B2C, quiero crear un ticket de soporte describiendo mi problema, para recibir ayuda del equipo de Tracklytics |
| Operativo | Usuario B2C | Experiencia | CU-O46 Consultar mis tickets de soporte | Como Usuario B2C, quiero ver mis propios tickets de soporte y su estado, para saber si ya fueron atendidos |
| Operativo | Lead Data Engineer / CTO | Experiencia | CU-O47 Consultar todos los tickets de soporte | Como Lead Data Engineer/CTO, quiero ver todos los tickets de soporte de la plataforma, para priorizar mi trabajo de atención |
| Operativo | Lead Data Engineer / CTO | Experiencia | CU-O48 Actualizar estado de un ticket de soporte | Como Lead Data Engineer/CTO, quiero actualizar el estado de un ticket, para reflejar el progreso de su atención |
| Operativo | Lead Data Engineer / CTO | Experiencia | CU-O49 Forzar sincronización de playlists | Como Lead Data Engineer/CTO, quiero forzar una resincronización del reflejo de playlists antes de la próxima corrida semanal, para verificar o depurar el dato actualizado |
| Operativo | Cliente B2B | Experiencia | CU-O50 Consultar tracks más agregados a playlists | Como Cliente B2B, quiero ver qué tracks son más agregados a playlists de usuarios, para entender qué contenido genera mayor afinidad |
| Operativo | Lead Data Engineer / CTO | Experiencia | CU-O51 Crear titular de plan familiar | Como Lead Data Engineer/CTO, quiero designar a un usuario con suscripción activa como titular de un plan familiar, para habilitar que agregue miembros |
| Operativo | Lead Data Engineer / CTO | Experiencia | CU-O52 Agregar miembro a plan familiar | Como Lead Data Engineer/CTO, quiero agregar un usuario como miembro de un plan familiar existente, para que comparta el beneficio de la suscripción del titular |
| Operativo | Lead Data Engineer / CTO | Experiencia | CU-O53 Quitar miembro de plan familiar | Como Lead Data Engineer/CTO, quiero quitar a un miembro de un plan familiar, para reflejar cuando esa persona deja de compartir la suscripción |
| Operativo | Usuario B2C | Experiencia | CU-O57 Resolver portada real de artista, álbum o track | Como Usuario B2C, quiero ver la portada real de un artista o álbum cuando exista, para reconocer visualmente lo que estoy explorando |
| Operativo | Usuario B2C | Experiencia | CU-O58 Reproducir audio real de un track | Como Usuario B2C, quiero escuchar el audio real de un track en vez de una simulación, para tener una experiencia de escucha genuina |
## Requirements
### Requirement: Registro de evento de reproducción enriquecido
El sistema SHALL registrar, de forma síncrona en el momento de la reproducción, un evento enriquecido con el dispositivo, la sesión y el porcentaje completado de la reproducción, adicional al registro de historial que ya existe. Este evento SHALL ser independiente del cálculo de engagement ya existente — ninguno de los dos sustituye al otro.

#### Scenario: Registro de evento enriquecido al reproducir
- **WHEN** ocurre una reproducción de un track por parte de un Usuario B2C autenticado, con dispositivo y sesión identificados
- **THEN** el sistema registra el evento con el dispositivo, la sesión, el porcentaje completado y la fecha, sin alterar el registro de historial ni el cálculo de engagement ya existentes

### Requirement: Registro de impresión de recomendación
El sistema SHALL registrar cada vez que se muestra una recomendación de track a un usuario, identificando el algoritmo que la generó. El sistema SHALL permitir actualizar ese registro para indicar si la recomendación derivó en una reproducción.

#### Scenario: Registro de una impresión mostrada
- **WHEN** el sistema muestra una recomendación de track a un Usuario B2C autenticado
- **THEN** el sistema registra la impresión con el usuario, el track recomendado, el algoritmo utilizado y la fecha, con el indicador de reproducción en falso

#### Scenario: Actualización cuando la recomendación se reproduce
- **WHEN** un Usuario B2C reproduce un track que le fue mostrado como recomendación
- **THEN** el sistema actualiza el indicador de esa impresión a reproducida

### Requirement: Crear ticket de soporte
El sistema SHALL permitir a un Usuario B2C autenticado crear un ticket de soporte con un asunto y una descripción, quedando registrado en estado abierto.

#### Scenario: Creación exitosa de un ticket
- **WHEN** un Usuario B2C autenticado crea un ticket con asunto y descripción no vacíos
- **THEN** el sistema registra el ticket en estado abierto, asociado a ese usuario, con la fecha de creación

#### Scenario: Intento de crear un ticket sin asunto o descripción
- **WHEN** un Usuario B2C autenticado intenta crear un ticket con el asunto o la descripción vacíos
- **THEN** el sistema rechaza la operación indicando los campos requeridos

### Requirement: Consultar tickets de soporte
El sistema SHALL permitir a un Usuario B2C autenticado consultar únicamente sus propios tickets de soporte. El sistema SHALL permitir a un usuario con rol admin consultar todos los tickets de soporte de la plataforma, filtrables por estado.

#### Scenario: Usuario B2C consulta sus propios tickets
- **WHEN** un Usuario B2C autenticado solicita su listado de tickets de soporte
- **THEN** el sistema retorna únicamente los tickets creados por ese usuario

#### Scenario: Admin consulta todos los tickets
- **WHEN** un usuario con rol admin solicita el listado de tickets de soporte, opcionalmente filtrado por estado
- **THEN** el sistema retorna los tickets solicitados de todos los usuarios

#### Scenario: Usuario sin rol admin intenta consultar tickets de otro usuario
- **WHEN** un Usuario B2C autenticado intenta consultar el listado administrativo de tickets
- **THEN** el sistema rechaza la operación indicando que es exclusiva de admin

### Requirement: Actualizar estado de un ticket de soporte
El sistema SHALL permitir a un usuario con rol admin actualizar el estado de un ticket existente entre abierto, en proceso, resuelto y cerrado, registrando la fecha de resolución cuando el estado pase a resuelto. Esta operación SHALL estar restringida exclusivamente a usuarios con rol admin.

#### Scenario: Admin actualiza el estado de un ticket
- **WHEN** un usuario con rol admin actualiza el estado de un ticket existente
- **THEN** el sistema registra el nuevo estado, y si el nuevo estado es resuelto, registra también la fecha de resolución

#### Scenario: Usuario sin rol admin intenta actualizar un ticket
- **WHEN** un usuario con rol distinto de admin intenta actualizar el estado de un ticket
- **THEN** el sistema rechaza la operación indicando que es exclusiva de admin

#### Scenario: Intento de actualizar un ticket inexistente
- **WHEN** un usuario con rol admin intenta actualizar un ticket que no existe
- **THEN** el sistema rechaza la operación con un error de ticket no encontrado

### Requirement: Reflejo analítico de playlists de usuario
El sistema SHALL sincronizar periódicamente, mediante un proceso batch, el contenido de las playlists de usuario desde el almacén operativo hacia el motor analítico, sin que este reflejo se convierta en la fuente de verdad de las playlists — la creación, edición y eliminación de playlists SHALL seguir ocurriendo exclusivamente en el almacén operativo. El sistema SHALL permitir a un usuario con rol admin forzar una resincronización fuera del ciclo periódico.

#### Scenario: Sincronización periódica del reflejo de playlists
- **WHEN** ocurre la corrida periódica de sincronización
- **THEN** el sistema actualiza el reflejo analítico con el contenido vigente de playlists y sus tracks del almacén operativo

#### Scenario: Admin fuerza una resincronización
- **WHEN** un usuario con rol admin solicita una resincronización fuera del ciclo periódico
- **THEN** el sistema ejecuta la sincronización de inmediato y actualiza el reflejo analítico

#### Scenario: Usuario sin rol admin intenta forzar una resincronización
- **WHEN** un usuario con rol distinto de admin intenta forzar una resincronización
- **THEN** el sistema rechaza la operación indicando que es exclusiva de admin

### Requirement: Consultar tracks más agregados a playlists
El sistema SHALL permitir a un usuario con rol analyst o admin consultar, a partir del reflejo analítico de playlists, los tracks más agregados a playlists de usuarios.

#### Scenario: Cliente B2B consulta tracks más agregados
- **WHEN** un usuario con rol analyst solicita el listado de tracks más agregados a playlists
- **THEN** el sistema retorna los tracks ordenados de mayor a menor cantidad de playlists en las que aparecen, según el reflejo analítico vigente

#### Scenario: Usuario B2C intenta consultar tracks más agregados
- **WHEN** un usuario con rol user intenta consultar el listado de tracks más agregados a playlists
- **THEN** el sistema rechaza la operación indicando que es exclusiva de Cliente B2B o admin

### Requirement: Gestión de plan familiar
El sistema SHALL permitir a un usuario con rol admin designar como titular de un plan familiar a un usuario con una suscripción activa en el plan premium (B2C), y agregar o quitar miembros de ese plan familiar. El admin SHALL poder localizar al usuario objetivo (titular o miembro) mediante una búsqueda por nombre o correo, sin requerir que conozca ni escriba su `usuario_id`. Adicionalmente, el sistema SHALL permitir que el propio usuario con suscripción activa en el plan premium se autogestione como titular de su plan familiar: crear su plan, agregar miembros por correo electrónico y quitarlos, sin depender de un administrador. El flujo admin se conserva como capacidad de soporte/override. El sistema SHALL rechazar designar como titular a un usuario cuya suscripción activa no sea del plan premium. El sistema SHALL rechazar agregar un miembro si el plan familiar ya alcanzó el límite de 5 personas, incluido el titular. Un usuario SHALL poder ser titular o miembro de, como máximo, un plan familiar activo a la vez. Un titular NO SHALL poder quitarse a sí mismo del plan familiar mediante el flujo de autoservicio.

#### Scenario: Buscar el usuario por nombre o correo antes de designarlo titular o miembro (admin)
- **WHEN** un usuario con rol admin escribe parte del nombre o correo de un usuario para designarlo titular o agregarlo como miembro de un plan familiar
- **THEN** el sistema muestra las coincidencias encontradas para que el admin seleccione el usuario exacto

#### Scenario: Crear un titular de plan familiar (admin)
- **WHEN** un usuario con rol admin designa como titular a un usuario con suscripción activa en el plan premium que no es titular ni miembro de otro plan familiar activo
- **THEN** el sistema registra a ese usuario como titular de un nuevo plan familiar asociado a su suscripción activa

#### Scenario: Un usuario premium crea su propio plan familiar (autoservicio)
- **WHEN** un Usuario B2C autenticado con una suscripción activa en el plan premium, que no es titular ni miembro de otro plan familiar, solicita crear su propio plan familiar
- **THEN** el sistema lo registra como titular de un nuevo plan familiar asociado a su suscripción activa, sin requerir intervención de un administrador

#### Scenario: Intento de crear un plan familiar sin plan premium (autoservicio)
- **WHEN** un Usuario B2C autenticado sin una suscripción activa en el plan premium solicita crear su propio plan familiar
- **THEN** el sistema rechaza la operación indicando que el plan familiar solo aplica al plan premium

#### Scenario: Intento de designar titular con un plan no premium (admin)
- **WHEN** un usuario con rol admin intenta designar como titular a un usuario cuya suscripción activa es un plan distinto de premium (incluidos los planes B2B)
- **THEN** el sistema rechaza la operación indicando que el plan familiar solo aplica a suscriptores del plan premium

#### Scenario: Agregar un miembro dentro del límite (admin)
- **WHEN** un usuario con rol admin agrega un usuario como miembro de un plan familiar que tiene menos de 5 personas registradas
- **THEN** el sistema registra al usuario como miembro de ese plan familiar, con la fecha de unión

#### Scenario: El titular agrega un miembro por correo (autoservicio)
- **WHEN** el titular de un plan familiar con menos de 5 personas registradas agrega un miembro especificando su correo electrónico
- **THEN** el sistema resuelve el correo a un usuario existente y lo registra como miembro de ese plan familiar

#### Scenario: El titular intenta agregar un correo que no corresponde a ningún usuario (autoservicio)
- **WHEN** el titular de un plan familiar intenta agregar un miembro especificando un correo que no corresponde a ningún usuario registrado
- **THEN** el sistema rechaza la operación indicando que no existe un usuario con ese correo

#### Scenario: Intento de agregar un miembro al alcanzar el límite
- **WHEN** un admin o el titular intenta agregar un miembro a un plan familiar que ya tiene 5 personas registradas
- **THEN** el sistema rechaza la operación indicando que se alcanzó el límite de miembros

#### Scenario: Intento de agregar un usuario que ya pertenece a otro plan familiar
- **WHEN** un admin o el titular intenta agregar como miembro a un usuario que ya es titular o miembro de otro plan familiar activo
- **THEN** el sistema rechaza la operación indicando que el usuario ya pertenece a un plan familiar

#### Scenario: Quitar un miembro de un plan familiar (admin)
- **WHEN** un usuario con rol admin quita a un miembro existente de un plan familiar
- **THEN** el sistema elimina la asociación de ese usuario con el plan familiar

#### Scenario: El titular quita un miembro (autoservicio)
- **WHEN** el titular de un plan familiar quita a un miembro existente (distinto de sí mismo)
- **THEN** el sistema elimina la asociación de ese usuario con el plan familiar

#### Scenario: El titular intenta quitarse a sí mismo (autoservicio)
- **WHEN** el titular de un plan familiar intenta quitarse a sí mismo mediante el flujo de autoservicio
- **THEN** el sistema rechaza la operación

#### Scenario: Un miembro (no titular) intenta administrar el plan familiar (autoservicio)
- **WHEN** un usuario que es miembro (no titular) de un plan familiar intenta agregar o quitar a otro miembro mediante el flujo de autoservicio
- **THEN** el sistema rechaza la operación indicando que solo el titular puede administrar miembros

#### Scenario: Usuario sin rol admin intenta administrar el plan familiar de otro usuario
- **WHEN** un usuario con rol distinto de admin intenta crear un titular, agregar o quitar un miembro del plan familiar de un usuario que no es él mismo
- **THEN** el sistema rechaza la operación indicando que es exclusiva de admin

### Requirement: Portada real de álbum, artista y track
El sistema SHALL resolver una portada real para artistas y álbumes del catálogo licenciado base mediante búsqueda en directorios musicales externos públicos (intento primario y, si no hay resultado, un segundo directorio como intento alternativo — ambos sin necesidad de credencial), almacenando la imagen resuelta. El sistema SHALL usar un reemplazo visual generado localmente, sin ninguna llamada externa, cuando ninguno de los directorios devuelva una portada o el contenido no pertenezca al catálogo licenciado base.

> **Nota de implementación (2026-07-04):** el intento primario es iTunes Search API; el
> alternativo es Deezer Search API, agregado tras confirmar en producción que iTunes por sí solo
> dejaba sin resolver una fracción significativa de artistas/álbumes (además de un bug de
> implementación ya corregido — la búsqueda de artistas usaba un tipo de entidad de iTunes que
> nunca trae artwork). Deezer no requiere API key ni cuenta, mismo criterio que iTunes. Evaluado
> también MusicBrainz/Cover Art Archive; descartado por requerir una llamada adicional (buscar el
> MBID antes de poder pedir la portada) frente a la resolución en una sola llamada de Deezer.

#### Scenario: Portada resuelta exitosamente
- **WHEN** el proceso de resolución de portadas encuentra una imagen para un artista o álbum del catálogo licenciado base, en el directorio primario o en el alternativo
- **THEN** el sistema almacena la URL de esa imagen asociada a ese artista o álbum, y el catálogo la muestra al consultarlo

#### Scenario: Sin portada disponible
- **WHEN** el proceso de resolución de portadas no encuentra una imagen para un artista o álbum en ninguno de los directorios externos, o el contenido no pertenece al catálogo licenciado base
- **THEN** el catálogo muestra un reemplazo visual generado localmente, sin realizar ninguna llamada externa

### Requirement: Reproducción de audio real
El sistema SHALL permitir reproducir audio real de un track mediante búsqueda por texto en un directorio de video externo, ejecutada desde el propio cliente. Cuando no haya conexión, no se encuentre un resultado, o falle la carga/inicialización del directorio externo, el sistema SHALL simular la reproducción de ese track (progreso avanzando en tiempo real durante la duración real del track, con control de reproducción/pausa funcional), sin exponer al usuario que el audio no es real.

> **Revisión posterior (2026-07-04), decidida por el usuario — no es el comportamiento del
> propuesto original de esta capability:** la versión original de este requirement (archivada en
> `openspec/changes/archive/2026-07-03-experiencia/`) especificaba deshabilitar el control de
> reproducción o mostrar un estado de "no disponible" cuando fallaba el directorio externo. Esa
> versión quedó reemplazada por la de arriba: ahora se simula la reproducción completa en vez de
> exponer la falta de audio real. La reproducción simulada usa Web Audio API nativa del navegador
> (sin dependencia nueva) — un tono simple y de volumen muy bajo, no pensado para ser notado,
> durante la duración exacta del track (`duration_ms`). El bloqueo por restricción geográfica
> (RF-DIS-007, capability `distribucion`) es independiente de este requirement y no se ve
> afectado — ese sí es un caso legítimo de "reproducción no disponible", una regla de negocio
> real, no una limitación técnica del directorio externo.

#### Scenario: Reproducción real disponible
- **WHEN** un Usuario B2C reproduce un track y la búsqueda en el directorio externo encuentra un resultado
- **THEN** el sistema reproduce el audio real de ese resultado en el reproductor persistente existente

#### Scenario: Reproducción real no disponible — simulada
- **WHEN** un Usuario B2C intenta reproducir un track y no hay conexión, no se encuentra un resultado, o falla la carga/inicialización del directorio externo
- **THEN** el sistema simula la reproducción de ese track en el reproductor persistente (progreso avanzando en tiempo real durante `duration_ms`, control de pausa/reanudación funcional), sin mostrarlo como un estado de error o no disponible

### Requirement: Panel administrativo de métricas de experiencia
El sistema SHALL exponer a un usuario con rol `admin` un panel con métricas operativas agregadas de la capability `experiencia`: conteo de tickets de soporte por estado, y total de tickets actualmente abiertos o en proceso.

#### Scenario: Admin consulta el panel de métricas de experiencia
- **WHEN** un usuario con rol `admin` solicita el dashboard de experiencia
- **THEN** el sistema retorna el conteo de tickets agrupado por estado y el total de tickets abiertos o en proceso, calculados sobre `FACT_TICKET_SOPORTE`

#### Scenario: Usuario sin rol admin intenta consultar el panel de experiencia
- **WHEN** un usuario sin rol `admin` intenta consultar el dashboard de experiencia
- **THEN** el sistema rechaza la operación

### Requirement: Recomendaciones personalizadas en secciones
El sistema SHALL presentar las recomendaciones personalizadas de un Usuario B2C autenticado agrupadas en hasta tres secciones independientes: "Hecho para ti" (similitud de audio real dentro de sus géneros más escuchados, con mismo género que sus favoritos y popularidad global como niveles de respaldo si no hay señal suficiente — siempre presente), "Novedades de artistas que sigues" (tracks recientes de artistas con seguimiento activo) y "Redescubre" (tracks del propio historial o favoritos con la interacción menos reciente). Una sección SHALL omitirse de la respuesta, en vez de incluirse vacía, cuando no exista señal suficiente para generarla.

#### Scenario: Usuario con historial de escucha y artistas seguidos recibe las tres secciones
- **WHEN** un Usuario B2C autenticado con historial de reproducción y al menos un artista seguido con tracks recientes solicita sus recomendaciones
- **THEN** el sistema retorna las tres secciones, cada una con su propio título y sus propios tracks

#### Scenario: Usuario sin artistas seguidos no recibe la sección de novedades
- **WHEN** un Usuario B2C autenticado que no sigue a ningún artista, o cuyos artistas seguidos no tienen tracks nuevos, solicita sus recomendaciones
- **THEN** el sistema retorna sus recomendaciones sin la sección "Novedades de artistas que sigues"

#### Scenario: Usuario sin historial ni favoritos no recibe la sección de redescubrimiento
- **WHEN** un Usuario B2C autenticado que nunca marcó un favorito ni reprodujo un track solicita sus recomendaciones
- **THEN** el sistema retorna sus recomendaciones sin la sección "Redescubre"

#### Scenario: "Hecho para ti" siempre está presente
- **WHEN** cualquier Usuario B2C autenticado solicita sus recomendaciones, incluso sin historial ni favoritos
- **THEN** el sistema retorna la sección "Hecho para ti" con tracks populares como respaldo final

### Requirement: Radio basada en una canción
El sistema SHALL permitir a un usuario iniciar una radio a partir de un track semilla, devolviendo una cola de aproximadamente 25 tracks similares. La similitud SHALL calcularse por distancia sobre los atributos de audio del track (bailabilidad, energía, valencia, tempo y acústica), dando mayor peso a los tracks del mismo género que la semilla. La cola SHALL excluir el track semilla y SHALL excluir los tracks no disponibles.

#### Scenario: Iniciar radio desde un track
- **WHEN** un usuario solicita la radio de un track del catálogo
- **THEN** el sistema devuelve una cola de tracks similares al semilla, sin incluir el propio semilla, predominando el género del track semilla

#### Scenario: Radio de un track inexistente
- **WHEN** un usuario solicita la radio de un track que no existe o no está disponible
- **THEN** el sistema responde que el track no fue encontrado

### Requirement: Mix diario personalizado y determinista
El sistema SHALL ofrecer a un usuario autenticado un mix diario de aproximadamente 30 tracks construido a partir de su historial de reproducción y sus favoritos, combinando una mayoría de tracks afines a lo que consume con una porción minoritaria de exploración fuera de sus géneros habituales. El mix SHALL ser determinista para un mismo usuario dentro de un mismo día, y SHALL cambiar al día siguiente. Si el usuario no tiene historial ni favoritos, el sistema SHALL degradar el mix a tracks populares.

#### Scenario: El mix del día es estable
- **WHEN** un usuario solicita su mix diario dos veces el mismo día
- **THEN** el sistema devuelve exactamente el mismo conjunto de tracks en el mismo orden

#### Scenario: El mix cambia de un día a otro
- **WHEN** un usuario solicita su mix diario en dos días distintos
- **THEN** el sistema devuelve mixes diferentes

#### Scenario: Mix con exploración
- **WHEN** un usuario con historial suficiente solicita su mix diario
- **THEN** el mix incluye mayoritariamente tracks afines a sus géneros y atributos habituales, y una porción minoritaria de tracks fuera de esos géneros

#### Scenario: Usuario sin historial
- **WHEN** un usuario sin historial ni favoritos solicita su mix diario
- **THEN** el sistema devuelve un mix de tracks populares

### Requirement: Recomendaciones por afinidad de audio con motivo explicable
El sistema SHALL construir las recomendaciones de un usuario a partir de su perfil de audio, entendido como el promedio de los atributos de audio de los tracks que ha marcado como favoritos y ha reproducido, recomendando tracks disponibles cercanos a ese perfil que el usuario no haya escuchado ni marcado como favorito. Cada track recomendado SHALL incluir un motivo legible que explique por qué se sugiere. Si el usuario no tiene historial ni favoritos, el sistema SHALL degradar la recomendación a tracks populares de géneros diversos.

#### Scenario: Recomendaciones afines al perfil del usuario
- **WHEN** un usuario con favoritos e historial solicita sus recomendaciones
- **THEN** el sistema devuelve tracks disponibles cercanos a su perfil de audio, ninguno de los cuales ha escuchado ni marcado como favorito

#### Scenario: Cada recomendación explica su motivo
- **WHEN** un usuario solicita sus recomendaciones
- **THEN** cada track recomendado incluye un motivo legible que justifica la sugerencia

#### Scenario: Usuario sin señal de consumo
- **WHEN** un usuario sin favoritos ni historial solicita sus recomendaciones
- **THEN** el sistema devuelve tracks populares de géneros diversos

