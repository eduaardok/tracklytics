# Capability: ingesta

## Purpose

Permitir que el Lead Data Engineer ejecute y monitoree la ingesta de nuevos lotes de datos de catálogo musical, audite el historial y calidad de cargas anteriores, y administre las tablas de dimensión del catálogo.

## Objetivo

Permitir que el Lead Data Engineer ejecute y monitoree la ingesta de nuevos lotes de datos de catálogo musical, audite el historial y calidad de cargas anteriores, y administre las tablas de dimensión del catálogo.

## Contexto

OE3 (Expansión Continua sobre Infraestructura Cloud) exige un pipeline de ingesta idempotente, auditable y de alto rendimiento, capaz de sostener el crecimiento del catálogo (de ~114k a ~1.6M registros durante el semestre) sin afectar la disponibilidad del sistema.

En esta especificación, "ingesta de nuevos lotes de catálogo" se describe como integración de datos desde fuentes externas de streaming musical, con su correspondiente proceso de validación de calidad.

## Actores

- **Lead Data Engineer**: ejecuta, monitorea y audita la ingesta; administra las dimensiones del catálogo.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Lead Data Engineer | Ingesta y calidad de datos del catálogo | CU-O13 Ejecutar y monitorear la ingesta de datos de catálogo | Como Lead Data Engineer, quiero ejecutar y monitorear cada ingesta desde la interfaz de gestión, para asegurar que los nuevos lotes se carguen correctamente |
| Operativo | Lead Data Engineer | Ingesta y calidad de datos del catálogo | CU-O14 Auditar historial y calidad de las cargas de datos | Como Lead Data Engineer, quiero auditar el historial y calidad de cada carga, para detectar y corregir problemas de integridad de datos |
| Operativo | Lead Data Engineer | Ingesta y calidad de datos del catálogo | CU-O15 Administrar (CRUD) dimensiones del catálogo | Como Lead Data Engineer, quiero administrar las tablas de dimensión del catálogo, para mantener consistente el modelo de datos analítico |
| Operativo | Lead Data Engineer | Ingesta y calidad de datos del catálogo | CU-O79 Recalificar el catálogo existente | Como Lead Data Engineer, quiero disparar una recalificación en bloque de los registros ya cargados con año/país sin informar o audio incoherente con su género, para corregir la calidad del catálogo sin editar la tabla de hechos directamente |

## Requirements

### Requirement: Disparo de ejecución de ingesta
El sistema SHALL permitir disparar la ejecución de una ingesta de catálogo desde la interfaz de gestión, identificando el período/lote a cargar.

#### Scenario: Disparar la ingesta de un lote
- **WHEN** el Lead Data Engineer identifica un período/lote y dispara su ingesta desde la interfaz de gestión
- **THEN** el sistema inicia el procesamiento de ese lote

### Requirement: Monitoreo en tiempo real del pipeline
El sistema SHALL mostrar en tiempo real el estado de cada etapa del pipeline (extracción, transformación a staging, carga a ClickHouse).

#### Scenario: Mostrar el estado de cada etapa del pipeline
- **WHEN** una ingesta está en curso
- **THEN** el sistema muestra en tiempo real en qué etapa se encuentra (extracción, transformación a staging o carga a ClickHouse)

### Requirement: Carga en batches de alto rendimiento
Una recarga completa del catálogo (orden de 800k registros) SHALL completarse en segundos, mediante inserciones en lotes de mínimo 50.000 filas.

#### Scenario: Ingesta exitosa de un nuevo lote
- **WHEN** el período solicitado no ha sido cargado previamente y el Lead Data Engineer dispara la ingesta
- **THEN** el sistema procesa el lote, lo inserta en ClickHouse en batches de al menos 50.000 filas, y registra el resultado en el log de auditoría

### Requirement: Control de idempotencia
El sistema SHALL verificar, antes de insertar, si el período/lote ya fue cargado previamente, y SHALL evitar duplicación si ya existe. El pipeline SHALL ser idempotente: volver a ejecutar la carga de un período ya procesado no debe duplicar registros. Un período/lote ya marcado como cargado no puede volver a insertarse sin una acción explícita de recarga forzada por el Lead Data Engineer.

