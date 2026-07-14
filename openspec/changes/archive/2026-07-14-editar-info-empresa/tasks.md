## 1. ClickHouse: tabla de información de la empresa

- [x] 1.1 En `init_clickhouse.py`, agregar `CREATE TABLE IF NOT EXISTS DIM_EMPRESA (empresa_id UInt8, razon_social String, ruc String, direccion String) ENGINE = MergeTree() ORDER BY empresa_id` (mismo patrón de las demás dimensiones administrables).
- [x] 1.2 Sembrar la fila única (`empresa_id = 1`) con los valores actuales ("Tracklytics S.A." / "0000000000001" / "Quito, Ecuador") si la tabla está vacía, mismo patrón condicional (`count() == 0`) ya usado para `DIM_PAIS`/`DIM_REGION`.

## 2. API: consulta y edición de la información de la empresa

- [x] 2.1 En `api/paquetes/facturacion/queries.py`, agregar `EMPRESA_ACTUAL = "SELECT razon_social, ruc, direccion FROM DIM_EMPRESA WHERE empresa_id = 1 LIMIT 1"`.
- [x] 2.2 En `api/paquetes/facturacion/router.py`, agregar `GET /app/v1/facturacion/empresa` (cualquier usuario autenticado vía `get_current_user`) que retorna el resultado de `EMPRESA_ACTUAL`.
- [x] 2.3 Agregar `PUT /app/v1/facturacion/empresa` (`require_admin`, mismo criterio ya usado en el resto de acciones administrativas de este router) con un body `{razon_social, ruc, direccion}`, que actualiza `DIM_EMPRESA` vía `ALTER TABLE ... UPDATE ... WHERE empresa_id = 1` y registra el cambio con `audit.record(...)` (mismo patrón ya usado en `creadores`/`distribucion` para acciones administrativas).

## 3. Frontend: encabezado dinámico y página de administración

- [x] 3.1 En `frontend/src/packages/facturacion/types.ts`, agregar `EmpresaInfo = { razon_social: string; ruc: string; direccion: string }`.
- [x] 3.2 En `frontend/src/packages/facturacion/api/facturacion.api.ts`, agregar `empresa()` (GET) y `actualizarEmpresa(body)` (PUT) apuntando a los endpoints de la tarea 2.
- [x] 3.3 En `InvoiceDetailPage.tsx`, reemplazar el bloque estático de "Tracklytics S.A." / "RUC 0000000000001" / "Quito, Ecuador" (líneas 60-62) por una consulta a `facturacionApi.empresa()`, mostrando los 3 valores dinámicos.
- [x] 3.4 Crear `frontend/src/packages/facturacion/pages/EmpresaConfigPage.tsx` — formulario admin-only de 3 campos (razón social, RUC, dirección), mismo patrón visual que `AuditoriaFacturacionPage.tsx` del mismo paquete, con guardado vía `actualizarEmpresa` y confirmación de éxito/error.
- [x] 3.5 Registrar la ruta nueva en `router.tsx` (admin-only, `RequireAuth roles={['admin']}`) y un enlace en el sidebar de facturación/administración correspondiente.

## 4. Specs y verificación

- [x] 4.1 Sincronizar la delta spec de `facturacion` hacia `openspec/specs/facturacion/spec.md`, incluyendo la fila de trazabilidad CU-O81.
- [x] 4.2 Verificar con `docker compose` real: `GET /facturacion/empresa` devuelve los valores sembrados por defecto; un admin edita la información y `GET` refleja el cambio de inmediato; un usuario no-admin recibe rechazo al intentar `PUT`; el detalle de una factura muestra el encabezado actualizado.
