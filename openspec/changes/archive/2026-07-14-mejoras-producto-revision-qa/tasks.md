## 1. Exención de anuncios para artistas aprobados

- [x] 1.1 En `api/paquetes/publicidad/router.py`, agregar `from paquetes.creadores.queries import CUENTA_ACTUAL_POR_USUARIO` y una función `_es_artista_aprobado(usuario_id: str) -> bool` que consulte esa query y verifique `estado_cuenta == 'aprobada'`.
- [x] 1.2 Modificar `_plan_de_usuario` (línea ~29) o los dos call sites (`registrar_impresion` línea ~112, `registrar_impresion_display` línea ~136) para que, si `_es_artista_aprobado(user["record"]["id"])` es verdadero, se comporte igual que un plan pago (`campana: None`) sin importar `tipo_plan`.
- [x] 1.3 Confirmar que no se rompe ningún flujo existente: un usuario con plan pago sigue sin ver anuncios, un usuario free sin cuenta de artista los sigue viendo.

## 2. Disclosure de fecha de cobro antes de confirmar el trial

- [x] 2.1 En `api/paquetes/suscripciones/router.py::listar_planes`, agregar `elegible_trial: bool` al plan `premium` de la respuesta, calculado con `pb_client.list_historial_por_plan` (misma condición que ya usa `confirmar_suscripcion` para decidir `en_trial`).
- [x] 2.2 En `frontend/src/packages/suscripciones/types.ts`, agregar `elegible_trial?: boolean` al tipo `Plan`, y declarar `DIAS_TRIAL_PREMIUM = 7` con un comentario explícito de que debe coincidir con la constante real del backend.
- [x] 2.3 En `PlanesPage.tsx`, en el formulario de confirmación del plan premium (antes del botón de confirmar), agregar un texto visible cuando `selectedPlan.elegible_trial` es verdadero: "Tu prueba gratuita dura 7 días. A partir del [fecha calculada] se te cobrará el precio del plan, salvo que canceles antes." La fecha se calcula como `hoy + DIAS_TRIAL_PREMIUM` días, formateada con el mismo helper de fecha ya usado en la página.
- [x] 2.4 Verificar que este texto NO aparece para planes sin trial (estudiante, B2B) ni para una segunda confirmación de premium (usuario que ya tuvo una suscripción previa, `elegible_trial=false`).

## 3. Endpoint de lista de disponibilidad por país

- [x] 3.1 En `api/paquetes/distribucion/queries.py`, agregar `disponibilidad_lista_sql(where: str) -> str` — `SELECT f.fact_id AS fact_id_track, f.track_name AS track_name, a.name AS artist_name, b.tipo_restriccion_id IS NULL AS disponible, t.nombre AS tipo_restriccion FROM FACT_TRACKS f JOIN DIM_ARTISTS a ON f.artist_id = a.artist_id LEFT JOIN BRIDGE_RESTRICCION_TRACK b ON b.fact_id_track = f.fact_id AND b.pais_id = {pais_id:UInt16} AND b.canal_id = {canal_id:UInt16} AND b.activo = 1 LEFT JOIN DIM_TIPO_RESTRICCION t ON b.tipo_restriccion_id = t.tipo_restriccion_id {where} ORDER BY f.fact_id LIMIT {limit:UInt32} OFFSET {offset:UInt32}` y una variante de conteo `disponibilidad_lista_total_sql(where: str)`. El filtro de estado se aplica en `{where}` sobre `b.tipo_restriccion_id IS NULL` (disponible) / `IS NOT NULL` (bloqueado) — nunca sobre el alias `disponible`, mismo criterio ya documentado en el proyecto para evitar el error de ClickHouse "ILLEGAL_AGGREGATION" al filtrar sobre un alias calculado.
- [x] 3.2 En `api/paquetes/distribucion/router.py`, agregar `GET /app/v1/distribucion/disponibilidad` (antes de la ruta `/disponibilidad/{fact_id_track}` para que FastAPI no la capture como `fact_id_track`), protegido por `require_b2c_user`, con query params `page`, `limit`, `estado: Literal['todos','disponible','bloqueado']='todos'`, `search: str = ''`, `pais_id: int | None = None`. Si `pais_id` no se indica, resolver el país del usuario con `resolver_pais_id` (mismo criterio fail-open ya usado: si no se reconoce, devolver todos como disponibles). Si se indica, validar con `PAIS_EXISTE`.
- [x] 3.3 El endpoint arma el `where` combinando el filtro de estado y, si `search` no está vacío, `position(lower(f.track_name), lower({search:String})) > 0 OR position(lower(a.name), lower({search:String})) > 0` (mismo patrón ya usado en `gestion_datos/router.py::facts_list`). Devuelve `{data, page, limit, total, pais_id}`.
- [x] 3.4 En el caso de país no reconocido (fail-open), devolver la página completa con `disponible=true` en cada fila sin hacer el JOIN de restricciones (o ignorando su resultado), consistente con el comportamiento ya vigente del endpoint puntual.

## 4. Frontend: vista de lista para disponibilidad por país

- [x] 4.1 En `frontend/src/packages/distribucion/types.ts`, agregar `DisponibilidadListaRow` y `DisponibilidadListaResponse` (mismo shape que el endpoint de la tarea 3).
- [x] 4.2 En `frontend/src/packages/distribucion/api/distribucion.api.ts`, agregar `disponibilidadLista(params)` apuntando al nuevo endpoint.
- [x] 4.3 Rediseñar `DisponibilidadPage.tsx`: mantiene el buscador existente (`TrackPicker`) como acceso directo a un track puntual, y agrega debajo una tabla paginada con columnas Track/Artista/Estado, un filtro de estado (disponible/bloqueado/todos) y un campo de búsqueda por texto que llama al nuevo endpoint con `search` — mismo patrón visual de tabla+paginación ya usado en `CrudDimensionesPage`/`EtlPage`.

## 5. Specs y verificación

- [x] 5.1 Sincronizar las delta specs de `publicidad`, `suscripciones` y `distribucion` hacia sus specs principales, agregando la fila de trazabilidad CU-O80 (nuevo requirement de `distribucion`) a la tabla de trazabilidad.
- [x] 5.2 Verificar con `docker compose` real: una cuenta de artista aprobada no recibe anuncios de audio ni display al reproducir/cargar pantallas; el formulario de premium muestra la fecha de cobro antes de confirmar y no la muestra en una segunda confirmación; la lista de disponibilidad por país devuelve resultados paginados y filtrables sin necesidad de buscar un track por nombre, y el endpoint puntual existente sigue funcionando sin cambios.
