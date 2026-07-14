## 1. Regalías — liquidación idempotente

- [x] 1.1 `api/paquetes/regalias/queries.py`: agregar `LIQUIDACION_YA_EXISTE_PERIODO` — cuenta filas en `FACT_LIQUIDACION_REGALIA` con `periodo_inicio`/`periodo_fin` exactos.
- [x] 1.2 `api/paquetes/regalias/router.py::liquidar_periodo`: antes de calcular, consultar `LIQUIDACION_YA_EXISTE_PERIODO`; si existe, retornar `{"status": "ya_liquidado", "liquidaciones": 0}` sin insertar nada.
- [x] 1.3 `etl/gold/regalias_liquidacion.py::run_liquidacion_regalias`: mismo check antes de insertar (query directa a ClickHouse con `client.query`, mismo patrón que el resto del script), loguear y salir temprano si el período ya existe.
- [x] 1.4 Actualizar el docstring de `etl/gold/regalias_liquidacion.py` que documenta la "limitación conocida" — ya no aplica.

## 2. Regalías — retiro de ganancias

- [x] 2.1 `init_clickhouse.py`: crear `FACT_RETIRO_REGALIA` (`retiro_id`, `tipo_rightsholder Enum8('artista'=1,'sello'=2)`, `rightsholder_id String`, `monto Float32`, `estado Enum8('pendiente'=1,'procesado'=2,'rechazado'=3)`, `fecha_solicitud DateTime DEFAULT now()`, `fecha_procesado Nullable(DateTime)`), `ORDER BY (rightsholder_id, fecha_solicitud)`.
- [x] 2.2 `api/paquetes/regalias/queries.py`: agregar queries de saldo disponible (`SUM(FACT_LIQUIDACION_REGALIA.monto) - SUM(FACT_RETIRO_REGALIA.monto WHERE estado IN ('pendiente','procesado'))` por `rightsholder_id`) y listado de retiros por rightsholder/admin.
- [x] 2.3 `api/paquetes/regalias/router.py`: `POST /artista/retiros` y `POST /sello/retiros` (o un único endpoint parametrizado por el tipo de cuenta ya resuelta del usuario autenticado) — valida monto ≤ saldo disponible, inserta en estado `pendiente`.
- [x] 2.4 `api/paquetes/regalias/router.py`: `GET /admin/retiros` (listado, filtrable por estado), `POST /admin/retiros/{retiro_id}/procesar`, `POST /admin/retiros/{retiro_id}/rechazar` — solo `admin`.
- [x] 2.5 `frontend/src/packages/regalias`: agregar el saldo disponible + botón "Solicitar retiro" a las páginas de "mis ganancias" existentes de artista/sello.
- [x] 2.6 `frontend/src/packages/regalias` (o su panel admin ya existente bajo `/seguridad/regalias`): tabla de solicitudes de retiro con acciones procesar/rechazar.

## 3. Facturación — renovación fallida cancela la suscripción

- [x] 3.1 `etl/gold/facturacion_recurrente.py::run_facturacion_recurrente`: cuando `estado == "fallida"`, además de insertar la transacción fallida, hacer `PATCH` a la suscripción en PocketBase (`estado="cancelada"`) e insertar en `FACT_CANCELACION_SUSCRIPCION` (`motivo='precio'`, `voluntaria=0`) — mismo patrón que `api/paquetes/suscripciones/router.py::_resolver_trial_vencido`.
- [x] 3.2 Confirmado: `get_token(cfg)` (`etl/utils/pocketbase_client.py`) autentica contra `_superusers/auth-with-password` — token de superusuario real, con permisos para actualizar cualquier suscripción cross-usuario.

## 4. Analítica — MRR/ARR

- [x] 4.1 `api/paquetes/suscripciones/pb_client.py`: agregar `sumar_montos_activos(tipos_plan)` — generaliza `_admin_count` a una suma de `monto` en vez de un conteo, mismo mecanismo de token superusuario ya usado por `contar_activas`/`contar_altas_antes_de`.
- [x] 4.2 `api/paquetes/analitica/queries.py`: agregar `INGRESO_MENSUAL_RECURRENTE_HISTORICO` — `SUM(FACT_TRANSACCION_PAGO.monto WHERE estado='exitosa')` agrupado por `toStartOfMonth(fecha)`.
- [x] 4.3 `api/paquetes/analitica/router.py`: nuevo `GET /mrr-arr` (`require_staff`) — MRR = suma de montos de suscripciones de pago activas (todos los planes con precio > 0, B2C y B2B), ARR = MRR × 12, más la tendencia histórica con su `nota` explicando la aproximación.
- [x] 4.4 `frontend/src/packages/analitica/api/analitica.api.ts` y `types.ts`: agregar `mrrArr()` y su tipo de respuesta.
- [x] 4.5 `frontend/src/packages/analitica/pages/MrrArrPage.tsx` (+ CSS module): KPIs de MRR/ARR + `MiniLineChart` con la tendencia histórica.
- [x] 4.6 `frontend/src/app/router.tsx` y `frontend/src/app/layout/AnalyticaShell.tsx`: nueva ruta `/analitica/mrr-arr`, admin-only (`RequireAuth roles={['admin']}`), agregada al nav junto a Churn/Funnel/P&L.

## 5. Simulación — capability nueva

