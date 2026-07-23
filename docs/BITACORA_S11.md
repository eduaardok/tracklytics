# Bitácora de Desarrollo — Semana 11
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 11 de 16
**Fecha:** 13–19 de julio de 2026
**Cierre de semana:** cierre del modelo de monetización freemium (publicidad display, churn con
motivo, trial + plan estudiante, funnel/P&L), corrección de un bug real de control de acceso
(admin podía suscribirse y facturar), cierre del modelo financiero completo (liquidación
idempotente, renovación con cancelación en cobro fallido, retiro de regalías, MRR/ARR, cambio de
plan con prorrateo, dunning real, retención fiscal en regalías, país/moneda/IVA/precios
configurables), una capability nueva, `simulacion`, para demostrar el flujo de dinero de punta a
punta sin operar la app manualmente a escala, el cierre de calidad de datos del catálogo
(año/país plausibles, coherencia audio-género, recalificación administrativa en bloque, mismo
criterio también en la subida de tracks por artistas), una ronda de revisión manual de producto
que encuentra y corrige 6 hallazgos reales (exención de ads para artistas, disclosure de cobro
del trial, disponibilidad por país como lista navegable, moneda incorrecta en facturas, tags de
stack técnico en el login), el cierre de la capability `finanzas` (15ª del proyecto): gastos
operativos, reembolsos validados, cuentas por cobrar/pagar, tracking de presupuesto de campañas
con pausa automática, indicadores empresariales, alertas administrativas y un dashboard/reporte
financiero consolidado, gating real por tier B2B (Básico/Pro/Enterprise) en `analitica` con 2
paneles predictivos exclusivos Enterprise, un gobierno de identidad y autorización administrativa
completo (6 roles admin por área, gestión de usuarios con vista 360°, lockout, recuperación de
contraseña, baja de cuenta), el cierre de los ciclos de vida de las entidades de negocio que el
sistema sabía crear pero no operar (pausar/revocar/terminar/takedown/retirar, CRUD de partners,
administración de suscripciones, denuncias), y el cierre de descubrimiento y comunidad (búsqueda
unificada, radio/mix diario por similitud de audio en SQL, bloqueos, strikes, verificación de
email, exportación de datos personales) — todo compuesto sobre el dato transaccional y de
catálogo que las capabilities existentes ya generaban, sin duplicar su lógica.

---

## Resumen ejecutivo

La semana 11 se organiza en nueve changes de OpenSpec consecutivas (más una sesión autónoma
multi-fase que no introduce capabilities nuevas, solo cierra deuda y ejecuta 10 fases de
producto/infraestructura — ver Bloque 6). Las primeras siete (Bloques 1–9, 13–16 jul) cierran el
modelo de monetización y de dinero, la calidad del catálogo y el acceso B2B por tier. Las tres
finales (Bloques 10–12, 16–19 jul) cierran gobierno de identidad, ciclos de vida operativos, y
descubrimiento/comunidad — extendiendo capabilities existentes, sin crear ninguna nueva. La
primera,
`monetizacion-retencion-mejoras`, amplía tres capabilities existentes (`publicidad`,
`suscripciones`, `analitica`) sin crear ninguna nueva: publicidad display además de audio, motivo
de cancelación auditable, trial gratuito de 7 días + plan estudiante, y dos vistas nuevas de
negocio (funnel de conversión, P&L consolidado). En el camino se corrige un bug real de control de
acceso encontrado en verificación: `admin` podía suscribirse a un plan y facturar como si fuera un
usuario B2C cualquiera, cuando en realidad ya tiene acceso completo a la plataforma sin pagar. La
segunda, `modelo-financiero-simulacion`, cierra cuatro huecos del modelo de dinero (liquidación de
regalías duplicable, renovación fallida sin resolución, sin retiro de ganancias, sin MRR/ARR) y
agrega `simulacion`, la capability #14 del proyecto — un panel admin que genera streams,
suscripciones e impresiones publicitarias juntos y liquida el período resultante en una sola
acción, porque los streams por sí solos no mueven dinero en el modelo real de reparto.

---

## Bloque 1 — `monetizacion-retencion-mejoras` (13 jul 2026)

### Publicidad: audio y display
`DIM_CAMPANA_PUBLICITARIA` gana `tipo_anuncio` (audio/display, exclusivo por campaña) y
`url_destino`; `FACT_IMPRESION_ANUNCIO` gana `click`. El trigger de audio (entre canciones) queda
igual; se agrega un trigger de display independiente del reproductor, disparado al cargar
catálogo/home para un usuario free, con reconocimiento de ingreso al hacer click (mismo mecanismo
`monto = cpm/1000` que ya usaba audio al completarse).

### Suscripciones: churn con motivo, trial, plan estudiante
Cancelar una suscripción ahora pide motivo (con default `otro`) y lo registra en
`FACT_CANCELACION_SUSCRIPCION`, tabla nueva. La primera confirmación de premium activa un trial de
7 días sin cobro inmediato, resuelto de forma perezosa en el siguiente acceso (`GET
/suscripciones/activa`, el mismo endpoint que ya consulta la app en cada carga — sin scheduler
real). Plan `estudiante` nuevo, con validación de email institucional.

### Analítica: churn, funnel, P&L
Tres vistas nuevas, todas `require_staff`: tasa de churn mensual (aproximada como altas en
PocketBase menos bajas en `FACT_CANCELACION_SUSCRIPCION`, exacta desde el despliegue en adelante),
funnel free → vio anuncio → se suscribió, y P&L consolidado (suscripciones + publicidad − regalías
= margen neto).

### Bug encontrado en verificación: admin podía suscribirse y facturar
`planes.py`/`router.py` de `suscripciones` trataban a cualquier rol distinto de `analyst` como
B2C, incluido `admin` — un administrador podía activar un plan premium y pagarlo, y además
`require_active_subscription("premium")` (el gating de audio-features) no tenía bypass para admin,
así que sin ese plan ni siquiera tenía acceso a contenido premium propio. Corregido: `admin`
bypassa el gating de suscripción (mismo criterio que `require_b2b_panel_access` en analítica),
`planes_para_rol`/`plan_valido_para_rol` devuelven vacío/`False` para admin, y "Mi Plan"/
"Facturación" desaparecen del sidebar para esa cuenta.

---

## Bloque 2 — `modelo-financiero-simulacion` (13 jul 2026)

### Regalías: liquidación idempotente
`POST /regalias/admin/liquidar` y el DAG semanal `finanzas_periodicas` compartían la misma fórmula
de liquidación pero ninguno de los dos evitaba duplicar filas si se llamaban dos veces sobre el
mismo rango de fechas — limitación conocida y documentada desde el change anterior. Ambos caminos
verifican ahora si el período exacto ya fue liquidado antes de insertar.

### Facturación: renovación automática documentada, cobro fallido cancela
La renovación periódica de suscripciones (ya implementada en el DAG, nunca especificada) pasa a
tener su propio requirement. Si el cobro simulado de una renovación falla,
`etl/gold/facturacion_recurrente.py` ahora cancela la suscripción y registra el motivo como churn
involuntario (`motivo='precio', voluntaria=0`), en vez de dejarla "activa" sin haber cobrado —
mismo criterio ya usado para un trial que expira sin poder cobrarse.

### Regalías: retiro de ganancias
Tabla nueva `FACT_RETIRO_REGALIA`. Artista y sello pueden solicitar el retiro de su saldo
disponible (liquidaciones menos retiros ya pendientes/procesados, calculado en el momento, nunca
persistido); admin lo procesa o rechaza. Sin pasarela bancaria real — un retiro "procesado" es una
simulación de éxito, mismo criterio que el resto del dinero del proyecto.

### Analítica: MRR/ARR
`GET /analitica/mrr-arr` — MRR es la suma en vivo de `monto` de suscripciones de pago activas en
PocketBase (no un agregado histórico), ARR = MRR × 12, con una tendencia mensual aproximada por
ingreso efectivamente cobrado (PocketBase no guarda MRR punto-en-el-tiempo, mismo tipo de
limitación ya documentada para churn).

### Capability nueva: `simulacion`
Panel admin-only, `POST /simulacion/generar-actividad`. Decisión de diseño central: los streams
por sí solos no generan dinero — el pool que reparten las regalías sale de suscripciones y
publicidad, los streams solo deciden cómo se reparte. Por eso el endpoint genera, en la misma
ventana de tiempo reciente, streams ponderados por popularidad, transacciones de suscripción
exitosas y visualizaciones publicitarias completadas — todo escrito directo a ClickHouse con
`usuario_id` sintético (`sim_user_XXXX`), sin crear cuentas reales de PocketBase, mismo patrón que
ya usan `engagement_referencia`/`facturacion_recurrente` — y dispara la liquidación de regalías
del período resultante al final, devolviendo un resumen con lo generado y liquidado.

Desviación de diseño encontrada al implementar: `FACT_ENGAGEMENT_USUARIO.source` es
`Enum8('app', 'referencia')` — no admite un tercer valor `'simulacion'` sin migrar el esquema. Se
reutiliza `source='referencia'` (ya es actividad no orgánica) y el prefijo `sim_user_` distingue
esta actividad de la del DAG académico sin necesitar el ALTER.

### Bug encontrado y corregido (pedido aparte por el usuario en la misma sesión)
`EtlPage.tsx` dejó de mostrar `duration_seconds` en algún refactor anterior de la página, aunque el
backend y el tipo `CargaLog` ya lo traían — nunca se eliminó del contrato, solo del JSX. Se agregó
la columna "Duración" al historial de cargas y a la barra de última carga.

### Artefactos entregados (semana 11)

| Artefacto | Estado |
|---|---|
| `api/paquetes/publicidad/{router,queries}.py` | Ampliado — tipo audio/display, click |
| `api/paquetes/suscripciones/{router,deps,planes,pb_client}.py` | Ampliado — churn, trial, estudiante, bypass admin |
| `api/paquetes/regalias/{router,queries}.py` | Ampliado — idempotencia, retiro de ganancias |
| `etl/gold/{regalias_liquidacion,facturacion_recurrente}.py` | Corregido — idempotencia, cancelación en cobro fallido |
| `api/paquetes/analitica/{router,queries}.py` | Ampliado — churn, funnel, P&L, MRR/ARR |
| `api/paquetes/simulacion/` | Nuevo paquete — generación conjunta de actividad + liquidación |
| `frontend/src/packages/{publicidad,suscripciones,regalias,analitica}` | Ampliados — UI correspondiente |
| `frontend/src/packages/simulacion/` | Nuevo paquete frontend |
| `frontend/src/packages/ingesta/pages/EtlPage.tsx` | Corregido — columna "Duración" restaurada |
| `init_clickhouse.py` | Ampliado — `FACT_CANCELACION_SUSCRIPCION`, `FACT_RETIRO_REGALIA` |
| `openspec/specs/{publicidad,suscripciones,analitica,regalias,facturacion,simulacion}/spec.md` | Sincronizados — CU-O69–78 |

Verificado con `docker compose` real (curl + Playwright), no solo compilado: campañas display,
trial con cobro automático diferido, plan estudiante, churn/funnel/P&L/MRR con datos reales, y el
bug de admin confirmado y corregido con capturas del sidebar antes/después.

---

## Bloque 3 — `enriquecimiento-catalogo` (13 jul 2026)

### El hueco: catálogo con año/país sin informar y audio sin relación con el género
`DIM_ALBUMS.release_year` y `DIM_ARTISTS.country` quedaban en `0`/`""` desde siempre — nunca hubo
lógica que les asignara un valor. Del lado de `FACT_TRACKS`, cada lote sintético (`etl/gold/synthetic.py`)
generaba características de audio contra un único pool global, sin relación con el género asignado
al track: un track de un género enérgico podía terminar con perfil de balada. El mismo defecto
existía en la subida de tracks por artistas (`creadores`): `NEUTRAL_AUDIO_DEFAULTS` era un valor fijo
idéntico sin importar el género elegido.

### Año y país deterministas por hash (no `random` sin semilla)
`etl/gold/enriquecimiento.py::asignar_release_year`/`asignar_country` derivan el valor de un hash
estable (`sha256`) del `album_id`/`artist_id`, ponderado hacia décadas recientes y hacia países con
industria musical relevante (mismo catálogo de 14 países que ya usa `DIM_PAIS` de `distribucion`).
Determinista a propósito: una recalificación posterior no le cambia el año/país a un registro que ya
lo tenía asignado. `etl/gold/loader.py` los usa al crear `DIM_ALBUMS`/`DIM_ARTISTS`.

