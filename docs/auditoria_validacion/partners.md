# Auditoría de validación — `partners`

**Corrección al censo original**: el censo de referencia decía "2 BaseModel / 0 endpoints de
escritura", pero ese conteo solo miraba `@router.` — `partners` monta un segundo router,
`v1_router` (prefijo `/app/v1/partners`), con **4 endpoints de escritura reales**:
`POST /admin`, `PATCH /admin/{partner_id}`, `POST /admin/{partner_id}/rotar-key`,
`POST /admin/{partner_id}/desactivar`. 2 `BaseModel` (`PartnerCrearBody`, `PartnerEditarBody`).

## Hallazgo crítico: `partner_id` sin validar interpolado en filtro/URL de PocketBase

`rotar_key`, `desactivar_partner` y `editar_partner` reciben `partner_id` como path param
`str` sin restricción de formato. `pb_client.get_partner()` arma el filtro de PocketBase por
concatenación de texto (`f'id="{partner_id}"'`) y `rotar_api_key()`/`desactivar_partner()`/
`actualizar_partner()` interpolan `partner_id` directo en la URL del REST API de PocketBase
(`f".../records/{partner_id}"`). Un `partner_id` con `"` rompe el filtro (inyección de filtro
PocketBase); uno con `/` cambia el recurso de destino de la petición — relevante porque
`pb_client` se autentica con token de **superusuario** de PocketBase (necesario para poder
escribir la colección `partners`, ver comentario `RT-01` en el código), así que una petición
mal dirigida no queda limitada a la colección `partners`.

### Corrección aplicada

`_PB_ID_PATTERN = r"^[a-z0-9]{15}$"` (formato real de un ID de PocketBase, confirmado contra un
registro real de la colección) en `Path(..., pattern=...)` de los tres endpoints — el valor se
rechaza con 422 antes de llegar a `pb_client`, sin tocar `pb_client.py`.

## Modelos

| Modelo | Campo | Antes | Después |
|---|---|---|---|
| `PartnerCrearBody` | `nombre` | `str` sin cota (el handler ya rechazaba vacío a mano) | `Field(min_length=1, max_length=200)` + validator que recorta espacios |
| | `tier` | `Literal["basico","pro","enterprise"]` | sin cambios, ya correcto |
| | `email_contacto` | `str = ""` sin ningún formato | `Field(max_length=254)` + validator: si no está vacío, debe tener forma de email |
| `PartnerEditarBody` | `nombre` | `str \| None` sin cota | `Field(max_length=200)` |
| | `email_contacto` | `str \| None` sin formato | `Field(max_length=254)` + mismo validator de formato |
| | `tier`, `estado` | ya `Literal[...]` | sin cambios |

No se usó `EmailStr` de Pydantic para `email_contacto` porque el campo acepta explícitamente
vacío (`""` = "sin contacto registrado", ver `PartnerCrearBody.email_contacto: str = ""`) y
`EmailStr` rechaza el string vacío — se usa un regex laxo que solo valida formato cuando el
valor no está vacío.

## PK inmutable

`partner_id` **nunca** viaja en el body de `PartnerEditarBody` (solo en el path) — ya estaba
correctamente separado, sin cambios necesarios ahí.

## Inyección SQL (ClickHouse)

Este paquete no escribe en ClickHouse (los partners viven en PocketBase); las queries de solo
lectura (`TRACKS_LIST`, etc.) ya usan `parameters`. Sin hallazgos de este tipo aquí — el
hallazgo crítico real es el de PocketBase, arriba.

## Frontend — `AdminPartnersPage.tsx`

`maxLength={200}` en los inputs de nombre (creación y edición), `maxLength={254}` en los de
email (ya tenían `type="email"` para el hint de formato del navegador, pero sin backend
real detrás esa validación de HTML5 no protegía nada).
