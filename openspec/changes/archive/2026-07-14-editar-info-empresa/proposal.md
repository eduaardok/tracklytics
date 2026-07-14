## Why

El encabezado de cada factura muestra la identidad de la empresa emisora (razón social, RUC,
dirección) como texto fijo en el frontend — no hay ninguna forma de corregirla o actualizarla sin
tocar código. Cualquier cambio real de la empresa (razón social, domicilio fiscal) quedaría
desincronizado de lo que aparece en cada comprobante emitido.

## What Changes

- **Administración de la información de la empresa emisora**: el Lead Data Engineer/CTO puede
  consultar y editar la razón social, el RUC y la dirección de la empresa que aparece en el
  encabezado de cada factura, desde la interfaz de gestión.
- El encabezado de la factura (`InvoiceDetailPage.tsx`) deja de mostrar valores fijos y consulta la
  información vigente de la empresa.

## Capabilities

### New Capabilities
(ninguna)

### Modified Capabilities
- `facturacion`: se agrega un requirement nuevo — administración (consulta y edición) de la
  información de la empresa emisora que aparece en el encabezado de cada factura (CU-O81).

## Impact

- **ClickHouse**: tabla nueva `DIM_EMPRESA` (fila única), sembrada con los valores actuales
  ("Tracklytics S.A." / RUC "0000000000001" / "Quito, Ecuador") como default inicial.
- **API** (`api/paquetes/facturacion/`): `GET /app/v1/facturacion/empresa` (cualquier usuario
  autenticado) y `PUT /app/v1/facturacion/empresa` (admin-only), con auditoría del cambio.
- **Frontend** (`frontend/src/packages/facturacion/`): `InvoiceDetailPage.tsx` consulta el
  encabezado en vez de tenerlo fijo; nueva página admin para editar la información de la empresa.
