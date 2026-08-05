# Nota metodológica — origen de los datos de Tracklytics

**Propósito de este documento**: separar, con precisión, qué parte de los datos que
alimentan la plataforma proviene del dataset real de Spotify y qué parte proviene de
simulación de eventos de negocio generada por el propio pipeline ETL, y documentar la
justificación académica de esa simulación. Este documento es la fuente única de verdad
sobre esa distinción — **no se replica en documentación funcional ni en la interfaz**: un
Lead de departamento que abre un informe compuesto no necesita saber que un dato es
sintético para poder actuar sobre él, de la misma forma en que un caso de estudio de
negocio no le dice al lector "esta cifra es hipotética" en cada línea. La marca de
trazabilidad vive en el esquema (columnas `source_type`/`is_synthetic`/`source` donde la
tabla las tiene) y en paneles internos de operaciones — nunca en la superficie de negocio.

## 1. Dataset real: el catálogo musical

El **catálogo de canciones** (`FACT_TRACKS`, `DIM_ARTISTS`, `DIM_ALBUMS`, `DIM_GENRES` y
dimensiones de audio asociadas) tiene como base el dataset público de Spotify usado para
este proyecto académico — 113.550 tracks reales (`source_type = 'real'`), con sus
metadatos, artistas, álbumes, géneros y características de audio (`popularity`, `energy`,
`danceability`, etc.) tal como vienen en la fuente. Las portadas (`imagen_url`) se
resuelven contra APIs públicas reales (Spotify oEmbed, iTunes Search, Deezer Search) por
`track_id`/nombre — no son inventadas, son las portadas reales de esas canciones.

Sobre ese catálogo real conviven **1,2 millones de tracks sintéticos** (`source_type =
'synthetic'`) generados en sesiones anteriores del proyecto para llevar el volumen del
catálogo a una escala representativa de una plataforma de streaming real — están
claramente marcados y nunca se presentan como catálogo con licencia real.

## 2. Simulación de eventos de negocio (RT-07)

El **catálogo musical por sí solo no genera actividad de negocio**: nadie se registra,
nadie paga una suscripción, nadie reproduce una canción, ninguna campaña publicitaria
genera impresiones, ningún contrato de regalías se liquida. Sin una fuente de eventos de
negocio, los 30 informes compuestos de la capa Gold (`GOLD_*_PERIODO`) no tienen nada real
que agregar — y hasta S14-P2 (`docs/BITACORA_S14.md`) ese vacío se llenaba con números
generados en el momento de la agregación (`rng_for()` en `etl/gold_ch/*.py`), una
fabricación no documentada fuera de una nota de bitácora.

**S14-P3 corrigió esa arquitectura**: los eventos de negocio ahora se generan como filas
reales en las tablas `FACT_*` del catálogo (8123), en la capa ETL — el mismo lugar donde
el proyecto ya documenta su mecanismo de simulación académica (`RT-07`, la misma política
que ya se aplicaba a `FACT_TRACKS`/`FACT_ENGAGEMENT_USUARIO` sintéticos y a
`gold/modelo_negocio_sync.py`/`api/paquetes/simulacion/generador.py`, que ya generaban
actividad reproducible directo en ClickHouse antes de este bloque). La capa Gold
(`etl/gold_ch/*.py`) ya no fabrica nada: agrega estos eventos como agregaría cualquier
evento real, sin distinguirlos en el cálculo.

### 2.1 Qué se generó (`etl/gold/backfill_negocio.py`)

Ventana: **24 meses exactos** hacia atrás desde la fecha de ejecución (anclados al primer
día del mes), justo el horizonte que necesitan los 5 gránulos temporales de la capa Gold
(`gold_ch.base.HORIZONTE_POR_GRANULARIDAD`: día 90, semana 52, mes 24, trimestre 8, año 3).

- **Usuarios** (`DIM_USUARIO`): ~13.000 altas con crecimiento progresivo (curva de
  adopción, no volumen plano), país real, fecha de registro distribuida en la ventana.
