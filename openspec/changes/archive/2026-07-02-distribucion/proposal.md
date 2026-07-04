## Why

Tracklytics no modela hoy dónde y cómo un track puede distribuirse legalmente. El catálogo global se muestra igual a cualquier usuario en cualquier país, y `record_label`/`label` en DIM_ARTISTS/DIM_ALBUMS son campos de texto libre sin relación estructurada con licencias. Un sistema tipo Spotify real necesita reflejar que los sellos discográficos licencian su catálogo país por país, y que la disponibilidad de un track puede estar restringida por mercado o canal — sin esto, el modelo de negocio B2B (que depende de sellos y productoras como clientes) carece de la pieza central que justifica su relación con Tracklytics: el control sobre dónde se distribuye su música.

## What Changes

- Se introduce la capability `distribucion`, con 7 tablas nuevas en ClickHouse: `DIM_PAIS`, `DIM_SELLO_DISCOGRAFICO`, `DIM_LICENCIA`, `DIM_TIPO_RESTRICCION`, `DIM_CANAL_DISTRIBUCION`, `BRIDGE_RESTRICCION_TRACK`, `FACT_RESTRICCION_REPRODUCCION`.
- Administración de sellos discográficos (alta/edición) y asignación de un sello a un artista o álbum existente.
- Administración de licencias de distribución a nivel sello-país (vigencia, estado).
- Administración de restricciones de reproducción por track, país y canal de distribución, con soft-delete.
- Verificación de disponibilidad geográfica al intentar reproducir un track, con bloqueo y registro del evento cuando aplica una restricción activa.
- Consulta de disponibilidad por país para el Usuario B2C, sin efecto de bloqueo (solo lectura informativa).
- **BREAKING**: `DIM_ARTISTS.record_label` y `DIM_ALBUMS.label` (campos de texto libre) se reemplazan por una clave foránea `sello_id` contra `DIM_SELLO_DISCOGRAFICO`. Todo query, vista o endpoint que hoy filtra o muestra el sello como texto libre se migra a `sello_id` (mismo patrón que la migración `is_synthetic` → `source_type` ya aplicada en `creadores`).
- Toda acción administrativa de licencias y restricciones queda auditada en `FACT_AUDIT_LOG`.

## Capabilities

### New Capabilities
- `distribucion`: modelado de mercado, sellos discográficos, licencias por país y restricciones de reproducción por país/canal, incluyendo el enforcement de esas restricciones al momento de reproducir un track.

### Modified Capabilities
(ninguna — el reemplazo de `record_label`/`label` por `sello_id` es un cambio de esquema en una dependencia de `catalogo`, no altera ningún requirement documentado en `openspec/specs/catalogo/spec.md`: la búsqueda, el detalle y la biblioteca personal siguen funcionando igual, solo cambia cómo se almacena y consulta el sello internamente)

## Impact

- **ClickHouse**: 7 tablas nuevas; `ALTER TABLE` en `DIM_ARTISTS` y `DIM_ALBUMS` para agregar `sello_id` y remover/deprecar `record_label`/`label`.
- **Backend (FastAPI)**: nuevo paquete `api/paquetes/distribucion/` (router, queries) bajo `/app/v1/distribucion`; reutiliza `require_admin`, `audit.record`, `require_b2c_user`/`get_current_user` ya existentes en `seguridad`. El endpoint de reproducción existente en `catalogo`/`biblioteca` incorpora la verificación de restricción antes de registrar el evento de reproducción.
- **ETL/población inicial**: script único para extraer valores distintos de `record_label`/`label`, poblar `DIM_SELLO_DISCOGRAFICO`, y actualizar `sello_id` en `DIM_ARTISTS`/`DIM_ALBUMS`.
- **Queries existentes**: cualquier query en `catalogo`, `analitica` o `partners` que hoy lea `record_label`/`label` como texto se migra a un join contra `DIM_SELLO_DISCOGRAFICO` vía `sello_id`.
- **Frontend**: nuevas pantallas de administración (sellos, licencias, restricciones) en el paquete `distribucion` de `frontend/src/packages/`; el flujo de reproducción del reproductor persistente incorpora el caso de track no disponible en el país del usuario.
