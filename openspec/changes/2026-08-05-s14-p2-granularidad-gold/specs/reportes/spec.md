## Purpose

Extender la capa Gold de los 30 informes compuestos para que el grano temporal sea
configurable (día/semana/mes/trimestre/año) en vez de semana fija, con una ventana de
historia propia por granularidad, sin romper la compatibilidad de la API existente.

## Objetivo

Extender la capa Gold de los 30 informes compuestos para que el grano temporal sea
configurable (día/semana/mes/trimestre/año) en vez de semana fija, con una ventana de
historia propia por granularidad, sin romper la compatibilidad de la API existente.

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Indicador de dato estimado

El sistema SHALL completar con un valor determinístico (semilla fija, reproducible) y
marcar con `es_estimado = 1` cualquier fila cuyo hecho fuente no exista en el catálogo o
sea insuficiente para el período dado, en vez de omitirla o fabricarla sin marca — pero
SOLO dentro de los períodos más recientes de la ventana de cada granularidad (los 12 más
recientes). Para períodos más antiguos que esa franja, si el catálogo no tiene el hecho
real, el sistema SHALL omitir la fila en vez de rellenarla con un valor generado. El
sistema SHALL marcar con `es_estimado = 0` las filas cuyo valor provenga de datos reales.

#### Scenario: Hecho fuente inexistente para un período reciente
- **WHEN** el catálogo no tiene el hecho necesario para calcular una métrica de uno de
  los períodos recientes (dentro de la franja de relleno demo) de un período determinado
- **THEN** la tabla Gold correspondiente registra ese período con un valor generado por
  semilla fija y `es_estimado = 1`

#### Scenario: Hecho fuente inexistente para un período antiguo
- **WHEN** el catálogo no tiene el hecho necesario para calcular una métrica de un
  período fuera de la franja de relleno demo (más antiguo que los últimos 12 períodos de
  esa granularidad)
- **THEN** la tabla Gold correspondiente NO registra ninguna fila para esa combinación de
  período y dimensión, en vez de inventar un valor

#### Scenario: Hecho fuente real disponible
- **WHEN** el catálogo sí tiene el hecho necesario para un período
- **THEN** la tabla Gold registra el valor agregado real con `es_estimado = 0`, incluso si
  ese valor real resulta ser cero (un cero real no se reemplaza por una estimación)
