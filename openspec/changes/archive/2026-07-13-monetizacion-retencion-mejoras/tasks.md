## 1. Publicidad — tipo de anuncio (audio vs. display)

- [x] 1.1 `init_clickhouse.py`: agregar `tipo_anuncio Enum8('audio'=1, 'display'=2) DEFAULT 'audio'` y `url_destino String DEFAULT ''` a `DIM_CAMPANA_PUBLICITARIA`; agregar `click UInt8 DEFAULT 0` a `FACT_IMPRESION_ANUNCIO`.
- [x] 1.2 `api/paquetes/publicidad/queries.py`: parametrizar `CAMPANAS_ELEGIBLES` por `tipo_anuncio` (reemplazar la constante fija por una función `campanas_elegibles_sql(tipo)` o un parámetro de query).
- [x] 1.3 `api/paquetes/publicidad/router.py`: extender `CampanaBody`/`crear_campana` con `tipo_anuncio` y `url_destino` (requerido si `tipo_anuncio='display'`, validar con 422 si falta).
- [x] 1.4 `api/paquetes/publicidad/router.py`: modificar `registrar_impresion`/`POST /impresion` para filtrar campañas elegibles por `tipo_anuncio='audio'` explícitamente.
- [x] 1.5 `api/paquetes/publicidad/router.py`: nuevo `POST /impresion-display` — selecciona campaña `tipo_anuncio='display'` elegible para el usuario free, registra la impresión, retorna `campana` (incluyendo `url_destino`) e `impresion_id`.
- [x] 1.6 `api/paquetes/publicidad/router.py`: nuevo `POST /impresion/{impresion_id}/click` — marca `click=1`, reutiliza la lógica de `completar_impresion` para el reconocimiento de ingreso (idempotente si ya estaba completada).
- [x] 1.7 `frontend/src/packages/publicidad/types.ts` y `publicidad.api.ts`: agregar tipos/llamadas para `tipo_anuncio`, `url_destino`, `impresionDisplay()`, `registrarClick()`.
- [x] 1.8 `frontend/src/packages/publicidad/pages/PublicidadAdminPage.tsx`: agregar selector de `tipo_anuncio` y campo `url_destino` (condicional a `display`) al formulario de creación de campaña; mostrar el tipo en la tabla de campañas.
- [x] 1.9 Nuevo componente `frontend/src/packages/publicidad/components/AdBanner.tsx` (+ CSS module): pide una impresión display al montar, renderiza imagen/texto + link a `url_destino`, registra el click al hacer click.
- [x] 1.10 `frontend/src/app/layout/AppShell.tsx`: montar `<AdBanner />` en el sidebar, visible solo cuando `usePlanActivo().tipoPlan === 'free'`, una sola solicitud de impresión por sesión de pestaña.
- [x] 1.11 Probado con `docker compose` real (curl + Playwright): banner display visible en el sidebar de un usuario free, click marca `click=1` en `FACT_IMPRESION_ANUNCIO` y genera ingreso una sola vez (segundo click idempotente), campaña display sin `url_destino` rechazada con 422.

## 2. Suscripciones — churn con motivo