#### Scenario: Intento de recarga de un período ya cargado
- **WHEN** un período ya fue cargado exitosamente con anterioridad y el Lead Data Engineer intenta ejecutar la ingesta de ese mismo período sin marcar recarga forzada
- **THEN** el sistema detecta la duplicidad mediante el control de idempotencia y no inserta los registros nuevamente

### Requirement: Registro de auditoría de cada ejecución
El sistema SHALL registrar cada ejecución con timestamp, período, registros leídos, insertados, rechazados y duración total. Toda ejecución de ingesta SHALL quedar registrada en el log de auditoría, incluso si falla.

#### Scenario: Registro de una ejecución exitosa
- **WHEN** una ingesta finaliza exitosamente
- **THEN** el sistema registra timestamp, período, registros leídos, insertados, rechazados y duración total en el log de auditoría

#### Scenario: Registro de una ejecución fallida
- **WHEN** una ingesta falla durante su procesamiento
- **THEN** el sistema registra igualmente la ejecución en el log de auditoría

### Requirement: Consulta del historial de cargas y última carga
El sistema SHALL permitir consultar el historial completo de cargas con sus métricas de calidad (tasa de rechazo, duración), y SHALL mostrar un indicador de la última carga realizada y sus métricas de integridad.

#### Scenario: Consultar el historial completo de cargas
- **WHEN** el Lead Data Engineer solicita el historial de cargas
- **THEN** el sistema muestra el listado completo con sus métricas de calidad (tasa de rechazo, duración)

#### Scenario: Mostrar indicador de la última carga
- **WHEN** el Lead Data Engineer accede a la interfaz de gestión
- **THEN** el sistema muestra un indicador de la última carga realizada y sus métricas de integridad

### Requirement: Señalización de tasa de rechazo elevada
La tasa de rechazo de una carga no SHALL superar el 1% del total leído; si lo supera, el sistema SHALL señalar la carga como requiriendo revisión.

#### Scenario: Tasa de rechazo elevada
- **WHEN** una carga finaliza con una tasa de rechazo superior al 1% y el Lead Data Engineer consulta el historial de cargas
- **THEN** el sistema señala visualmente esa carga como pendiente de revisión

### Requirement: CRUD de dimensiones del catálogo
El sistema SHALL permitir operaciones CRUD (crear, leer, actualizar, eliminar) sobre las tablas de dimensión del catálogo (artistas, álbumes, géneros y demás dimensiones técnicas).

#### Scenario: Administrar un valor de dimensión
- **WHEN** el Lead Data Engineer crea, lee, actualiza o elimina un valor de una dimensión del catálogo
- **THEN** el sistema aplica el cambio sobre la tabla de dimensión correspondiente en ClickHouse

### Requirement: Tabla de hechos de solo lectura desde la interfaz de gestión
El sistema SHALL exponer la tabla de hechos del catálogo en modo de solo lectura (sin permitir CRUD directo sobre ella desde la interfaz de gestión). La tabla de hechos del catálogo nunca se edita directamente desde la interfaz; solo se actualiza vía el pipeline de ingesta.

#### Scenario: Intento de editar la tabla de hechos directamente
- **WHEN** el Lead Data Engineer intenta una operación de escritura directa sobre la tabla de hechos desde la interfaz de gestión
- **THEN** el sistema no permite la operación, dado que la tabla de hechos solo se actualiza vía el pipeline de ingesta

### Requirement: Confirmación al eliminar dimensión referenciada
Eliminar un valor de dimensión que esté referenciado por registros existentes en la tabla de hechos SHALL requerir confirmación explícita, dado que rompería la integridad referencial.

#### Scenario: Eliminación de dimensión referenciada
- **WHEN** un valor de dimensión está referenciado por registros en la tabla de hechos y el Lead Data Engineer intenta eliminarlo
- **THEN** el sistema solicita confirmación explícita antes de proceder

### Requirement: Asignación de año de lanzamiento y país de origen
Al integrar un álbum o artista nuevo que no exista todavía en el catálogo, el sistema SHALL asignarle un año de lanzamiento y, para el artista, un país de origen, con valores plausibles dentro de rangos y distribuciones realistas de la industria musical, en vez de dejar el campo sin informar. La asignación SHALL ser determinista: recalcularla para el mismo álbum o artista SHALL producir siempre el mismo valor.

