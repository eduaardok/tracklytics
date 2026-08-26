# reportes Specification

## Purpose
TBD - created by archiving change s13-p3-informes-compuestos. Update Purpose after archive.
## Requirements
### Requirement: Consulta de informes compuestos por departamento

El sistema SHALL exponer 30 informes compuestos de solo lectura bajo
`GET /app/v1/reportes/compuestos/<departamento>/<informe>`, agrupados en 9 departamentos
según la tabla de trazabilidad. Cada respuesta SHALL seguir el formato estándar: `informe`
(código), `objetivo` (código de objetivo táctico), `titulo`, `departamento`,
`periodo_inicio`, `periodo_fin`, `datos` (filas por período) y `resumen` (agregados/KPIs).
El sistema SHALL aceptar `periodo_inicio`/`periodo_fin` opcionales para acotar el rango,
como etiquetas de período de la granularidad solicitada (o de `semana` si no se indica
granularidad).

#### Scenario: Lead de departamento consulta un informe de su área
- **WHEN** un usuario con el rol administrativo del departamento correspondiente (o
  `superadmin`) solicita uno de los 30 informes compuestos
- **THEN** el sistema responde con el formato estándar y los datos agregados de ese
  departamento

#### Scenario: Un rol de otro departamento intenta consultar un informe ajeno
- **WHEN** un usuario con rol administrativo de un departamento distinto solicita un
  informe compuesto de otra área (y no es `superadmin`)
- **THEN** el sistema rechaza la operación

#### Scenario: Consulta sin autenticación
- **WHEN** alguien solicita cualquiera de los 30 informes sin token de sesión
- **THEN** el sistema rechaza la petición con un error de autenticación

#### Scenario: Acotar por rango de período
- **WHEN** un Lead de departamento consulta un informe indicando `periodo_inicio` y
  `periodo_fin` (etiquetas de la granularidad solicitada)
- **THEN** el sistema devuelve únicamente las filas cuya `fecha_inicio` cae dentro de ese
  rango

#### Scenario: Período sin datos
- **WHEN** el rango de período solicitado no tiene filas en la tabla Gold correspondiente
  para la granularidad indicada
- **THEN** el sistema responde 200 con `datos` vacío, no con un error

### Requirement: Los informes compuestos leen exclusivamente de la capa Gold

El sistema SHALL calcular los 30 informes compuestos leyendo exclusivamente de las tablas
`GOLD_*` de la base `tracklytics_gold` (ClickHouse, puerto 8124), nunca computando en vivo
sobre el catálogo transaccional (`tracklytics`, puerto 8123) en el momento de la consulta.
Las tablas Gold SHALL poblarse mediante un proceso de agregación periódico e idempotente
por período (`DELETE` + `INSERT` sobre el mismo rango, nunca acumulativo) que lee el
catálogo en modo solo lectura.

#### Scenario: Re-ejecutar la agregación no duplica datos
- **WHEN** el proceso de agregación se ejecuta dos veces sobre el mismo período
- **THEN** las tablas Gold contienen el mismo número de filas para ese período después de
  ambas ejecuciones

#### Scenario: La agregación nunca escribe en el catálogo
- **WHEN** el proceso de agregación se ejecuta
- **THEN** ninguna tabla del catálogo (`tracklytics`, 8123) se modifica

### Requirement: Indicador de dato estimado

El sistema SHALL conservar la columna `es_estimado` en las 12 tablas `GOLD_*_PERIODO` como
garantía de esquema: si en el futuro un hecho de negocio deja de tener respaldo real en el
catálogo, la fila correspondiente SHALL marcarse `es_estimado = 1` en vez de omitirse o
fabricarse sin marca. El sistema NO SHALL completar ninguna fila con un valor generado por
semilla fija en la capa de agregación Gold (`etl/gold_ch/*.py`) — un período o dimensión sin
hecho de negocio real en el catálogo SHALL omitirse, nunca rellenarse. El sistema SHALL
marcar con `es_estimado = 0` las filas cuyo valor provenga de datos reales, incluso si ese
valor real resulta ser cero.

