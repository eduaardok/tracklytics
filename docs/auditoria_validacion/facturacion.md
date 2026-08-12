# Auditoría de validación — `facturacion`

3 `BaseModel`, 3 endpoints de escritura.

## Endpoints y modelos

| Endpoint | Modelo | Estado antes | Estado después |
|---|---|---|---|
| `POST /metodos-pago` | `MetodoPagoBody` | strings sin cota de longitud (`tipo`, `pais`, `nombre_titular`, `direccion`, `ciudad`, `codigo_postal`); `ultimos_4_digitos` sin validar formato salvo cuando venía derivado de `numero_tarjeta` | corregido |
| `POST /transacciones` | `TransaccionBody` | `metodo_pago_id: str` sin `min_length` ni trim | corregido |
| `PUT /empresa` | `EmpresaBody` | `razon_social`/`ruc`/`direccion` sin cota; `iva_tasa_global`/`retencion_fiscal_pct_global` sin `ge`/`le` (podían mandarse negativos o >100%) | corregido |

## Correcciones aplicadas

- **`MetodoPagoBody`**: `Field(max_length=...)` en todos los strings (topes generosos:
  nombre_titular 200, dirección/razón social 300, ciudad 150, código postal 20, país 10, tipo
  30). `ultimos_4_digitos` ahora se valida con regex (`^\d{4}$`) vía `model_validator` **solo**
  cuando no viene `numero_tarjeta` — si viene `numero_tarjeta`, `ultimos_4_digitos` se ignora en
  el handler (comportamiento preexistente) y no hace falta validarlo. Se decidió **no** cerrar
  `tipo` a un `Literal` fijo: es un campo puramente descriptivo (marca de tarjeta), no hay
  ninguna rama del backend que decida comportamiento según su valor, y el frontend ya lo llena
  desde dos fuentes distintas con vocabularios distintos (`checkout.ts.inferirMarcaTarjeta` usa
  `'visa'/'mastercard'/'amex'/'discover'/'tarjeta'`; el alta rápida de
  `suscripciones/PlanesPage.tsx` usa `'Visa'/'Mastercard'/'Amex'`) — un enum cerrado habría roto
  uno de los dos flujos sin necesidad real de negocio. Se acotó solo la longitud.
- **`TransaccionBody`**: `metodo_pago_id: str = Field(min_length=1)` + `field_validator` que
  recorta espacios y rechaza vacío tras el trim.
- **`EmpresaBody`**: `min_length=1`/`max_length` en los tres strings requeridos;
  `iva_tasa_global`/`retencion_fiscal_pct_global` con `ge=0, le=100` — son porcentajes en escala
  0-100 (se dividen entre 100 en `resolver_iva_pct`/`regalias._resolver_retencion_pct` antes de
  aplicarse, y el propio formulario los etiqueta con "%"), nunca una fracción 0-1.

## PK inmutable

No aplica: ninguno de los tres endpoints edita un recurso por ID con PK propia — `PUT /empresa`
es un singleton de configuración (upsert), no un CRUD por fila.

## Inyección SQL

No se encontró SQL armado por concatenación de datos de usuario en este paquete — las queries
existentes ya usan `parameters` de `query_rows`/`query_one`/`execute`, o `get_client().insert()`.

## Frontend

`EmpresaConfigPage.tsx`: `maxLength` en los tres inputs de texto, `max="100"` en los dos inputs
de porcentaje (ya tenían `min="0"`). `FacturacionPage.tsx` (alta de método de pago):
`maxLength` en nombre del titular, dirección, ciudad, código postal — reflejando exactamente
los mismos topes que el backend.
