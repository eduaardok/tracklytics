## 1. ClickHouse: tablas nuevas

- [x] 1.1 Agregar a `init_clickhouse.py` (idempotente, `CREATE TABLE IF NOT EXISTS`) `DIM_METODO_PAGO` (`ENGINE = MergeTree() ORDER BY (usuario_id, metodo_pago_id)`; campos: metodo_pago_id UUID, usuario_id, tipo, ultimos_4_digitos, pais, creado_en) (design.md, decisión "Las tres tablas nuevas viven enteramente en ClickHouse, sin fricción con RT-05").
- [x] 1.2 Agregar `FACT_TRANSACCION_PAGO` (append-only; `ORDER BY (usuario_id, fecha)`; campos: transaccion_id UUID, usuario_id, metodo_pago_id, suscripcion_id String, monto, moneda, estado Enum8('pendiente'=1,'exitosa'=2,'fallida'=3), fecha).
- [x] 1.3 Agregar `FACT_INVOICE` (append-only; `ORDER BY (usuario_id, fecha_emision)`; campos: invoice_id UUID, usuario_id, transaccion_id, monto, iva, fecha_emision, estado).
- [x] 1.4 Ejecutar `init_clickhouse.py` contra el ClickHouse de desarrollo y verificar que las 3 tablas existen sin afectar las ya existentes.

## 2. FastAPI: paquete `facturacion` — utilidades y consultas

- [x] 2.1 Crear `api/paquetes/facturacion/__init__.py`.
- [x] 2.2 Crear `api/paquetes/facturacion/queries.py`: constante `IVA_RATE` (design.md, "Cálculo de IVA con tasa fija"), consultas de historial de transacciones e invoices por `usuario_id`, y de métodos de pago por `usuario_id`.
- [x] 2.3 Crear `api/paquetes/facturacion/deps.py`: dependencia que resuelve la suscripción activa del usuario reutilizando `paquetes.suscripciones.pb_client.list_activas` (design.md, "Referencia a la suscripción como String (id de PocketBase)"); reutilizar `paquetes.seguridad.deps.require_admin` para el gating de terceros (no se duplica).
- [x] 2.4 Reutilizar `paquetes.seguridad.audit.record(...)` (no se duplica el helper) para instrumentar auditoría de operaciones sensibles de esta capability — mismo patrón que el otorgamiento/revocación de permisos en `seguridad` (design.md, sección de Decisions a agregar: "Auditoría de operaciones de pago vía el helper ya existente").

## 3. FastAPI: registro de método de pago

- [x] 3.1 Implementar `POST /app/v1/facturacion/metodos-pago`: crea un método de pago simulado (tipo, últimos 4 dígitos, país) asociado al `usuario_id` derivado de `core.deps.get_current_user` — nunca aceptado como campo de entrada (design.md, "El usuario_id de escritura siempre se deriva del token") (RF: Registro de método de pago, CU-O20). Registra el alta en `FACT_AUDIT_LOG` vía `audit.record(usuario_id, accion="registro_metodo_pago", tabla_afectada="DIM_METODO_PAGO", antes=None, despues={tipo, ultimos_4_digitos, pais})`.
- [x] 3.2 Implementar `GET /app/v1/facturacion/metodos-pago`: lista los métodos de pago del usuario autenticado.

## 4. FastAPI: pago de suscripción y emisión de invoice

- [x] 4.1 Implementar `POST /app/v1/facturacion/transacciones`: valida que el usuario autenticado tenga una suscripción activa (vía la dependencia de 2.3); si no la tiene, rechaza sin registrar transacción ni invoice (RN: Rechazo de pago sin suscripción activa, CA correspondiente).
- [x] 4.2 Validar que el `metodo_pago_id` recibido pertenece al usuario autenticado antes de simular el pago; rechazar si no.
- [x] 4.3 Simular el resultado de la transacción (éxito/fallo) — tasa de éxito fija por defecto, con indicador opcional de prueba para forzar el resultado de forma determinística (design.md, "Simulación de resultado de transacción"; detalle técnico, no expuesto como concepto de negocio) — e insertar la fila en `FACT_TRANSACCION_PAGO` con `suscripcion_id` resuelto en 4.1 (RF: Pago de una suscripción existente, CU-O21).
- [x] 4.4 Si la transacción resulta exitosa, emitir automáticamente el invoice correspondiente en `FACT_INVOICE` (monto igual al de la transacción, `iva = monto * IVA_RATE`, estado `emitido`) en la misma solicitud, sin acción manual adicional (RF: Emisión automática de invoice).
- [x] 4.5 Si la transacción resulta fallida, verificar que no se genera ningún invoice.
- [x] 4.6 Registrar la operación de pago en `FACT_AUDIT_LOG` vía `audit.record(usuario_id, accion="pago_suscripcion", tabla_afectada="FACT_TRANSACCION_PAGO", antes=None, despues={...})` en ambos casos (éxito y fallo) — `despues` incluye `suscripcion_id`, `metodo_pago_id`, `monto`, `moneda`, `estado` y, si se emitió, el `invoice_id`. Mismo patrón que el otorgamiento/revocación de permisos en `seguridad`, reutilizando el helper existente (no se duplica).

