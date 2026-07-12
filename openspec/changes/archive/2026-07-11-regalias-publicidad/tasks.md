## 1. Modelo de datos (9 tablas nuevas)

- [x] 1.1 `init_clickhouse.py`: `DIM_PRODUCTOR`, `BRIDGE_PRODUCTOR_TRACK`, `DIM_CUENTA_SELLO`, `DIM_CONTRATO_REGALIA`, `FACT_LIQUIDACION_REGALIA`.
- [x] 1.2 `init_clickhouse.py`: `DIM_ANUNCIANTE`, `DIM_CAMPANA_PUBLICITARIA`, `FACT_IMPRESION_ANUNCIO`, `FACT_INGRESO_PUBLICITARIO`.
- [x] 1.3 Ejecutar `init_clickhouse.py` contra ClickHouse vivo y confirmar las 9 tablas creadas.

## 2. Backend `regalias`

- [x] 2.1 `api/paquetes/regalias/queries.py`: queries de productores, contratos, cuentas de sello, streams por track/periodo, agregación de ingreso (transacciones + publicitario), ganancias por artista/sello.
- [x] 2.2 `api/paquetes/regalias/router.py`: `POST /admin/productores`, `POST /admin/productores/{id}/tracks/{fact_id}`, `POST /admin/contratos` (valida suma=100), `POST /admin/cuentas-sello`, `POST /admin/liquidar` (rango de fechas), `GET /artista/mis-ganancias`, `GET /sello/mis-ganancias`.
- [x] 2.3 `api/paquetes/regalias/deps.py`: `require_cuenta_sello` (análogo a `require_cuenta_artista_aprobada`).
- [x] 2.4 Registrar el router en `api/main.py`.
- [x] 2.5 Verificado con curl: creado productor + contrato (sello 50/40/10 master, 20/80 publishing) + cuenta de sello; 5 streams reales del track vía `/biblioteca/historial`; liquidado el período → 3 liquidaciones (sello $15.39, artista $16.79, productor $2.80, suman exactamente el `track_revenue` calculado). Contrato con porcentajes desbalanceados → 422 confirmado.

## 3. Backend `publicidad`

- [x] 3.1 `api/paquetes/publicidad/queries.py`: campañas elegibles, inserción de impresión/ingreso, agregación de ingreso por campaña/periodo.
- [x] 3.2 `api/paquetes/publicidad/router.py`: `POST /admin/anunciantes`, `POST /admin/campanas`, `POST /impresion` (selecciona campaña elegible para el usuario si su plan es free), `POST /impresion/{id}/completar` (reconoce ingreso real), `GET /admin/ingresos`.
- [x] 3.3 Registrar el router en `api/main.py`.
- [x] 3.4 Verificado con curl: usuario free recibe impresión real (campaña + cpm); completarla generó fila real en `FACT_INGRESO_PUBLICITARIO` (monto = cpm/1000, verificado 8.0/1000 = 0.008); reconfirmado también end-to-end en navegador (Playwright).

## 4. Ejecución periódica real (cron, no disparo manual)

- [x] 4.1 `etl/gold/facturacion_recurrente.py`: renovación real de suscripciones vencidas (≥30 días desde el último cobro exitoso), replica `procesar_pago` (ver design.md, Decisión 5).
- [x] 4.2 `etl/gold/regalias_liquidacion.py`: liquidación real de regalías para el período del DAG run (`data_interval_start/end`).
- [x] 4.3 `etl/dags/finanzas_periodicas_dag.py`: `schedule_interval="@weekly"`, `task_facturacion_recurrente >> task_liquidacion_regalias`.
- [x] 4.4 Verificado: DAG carga sin errores de import (`airflow dags list-import-errors`), aparece registrado y se dispara. Ambas funciones invocadas directamente contra datos reales del período de hoy: `facturacion_recurrente` identifica correctamente 8 suscripciones vencidas sin método de pago (las omite, no fuerza cobro) y 11 aún no vencidas de 19 activas; `regalias_liquidacion` produce exactamente los mismos montos que el endpoint `POST /admin/liquidar` para el mismo período (consistencia entre las dos implementaciones).

## 5. Frontend React

- [x] 5.1 `frontend/src/packages/regalias/`: `MisGananciasPage` (resuelve artista o sello automáticamente), `RegaliasAdminPage` (productores, asignación a track, contratos con validación de suma=100, cuentas de sello, liquidar período) — reusa `TrackPicker`/`UserPicker` compartidos en vez de inputs de ID crudo.
- [x] 5.2 `frontend/src/packages/publicidad/`: `AdContext`/`AdProvider` (overlay bloqueante real, mínimo 5s, montado en `app/providers`) conectado en los 3 call-sites de reproducción (`TrackCard`, `LibraryTrackRow`, `TrackDetailPage`); `PublicidadAdminPage` (anunciantes, campañas, ingreso real por campaña).
- [x] 5.3 Rutas nuevas en `router.tsx` (`/regalias/ganancias`, `/seguridad/regalias`, `/seguridad/publicidad`), nav en `AppShell.tsx` ("Mis ganancias") y `SeguridadShell` ("Regalías"/"Publicidad").
- [x] 5.4 Verificado en navegador (Playwright): `RegaliasAdminPage`/`PublicidadAdminPage` cargan con sus formularios operativos; usuario free ve el overlay de anuncio real al reproducir (bloquea, requiere 5s, cierra y genera ingreso real); `TrackDetailPage` muestra el paywall real (no solo visual) para características de audio.

## 6. `suscripciones`: conectar `require_active_subscription`

- [x] 6.1 Ajustar el dependency para aceptar `plan_minimo` explícito (ver design.md, Decisión 7).
- [x] 6.2 Límite aplicado: características de audio (danceability/energy/valence/acousticness/speechiness/instrumentalness/liveness) de un track dejaron de viajar en `GET /tracks/fact/{fact_id}` — ahora solo las expone `GET /tracks/fact/{fact_id}/audio-features`, gateado con `require_active_subscription("premium")`. Antes el paywall de `TrackDetailPage` era 100% del cliente: cualquiera podía leer esos 4 campos exclusivos de `TrackDetail` desde la pestaña Network sin backend real detrás. Limitación conocida y aceptada: `danceability/energy/valence` (3 de los 7) siguen viajando también en `GET /tracks/search` (lista/grid del catálogo) — no se tocó ese endpoint en este cambio, fuera de alcance.
- [x] 6.3 Verificado con curl: sin sesión → 401; usuario free autenticado → 403 "Se requiere un plan premium activo"; usuario premium → 200 con las 7 características.

## 7. Validación final

- [x] 7.1 Regresión con curl sobre endpoints no tocados (favoritos, planes, distribución, creadores, soporte) — 0 roturas reales (2 falsos positivos del propio script de verificación por rutas mal armadas, ya conocidos desde S10 Día 1).
- [x] 7.2 Recorrido en navegador (Playwright) de las pantallas nuevas — ver 5.4.