- [x] 2.1 `init_clickhouse.py`: crear `FACT_CANCELACION_SUSCRIPCION` (`cancelacion_id`, `suscripcion_id String`, `usuario_id String`, `motivo Enum8('precio'=1,'no_uso'=2,'competencia'=3,'otro'=4)`, `voluntaria UInt8`, `fecha DateTime DEFAULT now()`), `ORDER BY (usuario_id, fecha)`.
- [x] 2.2 `api/paquetes/suscripciones/router.py`: extender `POST /{suscripcion_id}/cancelar` con un body opcional `{ motivo?: string }` (default `"otro"` si no se especifica), insertar en `FACT_CANCELACION_SUSCRIPCION` en el mismo request tras cancelar en PocketBase.
- [x] 2.3 `frontend/src/packages/suscripciones/pages/PlanesPage.tsx`: agregar un `<select>` de motivo (con opción "Prefiero no decir" → `otro`) al flujo de confirmación de cancelación, junto al diálogo de confirmación existente.
- [x] 2.4 `frontend/src/packages/suscripciones/api/suscripciones.api.ts`: extender `cancelar()` para aceptar el motivo opcional en el body.
- [x] 2.5 `api/paquetes/analitica/queries.py`: agregar queries para cancelaciones por mes/motivo (ClickHouse) y placeholder para el conteo de altas por mes (PocketBase, resuelto en el router).
- [x] 2.6 `api/paquetes/analitica/router.py`: nuevo `GET /churn?desde&hasta` (gateado con `require_staff`) — calcula `activas_al_inicio(mes) = altas_antes_de(mes, PocketBase) − bajas_antes_de(mes, ClickHouse)`, `cancelaciones(mes)` y la tasa resultante por mes; retorna `null` cuando el denominador es 0; soporta desglose opcional por motivo.
- [x] 2.7 `frontend/src/packages/analitica/pages/ChurnPage.tsx` (+ CSS module): tabla/gráfico de tasa de churn mensual, reutilizando `MiniBarChart` o una tabla igual que `AdquisicionPage`.
- [x] 2.8 `frontend/src/app/router.tsx`: reemplazar el placeholder `ComingSoonPage` en `{ path: 'suscripciones', ... }` (árbol `/analitica`) por `ChurnPage`, con `RequireAuth roles={['admin']}` igual que `reporte-diario`.
- [x] 2.9 Probado con `docker compose` real: cancelación con `motivo=competencia` vía API confirmada en `FACT_CANCELACION_SUSCRIPCION`; `/analitica/suscripciones` (ChurnPage) renderiza la tabla real con datos reales como admin, sin errores de consola.

## 3. Suscripciones — trial gratuito + plan estudiante

- [x] 3.1 `pb_init.py`: agregar a la colección `suscripciones` los campos `en_prueba` (bool, default `false`), `fecha_fin_trial` (date, nullable), `metodo_pago_id` (text, nullable). Hallazgo corregido durante la prueba: `ensure_collection` es create-only y no agrega campos a una colección `suscripciones` ya existente en un entorno ya desplegado — se agregó `ensure_collection_field` (generalización de `ensure_users_text_field`) y se confirmó en logs reales que los 3 campos se agregan a una colección preexistente.
- [x] 3.2 `api/paquetes/suscripciones/pb_client.py`: extender `crear()` para aceptar `en_prueba`, `fecha_fin_trial`, `metodo_pago_id`; agregar `list_historial_por_plan(token, user_id, tipo_plan)` (todas las suscripciones del usuario para ese plan, cualquier estado) y `marcar_trial_cobrado(token, record_id)`.
- [x] 3.3 `api/paquetes/suscripciones/planes.py`: agregar `estudiante` a `PLANES_B2C` (precio menor a premium); agregar constante de dominio institucional válido (configurable vía variable de entorno, default `.edu`).
- [x] 3.4 `api/paquetes/suscripciones/router.py`: extender `ConfirmarSuscripcion` con `email_institucional: str | None`; validar (422) cuando `plan_id='estudiante'` y el email no contiene el dominio configurado.
- [x] 3.5 `api/paquetes/suscripciones/router.py`: en `confirmar_suscripcion`, cuando `plan_id='premium'` y `list_historial_por_plan` no retorna ninguna fila previa, crear la suscripción con `en_prueba=1`, `fecha_fin_trial=now()+7d`, `metodo_pago_id=body.metodo_pago_id`, y **no** llamar a `procesar_pago`.
- [x] 3.6 `api/paquetes/suscripciones/router.py`: en `plan_activo` (`GET /activa`), si la suscripción activa tiene `en_prueba=1` y `fecha_fin_trial <= now()`, llamar a `facturacion.procesar_pago` con el `metodo_pago_id` guardado; si es exitoso, `marcar_trial_cobrado`; si falla, cancelar la suscripción (mismo criterio que un cobro fallido).
- [x] 3.7 `frontend/src/packages/suscripciones/types.ts`: agregar `en_prueba`, `fecha_fin_trial` a `SuscripcionActiva`; agregar `email_institucional` a `ConfirmarSuscripcionBody`.
- [x] 3.8 `frontend/src/packages/suscripciones/pages/PlanesPage.tsx`: mostrar el plan estudiante en la grilla con el campo de email institucional en el formulario de confirmación (validación de formato en cliente además de la del backend); mostrar un indicador "En período de prueba, termina el {fecha}" en la tarjeta de plan activo cuando `en_prueba=1`.
- [x] 3.9 Probado con `docker compose` real (curl + Playwright): primera confirmación de premium activa trial (`en_prueba=true`, `pago=null`); backdatear `fecha_fin_trial` y volver a pedir `/activa` dispara el cobro automático (`FACT_TRANSACCION_PAGO` real) y apaga `en_prueba`; segunda confirmación de premium cobra de inmediato sin trial; plan estudiante rechaza sin email institucional y con dominio inválido (422), acepta con `.edu`.

