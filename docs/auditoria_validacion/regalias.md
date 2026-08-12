# Auditoría de validación — `regalias`

6 `BaseModel`, 11 endpoints de escritura (censo confirmado, coincide con el original).

## Endpoints y modelos

| Endpoint | Modelo | Hallazgo | Corrección |
|---|---|---|---|
| `POST /admin/productores` | `ProductorBody` | `nombre` sin cota | `Field(min_length=1, max_length=200)` + trim |
| `POST /admin/productores/{id}/tracks/{fact_id}` | — (path) | `productor_id`/`fact_id` sin cota inferior | `Path(..., ge=1)` en ambos |
| `POST /admin/contratos` | `ContratoBody` | **splits podían sumar 100 con valores negativos** (ver abajo, hallazgo de fondo); sin `vigente_fin > vigente_inicio` | corregido |
| `PUT /admin/contratos/{id}` | `ContratoEditBody` | mismos splits sin `ge`/`le`; sin validar `vigente_hasta` contra el `vigente_desde` real del contrato | corregido |
| `POST /admin/cuentas-sello` | `CuentaSelloBody` | `usuario_id` sin trim/cota | `Field(min_length=1)` + trim |
| `POST /admin/liquidar` | `LiquidarBody` | `periodo_fin > periodo_inicio` no validado en el modelo | `model_validator` agregado |
| `POST /artista/retiros`, `POST /sello/retiros` | `RetiroBody` | `monto: float` sin cota — aceptaba 0 o negativo | `Field(gt=0)` |
| `POST /admin/retiros/{id}/procesar`, `.../rechazar` | — | `estado` de `GET /admin/retiros` era `str` libre | `Literal["pendiente","procesado","rechazado"]` en el `Query` |
| `POST /admin/contratos/{id}/terminar` | — (sin body) | sin cambios | — |

## Hallazgo de fondo: splits de reparto podían sumar 100 con un valor negativo

`pct_master_sello`/`pct_master_artista`/`pct_master_productor` (y el par `publishing`) no tenían
`ge`/`le`. La única validación de negocio existente era "master debe sumar 100" — pero esa
invariante **no excluye splits negativos**: `pct_master_sello=150, pct_master_artista=-50` suma
100 y pasaba, dejando un split real negativo grabado en `DIM_CONTRATO_REGALIA`. `Field(ge=0,
le=100)` en los cinco campos cierra esto — la unidad real es "puntos porcentuales enteros de
0 a 100" (el cálculo de liquidación los usa como `pct / 100`, nunca como fracción 0..1, según
`liquidar_periodo_interno`).

## Fechas

- `ContratoBody`: `model_validator` que exige `vigente_hasta > vigente_desde` cuando se informa
  `vigente_hasta`.
- `ContratoEditBody` (PUT, edición parcial): el modelo no conoce el `vigente_desde` original del
  contrato (no es un campo editable), así que la validación se hace en el handler tras leer el
  registro actual: `if body.vigente_hasta <= actual["vigente_desde"]: 422`.
- `LiquidarBody`: `model_validator` — `periodo_fin > periodo_inicio`. La función interna
  `liquidar_periodo_interno` repite el mismo chequeo como defensa en profundidad, porque también
  la invoca `paquetes/simulacion/router.py` directo con fechas construidas en Python (sin pasar
  por este modelo Pydantic).

## PK inmutable

`contrato_id` viaja **solo** por el path en `PUT /admin/contratos/{contrato_id}` — nunca es un
campo de `ContratoEditBody`. No hace falta un chequeo explícito adicional: al no existir el
campo en el modelo, no hay forma de que el payload lo sobreescriba (a diferencia de
`gestion_datos.dim_update`, donde la PK sí convivía con el resto de los campos en un
`dict[str, Any]`).

## Inyección SQL

Sin hallazgos — todas las queries de escritura usan `parameters` o `get_client().insert()`.

## Frontend — `RegaliasAdminPage.tsx`

- `maxLength={200}` en el nombre de productor.
- `min="0" max="100"` en los 5 inputs de split (creación de contrato).
- Liquidación: `min={periodoInicio}` en el input "Hasta", botón deshabilitado si
  `periodoFin <= periodoInicio`, y mensaje de error visible en ese caso.
- `ContratoEditDialog`: `min={contrato.vigente_desde}` en "vigente hasta"; el botón de guardar ya
  se deshabilitaba si los splits no sumaban 100 (`valido`) — se agregó la misma condición para
  la fecha (`vigenciaValida`) y un mensaje específico que distingue "splits no suman 100" de
  "fecha inválida" en vez de un solo mensaje genérico.

`MisGananciasPage.tsx` (solicitud de retiro) ya tenía `min="0.01"`, `max={disponible}` y
deshabilitaba el botón para monto ≤ 0 — no necesitó cambios, coincide con el nuevo `gt=0` del
backend.
