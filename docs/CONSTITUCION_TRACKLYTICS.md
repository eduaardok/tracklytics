# Constitución de Tracklytics

## 0. Identidad de la empresa

**Tracklytics** es una plataforma de analítica musical B2B2C. Su capa B2C
es una aplicación freemium de exploración musical; los datos de
comportamiento y consumo que esa capa genera (favoritos, historial,
reproducciones) alimentan el motor analítico que constituye el producto
B2B — un modelo de *data flywheel* donde la base de usuarios finales
sostiene y enriquece el análisis vendido a sellos discográficos,
productoras, agencias de artistas y curadores de playlists.

**Misión.** Convertir datos de streaming en decisiones accionables para
la industria musical y en experiencias de descubrimiento musical para
usuarios finales, proporcionando métricas claras de popularidad,
tendencias y características de audio que maximicen el retorno de
inversión de sellos, productoras y agencias de artistas, mientras se
construye una base global de usuarios que sostiene y enriquece dicho
análisis.

**Visión.** Convertirse en la plataforma de referencia en analítica
musical de Latinoamérica para 2030, y desde ahí expandirse hacia
mercados internacionales mediante adquisición digital automatizada,
integración vía APIs con los ecosistemas de software que ya usa la
industria, e infraestructura cloud de alta disponibilidad —
consolidando un modelo de inteligencia de negocio centralizado capaz de
anticipar tendencias de mercado a escala global.

**Valores de ingeniería.** Tracklytics construye su producto bajo cuatro
principios no negociables: la analítica debe sostenerse sobre una única
fuente de verdad columnar (ClickHouse) para garantizar consistencia entre
los distintos paneles que consumen los mismos datos; toda decisión de
arquitectura debe quedar documentada y razonada, no solo implementada;
el sistema debe poder crecer en volumen de datos sin cambios
estructurales; y la calidad de software se evidencia en código y
arquitectura, no se da por supuesta.

Esta constitución y el resto de la documentación de negocio describen el
sistema en términos de su arquitectura y reglas de operación reales. El
detalle de cómo se generan o simulan determinados volúmenes de datos
para fines de desarrollo y pruebas se documenta por separado, en una
nota metodológica de ingeniería que no forma parte de esta constitución
ni de las especificaciones funcionales.

## 1. Stack tecnológico

- **Fuente de datos de catálogo:** PocketBase contiene el dataset base de
  catálogo musical y es permanente e inmutable; nunca se modifica directo
  desde el frontend.
- **Staging:** archivos Parquet como capa intermedia transitoria entre
  PocketBase y ClickHouse (se eliminan tras cada carga exitosa).
- **Base de datos analítica principal:** ClickHouse (columnar, motor
  MergeTree). No es solo la fuente analítica: por decisión deliberada
  (RT-05, fricción arquitectónica intencional — ver §3) también aloja
  dominios transaccionales/operativos que en un sistema "de manual" irían
  en una base relacional aparte (métodos de pago, transacciones,
  solicitudes de licencia, auditoría). PocketBase queda reservado a
  identidad de usuario y a las entidades cuyas reglas de acceso dependen
  de su motor de auth (playlists, favoritos, suscripciones activas).
- **ETL y orquestación:** Python (pandas, pyarrow, clickhouse-connect)
  para el movimiento de datos, orquestado con Apache Airflow.
- **API:** FastAPI, con inyección de dependencias, caché TTL, y cliente
  ClickHouse en `threading.local` (nunca singleton global) por la
  concurrencia entre vistas del frontend.
- **Contenedores:** Docker y Docker Compose; el sistema completo se
  levanta sin pasos de configuración manual adicionales.
- **Frontend:** React 18 + TypeScript + Vite, servido en producción vía
  Nginx desde un build multi-stage (sin volumen montado — un cambio de
  código exige reconstruir la imagen, no solo reiniciar el contenedor).
  `recharts` para visualización de datos. Organizado en paquetes por
  capability (uno por dominio de negocio: `analitica`, `catalogo`,
  `creadores`, `distribucion`, `experiencia`, `facturacion`, `ingesta`,
  `partners`, `publicidad`, `regalias`, `seguridad`, `simulacion`,
  `social`, `suscripciones`), con componentes verdaderamente
  transversales (buscadores tipo `TrackPicker`/`ArtistPicker`/
  `AlbumPicker`/`UserPicker`) en `shared/`. El frontend legado en
  HTML/CSS/JS vanilla + Bootstrap 5 + Plotly.js fue retirado por completo
  (S10) — no queda ninguna superficie de producto sirviéndose desde
  `app/`.
