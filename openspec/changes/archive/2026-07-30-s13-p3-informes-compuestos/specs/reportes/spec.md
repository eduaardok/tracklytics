# Capability: reportes

## Purpose

Dar a cada Lead de departamento (Comercial, Tecnología, Financiero, Ingeniería de Datos,
Analítica y BI, Contenido y A&R, Comunidad y Soporte, Seguridad, Producto) una vista
compuesta y precalculada de sus métricas — cruzando dimensiones que los informes simples
(uno por objetivo táctico) muestran por separado — sin pagar el costo de computarlas en
vivo contra el catálogo transaccional en cada consulta.

## Objetivo

Dar a cada Lead de departamento (Comercial, Tecnología, Financiero, Ingeniería de Datos,
Analítica y BI, Contenido y A&R, Comunidad y Soporte, Seguridad, Producto) una vista
compuesta y precalculada de sus métricas — cruzando dimensiones que los informes simples
(uno por objetivo táctico) muestran por separado — sin pagar el costo de computarlas en
vivo contra el catálogo transaccional en cada consulta.

## Contexto

Los 27 informes simples ya cubiertos por otras capabilities (`analitica`, `seguridad`,
`experiencia`, `social`, etc.) responden a un objetivo táctico cada uno. El programa pide
además 30 informes **compuestos**: cruces de varias métricas de un mismo departamento en
una sola vista (ej. MRR + ARR + margen neto + estado de resultados). Calcular esos cruces
en vivo violaría RT-01 (nunca escribir en el catálogo) si se intentara cachear ahí, y sería
costoso de recalcular en cada request. `reportes` resuelve esto leyendo exclusivamente de
una capa de agregación separada ("Gold", ClickHouse `tracklytics_gold`, puerto 8124),
poblada por un DAG de Airflow que sí lee el catálogo (solo lectura) y agrega por período
ISO-semana. El catálogo (`tracklytics`, 8123) nunca se modifica desde este flujo.

## Actores

- **Lead de departamento** (`role=admin` + rol administrativo departamental vigente en
  `BRIDGE_USUARIO_ROL_ADMIN`, o `superadmin`): consulta los informes compuestos de su
  propio departamento. Un `superadmin` puede consultar los 30.

## Tabla de trazabilidad

| Departamento | Informes (código · ruta) |
|---|---|
| Comercial | C01 `comercial/adquisicion` · C02 `comercial/conversion` · C03 `comercial/suscripciones` |
| Tecnología | C04 `tecnologia/api-consumo` · C05 `tecnologia/disponibilidad` · C06 `tecnologia/errores` |
| Financiero | C07 `financiero/mrr-arr` · C08 `financiero/gastos-vs-ingresos` · C09 `financiero/regalias` · C10 `financiero/publicidad` · C11 `financiero/facturacion` |
| Ingeniería de Datos | C12 `datos/pipeline` · C13 `datos/calidad` |
| Analítica y BI | C14 `analitica/panel-ejecutivo` · C15 `analitica/ranking-generos` · C16 `analitica/series-temporales` · C17 `analitica/proyeccion` · C18 `analitica/benchmark` |
| Contenido y A&R | C19 `contenido/revision` · C20 `contenido/licencias` · C21 `contenido/cobertura` |
| Comunidad y Soporte | C22 `comunidad/moderacion` · C23 `comunidad/denuncias` · C24 `comunidad/soporte` · C25 `comunidad/interacciones` |
| Seguridad | C26 `seguridad/auditoria` · C27 `seguridad/sanciones` |
| Producto | C28 `producto/recomendaciones` · C29 `producto/ab-tests` · C30 `producto/notificaciones` |

## ADDED Requirements

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

## Entradas

- Catálogo ClickHouse `tracklytics` (8123, solo lectura): `FACT_*`/`DIM_*` según cada uno de
  los 12 módulos de agregación.
- Parámetros de consulta: `periodo_inicio`, `periodo_fin` (formato ISO-semana `YYYY-WNN`).

## Salidas

- 13 tablas `GOLD_*` en `tracklytics_gold` (12 de datos + `GOLD_ETL_LOG` de auditoría de
  corridas).
- 30 endpoints `GET /app/v1/reportes/compuestos/<departamento>/<informe>`.

## Dependencias

- Segunda instancia de ClickHouse (`clickhouse-gold`, contenedor y puerto 8124) — ver
  `docker-compose.yml`. Es infraestructura de soporte de esta capability, no una capability
  de negocio propia; no existe un spec `gestion_datos`/`infraestructura` separado en este
  proyecto, así que su contrato (13 tablas, DAG idempotente, política real-primero/demo-
  después) queda documentado aquí.
- Airflow (`dag_gold_aggregations`, `schedule_interval=None`, disparo manual o programado)
  para poblar las tablas Gold.
- Roles administrativos departamentales de `seguridad` (`BRIDGE_USUARIO_ROL_ADMIN`) para el
  gating de cada informe.

## Fuera de alcance

- Escritura o edición desde `reportes` — es una capability 100% de lectura.
- Exportación a PDF/Excel de los informes compuestos.
- Recalculo en tiempo real ante cada request (el dato siempre viene de la última corrida
  del DAG, con su propio `updated_at` por fila).
