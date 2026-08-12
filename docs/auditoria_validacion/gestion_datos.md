# Auditoría de validación — `gestion_datos`

**Prioridad #1 confirmada.** 3 `BaseModel`, 5 endpoints de escritura. El CRUD genérico de
dimensiones (`/dim/{table}`) tenía el hallazgo más grave de toda la auditoría: **inyección SQL
real**, no solo ausencia de validación de rangos.

## Modelos y endpoints

| Endpoint | Modelo | Estado antes | Estado después |
|---|---|---|---|
| `POST /etl/clear` | — (sin body) | OK | sin cambios |
| `POST /etl/trigger` | `ETLTriggerRequest` | `week_number: int` sin rango | sin cambios (mantenido por compatibilidad; el flujo real de negocio es `POST /app/v1/ingesta/ejecuciones`, que sí valida `1 <= week_number <= 16`) |
| `POST /app/v1/ingesta/ejecuciones` | `EjecucionIngestaRequest` | `week_number` validado en `_trigger_guarded` (`1..16`); `synthetic_mode: Literal[...]` ya correcto | OK, sin cambios |
| `POST /dim/{table}` (`dim_create`) | `DimRecord` (`data: dict[str, Any]`) | **Crítico** — ver abajo | corregido |
| `PUT /dim/{table}/{record_id}` (`dim_update`) | `DimRecord` | **Crítico** — ver abajo | corregido |
| `DELETE /dim/{table}/{record_id}` (`dim_delete`) | — (path + query) | `record_id` ya tipado `int` por FastAPI; interpolado en SQL pero sin riesgo real (tipo garantizado) | parametrizado igual, por consistencia |

## Hallazgo crítico: inyección SQL en `dim_create` / `dim_update`

`DimRecord.data: dict[str, Any]` no tenía ninguna validación de tipo, rango, ni de qué claves
eran columnas reales. Peor aún, el código armaba SQL por concatenación de texto con esos datos
sin escapar:

```python
# ANTES — api/paquetes/gestion_datos/router.py
cols = ", ".join(data.keys())
vals = ", ".join(f"'{v}'" if isinstance(v, str) else str(v) for v in data.values())
execute(f"INSERT INTO {ch_table} ({cols}) VALUES ({vals})")
```

Un payload como `{"data": {"name": "x'); DROP TABLE DIM_ARTISTS; --"}}` rompía el literal de
texto y ejecutaba SQL arbitrario contra ClickHouse — tanto las **keys** (nombres de columna)
como los **values** venían de `Any` sin whitelist. `dim_update` tenía el mismo patrón en el
`ALTER TABLE ... UPDATE`.

### Corrección aplicada

- `api/core/database.py`: nuevo helper `insert_row(table, data)` que usa
  `Client.insert(table, [...], column_names=...)` — el protocolo nativo del driver
  (`clickhouse-connect`), no SQL de texto. Es el mismo patrón que ya usa el resto de los 17
  paquetes (`get_client().insert(...)`, ~90 llamadas en el código existente) — `gestion_datos`
  era el único lugar que no lo seguía.
- `api/paquetes/gestion_datos/queries.py`: nueva `dim_columns_sql()` — whitelist real de
  columnas (`system.columns`, nombre + tipo) de cada tabla de dimensión.
- `api/paquetes/gestion_datos/router.py`:
  - `_get_columns()` resuelve la whitelist; `_clean_and_validate_data()` rechaza con 422
    cualquier key de `data` que no sea una columna real de la tabla, recorta espacios en
    strings y rechaza (422) valores de texto de más de 500 caracteres.
  - `dim_create` usa `insert_row()` (sin SQL de texto para los valores).
  - `dim_update` construye el `SET` con nombres de columna ya validados contra la whitelist
    (nunca texto de usuario crudo como identificador) y valores **parametrizados**
    (`{p_0:Tipo}`, `{p_1:Tipo}`, …) usando el tipo real de ClickHouse de cada columna — el
    driver serializa el valor, no se concatena texto.
  - `dim_delete` parametriza igual el `WHERE` (no era explotable — `record_id` ya era `int`
    tipado por FastAPI — pero se deja consistente con el resto).

## Hallazgo: PK editable en `dim_update` (regla de negocio pedida por la auditoría)

**Antes:** si el payload de `PUT /dim/{table}/{record_id}` incluía la columna PK, el código la
descartaba en silencio (`if k != pk`) — no rompía nada, pero tampoco avisaba al cliente.

**Después:** si `data` incluye la PK, se rechaza explícitamente con `400` y un mensaje
("`'{pk}' es la clave primaria de esta tabla y no puede modificarse en una actualización.`").
Se prefirió rechazar sobre ignorar en silencio (ambas opciones eran válidas según el criterio de
la auditoría) porque es más verificable en una prueba automatizada y más honesto de cara al
consumidor de la API — un cliente que cree haber cambiado el ID merece un error, no un 200
silencioso que no hizo lo que pidió.

`dim_create` sí acepta la PK en el payload (es el caso de creación) — si no viene o viene vacía,
se autogenera con `max(pk) + 1` (comportamiento preexistente, CU-O15, sin cambios).

## Frontend — `CrudDimensionesPage.tsx`

Ya tenía una protección parcial no documentada: el input de la PK se deshabilita
(`disabled={locked}`) en modo edición. Pero:

- No había ningún límite de longitud en campos de texto (`maxLength` ausente).
- No había piso para campos numéricos (`min` ausente) — se podían enviar negativos para
  cualquier ID/año/conteo, que el backend no rechazaba porque no validaba nada.
- No había validación antes de `onSubmit`: un campo numérico vacío o no numérico se convertía a
  `NaN` y se mandaba igual al backend.

### Corrección aplicada

- `min={0}` en todos los inputs numéricos (las 11 tablas de dimensión son catálogos —
  IDs, años, rangos y conteos — ninguna tiene un caso de negocio legítimo para valores
  negativos; no se encontró ninguno en el dominio).
- `maxLength={500}` en inputs de texto, reflejando el mismo límite (`_MAX_STR_LEN`) del backend.
- Validación previa a `onSubmit`: número vacío/`NaN` o negativo, o texto que excede el máximo,
  bloquea el envío y muestra el error localmente (`localError`) sin llamar al backend — pero el
  backend sigue siendo la validación real; el frontend es solo feedback inmediato.
- El campo PK sigue bloqueado (`disabled`) en modo edición — comportamiento preexistente,
  documentado ahora explícitamente en el comentario del componente.

## Otros endpoints del paquete

`POST /etl/clear`, `GET /etl/*`, `GET /data-quality`, `GET /facts`, `GET /dim/{table}`,
`v1_router` (`/app/v1/ingesta/*`) — sin cambios; ya usan `Query(..., ge=..., le=...)` donde
corresponde (`page`, `limit`, `popularity_min`, etc. en otros paquetes; aquí `page`/`limit` en
`etl_logs`, `dim_list`, `facts_list` ya estaban acotados). `week_number` en
`_trigger_guarded` ya validaba `1..16` explícitamente antes de esta auditoría.

## Pendiente para Fase 3

Pruebas end-to-end con `curl` real (inyección, PK inmutable, rangos, tipos) — ver
`REPORTE_FINAL.md`, sección `gestion_datos`, una vez levantado el stack con `docker compose up`.
