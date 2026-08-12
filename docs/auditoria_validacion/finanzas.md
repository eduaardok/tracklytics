# Auditoría de validación — `finanzas`

2 `BaseModel`, 4 endpoints de escritura (censo confirmado). Paquete no tocado por ningún intento
previo de esta auditoría — auditado de cero.

## Endpoints y modelos

| Endpoint | Modelo | Hallazgo | Corrección |
|---|---|---|---|
| `POST /gastos` | `GastoBody` | `concepto` sin cota (validado en runtime, movido a `Field`); `categoria` ya `Literal` (correcto); `monto <= 0` solo en runtime; `descripcion` sin cota | corregido íntegro |
| `PUT /gastos/{id}` | `GastoBody` | mismo modelo; **sin validar transición de estado** (ver hallazgo abajo); `gasto_id` sin cota | corregido |
| `POST /gastos/{id}/anular` | — (sin body) | **anular un gasto ya anulado no se rechazaba** (idempotente silencioso); `gasto_id` sin cota | corregido |
| `POST /reembolsos` | `ReembolsoBody` | **`motivo` sin ninguna validación, ni siquiera vacío** (ver hallazgo abajo); `monto <= 0` solo en runtime | corregido |

## Hallazgo: `ReembolsoBody.motivo` sin ninguna validación

A diferencia de todos los demás campos `motivo`/`descripcion` de texto libre auditados en este
repo (que al menos tenían un chequeo de vacío en runtime), `ReembolsoBody.motivo: str` no tenía
**absolutamente ninguna** validación — ni longitud, ni siquiera rechazo de string vacío. Un
reembolso es una operación contable auditable (ajusta P&L, aparece en `FACT_REEMBOLSO` y en las
alertas financieras de "reembolso elevado") que exige justificación por diseño de negocio. Se
agregó `Field(min_length=1, max_length=500)` + `field_validator` que recorta espacios y rechaza
vacío tras el trim.

## Hallazgo: transiciones de estado no validadas en gastos operativos

- `PUT /gastos/{id}` no verificaba el estado actual antes de editar: un gasto `anulado` podía
  editarse como si estuviera vigente, "revivviéndolo" en la práctica sin pasar por un alta
  nueva. Se agregó el chequeo: `estado == "anulado"` → `409`.
- `POST /gastos/{id}/anular` no verificaba si el gasto ya estaba anulado — anular dos veces era
  un no-op silencioso (mismo resultado, sin señal de error). Se agregó el mismo chequeo: `409`
  si ya está `anulado`, consistente con el criterio recién aplicado a la edición (un gasto
  anulado es un estado terminal en ambos endpoints, no solo en uno).

## Otros hallazgos

- `GastoBody.monto`/`ReembolsoBody.monto`: `<= 0` se validaba en runtime en los 3 handlers —
  reemplazado por `Field(gt=0)` declarativo, checks redundantes removidos.
- `GastoBody.concepto`: `Field(min_length=1, max_length=200)` + validator (antes solo el chequeo
  de vacío en runtime, sin tope de longitud).
- `GastoBody.descripcion`: `Field(max_length=2000)` (antes sin cota).
- `ReembolsoBody.transaccion_id`: sin cambios — ya se valida su formato UUID en el handler
  (`uuid.UUID(...)`, 404 si es inválido) antes de esta auditoría; se deja así a propósito (un
  admin que manda un ID mal formado recibe "transacción no encontrada", que es la respuesta
  correcta de cara al usuario, no un 422 de formato interno).

## PK inmutable

`gasto_id` viaja solo por el path en `PUT /gastos/{id}` — no es campo de `GastoBody`.
`ReembolsoBody.transaccion_id` es una FK requerida en la creación (qué transacción reembolsar),
no una PK que se esté editando.

## Inyección SQL

Sin hallazgos — todas las escrituras usan `parameters` o `get_client().insert()`.

## Frontend

`GastosTab.tsx`: `maxLength` en concepto (200) y descripción (2000) — el monto ya tenía
`min="0.01"`, coincide con el nuevo `gt=0`. Los botones "Editar"/"Anular" ya solo se muestran
para gastos con `estado === 'activo'` (comportamiento preexistente, coincide con los nuevos 409
del backend). `ReembolsosTab.tsx`: `maxLength={500}` en motivo, y se agregó
`!form.motivo.trim()` a la condición de deshabilitado del botón — antes se podía enviar el
formulario con motivo vacío sin ningún feedback hasta que el backend rechazara la request.
