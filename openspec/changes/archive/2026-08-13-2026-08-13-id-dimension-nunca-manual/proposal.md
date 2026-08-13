## Why

Auditoría pre-demo (S16): al crear un álbum nuevo desde el CRUD de dimensiones
(`/seguridad/ingesta/dimensiones`), el formulario dejó ingresar manualmente el `album_id` — y el
backend lo aceptó tal cual, sin comprobar si ya existía. Resultado real: dos filas con
`album_id = 34011` en `DIM_ALBUMS` ("Sleep", 1999, y "Sleep: 111 Pieces Of Classical Music For
Bedtime", 2015), ambas referenciadas por 39 tracks reales de `FACT_TRACKS` — cualquier consulta
que uniera por ese id quedaba con un resultado ambiguo o duplicado.

Causa raíz doble:
1. **Frontend**: `DimForm` (en `CrudDimensionesPage.tsx`) precargaba el campo id con el valor de
   la fila usada como plantilla de campos (la primera fila cargada de la tabla) y lo dejaba
   editable en modo creación — invitando a enviarlo tal cual.
2. **Backend**: `dim_create` (`gestion_datos/router.py`) solo autoasignaba un id cuando el campo
   venía vacío; si el cliente mandaba un id (aunque fuera de un registro ya existente), lo usaba
   directo, sin ningún chequeo de unicidad.

El spec de `ingesta` (`Asignación de identificador único al crear una dimensión`) ya decía "el
sistema NO SHALL dejar un registro nuevo con un identificador... repetido" — la implementación
no lo cumplía. Se corrige y además se endurece el contrato: el id deja de ser un campo que el
operador pueda especificar en ningún caso, no solo "cuando no lo especifique".

## What Changes

- **Backend**: `dim_create` (aplica a las 11 tablas de dimensión, mismo endpoint genérico) ahora
  descarta cualquier valor de `pk` que venga en el payload, sin excepción — el id SIEMPRE lo
  calcula el sistema (`max(pk) + 1`), con una reconfirmación de unicidad justo antes de insertar
  (acotada a 5 intentos) para cubrir la ventana de carrera entre el cálculo y el insert.
- **Frontend**: el formulario de "Nuevo" en `CrudDimensionesPage.tsx` ya no muestra el campo id
  en absoluto (antes se mostraba editable, precargado con el id de otro registro); en modo
  edición sigue visible mostrado pero bloqueado, sin cambios ahí.
- **Limpieza de datos**: se eliminó la fila duplicada de `DIM_ALBUMS` (`album_id = 34011`,
  "Sleep: 111 Pieces Of Classical Music For Bedtime", 2015) creada por el bug, conservando el
  álbum original ("Sleep", 1999) — los 39 tracks que referencian ese id no se vieron afectados.

## Capabilities

### Modified Capabilities

- `ingesta`: el id de un valor de dimensión nuevo SHALL asignarlo siempre el sistema; un valor de
  id en el payload de creación SHALL ignorarse, no solo autoasignarse cuando falte.

## Impact

- **Backend**: `api/paquetes/gestion_datos/router.py` (`dim_create` descarta el pk del payload y
  reconfirma unicidad antes de insertar).
- **Frontend**: `frontend/src/packages/ingesta/pages/CrudDimensionesPage.tsx` (`DimForm` oculta
  el campo id en modo creación).
- **Datos**: un registro duplicado eliminado en `DIM_ALBUMS` (detalle arriba).
- **Compatibilidad**: un cliente que hoy mande un `pk` explícito en `POST /dim/{table}` deja de
  tener efecto — se ignora en vez de usarse. Nadie dependía de poder fijar un id a mano (no era
  el comportamiento documentado ni el flujo real de la UI antes del bug).
