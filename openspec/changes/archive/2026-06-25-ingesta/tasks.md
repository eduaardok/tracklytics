## 1. FastAPI: disparo y monitoreo de ingesta

- [x] 1.1 Implementar endpoint `POST /app/v1/ingesta/ejecuciones` que recibe el período/lote a integrar y dispara la ejecución correspondiente en Airflow (RF-ING-001)
- [x] 1.2 Implementar parámetro explícito de recarga forzada en la solicitud de disparo, deshabilitado por defecto (RN-ING-001) — campo `forzar_recarga: bool = false`
- [x] 1.3 Implementar endpoint `GET /app/v1/ingesta/ejecuciones/{id}` que reporta en tiempo real la etapa actual (extracción, transformación a staging, carga a ClickHouse) (RF-ING-002) — lee `taskInstances` de Airflow y mapea cada `task_id` de la DAG a su etapa

## 2. Pipeline: control de idempotencia

- [x] 2.1 Implementar verificación atómica contra `ETL_BATCH_CONTROL` antes de iniciar la carga de un período/lote (RF-ING-003, RNF-ING-002)
- [x] 2.2 Detener la ejecución sin insertar si el período ya está marcado como cargado y no se indicó recarga forzada (RN-ING-001, Escenario 2, CA-ING-002) — verificado con curl (409)
- [x] 2.3 Marcar el período como "en curso" de forma atómica antes de iniciar la ejecución en Airflow, para evitar disparos simultáneos del mismo período. **Desviación de diseño documentada**: `ETL_BATCH_CONTROL` no tiene una columna de estado y el Migration Plan prohíbe modificar el modelo de datos técnico; el guard se implementa consultando dagRuns activos (`state=queued|running`) en Airflow, serializado con un `asyncio.Lock` de proceso para cerrar la ventana de carrera entre la verificación y el disparo. Verificado empíricamente con dos disparos simultáneos: se encontraron y corrigieron dos bugs reales durante la verificación (ver design.md) antes de que el guard rechazara correctamente la segunda solicitud con 409.

## 3. Pipeline: carga a ClickHouse y auditoría

- [x] 3.1 Implementar la etapa de carga a ClickHouse con inserciones en lotes de mínimo 50.000 filas (RNF-ING-001) — ya implementado en el pipeline existente (`etl/gold/loader.py`), sin cambios
- [x] 3.2 Medir y validar que una recarga completa (~800k registros) se completa en segundos respetando el tamaño mínimo de batch (Escenario 1, CA-ING-001) — verificado con curl: recargas de semana completas (113k–913k registros) completadas en 30–80 segundos
- [x] 3.3 Registrar cada ejecución (exitosa o fallida) en `ETL_LOGS` con timestamp, período, registros leídos, insertados, rechazados y duración total (RF-ING-004, RNF-ING-003, CA-ING-003) — el camino exitoso ya existía; se agregó `task_log_failure` (trigger_rule=ONE_FAILED) a la DAG para cubrir el camino de fallo, que antes no generaba ninguna fila en ETL_LOGS
- [x] 3.4 Calcular la tasa de rechazo de cada carga y marcarla como "requiere revisión" cuando supere el 1% (RN-ING-002, Escenario 3) — campo `tasa_rechazo_pct` + `requiere_revision` en `GET /app/v1/ingesta/cargas`

## 4. FastAPI: historial y calidad de cargas

- [x] 4.1 Implementar endpoint `GET /app/v1/ingesta/cargas` que retorna el historial completo de cargas con sus métricas de calidad (tasa de rechazo, duración) (RF-ING-005)
- [x] 4.2 Implementar endpoint o sección de la respuesta que indica la última carga realizada y sus métricas de integridad (RF-ING-006) — campo `ultima_carga` en la misma respuesta

## 5. FastAPI: CRUD de dimensiones del catálogo

- [x] 5.1 Implementar endpoints CRUD sobre las tablas de dimensión técnica (artistas, álbumes, géneros y demás dimensiones) en ClickHouse (RF-ING-007) — ya existían (`/dim/{table}`); se mantienen
- [x] 5.2 Asegurar que no existe ningún endpoint de escritura sobre `FACT_TRACKS`; la interfaz de gestión solo permite lectura sobre la tabla de hechos (RF-ING-008, RN-ING-003, CA-ING-004) — verificado con curl: POST/PUT/DELETE sobre `/facts` devuelven 404/405
- [x] 5.3 Implementar verificación de referencias en `FACT_TRACKS` antes de eliminar un valor de dimensión, exigiendo un parámetro de confirmación explícita cuando existan referencias (RN-ING-004, Escenario 4) — `DELETE /dim/{table}/{id}` devuelve 409 si hay referencias y no se pasa `confirmar=true`; verificado con curl (género real referenciado → 409; valor sin referencias → 204)

## 6. Frontend: interfaz de gestión de ingesta

- [x] 6.1 Construir vista de disparo de ingesta con selección de período/lote y opción de recarga forzada — `etl.html`, checkbox "Forzar recarga"
- [x] 6.2 Construir vista de monitoreo en tiempo real del estado del pipeline por etapa — `etl.html`, `stage-tracker` con badges por etapa, poll cada 5s contra `GET /app/v1/ingesta/ejecuciones/{id}`
- [x] 6.3 Construir vista de historial de cargas con indicador de tasa de rechazo y señal visual de "requiere revisión" — `etl.html`, columna "Tasa Rechazo" con badge
- [x] 6.4 Construir vista de indicador de la última carga y sus métricas de integridad — `etl.html`, panel "Estado del Último Run" alimentado por `ultima_carga`
- [x] 6.5 Construir interfaz CRUD para las dimensiones del catálogo, sin exponer ninguna acción de edición directa sobre la tabla de hechos — ya existía (`crud.html`), se mantiene el badge "Solo lectura" sobre FACT_TRACKS
- [x] 6.6 Mostrar diálogo de confirmación explícita al intentar eliminar una dimensión referenciada por la tabla de hechos — `crud.html`, maneja 409 con un segundo `confirm()` y reintenta con `confirmar=true`

## 7. Verificación end-to-end

- [x] 7.1 Verificar CA-ING-001: un lote nuevo se carga completo en segundos respetando el tamaño mínimo de batch — verificado (semanas 2, 3, 4, 5, 6, 8, 9 cargadas en 30–80s cada una)
- [x] 7.2 Verificar CA-ING-002: un período ya cargado no genera registros duplicados en una segunda ejecución — verificado con curl (409 sin `forzar_recarga`)
- [x] 7.3 Verificar CA-ING-003: toda ejecución de ingesta queda registrada en el log con sus métricas completas — verificado vía `ETL_LOGS` tras cada disparo; camino de fallo cubierto por `task_log_failure` (no se forzó un fallo real para no corromper datos, validado por inspección de la DAG y `has_import_errors: false`)
- [x] 7.4 Verificar CA-ING-004: el Lead Data Engineer puede realizar CRUD sobre dimensiones sin poder editar directamente la tabla de hechos — verificado con curl (CRUD funcional sobre dimensiones; POST/PUT/DELETE sobre `/facts` → 404/405)

## Gating de acceso (no listado originalmente en tasks.md, agregado durante la implementación)

- [x] Aplicar `require_lead_data_engineer` (role=admin) a todo el router `gestion_datos`, tanto a los endpoints legacy (`/etl/*`, `/dim/*`, `/facts`, `/data-quality`) como a los nuevos `/app/v1/ingesta/*` — antes no existía ningún control de acceso sobre estos endpoints