- [x] 5.1 `api/paquetes/simulacion/__init__.py`, `queries.py`, `router.py`: nuevo paquete backend, `router = APIRouter(prefix="/app/v1/simulacion", tags=["Simulacion"], dependencies=[Depends(require_admin)])`. Registrado en `api/main.py`.
- [x] 5.2 `api/paquetes/simulacion/generador.py`: generador de reproducciones — mismo enfoque ponderado por popularidad que `etl/engagement/generator.py`, `event_timestamp` distribuido en la última hora (no atado a `week_number`/`WEEK1_START`), `user_id` con convención `sim_user_XXXX`, `is_synthetic=True`. Desviación de diseño encontrada al implementar: `source` de `FACT_ENGAGEMENT_USUARIO` es `Enum8('app'=1,'referencia'=2)` — no admite un tercer valor `'simulacion'` sin migrar el esquema. Se usa `source='referencia'` (ya es no-orgánico) y el prefijo `sim_user_` es lo que distingue esta actividad de `engagement_referencia`, sin necesitar ALTER de enum.
- [x] 5.3 `api/paquetes/simulacion/generador.py`: generador de suscripciones — inserta N transacciones exitosas directo en `FACT_TRANSACCION_PAGO`/`FACT_INVOICE` (mezcla realista de montos entre planes de pago existentes, mismo `IVA_RATE`/`TASA_EXITO_DEFAULT` que `facturacion/queries.py`), `usuario_id` sintético.
- [x] 5.4 `api/paquetes/simulacion/generador.py`: generador de impresiones publicitarias — reutiliza `CAMPANAS_ELEGIBLES_POR_TIPO` de `publicidad/queries.py` para elegir campañas activas y vigentes (audio y display), inserta N impresiones completadas en `FACT_IMPRESION_ANUNCIO`/`FACT_INGRESO_PUBLICITARIO`; si no hay campañas elegibles, omite este paso sin error.
- [x] 5.5 `api/paquetes/regalias/router.py`: extraída la lógica de `liquidar_periodo` a `liquidar_periodo_interno(periodo_inicio, periodo_fin)`, reutilizada tanto por el endpoint como por `simulacion`.
- [x] 5.6 `api/paquetes/simulacion/router.py`: `POST /generar-actividad` — orquesta los 3 generadores + la liquidación reutilizada, con parámetros opcionales `n_streams`/`n_suscripciones`/`n_impresiones` (defaults 5000/50/200), retorna el resumen (streams, ingreso suscripciones, ingreso publicitario, resultado de liquidación).
- [x] 5.7 `frontend/src/packages/simulacion/api/simulacion.api.ts`, `types.ts`: cliente del nuevo endpoint.
- [x] 5.8 `frontend/src/packages/simulacion/pages/SimulacionPage.tsx` (+ CSS module): formulario con las 3 cantidades (valores por defecto precargados) + botón "Simular actividad de negocio", panel de resultados con el resumen devuelto, y un link a `/analitica/pnl`.
- [x] 5.9 `frontend/src/packages/simulacion/index.ts`: barrel del paquete nuevo, siguiendo la regla de aislamiento ya usada por el resto de paquetes.
- [x] 5.10 `frontend/src/app/router.tsx` y `frontend/src/app/layout/SeguridadShell.tsx`: nueva ruta `/seguridad/simulacion` (admin-only, mismo patrón que `/seguridad/publicidad`, `/seguridad/regalias`), agregada al nav de Administración.

## 6. Documentación, trazabilidad y verificación

- [x] 6.1 Asignar CU-O75 (regalías: solicitar retiro), CU-O76 (regalías: procesar/rechazar retiro), CU-O77 (analítica: consultar MRR/ARR), CU-O78 (simulación: generar actividad de negocio simulada) y agregar las filas correspondientes a la tabla de trazabilidad de `openspec/specs/regalias/spec.md` y `openspec/specs/analitica/spec.md` al sincronizar; crear `openspec/specs/simulacion/spec.md` completo.
- [x] 6.2 Al sincronizar `regalias`: actualizado "Fuera de alcance", "Entradas"/"Salidas"/"Dependencias".
- [x] 6.3 Al sincronizar `facturacion`: actualizado "Fuera de alcance" para aclarar que la renovación automática con cancelación en fallo sí está en alcance (solo el reintento/dunning multi-día queda fuera).
- [x] 6.4 Al sincronizar `analitica`: actualizado "Salidas" para incluir MRR/ARR.
- [x] 6.5 Creado `docs/BITACORA_S11.md` documentando esta change y la de `monetizacion-retencion-mejoras`.
- [x] 6.6 Probado con `docker compose` real (curl + Playwright): liquidar dos veces el mismo rango de fechas la segunda vez responde `ya_liquidado` sin duplicar filas (verificado contando filas reales en ClickHouse); `POST /simulacion/generar-actividad` de punta a punta genera streams+ingreso+liquidación y se ve reflejado en la UI de Simulación con el mensaje correcto de "ya liquidado hoy"; solicitar/procesar un retiro de regalías vía API, con el rechazo correcto de volver a procesar uno ya procesado; MRR/ARR con datos reales en `/analitica/mrr-arr`; regresión de admin sin suscripción confirmada aún vigente (403).
- [x] 6.7 (fuera del alcance original, pedido por el usuario en la misma sesión) Bug real encontrado: `EtlPage.tsx` dejó de mostrar `duration_seconds` en un refactor anterior, aunque el backend y el tipo ya lo traían. Se agregó la columna "Duración" al historial de cargas y a la barra de última carga (`fmtDuration`).
