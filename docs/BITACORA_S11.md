# Bitácora de Desarrollo — Semana 11
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 11 de 16
**Fecha:** 13–14 de julio de 2026
**Cierre de semana:** cierre del modelo de monetización freemium (publicidad display, churn con
motivo, trial + plan estudiante, funnel/P&L), corrección de un bug real de control de acceso
(admin podía suscribirse y facturar), cierre del modelo financiero completo (liquidación
idempotente, renovación con cancelación en cobro fallido, retiro de regalías, MRR/ARR), una
capability nueva, `simulacion`, para demostrar el flujo de dinero de punta a punta sin operar la
app manualmente a escala, el cierre de calidad de datos del catálogo (año/país plausibles,
coherencia audio-género, recalificación administrativa en bloque, mismo criterio también en la
subida de tracks por artistas), y una ronda de revisión manual de producto que encuentra y corrige
6 hallazgos reales (exención de ads para artistas, disclosure de cobro del trial, disponibilidad
por país como lista navegable, moneda incorrecta en facturas, tags de stack técnico en el login).

---

## Resumen ejecutivo

La semana 11 se organiza en dos changes de OpenSpec consecutivas. La primera,
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