- **Control de versiones:** Git y GitHub.

## 2. Arquitectura del pipeline de catálogo

PocketBase (fuente de catálogo) → ETL en Python → Parquet (stage en
disco) → ClickHouse (tablas de hechos y dimensiones). El flujo de carga
del catálogo siempre pasa por Parquet; nunca se inserta directo de
PocketBase a ClickHouse. Todo movimiento de datos de este pipeline
ocurre desde código Python.

El DAG semanal de ingesta (`tracklytics_etl`) solo incluye lo que
bloquea la disponibilidad de `FACT_TRACKS`/`DIM_ARTISTS`/`DIM_ALBUMS`
(bronze → silver → gold → synthetic → log). Trabajo aditivo que no
bloquea esa disponibilidad — la resolución de portadas reales de
artistas/álbumes (oEmbed de Spotify + respaldo iTunes/Deezer) es el
primer caso — vive en un DAG separado y desacoplado (`reload_portadas`,
disparable de forma independiente), para que su costo de red no infle
`ETL_LOGS.duration_seconds` de la ingesta real (decisión S11: sacarlo
del DAG principal redujo la duración de una carga de 11 semanas
acumuladas de ~3-6 min a 65s).

## 3. Principios de arquitectura no negociables

- **P1 — Trazabilidad del movimiento de datos.** Todo movimiento de
  datos del sistema ocurre desde código Python, ya sea como parte del
  pipeline batch orquestado por Airflow o como escritura síncrona desde
  la capa de API (FastAPI). Una escritura síncrona y de bajo volumen,
  como el registro de un evento de usuario, es una excepción consciente
  al patrón batch del catálogo, no una violación de este principio: la
  regla exige que el movimiento de datos sea código Python auditable,
  no que sea necesariamente un proceso por lotes.
- **P2 — Escala mínima de datos.** El conjunto de datos del sistema debe
  sostener un volumen superior a 100.000 registros con más de 12
  atributos por entidad, para garantizar que el modelo analítico
  refleje patrones reales y no anécdotas de un dataset pequeño.
- **P3 — Contenerización completa.** Todos los servicios del sistema
  corren en contenedores Docker orquestados con Docker Compose.
- **P4 — Interfaz funcional con analítica visual.** El sistema expone
  una interfaz web funcional con dashboards interactivos, no solo
  endpoints de datos crudos.
- **P5 — Fuente analítica única.** ClickHouse es la única fuente
  analítica principal del sistema; ningún panel ni reporte se construye
  sobre agregaciones calculadas en tiempo real desde la base de datos
  operativa. Esto se sostiene incluso a costa de fricción arquitectónica
  deliberada (RT-05): dominios que un sistema transaccional "de manual"
  resolvería en una base relacional aparte (pagos, solicitudes,
  auditoría) también viven en ClickHouse, sacrificando algunas garantías
  transaccionales (sin `UPDATE`/`DELETE` fila-a-fila baratos; los estados
  "pendiente → resuelto" se modelan re-insertando en `ReplacingMergeTree`
  o con `ALTER TABLE ... UPDATE` mutations) a cambio de no fragmentar la
  fuente de verdad analítica. Es una decisión consciente, no un descuido.
- **P6 — Modelo de negocio relacionado al dominio.** El modelo de datos
  debe sostener el contexto de negocio de Tracklytics (catálogo musical,
  suscripciones, adquisición, integraciones, disponibilidad, ingesta de
  datos, engagement de usuario) con las tablas que cada capability
  necesite. El piso original de diez tablas (RT-06, ver `openspec/
  config.yaml`) quedó superado hace tiempo — el sistema no fija ya un
  número objetivo de tablas; el modelo crece por necesidad real de cada
  capability nueva, no para cumplir una cuota. A la fecha de esta
  revisión (S11) hay 66 tablas físicas en ClickHouse repartidas en 14
  capabilities de negocio.

## 4. Modelo de datos técnico (catálogo musical)

Data warehouse dimensional: una tabla de hechos (`FACT_TRACKS`) más once
tablas de dimensión (artistas, álbumes, géneros, fecha de carga, tono
musical, modo, compás, tipo de contenido explícito, rango de
popularidad, rango de tempo, nivel de energía) y tres tablas de
infraestructura (zona de aterrizaje temporal, bitácora de ejecución,
control de idempotencia por lote). El catálogo crece de forma continua a
medida que se integran nuevos lotes de datos de origen. Un mismo
identificador de track puede aparecer en múltiples filas de la tabla de
hechos, porque un track puede pertenecer a más de un género —relación
N:M resuelta como filas independientes en la tabla de hechos.