#### Scenario: Integrar un álbum nuevo
- **WHEN** la ingesta integra un álbum que no existía previamente en el catálogo
- **THEN** el sistema le asigna un año de lanzamiento plausible, sin dejarlo sin informar

#### Scenario: Integrar un artista nuevo
- **WHEN** la ingesta integra un artista que no existía previamente en el catálogo
- **THEN** el sistema le asigna un país de origen plausible, sin dejarlo sin informar

#### Scenario: Recalcular el mismo álbum no cambia su año
- **WHEN** se recalcula el año de lanzamiento de un álbum que ya tiene uno asignado por este mecanismo
- **THEN** el sistema produce exactamente el mismo año que ya tenía asignado

### Requirement: Coherencia entre características de audio y género musical
Al integrar tracks nuevos, el sistema SHALL calibrar sus características de audio (energía, bailabilidad, acústica, instrumentalidad, valencia, tempo) contra el perfil típico del género musical que se les asigna, calculado a partir de los tracks del catálogo de origen que pertenecen a ese mismo género. Si un género no cuenta con una muestra mínima de tracks de origen para calcular un perfil confiable, el sistema SHALL usar el perfil general del catálogo como respaldo para ese género.

#### Scenario: Integrar un track de un género con perfil de referencia disponible
- **WHEN** la ingesta integra un track nuevo asignado a un género que cuenta con suficientes tracks de origen para calcular su perfil de audio
- **THEN** el sistema genera las características de audio del track dentro del perfil típico de ese género

#### Scenario: Integrar un track de un género sin muestra suficiente
- **WHEN** la ingesta integra un track nuevo asignado a un género que no cuenta con una muestra mínima de tracks de origen
- **THEN** el sistema genera sus características de audio a partir del perfil general del catálogo

### Requirement: Recalificación administrativa del catálogo existente
El sistema SHALL permitir al Lead Data Engineer disparar, desde la interfaz de gestión, una recalificación en bloque de los registros del catálogo ya cargados que tengan año/país sin informar o un perfil de características de audio incoherente con su género asignado. La recalificación SHALL ejecutarse a través del pipeline de ingesta (no como una edición directa de la tabla de hechos desde la interfaz), SHALL excluir siempre los registros del catálogo de origen, y SHALL registrar en el log de auditoría cuántos registros fueron corregidos.

#### Scenario: Disparar una recalificación del catálogo
- **WHEN** el Lead Data Engineer dispara la recalificación desde la interfaz de gestión
- **THEN** el sistema corrige, vía el pipeline de ingesta, los álbumes/artistas con año o país sin informar y los tracks con un perfil de audio incoherente con su género, y registra en el log de auditoría cuántos registros corrigió

#### Scenario: La recalificación no toca el catálogo de origen
- **WHEN** se ejecuta una recalificación del catálogo
- **THEN** el sistema no modifica ningún registro del catálogo de origen, aunque su año, país o perfil de audio coincidan con los criterios de corrección

## Entradas

- Identificador del período/lote a ingerir.
- Datos de la dimensión a crear/editar (nombre, atributos según la dimensión).
- Disparo de recalificación administrativa (sin parámetros: aplica sobre todo el catálogo con año/país sin informar o audio incoherente).

## Salidas

- Estado de progreso de la ingesta en curso.
- Registro de log con métricas de la carga (leídos/insertados/rechazados/duración).
- Listado de cargas históricas con su estado de calidad.
- Confirmación o error de operación CRUD sobre dimensiones.
- Resumen de la recalificación (álbumes, artistas y tracks corregidos, duración total).

## Dependencias

- **ClickHouse**: FACT_TRACKS, las 11 dimensiones técnicas, STG_RAW_TRACKS, ETL_LOGS, ETL_BATCH_CONTROL.
- **PocketBase**: fuente origen de los datos de catálogo (inmutable).
- **Pipeline ETL en Python** (pandas, pyarrow, clickhouse-connect), orquestado con Airflow.

## Fuera de alcance

- Definición de nuevas fuentes de datos externas distintas a la fuente origen actual.
- Transformaciones de calidad de datos avanzadas (deduplicación difusa, enriquecimiento desde una fuente externa nueva — el enriquecimiento de año/país/audio basado en el propio catálogo real ya integrado sí está en alcance).
- Notificaciones automáticas por correo/Slack ante fallos de ingesta.