## 5. FastAPI: historial de facturación (propio y admin)

- [x] 5.1 Implementar `GET /app/v1/facturacion/transacciones` y `GET /app/v1/facturacion/invoices`, con `usuario_id` opcional en query string: por defecto (u omitido) devuelve los registros del usuario autenticado (RF: Consulta del propio historial de facturación, CU-O22).
- [x] 5.2 Si `usuario_id` difiere del usuario autenticado, exigir rol `admin` (`require_admin`); rechazar con 403 en caso contrario (RF: Acceso restringido al historial de facturación de terceros, CU-O23).
- [x] 5.3 Montar el router de `facturacion` en `api/main.py` junto al resto de routers.

## 6. Frontend: completar el paquete `facturacion` en `frontend/src/packages/facturacion/`

- [x] 6.1 Definir `types.ts` (MetodoPago, Transaccion, Invoice, y los payloads de request de registro de método de pago y de pago) reflejando los campos de `DIM_METODO_PAGO`/`FACT_TRANSACCION_PAGO`/`FACT_INVOICE`, mismo patrón que `packages/seguridad/types.ts`.
- [x] 6.2 Implementar `api/facturacion.api.ts` con llamadas tipadas a `/app/v1/facturacion/*` (mismo patrón que `packages/seguridad/api/seguridad.api.ts` y `packages/analitica/api/analitica.api.ts`).
- [x] 6.3 Implementar `pages/FacturacionPage.tsx`: vista de autoservicio (cualquier rol) con métodos de pago (lista + alta), botón/form de pago sobre la suscripción activa, e historial propio de transacciones e invoices — aplicando los tokens de diseño ya establecidos por Impeccable (`src/index.css`: `--color-*`, `--font-*`, `--space-*`, `--radius-*`), mismo lenguaje visual que `CatalogPage`/`PermisosPage`.
- [x] 6.4 Implementar `pages/AuditoriaFacturacionPage.tsx`: vista admin-only para consultar transacciones/invoices de cualquier `usuario_id` (mismo patrón que `packages/seguridad/pages/PermisosPage.tsx`: campo de búsqueda por `usuario_id` + tablas de resultado).
- [x] 6.5 Exponer únicamente lo necesario desde `index.ts` (páginas + `facturacionApi` + tipos), siguiendo la regla de aislamiento ya documentada en el README del stub.
- [x] 6.6 Wiring de rutas: agregar `/facturacion` (`FacturacionPage`) bajo `AppShell` con su entrada de navegación junto a "Catálogo"; agregar "Facturación" como cuarto ítem de la barra lateral de `SeguridadShell` apuntando a `AuditoriaFacturacionPage` (mismo shell admin ya usado por permisos/auditoría/errores — evita crear un shell nuevo para una sola página).
- [x] 6.7 Dejar constancia en el README del paquete (igual que se hizo en `seguridad`) de que estas páginas dependen de sesión autenticada en el frontend React, que todavía no está wireada (login/registro siguen en el frontend vanilla `app/`, ver `docs/decisiones-refactorizacion.md` sección 13) — no es un defecto de esta capability, es una brecha conocida y pendiente a nivel de todo el frontend React.

## 7. Verificación end-to-end

- [x] 7.1 Verificar registro de método de pago (curl, con token de un usuario de prueba autenticado vía `seguridad`), confirmando la fila en `DIM_METODO_PAGO`.
- [x] 7.2 Verificar que un pago sin suscripción activa se rechaza sin crear transacción ni invoice.
- [x] 7.3 Verificar un pago exitoso (forzando el resultado determinístico de prueba): confirmar la fila en `FACT_TRANSACCION_PAGO` con estado exitoso y el invoice correspondiente en `FACT_INVOICE` con el IVA calculado correctamente.
- [x] 7.4 Verificar un pago fallido (forzando el resultado): confirmar la fila en `FACT_TRANSACCION_PAGO` con estado fallido y que no se generó ningún invoice.
- [x] 7.5 Verificar que un usuario normal solo ve su propio historial de transacciones/invoices, y que al solicitar `usuario_id` de otro usuario recibe 403.
- [x] 7.6 Verificar que `admin` puede consultar el historial de transacciones/invoices de otro usuario exitosamente.
- [x] 7.7 Verificar con `npx tsc --noEmit` que el nuevo paquete `facturacion` y los archivos de routing/shell modificados no introducen errores de tipos (mismo chequeo que se hizo al cerrar `seguridad`).
- [x] 7.8 Verificar que el registro de un método de pago y cada intento de pago (exitoso y fallido) quedan reflejados en `FACT_AUDIT_LOG` (consultable vía `GET /app/v1/seguridad/auditoria` como `admin`), con `despues` mostrando los datos correctos en cada caso, incluyendo el `invoice_id` cuando corresponda.