- **Suscripciones** (`FACT_TRANSACCION_PAGO`, `FACT_INVOICE`, `FACT_REEMBOLSO`,
  `FACT_CANCELACION_SUSCRIPCION`): ~30% de conversión free→pago, ciclo de facturación
  mensual real (30 días), tasa de éxito de cobro y precios de plan tomados del código real
  (`IVA_RATE`, `TASA_EXITO_DEFAULT`, `PLANES_B2C`/`PLANES_B2B` — nunca inventados), dunning
  de hasta 3 intentos antes de cancelar, churn voluntario mensual.
- **Publicidad** (`FACT_IMPRESION_ANUNCIO`, `FACT_INGRESO_PUBLICITARIO`): impresiones sobre
  las campañas **ya existentes** en `DIM_CAMPANA_PUBLICITARIA`, respetando su ventana de
  vigencia real.
- **Engagement** (`FACT_ENGAGEMENT_USUARIO`): ~950.000 reproducciones/favoritos, con
  estacionalidad semanal (más consumo el fin de semana) y crecimiento progresivo — el
  dominio de mayor volumen, marcado `is_synthetic=True, source='referencia'` (misma
  convención que la simulación ya existente en el proyecto).
- **Regalías** (`FACT_LIQUIDACION_REGALIA`): **no se generó con una fórmula propia** — se
  llamó al endpoint real ya probado (`POST /app/v1/regalias/admin/liquidar`,
  `liquidar_periodo_interno`) una vez por mes calendario, sobre las transacciones/ingresos
  publicitarios/reproducciones ya generados. Es la misma fórmula de negocio que usa
  cualquier liquidación real de la plataforma (pool 70/30 rightsholders/plataforma, split
  80/20 master/publishing, retención fiscal por país).
- **Disponibilidad, llamadas de partners, comunidad (comentarios/denuncias/tickets/
  compartición), producto (recomendaciones/A-B/notificaciones), contenido (sumisiones de
  tracks), auditoría**: mismo criterio — crecimiento progresivo, volumen y proporciones
  realistas, sin literales de negocio inventados donde ya existía una constante real en el
  código (IVA, retención fiscal, splits de regalías, umbral de 3 strikes, etc. — ver
  `docs/BITACORA_S14.md`, entrada S14-P3, tabla de constantes con su origen exacto en el
  código).

### 2.2 Qué NO se pudo resolver con un evento real (documentado, no oculto)

- **Regalías**: solo 2 de los 3 contratos de `DIM_CONTRATO_REGALIA` están activos, y ambos
  quedaron vigentes recién desde julio de 2026 — la ventana real donde había, a la vez,
  contrato vigente y reproducciones del track contratado resultó angosta. El backfill
  generó liquidaciones reales (misma fórmula, mismo endpoint) pero concentradas en pocos
  días, no distribuidas parejo en los 24 meses — una limitación de la escasez de datos
  base (solo 3 contratos existen en el catálogo), no del mecanismo de simulación.
- Ningún otro dominio de los 30 informes compuestos quedó sin resolver con un evento real
  — a diferencia de S14-P2 (donde 19 puntos de la capa Gold fabricaban números en tiempo de
  agregación), S14-P3 no dejó ningún `rng_for()` en `etl/gold_ch/*.py`.

## 3. Regla de separación (por qué esto no está en la UI)

Un usuario de negocio (Lead de departamento, admin, cliente B2B) interactúa con datos
agregados y agregados-de-agregados — nunca necesita saber, fila por fila, si un evento
puntual nació de un usuario real o de la simulación, de la misma forma que un caso de
estudio de MBA no le recuerda al lector en cada párrafo que las cifras son de un caso
hipotético. La columna `es_estimado` de las 12 tablas Gold se conserva en el esquema
exactamente por esta razón, invertida: es la garantía de que si en el futuro un dato deja
de tener respaldo real, la fila queda marcada — no que hoy haya datos marcados como tales
en las respuestas de los 30 informes (después de S14-P3, `es_estimado` vale 0 en las 12
tablas).