#### Scenario: Hecho fuente inexistente para un período
- **WHEN** el catálogo no tiene el hecho de negocio necesario para calcular una métrica de
  un período determinado
- **THEN** la tabla Gold correspondiente NO registra ninguna fila para esa combinación de
  período y dimensión, en vez de fabricar un valor

#### Scenario: Hecho fuente real disponible
- **WHEN** el catálogo sí tiene el hecho de negocio necesario para un período
- **THEN** la tabla Gold registra el valor agregado real con `es_estimado = 0`, incluso si
  ese valor real resulta ser cero (un cero real no se reemplaza por una estimación)

#### Scenario: Columna derivada sin fuente real en el esquema actual
- **WHEN** una métrica no tiene ninguna columna de origen real en el catálogo para
  calcularse (ej. una métrica de impacto de un experimento sin columna de resultado)
- **THEN** el sistema deriva la métrica de una señal real correlacionada cuando existe una
  disponible, o la deja en su valor neutro (cero/vacío) documentado en vez de generarla con
  semilla fija

### Requirement: Grano temporal configurable en informes compuestos

El sistema SHALL soportar 5 granularidades de período en los 30 informes compuestos:
`dia`, `semana`, `mes`, `trimestre`, `anio`. Cada tabla `GOLD_*_PERIODO` SHALL guardar
las 5 granularidades a la vez, distinguidas por una columna `granularidad`, con una
columna `fecha_inicio` (primer día del período) que permite ordenar y filtrar
cronológicamente sin depender del orden alfabético de la etiqueta `periodo`. El sistema
SHALL aceptar un parámetro `granularidad` opcional en cada uno de los 30 endpoints de
informes compuestos, con valor por defecto `semana`.

#### Scenario: Consultar un informe con una granularidad distinta a la semanal
- **WHEN** un Lead de departamento solicita un informe compuesto indicando
  `granularidad=mes` (o `dia`/`trimestre`/`anio`)
- **THEN** el sistema responde con filas agregadas en esa granularidad, ordenadas
  cronológicamente por `fecha_inicio`

#### Scenario: Consultar sin indicar granularidad
- **WHEN** un Lead de departamento solicita un informe compuesto sin el parámetro
  `granularidad`
- **THEN** el sistema responde como si hubiera pedido `granularidad=semana`, con el
  mismo formato y contenido que antes de que existiera el parámetro

#### Scenario: Listar los períodos reales disponibles de una tabla Gold
- **WHEN** un usuario con rol administrativo solicita
  `GET /app/v1/reportes/compuestos/_meta/periodos` indicando una tabla `GOLD_*` válida y
  una granularidad
- **THEN** el sistema responde con las etiquetas de período reales disponibles para esa
  combinación, cada una con su `fecha_inicio`

#### Scenario: Solicitar períodos de una tabla desconocida
- **WHEN** alguien solicita `_meta/periodos` con un valor de `tabla` que no es una de las
  12 tablas `GOLD_*_PERIODO` válidas
- **THEN** el sistema rechaza la solicitud con un error, sin ejecutar ninguna consulta

### Requirement: Selector de granularidad en los informes compuestos

Cada uno de los 30 informes compuestos SHALL mostrar un control para elegir la granularidad
temporal (Día, Semana, Mes, Trimestre, Año), con Mes como valor por defecto. Al cambiar de
granularidad, el sistema SHALL volver a solicitar los datos del informe con la nueva
granularidad y SHALL limpiar cualquier filtro de rango de período (Desde/Hasta) previamente
seleccionado, porque el formato de la etiqueta de período (`2026-W20` en semana, `2026-08` en
mes, `2026-Q3` en trimestre, ...) no es comparable entre granularidades distintas.

#### Scenario: Cambiar la granularidad de un informe compuesto
- **WHEN** un usuario con acceso a un informe compuesto selecciona una granularidad distinta
  a la actual
- **THEN** el sistema recarga el informe con datos agregados en la nueva granularidad y
  reinicia el filtro Desde/Hasta a "sin filtro"

#### Scenario: Cargar un informe compuesto por primera vez
- **WHEN** un usuario abre un informe compuesto sin haber elegido ninguna granularidad antes
- **THEN** el sistema lo carga con granularidad Mes