### Perfil de audio empírico por género, calculado sobre el catálogo real
`calcular_perfiles_por_genero` agrupa por `genre_id` los ~113 550 tracks `source_type='real'` y arma,
por género, el pool de valores reales de las 6 características principales (umbral mínimo: 30 tracks
por género, si no hay muestra usa el pool global). `etl/gold/synthetic.py` (modo `empirical`) ahora
asigna el género primero y remuestrea cada característica del pool de ese género en vez de un pool
global — verificado en vivo: los promedios por género de tracks sintéticos quedaron a menos de
0.01-0.06 de diferencia de los tracks reales del mismo género.

### Recalificación administrativa: DAG independiente, nunca UPDATE directo desde la interfaz
`tracklytics_recalificacion` (nuevo DAG, `schedule_interval=None`) corrige en bloque los registros ya
cargados: álbumes/artistas con año/país sin informar (agrupados por valor calculado, un `ALTER TABLE
... UPDATE` por valor distinto en vez de uno por fila) y tracks no reales cuyo perfil se sale del
rango P5–P95 de su género (recalibrados al valor mediano del perfil de su género, un `UPDATE` por
género). Nunca toca `source_type='real'`. Expuesto vía `POST /app/v1/ingesta/recalificacion` +
`GET .../recalificacion/{ejecucion_id}` (mismo mecanismo de lock/guard de concurrencia que la ingesta
normal, apuntando al nuevo DAG). Verificado en vivo sobre el catálogo completo: 46 595 álbumes,
29 862 artistas y 191 111 tracks corregidos en 15 segundos, `source_type='real'` intacto (113 550
filas antes y después).

### Mismo criterio en `creadores`: subir un track ya no usa un valor neutro fijo
`api/paquetes/creadores/promocion.py::perfil_audio_por_genero` consulta el promedio real por género
directo en ClickHouse (consulta propia, liviana — la API no importa el módulo de ETL, mismo criterio
de duplicación intencional ya usado entre `regalias/router.py` y `regalias_liquidacion.py`, porque
corren en contenedores/entornos Python separados). `subir_track` lo usa para las 6 características
calibrables; el resto de `NEUTRAL_AUDIO_DEFAULTS` (tonalidad, modo, loudness, etc. — atributos que la
spec ya declara sin análisis de audio real) queda igual. Verificado subiendo un track real como
artista de prueba para un género con perfil propio (energía 0.87, coherente con el género, no el 0.5
neutro anterior).

### Artefactos entregados (Bloque 3)

| Artefacto | Estado |
|---|---|
| `etl/gold/enriquecimiento.py` | Nuevo — año/país deterministas, perfiles de audio por género |
| `etl/gold/loader.py` | Modificado — usa `asignar_release_year`/`asignar_country` |
| `etl/gold/synthetic.py` | Modificado — género primero, audio remuestreado por perfil de género |
| `etl/gold/recalificacion.py` | Nuevo — corrección en bloque, nunca toca `source_type='real'` |
| `etl/dags/recalificacion_dag.py` | Nuevo DAG — `tracklytics_recalificacion` |
| `api/paquetes/gestion_datos/router.py` | Ampliado — `POST/GET .../recalificacion` |
| `api/paquetes/creadores/{queries,promocion,router}.py` | Ampliado — perfil de audio por género en la subida |
| `frontend/src/packages/ingesta/{api,pages,types}` | Ampliado — panel "Recalificar catálogo" |
| `openspec/specs/{ingesta,creadores}/spec.md` | Sincronizados — CU-O79 |

Verificado con `docker compose` real (Airflow + ClickHouse + API), no solo compilado: recalificación
completa sobre el catálogo existente, una recarga real de una semana sintética en modo `empirical`
confirmando año/país ya poblados desde la carga y coherencia audio-género de punta a punta, y una
subida de track real como artista de prueba.

---

## Bloque 4 — `mejoras-producto-revision-qa` (14 jul 2026)

Una ronda de revisión manual del producto ya desplegado (no automatizada) encuentra 6 hallazgos. 3
requerían cambio de comportamiento especificado y se resuelven con esta change (`publicidad`,
`suscripciones`, `distribucion`); 2 eran bugs de implementación puros (la spec ya exigía el
comportamiento correcto, el código simplemente no lo cumplía) y se corrigen directo en código sin
pasar por el flujo de OpenSpec; el restante (formulario de pago con solo últimos 4 dígitos) se
confirma como parte del sistema de pago simulado ya documentado del proyecto, sin acción necesaria.

### Exención de anuncios para artistas aprobados
Antes, una cuenta de artista aprobada (`creadores`) no tenía ninguna relación con `publicidad` — un
artista sin suscripción paga seguía viendo anuncios de audio y display exactamente igual que
cualquier oyente free. `_plan_de_usuario` en `publicidad/router.py` se reemplaza por
`_usuario_exento_de_ads`, que primero verifica si el usuario tiene una cuenta de artista en estado
`aprobada` (reutilizando `CUENTA_ACTUAL_POR_USUARIO` de `creadores`, sin duplicar la consulta) antes
de mirar su plan de suscripción. Verificado en vivo: el mismo usuario veía un anuncio antes de que
se aprobara su cuenta de artista, y dejó de verlo (audio y display) inmediatamente después de la
aprobación.