## 4. Analítica — funnel de conversión y P&L consolidado

- [x] 4.1 `api/paquetes/analitica/queries.py`: agregar queries para `FACT_IMPRESION_ANUNCIO` (usuarios distintos con al menos una impresión en el rango), `FACT_TRANSACCION_PAGO` (ingreso por suscripciones exitosas en el rango), `FACT_INGRESO_PUBLICITARIO` (ingreso publicitario en el rango) y `FACT_LIQUIDACION_REGALIA` (regalías pagadas en el rango).
- [x] 4.2 `api/paquetes/analitica/router.py`: nuevo `GET /funnel-conversion?desde&hasta` (`require_staff`) — combina el conteo de usuarios free activos (PocketBase), usuarios que vieron al menos un anuncio (ClickHouse) y usuarios que se suscribieron a premium/estudiante en el rango (PocketBase).
- [x] 4.3 `api/paquetes/analitica/router.py`: nuevo `GET /pnl?desde&hasta` (`require_staff`) — agrega ingreso por suscripciones + ingreso publicitario − regalías pagadas = margen neto.
- [x] 4.4 `frontend/src/packages/analitica/api/analitica.api.ts` y `types.ts`: agregar `funnelConversion()`, `pnl()` y sus tipos de respuesta.
- [x] 4.5 `frontend/src/packages/analitica/pages/FunnelConversionPage.tsx` (+ CSS module): vista del funnel (3 etapas) con conteos y tasas de conversión entre etapas.
- [x] 4.6 `frontend/src/packages/analitica/pages/PnlPage.tsx` (+ CSS module): dashboard con `MiniBarChart` (4 barras: ingreso suscripciones, ingreso publicitario, regalías pagadas, margen neto), reutilizando la paleta de `@shared/components/charts/colors`.
- [x] 4.7 `frontend/src/app/router.tsx`: agregar `{ path: 'funnel-conversion', ... }` y `{ path: 'pnl', ... }` al árbol `/analitica`, ambas con `RequireAuth roles={['admin']}` igual que `reporte-diario`.
- [x] 4.8 Probado con `docker compose` real (curl + Playwright): ambas vistas renderizan con datos reales generados por las pruebas de las secciones 1-3. Hallazgo corregido durante la prueba: el ancho de barra del funnel era un taper decorativo fijo con un "% del total" que podía superar 100% (ya que `se_suscribieron` no es un subconjunto estricto de `free_activos`) — se reemplazó por ancho proporcional al valor real y se quitó el porcentaje engañoso.

## 5. Documentación y trazabilidad (paso de sync/archive)

- [x] 5.1 Asignar CU-O69 (publicidad: recibir anuncio display), CU-O70 (suscripciones: cancelar indicando motivo), CU-O71 (suscripciones: trial gratuito + plan estudiante), CU-O72 (analitica: consultar churn), CU-O73 (analitica: consultar funnel de conversión), CU-O74 (analitica: consultar P&L consolidado) y agregar las filas correspondientes a la tabla de trazabilidad de `openspec/specs/publicidad/spec.md`, `openspec/specs/suscripciones/spec.md` y `openspec/specs/analitica/spec.md` al sincronizar.
- [x] 5.2 Al sincronizar `publicidad`: actualizar la sección "Fuera de alcance" para remover la exclusión de "Formatos de anuncio distintos a audio (video, display, banner)", y actualizar "Dependencias"/"Entradas"/"Salidas" para reflejar `tipo_anuncio`, `url_destino` y `click`.
- [x] 5.3 Al sincronizar `suscripciones`: actualizar "Entradas"/"Salidas" para reflejar el motivo de cancelación, el email institucional y el estado de período de prueba.
- [x] 5.4 Al sincronizar `analitica`: actualizar "Salidas" y "Dependencias" (agrega `FACT_CANCELACION_SUSCRIPCION` como dependencia nueva) para incluir churn, funnel de conversión y P&L.
