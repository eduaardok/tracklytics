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
El sistema SHALL aceptar `periodo_inicio`/`periodo_fin` opcionales para acotar el rango.

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
  `periodo_fin`
- **THEN** el sistema devuelve únicamente las filas cuyo período cae dentro de ese rango

#### Scenario: Período sin datos
- **WHEN** el rango de período solicitado no tiene filas en la tabla Gold correspondiente
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

El sistema SHALL completar con un valor determinístico (semilla fija, reproducible) y
marcar con `es_estimado = 1` cualquier fila cuyo hecho fuente no exista en el catálogo o
sea insuficiente para el período dado, en vez de omitirla o fabricarla sin marca. El
sistema SHALL marcar con `es_estimado = 0` las filas cuyo valor provenga de datos reales.

#### Scenario: Hecho fuente inexistente para un período
- **WHEN** el catálogo no tiene el hecho necesario para calcular una métrica de un período
  determinado
- **THEN** la tabla Gold correspondiente registra ese período con un valor generado por
  semilla fija y `es_estimado = 1`

#### Scenario: Hecho fuente real disponible
- **WHEN** el catálogo sí tiene el hecho necesario para un período
- **THEN** la tabla Gold registra el valor agregado real con `es_estimado = 0`, incluso si
  ese valor real resulta ser cero (un cero real no se reemplaza por una estimación)