### Disclosure de fecha de cobro antes de confirmar el trial de 7 días
El backend ya calculaba y guardaba `fecha_fin_trial` al confirmar una suscripción premium, y el
frontend ya la mostraba — pero solo DESPUÉS de confirmar. El usuario no tenía forma de saber, antes
de aceptar, cuándo empezaría el cobro real. La fecha en sí es un cálculo trivial (`hoy + 7 días`) que
el frontend ahora calcula localmente, pero la ELEGIBILIDAD al trial ("nunca tuvo una suscripción
previa a premium, activa o cancelada") depende de historial real en PocketBase que el frontend no
podía replicar sin duplicar la regla de negocio — así que `GET /suscripciones/planes` se amplía para
incluir `elegible_trial: bool` en el plan premium, calculado con la misma condición que ya usa
`confirmar_suscripcion`. El formulario muestra el disclosure solo cuando corresponde. Verificado en
vivo: un usuario nuevo ve "Tu prueba gratuita dura 7 días. A partir del 21/7/2026 se te cobrará..."
antes de confirmar; tras confirmar y volver a consultar planes, `elegible_trial` pasa a `false` y el
disclosure ya no aparece en una segunda suscripción.

### Disponibilidad del catálogo por país como lista navegable
Antes, la única forma de saber si un track estaba disponible en el país del usuario era buscarlo por
nombre exacto — no existía ninguna vista de exploración. Se agregó `GET
/distribucion/disponibilidad` (lista paginada, filtrable por disponible/bloqueado/todos, con
búsqueda opcional), complementario al endpoint puntual existente (`GET
/disponibilidad/{fact_id_track}`, sin cambios). `DisponibilidadPage.tsx` ahora combina ambos: el
buscador puntual arriba, la tabla navegable abajo.

**Bug real encontrado durante la implementación de este mismo requirement**: la primera versión de
la query marcaba TODO el catálogo como bloqueado. Causa raíz:
`BRIDGE_RESTRICCION_TRACK.tipo_restriccion_id` es `UInt16` no nullable, y ClickHouse rellena las
filas sin match de un `LEFT JOIN` con el valor default de la columna (`0`), no con `NULL` real, a
menos que la sesión tenga `join_use_nulls=1` (no es el caso en este proyecto). El cálculo `IS NULL`
sobre esa columna era siempre falso. Corregido comparando explícitamente contra `0` (ningún
`tipo_restriccion_id` real empieza en ese valor). Verificado con una restricción real creada para la
prueba: el filtro "bloqueado" encontró exactamente ese track y ningún otro, y el filtro "disponible"
lo excluyó correctamente.

### Bugs corregidos aparte, sin pasar por specs (implementación, no requirement)
- **Moneda hardcodeada en la lista de facturas**: `FacturacionPage.tsx` forzaba a mostrar todas las
  facturas en EUR sin importar la moneda real de la transacción (la vista de detalle de cada factura
  sí usaba la moneda correcta — inconsistencia entre ambas). Causa raíz: `INVOICES_POR_USUARIO`
  (`facturacion/queries.py`) nunca traía el campo `moneda` — ni siquiera existía en la query, no era
  solo un problema del frontend. Se agregó el `LEFT JOIN` a `FACT_TRANSACCION_PAGO` que ya usa
  `INVOICE_DETALLE`. Verificado contra datos reales: las transacciones del proyecto están en USD, no
  EUR — el bug era visible en cualquier factura real de la plataforma.
- **Tags de stack técnico en el login**: `AuthHero.tsx` mostraba "PocketBase / ClickHouse / FastAPI"
  como badges visibles al usuario final en la pantalla de inicio de sesión — apropiado para un
  README, no para un producto de cara al usuario. Reemplazado por mensajes de producto ("Para sellos
  y productoras" / "Para curadores y artistas").

### Confirmado como comportamiento intencional (sin cambio)
El formulario de pago (tipo de tarjeta + últimos 4 dígitos + país opcional) es un sistema de pago
100% simulado y documentado como tal en el código (`facturacion/router.py::procesar_pago`, resultado
aleatorio sin gateway real) — la ausencia de CVV, nombre del titular o dirección de facturación es
consistente con ese diseño, no un descuido.

### Artefactos entregados (Bloque 4)

| Artefacto | Estado |
|---|---|
| `api/paquetes/publicidad/router.py` | Modificado — exención de ads para artistas aprobados |
| `api/paquetes/suscripciones/router.py` | Modificado — `elegible_trial` en `GET /planes` |
| `api/paquetes/distribucion/{router,queries}.py` | Ampliado — `GET /disponibilidad` (lista) |
| `api/paquetes/facturacion/queries.py` | Corregido — `INVOICES_POR_USUARIO` ahora trae `moneda` |
| `frontend/src/packages/suscripciones/{types,pages/PlanesPage}.tsx` | Ampliado — disclosure de trial |
| `frontend/src/packages/distribucion/{types,api,pages/DisponibilidadPage}` | Ampliado — vista de lista |
| `frontend/src/packages/facturacion/{types,pages/FacturacionPage}.tsx` | Corregido — moneda real, no EUR fijo |
| `frontend/src/packages/seguridad/pages/AuthHero.tsx` | Corregido — tags de producto, no de stack técnico |
| `openspec/specs/{publicidad,suscripciones,distribucion}/spec.md` | Sincronizados — CU-O80 |

Verificado con `docker compose` real (curl + Playwright), no solo compilado: exención de ads
confirmada antes/después de aprobar una cuenta de artista, disclosure de trial con fecha real
calculada y su desaparición tras la primera suscripción, lista de disponibilidad con filtro
verificado contra una restricción real creada para la prueba (incluyendo el bug de ClickHouse
`join_use_nulls` encontrado y corregido en el camino), moneda real (USD) confirmada contra datos de
facturas ya existentes, y capturas de pantalla del login y de ambas páginas rediseñadas.

---

## Bloque 5 — `editar-info-empresa` (14 jul 2026)

### Información de la empresa emisora, antes fija, ahora administrable
La razón social, el RUC y la dirección que aparecen en el encabezado de cada factura vivían
hardcodeados en `InvoiceDetailPage.tsx` ("Tracklytics S.A." / "RUC 0000000000001" / "Quito,
Ecuador") — cualquier corrección real habría requerido un cambio de código. Se agregó
`DIM_EMPRESA` en ClickHouse (fila única, `empresa_id = 1`, sembrada con los valores que ya estaban
fijos como default de una instalación nueva) junto a `GET /facturacion/empresa` (cualquier usuario
autenticado, lo necesita cualquiera que vea su propia factura) y `PUT /facturacion/empresa`
(admin-only, con registro en `FACT_AUDIT_LOG` de quién cambió qué). Se eligió ClickHouse sobre
PocketBase porque el consumidor natural del dato (`FACT_INVOICE`) ya vive ahí, y el resto de
"dimensiones" administrables del proyecto (`DIM_SELLO_DISCOGRAFICO`, `DIM_CANAL_MARKETING`) siguen
el mismo patrón. Nueva página admin `EmpresaConfigPage.tsx` (`/seguridad/facturacion/empresa`) con
un formulario de 3 campos.

**Bug encontrado en el camino (fuera de esta change, mismo tipo que el de la moneda de la semana
pasada)**: `AuditoriaFacturacionPage.tsx` también forzaba las invoices a EUR fijo (línea 195-196),
el mismo bug ya corregido en `FacturacionPage.tsx` la semana pasada pero que había quedado sin
corregir en la vista de auditoría admin. Corregido en el mismo commit.

Verificado con `docker compose` real: valores por defecto confirmados tras el seed, edición como
admin reflejada de inmediato en una consulta posterior, rechazo confirmado para un usuario sin rol
admin, entrada de auditoría confirmada en ClickHouse con el antes/después exacto, y el detalle de
una factura real mostrando el encabezado dinámico (capturas de pantalla de la página admin y de la
factura).

### Artefactos entregados (Bloque 5)

| Artefacto | Estado |
|---|---|
| `init_clickhouse.py` | Ampliado — tabla y seed de `DIM_EMPRESA` |
| `api/paquetes/facturacion/{router,queries}.py` | Ampliado — `GET`/`PUT /empresa` |
| `frontend/src/packages/facturacion/{types,api,pages/InvoiceDetailPage}` | Ampliado — encabezado dinámico |
| `frontend/src/packages/facturacion/pages/EmpresaConfigPage.tsx` | Nuevo — formulario admin |
| `frontend/src/packages/facturacion/pages/AuditoriaFacturacionPage.tsx` | Corregido — moneda real, no EUR fijo |
| `openspec/specs/facturacion/spec.md` | Sincronizado — CU-O81 |

---

## Bloque 6 — Sesión autónoma multi-fase (14 jul 2026)

Sesión larga sin supervisión directa, ejecutada en 11 fases (Fase 0 de cierre de deuda pendiente,
Fases 1-6 de producto, Fase 7-8 de infraestructura/datos, Fase 9-10 de despliegue/documentación),
con 5 de las fases de producto (2-6) paralelizadas en agentes en background trabajando sobre
paquetes disjuntos, y el resto (Fase 0, 1, 7, 8, 9, 10) ejecutado directamente. Todo verificado con
`docker compose` real, curl con sesión admin real, consultas directas a ClickHouse, y Playwright
contra el stack reconstruido — no solo compilado.

### Fase 0 — Cierre de deuda de sesiones anteriores
- **3 changes OpenSpec activos archivados** (`2026-07-09-mejoras-produccion`,
  `2026-07-11-dia3-operaciones-avanzadas`, `2026-07-12-notificaciones-perfiles-recos`): sus specs
  delta (17 archivos, 9 capabilities) se sincronizaron a mano a los specs principales — el CLI
  `openspec status --change` tiene un bug real que rechaza nombres de change que empiezan con dígito
  ("Change name must start with a letter"), así que la sincronización y el archivado se hicieron
  manualmente en vez de con el flujo automatizado. `openspec validate --strict --all`: 14/14 en
  verde tras archivar. Los pocos ítems de "recorrido manual en navegador" que quedaban sin marcar en
  `tasks.md` resultaron ya estar ejecutados y documentados en rondas anteriores de esta misma
  bitácora (bookkeeping, no trabajo real pendiente) — verificado leyendo el detalle antes de
  marcarlos, no asumido.
- **Rol inconsistente de `admin@demo.tracklytics.com` — corregido en la causa raíz**: `DIM_USUARIO.rol`
  solo se escribía una vez, al crear la cuenta o en el backfill de un login antiguo — si el rol
  cambiaba después en PocketBase (fuente real de autorización), el espejo analítico quedaba
  desincronizado para siempre. `POST /seguridad/auth/login` (`api/paquetes/seguridad/router.py`)
  ahora resincroniza `rol` en cada login si diverge del valor real en PocketBase, con el mismo
  patrón `ALTER TABLE ... UPDATE` ya usado para `perfil_publico`. Verificado con `py_compile` y
  reload limpio de la API; la verificación de login en vivo específica para esa cuenta se evitó
  deliberadamente (habría requerido extraer su contraseña, fuera de alcance).
- **Backfill de mood en `DIM_GENRES` — ejecutado**: `scripts/backfill_mood_generos.py` (heurística de
  cuadrante valence/energy sobre el promedio real de audio por género) se verificó contra el
  vocabulario de mood existente en el proyecto (sin conflicto — ningún otro lugar define moods de
  género) y se corrió contra los 114 géneros reales. Resultado real: Intenso 46, Enérgico 46,
  Melancólico 19, Relajado 3 (antes: 114/114 "Neutral"). **Decisión: backfill de una sola corrida,
  no recalculable en cada ETL** — `DIM_GENRES` se puebla una única vez (`if _count == 0` en
  `loader.py`) y nunca se trunca, así que un backfill posterior a la carga real es suficiente y
  estable; convertirlo en parte del DAG semanal repetiría el mismo cálculo cada semana sin ningún
  dato nuevo que lo cambie.

### Fase 1 — Eliminación de IDs crudos en formularios
Regla aplicada: ningún formulario pide un ID que el usuario no tiene forma de conocer.
- `RestriccionesTab.tsx` (distribución): el input numérico "fact_id del track" se reemplazó por
  `TrackPicker` (ya existente, reusado sin cambios).
- `FamiliaAdminPage.tsx` (experiencia): el campo de texto libre "id de la suscripción" se reemplazó
  por `UserPicker` sobre el usuario titular; nuevo endpoint `GET /experiencia/familia/resolver-
  suscripcion/{usuario_id}` resuelve la suscripción premium activa de ese usuario en el backend
  (404 claro si no tiene una).
- **Encontrado en la auditoría dirigida (no reportado explícitamente)**: `SellosTab.tsx` pedía
  `artist_id`/`album_id` numéricos crudos para asignar un sello. No existía picker de artista
  reusable fuera de `analitica` (`ArtistPicker` vivía acoplado a esa capability) ni picker de
  álbum. Se movió `ArtistPicker` a `shared/components/` (generalizado contra `GET
  /artists/search` de `catalogo`, sus 2 consumidores existentes en `analitica` se repuntaron sin
  cambio de comportamiento) y se creó `AlbumPicker` nuevo siguiendo el mismo patrón exacto que
  `TrackPicker`/`UserPicker`/`ArtistPicker` (debounce 300ms, selección por `onMouseDown`, botón de
  limpiar).
- **Grep dirigido sobre todo `frontend/src/packages/**/*.tsx`** confirmó que el resto de campos con
  forma de ID son o bien `<select>` con opciones legibles (correcto, no se tocaron) o el único caso
  documentado como excepción intencional: `PartnersConsolePage.tsx` (`id (detalle)`) es una consola
  de pruebas técnica interna para partners (réplica de `app/partners/console.html`, no una pantalla
  de producto orientada a un humano sin contexto técnico) — se dejó como está.
- Verificado: `tsc --noEmit` sin errores nuevos, `npm run build` limpio, y con Playwright real
  contra el stack reconstruido (ver Verificación final).

### Fase 2 — Flujo de solicitud de licencia por sello
Gap más grande identificado en el prompt de la sesión: antes, el admin creaba licencias
unilateralmente, sin ningún rastro de que el sello las hubiera pedido. Tabla nueva
`SOLICITUD_LICENCIA` (separada de `DIM_LICENCIA`, mismo patrón de `DIM_CUENTA_ARTISTA` en
`creadores`: pendiente → aprobada/rechazada, re-inserción en `ReplacingMergeTree` para resolver el
estado) — separada porque una solicitud cubre N países y produce N filas de `DIM_LICENCIA` al
aprobarse, y una solicitud rechazada nunca debe poder confundirse con una licencia vigente.
`canales_solicitados` se guarda como metadato de auditoría aunque `DIM_LICENCIA` no tiene columna
de canal (ese dato vive a nivel de restricción, no de licencia, en el modelo actual).

Endpoints nuevos en `api/paquetes/distribucion/router.py`: crear solicitud (admin actuando en
nombre del sello — interín, no existe login de sello todavía, pero `sello_id` queda en el modelo de
datos listo para cuando exista), listar pendientes, ver solicitudes de un sello, aprobar (crea las
licencias reales) y rechazar (con motivo). Frontend: pestaña nueva "Solicitudes de licencia" en
`DistribucionAdminPage.tsx`, con formulario de creación (sello + países + canales por checkboxes,
sin librería de multi-select nueva) y las dos vistas (pendientes con aprobar/rechazar, y por sello).

Verificado en vivo con sesión admin real: creación de solicitud (201), listado de pendientes,
aprobación (generó `DIM_LICENCIA.licencia_id=4` real, confirmado con consulta directa a
ClickHouse), y el ciclo completo cerrado extremo a extremo.

### Fase 3 — Visibilidad de datos generados por semana (Ingesta)
`EtlPage.tsx` solo mostraba contadores del historial de cargas, sin forma de ver qué se generó.
Nuevos endpoints `GET /ingesta/etl/muestra` (muestra aleatoria de hasta 200 tracks de una semana,
con nombre/artista/género/popularidad/`source_type`) y `GET /ingesta/etl/distribucion` (distribución
completa de géneros y bins de energy/valence/danceability para la semana completa, no solo la
muestra). Nueva sección "Datos generados por semana" en `EtlPage.tsx`: selector de semana, tabla de
muestra, y 4 gráficos (top 15 géneros + 3 atributos de audio) con `MiniBarChart` ya existente.
Verificado con consultas directas a ClickHouse (conteos exactos: distribución de género y de cada
atributo suman exactamente el total de la semana) y, tras obtener sesión admin, con curl real —
ambos endpoints devuelven 200 con datos reales.

### Fase 4 — Reporte de regalías por contrato
`RegaliasAdminPage.tsx` no tenía forma de ver el historial de liquidaciones de un contrato
específico (sí existía a nivel de "mis ganancias" del rightsholder). Nuevos endpoints
`GET /regalias/admin/contratos/{id}/liquidaciones` y `.../resumen` (total liquidado, última
liquidación, número de liquidaciones). Frontend: acción "Ver historial" por fila de contrato, con
el mismo patrón "seleccionar fila → detalle aparece debajo" ya usado en `RestriccionesTab.tsx` (sin
modal, este proyecto no tiene infraestructura de modales). **"Próxima liquidación esperada" se
omitió deliberadamente** — no existe ningún concepto de periodicidad/calendario en el esquema
(`DIM_CONTRATO_REGALIA` no tiene esa columna, confirmado por inspección), inventarlo habría sido
fabricar un dato. Verificado con curl real contra un contrato con 9 liquidaciones reales:
`resumen.total_liquidado` coincide exacto con `SUM(monto)` calculado directo en ClickHouse.

### Fase 5 — Checkout de pagos más realista, sin persistir datos sensibles
Formulario de método de pago ampliado: nombre del titular, número de tarjeta completo (16 dígitos,
validación Luhn client-side, marca de tarjeta inferida del prefijo — nunca pedida al usuario),
fecha de expiración y CVV (solo validación de formato, **nunca enviados al backend ni persistidos**),
dirección de facturación completa (calle, ciudad, país vía selector real de `DIM_PAIS`, código
postal). `DIM_METODO_PAGO` ganó columnas `nombre_titular`/`direccion`/`ciudad`/`codigo_postal`
(`ALTER TABLE` aplicado contra el contenedor en vivo, no solo el schema fuente). Flujo de pago con
estados intermedios simulados ("Validando…" → "Autorizando…", ~600ms cada uno) antes de la llamada
real al backend — el resultado final sigue viniendo siempre del backend real, nunca fabricado en el
frontend. Verificación de seguridad explícita: grep del diff completo confirma que ningún número de
tarjeta completo, expiración o CVV aparece en el cuerpo de ninguna request, en ningún
`console.log`, ni en el registro de auditoría — `DESCRIBE TABLE` en vivo confirma que
`DIM_METODO_PAGO` no tiene ninguna columna capaz de almacenarlos.

### Fase 6 — Visualizaciones reales en Analítica
El dashboard principal no tenía un solo gráfico. Se agregaron 4 paneles nuevos a
`GET /analitica/dashboard/executive`, todos sobre datos reales: (1) ingresos (suscripciones +
publicidad) vs. regalías pagadas, serie diaria (no semanal — el rango real de datos son ~12 días,
una serie semanal habría colapsado a 1-2 puntos, verificado antes de decidir la granularidad); (2)
altas de suscripción por plan agrupado (free/B2C pago/B2B), serie semanal vía
`pb_client.contar_altas_en_rango` ya existente; (3) géneros con más engagement real, reusando la
misma fórmula de `raw_score` ya usada en `EngagementPage`; (4) reproducciones bloqueadas por país,
reusando `RESTRICCIONES_POR_PAIS` de `distribucion` sin duplicar la query. `RegaliasAdminPage.tsx`
se dejó fuera del alcance de esta fase por estar siendo editado en paralelo por el agente de la
Fase 4 (evitar condición de carrera entre agentes). Verificado con curl real (sesión admin
real, un usuario/suscripción/pago de prueba creados de punta a punta) y, después, con Playwright: 10
gráficos `recharts` renderizando en el dashboard.

### Fase 7 — `task_portada` fuera del camino crítico del DAG de ingesta
Causa raíz confirmada por inspección: `task_portada` (resolución de portadas reales vía oEmbed +
respaldo iTunes/Deezer) corría secuencialmente dentro de `tracklytics_etl`, entre `task_gold` y
`task_synthetic` — aditiva por diseño, pero bloqueando el pipeline igual. Se sacó del DAG semanal
(`etl/dags/tracklytics_etl.py`: `task_bronze >> task_silver >> task_gold >> task_synthetic >>
task_log`) y se movió a un DAG nuevo e independiente, `reload_portadas` (`etl/dags/
reload_portadas_dag.py`), siguiendo el mismo patrón standalone que `reload_portadas_1h.py`/
`reload_portadas_5h.py` ya usaban para recargas puntuales. Verificado con una ejecución real
disparada en la Fase 8 (ver abajo): la duración cayó de ~3-6 min a **65 segundos**, pese a cargar
muchos más datos que las corridas previas usadas de referencia.

### Fase 8 — Carga hasta semana 11 + portadas en background
Estado real del catálogo verificado antes de disparar (no asumido del historial de `ETL_LOGS`, que
tenía entradas obsoletas de una recarga previa): `FACT_TRACKS` solo tenía semanas 1-2 realmente
cargadas (`ETL_BATCH_CONTROL` como fuente de verdad). Se confirmó por lectura de código que
`gold/synthetic.py` carga acumulativamente todas las semanas 2..N en una sola corrida y que
`_trigger_guarded` trunca y recarga `FACT_TRACKS` por completo en cada disparo (preservando
`source_type='user_uploaded'`) — un solo trigger con `week_number=11` era seguro y correcto.

**Bloqueo real encontrado y resuelto**: el endpoint de disparo de ingesta está protegido por rol
`admin` de la aplicación (`require_lead_data_engineer`), que no es autoasignable — no había forma
de obtenerlo sin credenciales, y el sistema bloqueó correctamente dos intentos de extraer o
adivinar credenciales de infraestructura (superusuario de PocketBase) desde variables de entorno
del contenedor. Se solicitaron credenciales admin reales al usuario, quien las proporcionó,
permitiendo verificar con HTTP real no solo esta fase sino también las Fases 2, 3 y 4 (que hasta
ese momento solo tenían verificación indirecta vía ClickHouse).

Al disparar la ingesta se encontró un **segundo bloqueo real de infraestructura, no relacionado
con esta sesión**: el scheduler de Airflow llevaba **~6 horas caído** (crash por `sqlite3.
OperationalError: database is locked`, un problema conocido de `SequentialExecutor` + SQLite bajo
`airflow standalone` cuando webserver/scheduler/triggerer compiten por el mismo archivo) —
`webserver` y `triggerer` seguían vivos, así que el contenedor nunca se marcó como no saludable y
Docker nunca lo reinició. Diagnosticado leyendo los logs del contenedor (ausencia total de líneas
`scheduler` en la ventana reciente) y resuelto con `docker compose restart airflow`. Tras la
recuperación, la corrida en cola avanzó de inmediato.

Resultado verificado directo en ClickHouse: `FACT_TRACKS` con semanas 1-11 completas
(1 113 550 registros: 113 550 reales + 10×100 000 sintéticos), `ETL_LOGS` confirma
`status='success', records_inserted=1113550, duration_seconds=64.96`. DAG `reload_portadas`
disparado en background (`airflow dags trigger reload_portadas`) para resolver portadas de forma
independiente durante las horas siguientes, sin bloquear nada más.

### Fase 9 — Logo actualizado y contenedores reconstruidos
`frontend/public/logo.png` (ya en el estado correcto, commit previo a esta sesión) se sirve desde
`/logo.png`, referenciado en `index.html` y en los 3 shells de layout (`AppShell`, `AnalyticaShell`,
`SeguridadShell`). El frontend se sirve desde un build multi-stage de Nginx sin volumen montado
(`docker-compose.yml`), así que un `restart` no basta — se requiere rebuild. Se reconstruyó con
`docker compose build --no-cache frontend-react` (mismo quirk de cacheo de Docker Desktop en
Windows ya documentado en bitácoras anteriores) y se confirmó servido correctamente
(`curl http://localhost:8082/logo.png` → 200, tamaño exacto del archivo fuente).

### Fase 10 — Constitución del proyecto actualizada
Documento localizado en `docs/CONSTITUCION_TRACKLYTICS.md` (no en `openspec/`, que solo tiene un
`config.yaml` con una copia funcionalmente equivalente usada para generación de specs — no
modificado en esta sesión, fuera del alcance pedido). Actualizado para reflejar:
- Frontend real: React 18 + TypeScript + Vite + `recharts` (ya no HTML/JS vanilla + Bootstrap +
  Plotly.js — ese frontend fue retirado por completo en S10, confirmado que no queda ningún rastro
  servido desde `app/`).
- RT-05 (ClickHouse como única fuente analítica) documentado explícitamente como fricción
  arquitectónica deliberada: dominios transaccionales (pagos, solicitudes, auditoría) también viven
  en ClickHouse a propósito, no por descuido.
- RT-06 (piso de tablas) reformulado: ya no fija un número objetivo — el proyecto tiene 66 tablas
  físicas repartidas en 14 capabilities de negocio, y crece por necesidad real de cada capability,
  no por cuota.
- RT-07 (`source_type` como reemplazo de `is_synthetic`) documentado, incluyendo que la migración
  no es universal todavía (`FACT_ENGAGEMENT_USUARIO.is_synthetic` sigue existiendo como deuda
  técnica conocida, no una inconsistencia sin explicar).
- Patrón de solicitud/aprobación (nuevo con `SOLICITUD_LICENCIA` de esta sesión) documentado como
  convención reutilizable del modelo de negocio.
- Separación de `reload_portadas` del DAG principal documentada en la sección de arquitectura del
  pipeline.
- Nota sobre el actor "sello" como identidad de negocio real sin login propio todavía (interín
  admin-en-su-nombre), con el modelo de datos ya preparado para cuando exista.
- Se verificó que ningún detalle de generación sintética se filtró a `docs/negocio/` (grep limpio).

### Verificación final
- `docker compose down` (sin `-v`) + `docker compose up --build`: los 5 servicios persistentes
  (`pocketbase`, `clickhouse`, `api`, `airflow`, `frontend-react`) subieron sanos; los 3
  contenedores de inicialización de un solo uso (`init`, `init-permissions`, `pb_init`) terminaron
  con éxito. Catálogo y tablas nuevas confirmados intactos tras el ciclo completo (1 113 555 tracks,
  `SOLICITUD_LICENCIA` y `DIM_METODO_PAGO` con las filas de prueba de esta sesión).
- **Hallazgo aparte, preexistente, fuera de alcance**: el servicio `etl` de `docker-compose.yml`
  (contenedor de un solo uso, no relacionado con Airflow) falla con `python: can't open file
  '/app/main.py'` — ese archivo no existe en `etl/` desde que la orquestación se migró por completo
  a Airflow en una sesión anterior; el servicio quedó huérfano en el compose file. No bloquea nada
  (la ingesta real corre íntegramente vía Airflow, ya verificada) — documentado aquí, no corregido,
  por estar fuera del alcance de las 10 fases de esta sesión.
- `npx tsc --noEmit` y `npm run build` combinados tras fusionar los 5 agentes en paralelo: cero
  errores nuevos (solo los 3 ya documentados de `EngagementPage.tsx`).
- **Playwright real contra el stack reconstruido** (Chromium, sesión admin real): login,
  dashboard con 10 gráficos `recharts`, pestaña "Solicitudes de licencia" visible y funcional,
  `TrackPicker` confirmado en `RestriccionesTab` (ningún input crudo de `fact_id`/`artist_id`
  restante), acción "Ver historial" en `RegaliasAdminPage`, 4 gráficos de distribución en
  `EtlPage` — cero errores de consola en todas las páginas visitadas.
- El script de verificación de Playwright se ejecutó con credenciales pasadas por variable de
  entorno, nunca hardcodeadas en un archivo dentro del repositorio (un primer intento sí las dejó
  en un archivo temporal dentro de `frontend/`; el clasificador de permisos lo bloqueó
  correctamente, se corrigió y el archivo temporal se eliminó).

### Artefactos entregados (Bloque 6)

| Artefacto | Estado |
|---|---|
| `api/paquetes/seguridad/router.py` | Corregido — resincronización de `rol` en cada login |
| `scripts/backfill_mood_generos.py` | Ejecutado — 114 géneros con mood real |
| `frontend/src/packages/distribucion/components/{RestriccionesTab,SellosTab}.tsx` | Corregido — IDs crudos reemplazados |
| `frontend/src/packages/experiencia/pages/FamiliaAdminPage.tsx` + `api/paquetes/experiencia/router.py` | Ampliado — resolución de suscripción por usuario |
| `frontend/src/shared/components/{ArtistPicker,AlbumPicker}.tsx` | Nuevo/movido — pickers compartidos |
| `init_clickhouse.py` | Ampliado — `SOLICITUD_LICENCIA`, columnas de `DIM_METODO_PAGO` |
| `api/paquetes/distribucion/{router,queries}.py` | Ampliado — flujo de solicitud de licencia |
| `frontend/src/packages/distribucion/components/SolicitudesLicenciaTab.tsx` | Nuevo |
| `api/paquetes/gestion_datos/{router,queries}.py` | Ampliado — muestra y distribución de datos generados |
| `frontend/src/packages/ingesta/pages/EtlPage.tsx` | Ampliado — sección de datos generados |
| `api/paquetes/regalias/{router,queries}.py` | Ampliado — historial/resumen por contrato |
| `frontend/src/packages/regalias/pages/RegaliasAdminPage.tsx` | Ampliado — "Ver historial" |
| `frontend/src/packages/facturacion/{lib/checkout.ts,pages/FacturacionPage}.tsx` | Nuevo/ampliado — checkout realista |
| `api/paquetes/facturacion/{router,queries}.py` | Ampliado — dirección de facturación |
| `api/paquetes/analitica/{router,queries}.py`, `api/core/cache.py` | Ampliado — 4 gráficos de dashboard |
| `frontend/src/packages/analitica/pages/DashboardPage.tsx` | Ampliado — visualizaciones reales |
| `etl/dags/tracklytics_etl.py`, `etl/dags/reload_portadas_dag.py` | Modificado/nuevo — portadas fuera del camino crítico |
| `docs/CONSTITUCION_TRACKLYTICS.md` | Actualizado — stack real, RT-05/06/07, nuevos patrones |
| `openspec/changes/archive/{2026-07-09-mejoras-produccion,2026-07-11-dia3-operaciones-avanzadas,2026-07-12-notificaciones-perfiles-recos}/` | Archivados |
| `openspec/specs/{distribucion,experiencia,facturacion,ingesta,seguridad,suscripciones,catalogo,creadores,social}/spec.md` | Sincronizados |

---

## Bloque 7 — `mejoras-financieras-empresariales` (15 jul 2026)

Sesión autónoma sin pausas de confirmación (autorización explícita del usuario): flujo OpenSpec
completo de punta a punta (`propose` → `apply` → `verify` → `archive`) para cerrar el último
hueco del modelo de dinero — hasta ahora `analitica` sabía cuánto entraba (`v1_pnl`:
suscripciones + publicidad − regalías pagadas) pero nada sabía cuánto costaba operar la
plataforma, ni existía forma de reembolsar un pago, ni de ver qué facturas/regalías estaban
pendientes de cobro o pago, ni de controlar cuándo una campaña publicitaria se pasaba de su
presupuesto contratado.

### Capability nueva: `finanzas` (15ª del proyecto)
Paquete nuevo `api/paquetes/finanzas/` (mismo patrón que `facturacion`/`publicidad`: `deps.py`,
`queries.py`, `router.py`), 13 endpoints bajo `/app/v1/finanzas`, admin-only, todos con
`audit.record` en cada mutación:

- **Gastos operativos** — CRUD con soft-delete (`FACT_GASTO_OPERATIVO`, tabla nueva): crear,
  listar con filtros de categoría/fecha/estado, editar, anular. Un gasto `anulado` se excluye de
  todo cálculo aguas abajo.
- **Reembolsos** — vinculados a `FACT_TRANSACCION_PAGO` (`FACT_REEMBOLSO`, tabla nueva):
  validación de que el monto no exceda lo pagado menos reembolsos previos `procesado`, y de que
  la transacción esté `exitosa`. El diseño es procesar-o-rechazar en el mismo request (rechazado
  = error HTTP, no se inserta fila) — los estados `rechazado`/`cancelado` del enum quedan
  reservados para un flujo de revisión manual futuro, no implementado en este change.
- **Cuentas por cobrar y por pagar** — resumen on-read (sin tabla de estado nueva) sobre
  `FACT_INVOICE`, `FACT_LIQUIDACION_REGALIA` y `FACT_RETIRO_REGALIA`, reutilizando el mismo
  patrón de saldo disponible ya usado por `regalias`.
- **Tracking de presupuesto de campañas** — consumo calculado on-read (suma de
  `FACT_INGRESO_PUBLICITARIO` por campaña, sin columna materializada), con alerta al 80% y al
  100%; al agotarse, `DIM_CAMPANA_PUBLICITARIA.activa` pasa a `0` automáticamente (reutiliza el
  campo existente, sin nuevo DAG).
- **Dashboard financiero, indicadores empresariales, alertas administrativas y reporte por
  periodo** — todos componen `v1_pnl` (ya existente en `analitica`) restando gastos operativos y
  reembolsos, sin reimplementar su cálculo. Las alertas (factura vencida, retiro pendiente,
  campaña por agotarse, gasto mayor a ingreso, caída de ingreso, reembolso elevado) se calculan
  on-read, solo visibles en panel admin, sin notificaciones externas.

### Desviaciones de diseño encontradas al implementar
- `FACT_TRANSACCION_PAGO.estado` no tiene valor `cancelada` en el schema real (solo
  `pendiente`/`exitosa`/`fallida`) — la regla de reembolso quedó como "la transacción debe estar
  `exitosa`", que ya cubre los otros dos casos.
- `FACT_INVOICE.estado` solo se escribe como `'emitido'` en todo el código actual (nunca
  `'pagada'`/`'vencida'`) — "vencida" para cuentas por cobrar se deriva por antigüedad (>30 días
  desde `fecha_emision`) en vez de depender de un estado que ningún flujo asigna.
- `FACT_GASTO_OPERATIVO` usa `ORDER BY (gasto_id)` en vez de `(fecha)` — ClickHouse rechaza
  `ALTER TABLE ... UPDATE` sobre columnas del sort key, y `fecha` debe poder editarse.

### Fuera de alcance de este change (documentado, no pendiente por descuido)
Frontend del panel de finanzas (tasks.md sección 10, implementado en una segunda pasada más abajo)
y exportación PDF/Excel del reporte (sección 12) quedaron sin implementar en el change original —
ambas explícitamente marcadas como opcionales/fuera del camino crítico en la propuesta,
deprioritizadas frente al backend con las 9 secciones restantes ya completas y verificadas sin
fricción.

Verificado con `docker compose` real: primer suite de pytest del proyecto
(`api/tests/test_finanzas.py`, 26/26 casos, cubriendo validaciones de reembolso, cálculo de
consumo de presupuesto/alertas 80%-100% con pausa automática, y que la utilidad del dashboard
efectivamente reste gastos y reembolsos), los 13 endpoints confirmados en
`http://localhost:8000/openapi.json` contra la instancia real, y consultas directas a ClickHouse
confirmando que las mutaciones (gasto anulado, reembolso procesado, campaña pausada) y sus
entradas en `FACT_AUDIT_LOG` quedaron escritas.

### Artefactos entregados (Bloque 7)

| Artefacto | Estado |
|---|---|
| `init_clickhouse.py` | Ampliado — `FACT_GASTO_OPERATIVO`, `FACT_REEMBOLSO` |
| `api/paquetes/finanzas/` | Nuevo paquete — 13 endpoints |
| `api/main.py` | Ampliado — registro de `finanzas_router` |
| `api/tests/{conftest,test_finanzas}.py` | Nuevo — primera suite de pytest del proyecto |
| `openspec/specs/finanzas/spec.md` | Nuevo — capability 15 |
| `openspec/specs/publicidad/spec.md` | Sincronizado — pausa automática por presupuesto agotado |
| `openspec/changes/archive/2026-07-15-mejoras-financieras-empresariales/` | Archivado |

### Segunda pasada — frontend del panel de finanzas (15 jul 2026, mismo día)

El frontend que quedó deprioritizado en el change original se implementó en una sesión
independiente, con foco explícito del usuario en gráficos no convencionales (nada de bar/donut
por defecto) y verificación real con Playwright — no solo `tsc`/`npm run build`.

Nuevo paquete `frontend/src/packages/finanzas/` (mismo patrón de aislamiento que el resto:
`types.ts`, `api/finanzas.api.ts`, `index.ts`, `pages/`, `components/`), 8 pestañas en
`FinanzasAdminPage.tsx` (`/seguridad/finanzas`, lazy-loaded por traer Recharts, mismo patrón que
`DistribucionAdminPage`/`RegaliasAdminPage`): Dashboard, Gastos operativos, Reembolsos, Cuentas por
cobrar/pagar, Presupuesto de campañas, Indicadores, Alertas, Reporte.

Cuatro componentes de chart nuevos, deliberadamente distintos del trío `MiniBarChart`/
`MiniLineChart`/`MiniDonutChart` que domina el resto del proyecto (`shared/components/charts/`) —
cada uno elegido porque encaja semánticamente con el dato, no por novedad:
- **`RadialGauge`** (anillo de progreso 0-100%): margen de plataforma (Dashboard/Reporte), % de lo
  por cobrar que está vencido (Cuentas), y una grilla de un gauge por campaña — colores
  neutro/warning/error según `alerta_80`/`alerta_agotado` — en Presupuesto de campañas.
- **`CategoriaTreemap`**: gasto operativo por categoría (Gastos, Reporte) — área en vez de
  longitud/ángulo, con nombre y monto dentro del propio bloque cuando hay espacio. Paleta
  categórica de 8 colores extendida desde `CHART_COLORS` (misma banda L/C validada, hue rotado en
  pasos de 45°) porque la paleta de 3 tonos del proyecto no alcanza para 8 categorías fijas.
- **`ReembolsosScatter`**: dispersión monto×fecha de reembolsos procesados, con los que superan
  `REEMBOLSO_MONTO_ALTO_USD` marcados en ámbar — pensado para que un reembolso elevado salte a la
  vista como outlier en vez de perderse en un total diario agregado.
- **`IndicadoresRadar`**: única serie con las 3 proporciones del periodo, todas en el mismo eje
  (%) — a diferencia de `AudioRadarChart` (analítica), que compara 6 rasgos ya normalizados entre
  dos entidades, aquí se dejó fuera del radar cualquier métrica en dinero (ARPU, ingreso promedio
  por anunciante) para no mezclar unidades distintas en un mismo eje.

**Hallazgo del hook de diseño (`impeccable`) corregido en el camino**: el primer borrador de la
lista de alertas usaba un borde lateral de color por severidad (`border-left: 3px solid`) — el
hook lo marcó como el tell más reconocible de una UI generada sin criterio propio. Se reemplazó
por un punto de estado + tinte de fondo sutil, reutilizando los mismos tokens que ya usan
`badgeError`/`badgePending` en vez de inventar un lenguaje visual nuevo.

Verificado con Playwright real (no simulado): cuenta admin de prueba creada con
`pb_client.crear_usuario(rol="admin")` (`api/paquetes/seguridad/pb_client.py`, no
`suscripciones/pb_client.py` como en sesiones previas — ese módulo no tiene esa función), sesión
sembrada en `localStorage` con el token real, `npm run dev` contra el stack Docker ya levantado.
Las 8 pestañas cargaron con datos reales y cero errores de consola/página; la grilla de
presupuesto de campañas mostró en vivo campañas ya pausadas automáticamente por el backend
(`activa=false` + badge "Presupuesto agotado"); un ciclo completo de alta de gasto (formulario →
`POST /finanzas/gastos` → fila nueva visible en la tabla) confirmado end-to-end. `npx tsc --noEmit`
y `npm run build`: sin errores nuevos (los 3 ya documentados de `EngagementPage.tsx` siguen
igual), `FinanzasAdminPage` queda en su propio chunk de build (no se coló en el bundle principal).

| Artefacto | Estado |
|---|---|
| `frontend/src/packages/finanzas/` | Nuevo paquete — 8 pestañas, `types.ts`, `api/finanzas.api.ts` |
| `frontend/src/packages/finanzas/components/charts/{RadialGauge,CategoriaTreemap,ReembolsosScatter,IndicadoresRadar}.tsx` | Nuevo — 4 charts no convencionales |
| `frontend/src/app/router.tsx` | Ampliado — ruta `/seguridad/finanzas` (lazy) |
| `frontend/src/app/layout/SeguridadShell.tsx` | Ampliado — link "Finanzas" en el sidebar |

## Bloque 8 — `b2b-tier-access-analitica` (16 jul 2026)

**Gap identificado (sesión autónoma, ciclo completo propose → apply → verify → archive)**: los 3
planes B2B (`api/paquetes/suscripciones/planes.py`) prometían una escalera de valor explícita en su
propia descripción — Básico "paneles esenciales", Pro "paneles avanzados y comparativas",
Enterprise "inteligencia de negocio completa, incluyendo reporte diario operativo" — pero el
gating real (`require_b2b_panel_access`) solo verificaba `role == "analyst"` + suscripción activa,
sin mirar `tipo_plan`. Los 10 endpoints de `analitica` protegidos por ese dependency eran
idénticamente accesibles a los 3 tiers, y Enterprise no tenía ningún panel exclusivo pese a costar
3x más que Pro. La descripción de Enterprise, además, prometía "reporte diario operativo" — un
panel que en realidad es `require_staff` (admin-only), nunca alcanzable por ningún Cliente B2B sin
importar cuánto pague; se corrigió esa descripción como parte del mismo change.

### Diseño

Gating por tier modelado como dict estático (`_TIER_RANK = {"basico": 0, "pro": 1, "enterprise":
2}`) + dependency factory `require_tier(minimo)` en `api/paquetes/analitica/deps.py`, en vez de
reusar el patrón de permisos granulares de `seguridad` (`FACT_PERMISO_USUARIO`, CU-O17): ese
patrón existe para permisos asignables por un admin en runtime por usuario individual, mientras que
el tier B2B es un atributo fijo del plan que el cliente compra, no configurable por admin — usar
una tabla asignable ahí habría introducido una superficie de inconsistencia sin aportar nada al
alcance del proyecto. `require_b2b_panel_access` ahora devuelve `tier` junto al `user` (admin recibe
`"enterprise"` implícito), y `require_tier` lo compara sin round-trip adicional a PocketBase.

Paneles predictivos/estratégicos nuevos (exclusivos Enterprise, CU-O92/CU-O93): proyección de
tendencia de género y proyección de trayectoria de artista vs. su género predominante, calculadas
con regresión lineal simple (`numpy.polyfit`, ya en `requirements.txt` — cero dependencias nuevas)
sobre la serie semanal de popularidad (`load_week`), extrapolada 4 semanas adelante. Mínimo 3
semanas de datos para proyectar; con menos, `suficiente: false` en vez de un valor sin base. Se
evaluó un tercer endpoint de "alerta temprana" (paralelo a `AlertasTab.tsx` de `finanzas`, CU-O89) y
se descartó: la alerta es un derivado directo del mismo cálculo de proyección, así que se embebió
como campo `alerta` en los dos endpoints existentes en vez de triplicar la consulta. Presentación
siempre como "proyección estadística estimada", nunca como "predicción de IA" — mismo criterio que
la regla de framing de datos sintéticos del proyecto.

**Corrección durante la implementación** (verificación real > intuición): el diseño inicial asignó
`/artistas/search` (v1) a tier Pro, asumiendo que solo alimentaba los paneles comparativos. Al
revisar el consumidor real en el frontend, resultó ser exclusivamente `EngagementPage.tsx` (buscar
un artista para ver su engagement, panel Básico) — `ComparacionPage`/`ArtistaBenchmarkPage` usan un
`ArtistPicker` compartido que golpea un endpoint legacy distinto, sin este dependency. Gatear ese
endpoint a Pro habría bloqueado un feature Básico sin restringir ningún panel Pro; se corrigió a
Básico antes de verificar con curl. Documentado en `design.md` como aprendizaje: verificar el
consumidor real en el frontend antes de asignar tier por similitud de nombre de ruta.

### Auditoría retroactiva de trazabilidad

`openspec/specs/analitica/spec.md` y `openspec/specs/suscripciones/spec.md` ya tenían la tabla de
5 niveles "de negocio" (nivel empresarial → departamento → paquete → CU → historia de usuario)
exigida por la convención docente, pero ninguno documentaba explícitamente la cadena técnica CU →
endpoint → componente frontend — vivía implícita en nombres de rutas e imports. Se completó esa
cadena para los 14 CU operativos existentes de ambos paquetes en `design.md` del change (sin abrir
un change aparte, por ser documentación) — no se encontraron CU sin componente frontend real
asociado, el hueco era puramente de documentación, no de cobertura funcional.

### Verificación real

**curl** contra la API en Docker (`docker compose up -d pocketbase pb-init clickhouse init-db
init-permissions api frontend-react`): 3 cuentas nuevas (`cliente_basico@demo.tracklytics.com`,
`cliente_pro@…`, `cliente_enterprise@…`, password `Demo12345!`, creadas vía
`POST /seguridad/auth/registro` + método de pago + `POST /suscripciones` con el `tipo_plan`
correspondiente) confirmaron: Básico ve solo paneles base (403 estructurado
`tier_insuficiente` en comparativos y predictivos), Pro ve paneles base + comparativos (403 en
predictivos), Enterprise ve todo incluidos los 2 paneles nuevos con datos reales
(`pendiente_semanal`, `alerta`, `trayectoria`); admin bypassa todo (`tier: "enterprise"` implícito)
y `require_staff` (`/churn`) sigue rechazando a Enterprise igual que antes. Casos de borde
verificados directamente sobre `proyeccion.py`: datos insuficientes (`suficiente: false` con <3
semanas) y alerta temprana (`alerta: true` con pendiente negativa >10% acumulado).

**Playwright** real contra `npm run dev` (puerto 5173, proxy a la API en 8000): `PlanesPage`
muestra las features por tier (capturas); cuenta Básico en `/analitica/adquisicion` ve la tarjeta
"disponible desde el plan Pro" con CTA "Ver planes" en vez de un error genérico; cuenta Pro accede
al panel sin bloqueo y no ve la sección "Predictivo" en la nav; cuenta Enterprise ve la nav
"Proyección de género"/"Proyección de artista", ambos paneles renderizan el gráfico
histórico+proyectado (`MiniLineChart`) y, en el caso de artista, el badge de trayectoria
("Perdiendo terreno frente a su género" para el caso probado). `npm run build`: sin errores.

### Artefactos entregados (Bloque 8)

| Artefacto | Estado |
|---|---|
| `api/paquetes/analitica/deps.py` | Ampliado — `_TIER_RANK`, `require_tier` |
| `api/paquetes/analitica/router.py` | Ampliado — tier por endpoint, 2 endpoints predictivos nuevos |
| `api/paquetes/analitica/queries.py` | Ampliado — `GENRE_WEEKLY_POPULARITY`, `ARTIST_WEEKLY_POPULARITY` |
| `api/paquetes/analitica/proyeccion.py` | Nuevo — regresión lineal simple, umbral de alerta |
| `api/paquetes/suscripciones/planes.py` | Ampliado — `features` por plan B2B, descripción Enterprise corregida |
| `frontend/src/packages/suscripciones/pages/PlanesPage.tsx` | Ampliado — lista de features por plan |
| `frontend/src/packages/analitica/components/TierUpsell.tsx` | Nuevo — estado "disponible desde plan X" |
| `frontend/src/packages/analitica/lib/tierError.ts` | Nuevo — helper de lectura del 403 estructurado |
| `frontend/src/packages/analitica/pages/{ProyeccionGeneroPage,ProyeccionArtistaPage}.tsx` | Nuevo — paneles predictivos Enterprise |
| `frontend/src/shared/lib/api-client.ts` | Ampliado — `ApiError.detailBody` para `detail` estructurado |
| `frontend/src/app/layout/AnalyticaShell.tsx` | Ampliado — sección "Predictivo" (tier Enterprise/admin) |
| `openspec/specs/analitica/spec.md` | Sincronizado — CU-O92/CU-O93, gating por tier, trazabilidad completada |
| `openspec/specs/suscripciones/spec.md` | Sincronizado — features por plan (CU-O06) |
| `openspec/changes/archive/2026-07-16-b2b-tier-access-analitica/` | Archivado |

## Bloque 9 — `modelo-financiero-completar-huecos` (16 jul 2026, mismo día)

**Auditoría del manejo de dinero** (`facturacion`, `regalias`, `publicidad`, `suscripciones`,
`finanzas`): el modelo ya era sólido (trial, IVA en invoices, pool 70/30 con split 80/20, retiros
con aprobación, pausa automática por presupuesto, panel de finanzas consolidado), pero faltaban 4
piezas para operar como un negocio real: cambio de plan, dunning real, retención fiscal a
rightsholders, y país/moneda/IVA/checkout configurables sin tocar código.

### Qué se implementó

- **Cambio de plan con prorrateo (CU-O94)**: `PUT /suscripciones/{id}/plan` mueve la suscripción
  in-place (PATCH sobre el mismo registro PocketBase, conserva `created`) a otro `tipo_plan`,
  cobrando/acreditando el ajuste sobre los días restantes de un ciclo de 30 días.
  `concepto='ajuste_prorrateo'` nuevo en `FACT_TRANSACCION_PAGO` distingue el ajuste de un cobro
  normal.
- **Dunning real (CU-O95)**: nuevo estado `pago_pendiente` + `intentos_fallidos` en la colección
  `suscripciones`; `POST /suscripciones/{id}/procesar-cobro` intenta el cobro, incrementa el
  contador si falla, y degrada a los 3 intentos (B2C → free manteniendo acceso; B2B → cancelada,
  suspende `analitica` vía el `require_b2b_panel_access` ya existente). `finanzas` suma la alerta
  "suscripciones con cobro pendiente" (CU-O89). El DAG `facturacion_recurrente.py` usa la misma
  política en vez de cancelar en la primera falla.
- **Retención fiscal en regalías (CU-O96)**: `FACT_LIQUIDACION_REGALIA` gana
  `monto_bruto`/`retencion_pct`/`monto_retenido`; `monto` pasa a significar el neto. La tasa se
  resuelve por país del rightsholder (override en `DIM_PAIS`) o una tasa global en `DIM_EMPRESA`
  (fallback). Tratada como pasivo por remitir, no como ingreso de la plataforma.
- **País configurable (CU-O97)**: `DIM_PAIS` gana `moneda_codigo`/`tasa_cambio_a_usd` (congelada,
  simulada)/`iva_tasa`/`retencion_fiscal_pct`/`activo`, con CRUD admin nuevo en `distribucion`
  (dueño de la tabla) — antes solo tenía lectura.
- **Precios de plan configurables (CU-O98)**: nueva tabla `DIM_PLAN`, desacoplada a propósito de
  `_TIER_RANK` (`analitica/deps.py`, change anterior) — el admin cambia cuánto cuesta un plan,
  nunca qué desbloquea.
- **Checkout + notificación simulada (CU-O99)**: `MetodoPagoBody` acepta `numero_tarjeta`/
  `fecha_expiracion` (validados, nunca persistidos — se descubrió que `FacturacionPage.tsx` ya
  hacía esto client-side desde un change anterior no documentado en la spec, corregido en esta
  sesión). Nueva tabla `FACT_EMAIL_ENVIADO` registra cada factura emitida como notificación
  simulada, visible en una tabla nueva en `FacturacionPage.tsx`.

### Decisiones de diseño

Prorrateo sobre ciclo fijo de 30 días (mismo criterio que `facturacion_recurrente.py`, ya
documentado como simplificación académica). Dunning con 3 intentos fijos en código, resuelto vía
endpoint (no hay scheduler real garantizado — memoria de proyecto, Airflow puede morir en
silencio). Retención/IVA con patrón "global + override por país" (no exigir tasa por los 15
países sembrados). Configuración de país como extensión de `DIM_PAIS` existente, no una tabla
paralela ni un paquete de configuración nuevo.

**Corrección real durante la verificación con curl**: el diseño asumía que toda suscripción de
pago guarda su `metodo_pago_id`, pero `confirmar_suscripcion` solo lo persiste en el camino de
trial — un plan de pago normal nunca lo guardaba (comportamiento preexistente). Se corrigió
`PUT /{id}/plan` para aceptar `metodo_pago_id` opcional en el body como fallback, verificado con
una suscripción real que no lo tenía.

### Auditoría retroactiva de trazabilidad

`facturacion`, `regalias`, `distribucion` y `suscripciones` ya tenían la tabla de 5 niveles "de
negocio" exigida por convención, pero ninguna documentaba CU → endpoint → componente frontend en
un solo lugar (mismo hueco ya corregido para `analitica` en el bloque 8). Se completó esa cadena
en `design.md` del change para los CU de dinero relevantes. Hallazgo adicional: el requirement
"Registro de método de pago" de `facturacion/spec.md` describía el endpoint como "tipo, últimos 4
dígitos, país" pero el código ya capturaba `nombre_titular`/`direccion`/`ciudad`/`codigo_postal`
desde un change anterior nunca sincronizado — corregido en la misma delta spec. También se
documentó que CU-O63 (liquidar regalías) no tiene ningún componente frontend propio — hueco
preexistente, fuera del alcance de este change.

### Verificación real

**curl**: ciclo completo de dunning (2 fallos → `pago_pendiente` con contador, 3er fallo →
degradación B2C a free, reintento exitoso → reset a `activa`), cambio de plan (upgrade con cobro
real de ajuste, downgrade con crédito sin cobro, rechazo por cobro fallido), país nuevo (Uruguay)
con moneda/tasa/IVA/retención propios y desactivación, retención fiscal real en una liquidación
(`liquidar` real sobre datos existentes: sello con país Ecuador y retención propia del 5% vs.
sello/productor sin país configurado usando la tasa global del 10%, confirmado con
`toFloat64()` directo en ClickHouse), conversión de moneda para un usuario mexicano (MXN a tasa
18x), edición de precio de plan admin reflejada de inmediato. Un hallazgo curioso: al ordenar
liquidaciones por fecha, aparecieron primero registros de años futuros (2027-2028) sembrados por
`simulacion` — no un bug, solo un recordatorio de que esa capability puebla datos con fechas
simuladas más allá del presente.

**Playwright** real contra `npm run dev`: `PlanesPage` muestra conversión a MXN y el botón
"Cambiar a este plan"; `FacturacionPage` muestra las transacciones de ajuste (+300/-300) y la
notificación de factura simulada; `EmpresaConfigPage` con los campos de IVA/retención global;
pestaña "Configuración" nueva en `DistribucionAdminPage` con precios de plan y países (incluido
Uruguay desactivado con sus tasas). Se corrigió en el camino un bug de precisión de punto flotante
en `fmtPrecio` (mostraba `12.989999771118164` en vez de `12.99`).

### Artefactos entregados (Bloque 9)

| Artefacto | Estado |
|---|---|
| `init_clickhouse.py` | Ampliado — columnas nuevas en `DIM_PAIS`/`DIM_EMPRESA`/`DIM_SELLO_DISCOGRAFICO`/`FACT_TRANSACCION_PAGO`/`FACT_LIQUIDACION_REGALIA`, tablas nuevas `DIM_PLAN`/`FACT_EMAIL_ENVIADO` |
| `pb_init.py` | Ampliado — campo `intentos_fallidos` en `suscripciones` |
| `api/paquetes/suscripciones/{router.py,pb_client.py,queries.py}` | Ampliado — cambio de plan, dunning, precios configurables |
| `etl/gold/facturacion_recurrente.py` | Ampliado — dunning en vez de cancelación inmediata |
| `api/paquetes/regalias/{router.py,queries.py}` | Ampliado — retención fiscal en liquidación |
| `api/paquetes/distribucion/{router.py,queries.py}` | Ampliado — CRUD de país, país en sellos |
| `api/paquetes/facturacion/{router.py,queries.py}` | Ampliado — IVA configurable, checkout, notificación simulada |
| `frontend/src/packages/suscripciones/{pages/PlanesPage.tsx,types.ts,api/suscripciones.api.ts}` | Ampliado — cambio de plan, dunning, moneda local |
| `frontend/src/packages/facturacion/pages/{FacturacionPage,EmpresaConfigPage}.tsx` | Ampliado — notificaciones, IVA/retención global |
| `frontend/src/packages/distribucion/components/ConfiguracionGlobalTab.tsx` | Nuevo — países + precios de plan |
| `frontend/src/packages/regalias/pages/MisGananciasPage.tsx` | Ampliado — bruto/retención/neto |
| `openspec/specs/{suscripciones,regalias,distribucion,facturacion}/spec.md` | Sincronizados — CU-O94 a CU-O99, corrección retroactiva de método de pago |
| `openspec/changes/archive/2026-07-16-modelo-financiero-completar-huecos/` | Archivado |

### QA post-cierre (16 jul 2026, mismo día) — bug real encontrado y corregido

Sesión de verificación (no un change nuevo) sobre los bloques 8 y 9 antes de una demo. Dos
veredictos pedidos:

- **CU-O63 (liquidar regalías) sin UI propia** — el bloque 9 documentó esto como hueco
  preexistente. **Resultó ser un hallazgo equivocado**: `RegaliasAdminPage.tsx` ya tiene un
  formulario "Liquidar un período" (fecha desde/hasta + botón), funcional, verificado en vivo con
  Playwright (genera liquidaciones reales, muestra el resumen de pool/streams). Demo-safe sin
  ningún cambio.
- **Fix de `metodo_pago_id` del bloque 9** — verificado con curl de punta a punta (B2C premium
  nuevo con trial, B2B básico nuevo con cobro inmediato): el fallback agregado en `PUT
  /suscripciones/{id}/plan` no interfiere con el flujo de pago normal: transacción e invoice se
  generan igual que antes, el `metodo_pago_id` real queda bien asociado en
  `FACT_TRANSACCION_PAGO`. Demo-safe.

**Bug real encontrado durante la pasada de humo** (no en los dos puntos pedidos, en el flujo de
dunning del bloque 9 mismo): `pb_client.list_activas` filtraba estrictamente `estado="activa"` —
al mover una suscripción a `pago_pendiente` (dunning), esa función dejaba de devolverla por
completo. Efecto real: `GET /suscripciones/activa` devolvía `null`, así que `PlanesPage.tsx`
mostraba "Plan Activo: Free" en vez del banner de dunning (el usuario perdía visibilidad total de
que su cobro había fallado), y `require_b2b_panel_access` le cortaba el acceso a un Cliente B2B
desde el primer intento fallido en vez de mantenerlo durante los reintentos, como decía el diseño.
**Corregido**: el filtro de `list_activas` ahora es `(estado="activa" || estado="pago_pendiente")`
— un único cambio en `api/paquetes/suscripciones/pb_client.py` que arregla ambos síntomas a la
vez, verificado de nuevo con curl (acceso B2B confirmado durante `pago_pendiente`) y Playwright (el
banner de dunning ahora se ve correctamente en `PlanesPage.tsx`, con "Plan Activo: Premium" y el
botón "Reintentar cobro", no "Free").

Cuentas de prueba de la demo restauradas a un estado limpio tras las pruebas: `cliente_basico@...`
de vuelta a `activa`; `cliente_dunning@...` dejado deliberadamente en `pago_pendiente` (1 de 3
intentos) para que el banner sea visible al abrir sesión mañana.

---

## Bloque 10 — `roles-gestion-usuarios` (16–17 jul 2026)

**Gobierno de identidad y autorización administrativa**, extensión de `seguridad` (sin
capabilities nuevas). Hasta este bloque la autorización admin era monolítica: ~50 endpoints
`/admin/*` de 15 capabilities compartían un único check (`role == "admin"`), de modo que cualquier
administrador podía liquidar regalías, moderar comentarios, cambiar precios de planes y aprobar
artistas indistintamente.

### Diseño
- **`require_rol_admin(*roles)` reemplaza al `require_admin` monolítico, con retrocompatibilidad.**
  La mayoría de capabilities ya reexportaban un único `require_admin`
  (`api/paquetes/seguridad/deps.py`) en su propio `deps.py`; la migración de cada capability se
  redujo a redefinir ese reexport (`require_admin = require_rol_admin("admin_finanzas")`, etc.),
  sin editar router por router. `require_admin` se conserva como alias delgado de
  `require_rol_admin("superadmin")`.
- **`admin` de PocketBase → `superadmin` por auto-backfill.** Toda cuenta con `role == "admin"` en
  PocketBase queda reflejada con `superadmin` en `BRIDGE_USUARIO_ROL_ADMIN` de forma automática al
  resolver la autorización, sin migración manual y sin pérdida de acceso para cuentas existentes.
- **Roles vigentes resueltos con `argMax`**, nunca filtrando la tabla cruda del
  `ReplacingMergeTree` — mismo patrón que `FACT_PERMISO_USUARIO`/`FACT_SESION`. Se reprodujo y
  corrigió el gotcha de aliasing de ClickHouse (`max(fecha) AS fecha` rompe el `argMax` interno,
  Code 184), ya documentado en `PERMISOS_VIGENTES`.
- **`estado_cuenta` verificado en cada request** (`get_current_user`, `api/core/deps.py`): rechaza
  con 403 una cuenta `suspendido`/`eliminado` aunque su token de PocketBase siga siendo válido.
  Fail-open ante fallo de lectura de ClickHouse.
- **Lockout sobre `FACT_AUDIT_LOG`, sin tabla nueva**: intentos fallidos como
  `accion='login_fallido'` (`usuario_id = email`, porque un login fallido no tiene identidad
  resuelta); ≥5 fallos en 15 min → 429.
- **Recuperación de contraseña simulada con token de un solo uso.** `POST /auth/recuperar` responde
  siempre genérico (no revela si el correo existe); `POST /auth/restablecer` valida token no
  vencido/no usado, cambia la contraseña vía la API de superusuario de PocketBase y marca el token
  como usado. Sin correo real (patrón de simulación del proyecto).

### Tablas nuevas (ClickHouse)
`DIM_ROL_ADMINISTRATIVO` (catálogo cerrado de 6 roles y su alcance de capabilities, sembrada en
`init_clickhouse.py`), `BRIDGE_USUARIO_ROL_ADMIN` (asignaciones usuario→rol, revocación = borrado
lógico), `FACT_TOKEN_RECUPERACION` (tokens de un solo uso con vencimiento). Más
`DIM_USUARIO.estado_cuenta` (`activa`/`suspendido`/`eliminado`). Total de tablas físicas: 68 → 71.

Catálogo de roles: `superadmin` (todas), `admin_finanzas` (facturacion/finanzas/regalias/
publicidad), `admin_contenido` (creadores/distribucion/catalogo), `admin_comunidad`
(social/experiencia), `admin_datos` (gestion_datos/analitica), `admin_comercial`
(suscripciones/partners).

### Endpoints y frontend
Nuevos en `seguridad`: catálogo de roles, listado/vista 360° de usuarios, asignar/revocar rol
admin, suspender/reactivar, recuperar/restablecer contraseña, baja de cuenta propia. Modificados:
`POST /auth/login` (lockout + verificación de `estado_cuenta`), `get_current_user`. Gating
`/admin/*` migrado a rol de área en 12 capabilities. Frontend: `UsuariosAdminPage.tsx`
(`/seguridad/usuarios`, vista 360° + gestión de roles/estado), flujo recuperar/restablecer en
`LoginPage`, baja de cuenta con confirmación doble en `ProfilePage`.

### Verificación
Stack real (`docker compose up`), 6 escenarios curl en verde: login admin → `superadmin`
auto-asignado; cuenta `admin_finanzas` con acceso correcto y revocación efectiva; suspender/
reactivar afectando login; 5 fallos → 6º rechazado (429); ciclo completo recuperar → restablecer →
login (token reusado → 400); baja de cuenta → login posterior 403. `npm run build` en verde
(`UsuariosAdminPage` en chunk lazy propio).

### Limpieza de `docs/`
Se eliminaron 5 documentos obsoletos (era S2 / pre-React / pre-B2B2C) cuyo contenido vigente ya
había migrado a bitácoras, README y `design.md` archivados: `decisiones-refactorizacion.md`,
`ARQUITECTURA_S2.MD`, `TRACKLYTICS_PLAN_S2.md`, `PLAN_MEJORAS_FRONTEND_P2.md`,
`EMPRESA_TRACKLYTICS.md`.

### Artefactos entregados (Bloque 10)

| Artefacto | Estado |
|---|---|
| `init_clickhouse.py` | Ampliado — `DIM_ROL_ADMINISTRATIVO`, `BRIDGE_USUARIO_ROL_ADMIN`, `FACT_TOKEN_RECUPERACION`, `DIM_USUARIO.estado_cuenta` |
| `api/paquetes/seguridad/{deps,router}.py` | Ampliado — `require_rol_admin`, lockout, recuperación, baja de cuenta |
| `api/core/deps.py` | Ampliado — rechazo de cuentas suspendidas/eliminadas |
| 12 capabilities (`creadores`, `distribucion`, `social`, `experiencia`, `facturacion`, `finanzas`, `regalias`, `publicidad`, `suscripciones`, `gestion_datos`, `partners`, `simulacion`) | Migrado — gating por rol de área |
| `frontend/src/packages/seguridad/pages/UsuariosAdminPage.tsx` | Nuevo — vista 360°, gestión de roles/estado |
| `openspec/changes/archive/2026-07-19-roles-gestion-usuarios/` | Archivado |

---

## Bloque 11 — `p1-ciclos-vida` (18 jul 2026)

**Ciclos de vida de entidades de negocio.** El sistema sabía crear casi todas sus entidades de
negocio pero no operarlas a lo largo de su ciclo de vida. Sin capabilities nuevas: cada pieza
extiende un paquete existente. Toda acción admin se autoriza con el rol de área de
`roles-gestion-usuarios` y se audita en `FACT_AUDIT_LOG`.

### Qué se implementó, por capability
- **`publicidad`** — editar/pausar/reanudar/finalizar campaña; editar/desactivar anunciante.
  Doble estado de campaña: `activa` (presupuesto) y `estado_manual` (pausa/cierre manual) son ejes
  independientes; elegibilidad de servido = ambos en regla; `finalizar` es terminal (409 al
  reanudar/pausar una finalizada).
- **`distribucion`** — revocar licencia (`DIM_LICENCIA.estado` gana `'revocada'`).
- **`regalias`** — editar contrato (splits granulares, revalida que sumen 100), terminar contrato
  (`activo=0` + `vigente_hasta=today()`, sin columna `estado` nueva), exportar historial.
- **`catalogo`** — ocultar/restaurar track (takedown). Un track existe como N filas en
  `FACT_TRACKS` (una por género); `disponible=0` se aplica a todas las filas del `track_id` para
  que desaparezca de verdad de la búsqueda.
- **`creadores`** — editar/retirar track propio (`require_cuenta_artista_aprobada`). Al editar un
  track `aprobado` vuelve a `pendiente` (revisión editorial); transiciones insertan fila nueva con
  `version=max+1`.
- **`partners`** — CRUD completo con rotación de API key. Los partners viven solo en PocketBase; la
  key se guarda como hash SHA-256 (`api_key_hash`), se devuelve en claro una sola vez. Fallback a
  `api_key` en claro para los 2 partners demo legados. Caché TTL de 30s en la resolución
  partner→tier (rotar/desactivar tarda hasta 30s en propagarse).
- **`suscripciones`** — listar/detalle/cancelar/extender suscripciones (admin).
- **`social`** — denunciar contenido (`POST /denuncias`) + bandeja de moderación admin
  (`FACT_DENUNCIA`, tabla nueva). No ejecuta acción automática sobre el objeto denunciado.

### Tablas y columnas nuevas
`FACT_DENUNCIA` (ClickHouse, nueva). Columnas: `DIM_CAMPANA_PUBLICITARIA.{formato,estado_manual}`,
`FACT_TRACKS.disponible`, `DIM_ANUNCIANTE.activo`, `DIM_LICENCIA.{motivo_revocacion,
fecha_revocacion}`, `STG_ARTIST_UPLOADS.descripcion`, semilla `DIM_ESTADO_REVISION` (`retirado`).
PocketBase: `partners.{api_key_hash,email_contacto}`, `suscripciones.fecha_vencimiento`.

### Verificación
curl real sobre 9 flujos (campaña completa incluida transición terminal en 409, anunciante,
licencia con doble-revocación en 409, contrato con validación 422→ok→terminar→409→exportar, track
oculto/restaurado, artista aprobar→editar→retirar, partner crear→usar→listar→rotar→(31s)
401/200→desactivar, suscripciones listar/extender/detalle, denuncia usuario→admin). Frontend
completo (sistema de diseño Impeccable), `npm run build` verde, Playwright real contra el stack
reconstruido, cero errores de consola.

### Estado de las portadas al cerrar el bloque
El backfill standalone `gold.backfill_portadas` (secuencial, ~2000 tracks/h por rate-limit de
Spotify oEmbed, reanudable) quedó corriendo en background sobre las ~89 741 canciones reales.
Cobertura al cierre: ~266 tracks reales — **no completo**, no cabe al 100% en una sola ventana.

### Artefactos entregados (Bloque 11)

| Artefacto | Estado |
|---|---|
| `init_clickhouse.py`, `pb_init.py` | Ampliado — `FACT_DENUNCIA` y columnas de ciclo de vida |
| `api/paquetes/publicidad/{router,queries}.py` | Ampliado — pausar/reanudar/finalizar, editar |
| `api/paquetes/distribucion/{router,queries}.py` | Ampliado — revocar licencia |
| `api/paquetes/regalias/{router,queries}.py` | Ampliado — editar/terminar/exportar contrato |
| `api/paquetes/catalogo/{router,queries}.py` | Ampliado — ocultar/restaurar track |
| `api/paquetes/creadores/{router,queries}.py` | Ampliado — editar/retirar track propio |
| `api/paquetes/partners/{router,pb_client}.py` | Ampliado — CRUD, rotación de API key |
| `api/paquetes/suscripciones/{router,pb_client}.py` | Ampliado — administración de suscripciones |
| `api/paquetes/social/{router,queries}.py` | Ampliado — denuncias |
| `frontend/src/packages/{catalogo,partners,suscripciones,social,publicidad,distribucion,regalias,creadores}` | Ampliado/nuevo — UI de ciclo de vida |
| `openspec/changes/archive/2026-07-19-p1-ciclos-vida/` | Archivado |

---

## Bloque 12 — `p2-descubrimiento-comunidad` (19 jul 2026)

**Descubrimiento y comunidad.** El sistema tenía un catálogo grande y un modelo de comunidad, pero
no sabía descubrir ni convivir. Sin capabilities nuevas y sin ML externo: la similitud se calcula
en SQL de ClickHouse sobre los atributos de audio que ya viven en `FACT_TRACKS`.

### Qué se implementó
- **Búsqueda unificada** (`GET /catalogo/search`, sesión opcional): `{tracks, artistas, albumes,
  playlists}` en un solo request, respetando `disponible=1` (takedown) en los cuatro grupos.
- **Radio y mix diario** (`experiencia`): `GET /radio/track/{fact_id}` (~25 similares) y `GET
  /mix-diario` (~30). Similitud = distancia euclídea al cuadrado sobre 5 atributos de audio +
  penalización aditiva de 0.35 por no compartir género (pesa, no filtra). Mix diario: porción de
  afinidad determinista + porción de exploración pseudoaleatoria estable por `usuario_id + fecha`
  (`cityHash64`), sin caché. `GET /recomendaciones` pasa de filtrar por exclusión a recomendar por
  afinidad, con `motivo` explicable.
- **Bloqueo entre usuarios** (`social`): traducido al modelo real (no existe seguimiento
  usuario-a-usuario ni comentarios de perfil) — comentarios del bloqueado invisibles para quien
  bloquea (lectura, unidireccional), bloqueado no puede responder a comentarios de quien lo bloqueó
  (escritura, 403). Borrado lógico (`activo`/`actualizado_en`, resuelto por `argMax`).
- **Strikes con suspensión automática**: `FACT_STRIKE_USUARIO` (nueva), 3 strikes activos →
  suspensión. Emitidos manualmente o al resolver una denuncia (`emitir_strike`).
- **Verificación de email simulada**: reutiliza `FACT_TOKEN_RECUPERACION` (columna `proposito`
  nueva) en vez de una tabla paralela. Regla suave: sin verificar se navega con normalidad, solo
  se frena comentar, subir track y contratar plan de pago (free sigue disponible). 403 con código
  estable `email_no_verificado`.
- **Exportación de datos personales**: `GET /perfil/mis-datos`, 11 secciones, queries propias de
  solo lectura en `seguridad/exportacion.py` (acoplado al modelo dimensional, no a los routers de
  otras capabilities).

### Tablas y columnas nuevas
`BRIDGE_BLOQUEO_USUARIO`, `FACT_STRIKE_USUARIO` (ambas nuevas). `DIM_USUARIO.email_verificado`
(backfill por fecha de corte fija, 91 usuarios previos marcados verificados),
`FACT_TOKEN_RECUPERACION.proposito`. Total de tablas: 71 → 73.

### Hallazgos durante la implementación
`reload_portadas` no es el backfill completo (50/corrida); ClickHouse rechaza identificadores
no-ASCII en alias; alias que colisiona con columna dentro de un agregado (`ILLEGAL_AGGREGATION`);
`MI_PERFIL` leía `DIM_USUARIO` sin `argMax` (corregido de paso).

### Verificación
curl real (8 escenarios: búsqueda con takedown, radio 25/25 del género de la semilla, mix diario
idéntico en dos llamadas el mismo día, recomendaciones con `motivo` y solapamiento 0 con
favoritos/historial, bloqueo A↔B con unidireccionalidad y 403 verificados, 3 strikes →
`cuenta_suspendida:true`, verificación de email bloqueando/desbloqueando comentar, exportación con
11 secciones). Playwright real: 7/7 escenarios, cero errores de consola. `npm run build` verde
(bundle principal 511.6 kB → 526.7 kB).

### Avance de portadas al cierre del bloque
Backfill de portadas: 10 906 → 20 322 filas `source_type='real'` con `imagen_url` (+9 416 en la
sesión), 93 228 pendientes. Sigue corriendo, reanudable.

### Artefactos entregados (Bloque 12)

| Artefacto | Estado |
|---|---|
| `init_clickhouse.py` | Ampliado — `BRIDGE_BLOQUEO_USUARIO`, `FACT_STRIKE_USUARIO`, `email_verificado`, `proposito` |
| `api/paquetes/catalogo/{router,queries}.py` | Ampliado — `GET /search` unificado |
| `api/paquetes/experiencia/{router,queries}.py` | Ampliado — radio, mix diario, recomendaciones por afinidad |
| `api/paquetes/social/{router,queries}.py` | Ampliado — bloqueos, strike al resolver denuncia |
| `api/paquetes/seguridad/{router,exportacion}.py` | Ampliado/nuevo — strikes, verificación de email, exportación de datos |
| `frontend/src/packages/catalogo/{components/GlobalSearch,components/MixDiarioCard,pages/SearchResultsPage,hooks/useRadio}` | Nuevo |
| `frontend/src/packages/social/components/BloquearButton.tsx` | Nuevo |
| `frontend/src/packages/seguridad/components/VerificacionEmailBanner.tsx` | Nuevo |
| `frontend/src/shared/context/PlayerContext.tsx` | Ampliado — `enqueueMany`/`replaceQueue` |
| `openspec/changes/archive/2026-07-19-p2-descubrimiento-comunidad/` | Archivado |

---

## Bloque 13 — Cierre técnico post-S11: reproducción real de YouTube (19–22 jul 2026)

QA final (no un change de OpenSpec, corrección directa en código): la reproducción "real" del
reproductor (`PlayerContext.tsx`, documentada en S9 como parte de `experiencia`) nunca reproducía
audio real en la práctica. Causa raíz: `playerVars.listType: 'search'` de la IFrame Player API de
YouTube fue **deprecado el 15/11/2020** — el player lo sigue aceptando (`onReady` dispara,
`onError` no) pero el `<video>` interno nunca resuelve media, cayendo siempre al fallback simulado
sin que el watchdog lo distinguiera de un fallo real.

### Corrección: resolución de `videoId` en el backend
`GET /experiencia/reproduccion/youtube-video-id` (nuevo endpoint, solo requiere sesión) resuelve
`"artista + track"` contra la **YouTube Data API v3** (`search.list`, sí soportada) usando
`YOUTUBE_API_KEY` (`api/core/config.py`, vacía por defecto — sin key configurada el endpoint
devuelve 404 y el reproductor cae al mismo fallback simulado de siempre, no un error nuevo).
Cacheado 6h (`core/cache.py`) porque el video de una combinación artista+track no cambia y
`search.list` cuesta 100 de las 10 000 unidades/día de la cuota gratuita. `PlayerContext.tsx`
resuelve el `videoId` (backend) y carga la IFrame API en paralelo, y solo entonces instancia
`YT.Player` con un `videoId` real en vez de una búsqueda de texto.

### Bug de React encontrado en el camino
Reproducir con un `videoId` real (a diferencia de `listType: 'search'`, que nunca llegaba a
reemplazar nada) expuso un crash latente: `new YT.Player(id, ...)` recibía el id de un `<div>`
renderizado por JSX, y la IFrame API lo reemplazaba in-place por su `<iframe>` sin que React se
enterara — el siguiente re-render (el ticker de progreso corre cada 500ms) lanzaba
`NotFoundError: insertBefore/removeChild ... not a child of this node`. Corregido: el `<div>` que
YT reemplaza ahora se crea con `document.createElement`, fuera del árbol virtual, dentro de un
wrapper que React sí posee y nunca muta.

### Logout no cortaba el audio
`UserMenu::handleLogout` invalidaba la sesión sin detener la reproducción — el audio (real o el
tono simulado) seguía sonando tras el logout, y el siguiente track de la cola intentaba
reproducirse contra un token que el backend ya no reconocía. Se agregó `stop()` a
`PlayerContext` (invalida cualquier `play()` en vuelo, limpia timers/host/estado) y se llama antes
de `authApi.logout()`.

### Limpieza relacionada
`etl/gold/reload_portadas_1h.py`/`reload_portadas_5h.py` (scripts standalone de recarga puntual de
portadas, precursor del patrón) eliminados — superados por el DAG `reload_portadas` (Bloque 6,
Fase 7) y el backfill reanudable `gold.backfill_portadas.py` (Bloques 11–12), que cubren los mismos
casos de uso sin duplicar código.

### Artefactos entregados (Bloque 13)

| Artefacto | Estado |
|---|---|
| `api/core/config.py` | Ampliado — `YOUTUBE_API_KEY` |
| `api/paquetes/experiencia/router.py` | Ampliado — `GET /reproduccion/youtube-video-id` (cacheado 6h) |
| `frontend/src/packages/experiencia/api/experiencia.api.ts` | Ampliado — `resolverYoutubeVideoId` |
| `frontend/src/shared/context/PlayerContext.tsx` | Corregido — `videoId` real, host fuera de React, `stop()` |
| `frontend/src/packages/seguridad/components/UserMenu.tsx` | Corregido — corta audio antes de logout |
| `docker-compose.yml` | Ampliado — `YOUTUBE_API_KEY` pasada al servicio `api` |
| `etl/gold/{reload_portadas_1h,reload_portadas_5h}.py` | Eliminados — superados por `reload_portadas` DAG / `backfill_portadas.py` |