`FACT_TRACKS.source_type` (`Enum8('real', 'synthetic', 'user_uploaded')`)
es el campo de procedencia canónico de un registro (RT-07) — reemplaza a
un flag booleano `is_synthetic` como mecanismo de clasificación en esta
tabla. Es una distinción de tres vías, no dos: un track puede venir del
dataset base, de generación de datos de referencia, o de una subida real
de un artista (`creadores`) — un booleano no alcanza a representarlo.
Nótese que `source_type` todavía no se propagó a todas las tablas del
proyecto: `FACT_ENGAGEMENT_USUARIO`, por ejemplo, conserva su propio
`is_synthetic Bool` — deuda técnica conocida, no una inconsistencia de
diseño sin resolver conscientemente.

## 5. Modelo de datos de negocio

`FACT_SUSCRIPCION`, `FACT_ADQUISICION`, `FACT_INTEGRACION_PARTNER`,
`FACT_DISPONIBILIDAD`, `FACT_INGESTA_DATOS`, `FACT_ENGAGEMENT_USUARIO`,
con dimensiones de tiempo, región, cliente, partner, plan de
suscripción, canal de marketing y componente de infraestructura. Este
modelo de negocio es independiente del modelo técnico de catálogo; no
deben conflactarse en ningún artefacto de documentación o
implementación.

Patrón recurrente para flujos de solicitud/aprobación (`DIM_CUENTA_ARTISTA`
en `creadores`, `SOLICITUD_LICENCIA` en `distribucion` desde S11): una
tabla de solicitud separada de la tabla de "lo ya vigente", nunca un
estado embebido en la dimensión final. Una solicitud pendiente o
rechazada no debe poder confundirse con algo actualmente activo, y una
sola solicitud puede resolver en múltiples filas de la dimensión final
(p. ej. una solicitud de licencia para N países aprueba N filas en
`DIM_LICENCIA`). El estado de la solicitud se resuelve re-insertando en
una `ReplacingMergeTree` con `actualizado_en` más reciente — nunca un
`UPDATE` de fila suelta.

## 6. Roles del sistema

Tres roles de identidad (PocketBase): usuario final (consumidor B2C),
analista (Cliente B2B, Data Analyst / BI Lead) y administrador (Lead Data
Engineer, CTO). El catálogo completo de actores y sus responsabilidades
específicas se documenta en la especificación de negocio.

El sello discográfico es un actor de negocio real (crea solicitudes de
licencia, ve el estado de las suyas) pero, a la fecha de esta revisión,
no tiene una identidad de login propia — el rol `admin` actúa en su
nombre como interín (`distribucion`, S11). El modelo de datos de la
solicitud ya guarda `sello_id` de forma que, cuando exista login de
sello, la transición no requiera rediseñar el esquema — solo agregar la
identidad y el gating de acceso.

## 7. Calidad de software

La calidad del sistema se evidencia en código y arquitectura, no se
declara por separado:

- **Adecuación funcional:** el sistema hace exactamente lo especificado
  en cada capability.
- **Eficiencia de rendimiento:** las cargas masivas en ClickHouse se
  ejecutan en lotes de mínimo 50.000 filas; una recarga completa del
  catálogo se completa en segundos.
- **Compatibilidad:** los servicios se intercomunican correctamente vía
  Docker Compose.
- **Capacidad de interacción:** la interfaz web es usable, con
  dashboards claros construidos sobre Plotly.js.
- **Fiabilidad:** el pipeline de ingesta es idempotente (una tabla de
  control de lotes evita duplicar cargas ya procesadas), con manejo de
  errores y bitácora de cada ejecución.
- **Seguridad:** las credenciales se gestionan exclusivamente vía
  variables de entorno, nunca hardcodeadas en el código.
- **Mantenibilidad:** el código es modular y está separado por paquete
  funcional.
- **Flexibilidad:** el sistema acepta nuevos lotes de datos sin cambios
  estructurales al modelo.
- **Safety:** el proceso de ingesta valida los datos antes de
  insertarlos en ClickHouse.

## 8. Convenciones de documentación

- Cada especificación de capability incluye una tabla de trazabilidad de
  cinco niveles: nivel empresarial, departamento o actor responsable,
  paquete funcional, caso de uso y su historia de usuario asociada.
- Las historias de usuario siguen el formato "Como [actor], quiero
  [acción], para [beneficio]" — una por cada caso de uso operativo.
- El diseño técnico de cada capability especifica explícitamente en qué
  motor de base de datos vive cada entidad (PocketBase o ClickHouse) y
  por qué, evitando ambigüedad arquitectónica.