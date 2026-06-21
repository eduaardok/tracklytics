## 1. FastAPI: disparo y monitoreo de ingesta

- [ ] 1.1 Implementar endpoint `POST /app/v1/ingesta/ejecuciones` que recibe el período/lote a integrar y dispara la ejecución correspondiente en Airflow (RF-ING-001)
- [ ] 1.2 Implementar parámetro explícito de recarga forzada en la solicitud de disparo, deshabilitado por defecto (RN-ING-001)
- [ ] 1.3 Implementar endpoint `GET /app/v1/ingesta/ejecuciones/{id}` que reporta en tiempo real la etapa actual (extracción, transformación a staging, carga a ClickHouse) (RF-ING-002)

## 2. Pipeline: control de idempotencia

- [ ] 2.1 Implementar verificación atómica contra `ETL_BATCH_CONTROL` antes de iniciar la carga de un período/lote (RF-ING-003, RNF-ING-002)
- [ ] 2.2 Detener la ejecución sin insertar si el período ya está marcado como cargado y no se indicó recarga forzada (RN-ING-001, Escenario 2, CA-ING-002)
- [ ] 2.3 Marcar el período como "en curso" de forma atómica antes de iniciar la ejecución en Airflow, para evitar disparos simultáneos del mismo período

## 3. Pipeline: carga a ClickHouse y auditoría

- [ ] 3.1 Implementar la etapa de carga a ClickHouse con inserciones en lotes de mínimo 50.000 filas (RNF-ING-001)
- [ ] 3.2 Medir y validar que una recarga completa (~800k registros) se completa en segundos respetando el tamaño mínimo de batch (Escenario 1, CA-ING-001)
- [ ] 3.3 Registrar cada ejecución (exitosa o fallida) en `ETL_LOGS` con timestamp, período, registros leídos, insertados, rechazados y duración total (RF-ING-004, RNF-ING-003, CA-ING-003)
- [ ] 3.4 Calcular la tasa de rechazo de cada carga y marcarla como "requiere revisión" cuando supere el 1% (RN-ING-002, Escenario 3)

## 4. FastAPI: historial y calidad de cargas

- [ ] 4.1 Implementar endpoint `GET /app/v1/ingesta/cargas` que retorna el historial completo de cargas con sus métricas de calidad (tasa de rechazo, duración) (RF-ING-005)
- [ ] 4.2 Implementar endpoint o sección de la respuesta que indica la última carga realizada y sus métricas de integridad (RF-ING-006)

## 5. FastAPI: CRUD de dimensiones del catálogo

- [ ] 5.1 Implementar endpoints CRUD sobre las tablas de dimensión técnica (artistas, álbumes, géneros y demás dimensiones) en ClickHouse (RF-ING-007)
- [ ] 5.2 Asegurar que no existe ningún endpoint de escritura sobre `FACT_TRACKS`; la interfaz de gestión solo permite lectura sobre la tabla de hechos (RF-ING-008, RN-ING-003, CA-ING-004)
- [ ] 5.3 Implementar verificación de referencias en `FACT_TRACKS` antes de eliminar un valor de dimensión, exigiendo un parámetro de confirmación explícita cuando existan referencias (RN-ING-004, Escenario 4)

## 6. Frontend: interfaz de gestión de ingesta

- [ ] 6.1 Construir vista de disparo de ingesta con selección de período/lote y opción de recarga forzada
- [ ] 6.2 Construir vista de monitoreo en tiempo real del estado del pipeline por etapa
- [ ] 6.3 Construir vista de historial de cargas con indicador de tasa de rechazo y señal visual de "requiere revisión"
- [ ] 6.4 Construir vista de indicador de la última carga y sus métricas de integridad
- [ ] 6.5 Construir interfaz CRUD para las dimensiones del catálogo, sin exponer ninguna acción de edición directa sobre la tabla de hechos
- [ ] 6.6 Mostrar diálogo de confirmación explícita al intentar eliminar una dimensión referenciada por la tabla de hechos

## 7. Verificación end-to-end

- [ ] 7.1 Verificar CA-ING-001: un lote nuevo se carga completo en segundos respetando el tamaño mínimo de batch
- [ ] 7.2 Verificar CA-ING-002: un período ya cargado no genera registros duplicados en una segunda ejecución
- [ ] 7.3 Verificar CA-ING-003: toda ejecución de ingesta queda registrada en el log con sus métricas completas
- [ ] 7.4 Verificar CA-ING-004: el Lead Data Engineer puede realizar CRUD sobre dimensiones sin poder editar directamente la tabla de hechos
