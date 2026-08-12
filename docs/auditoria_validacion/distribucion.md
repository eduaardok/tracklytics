# Auditoría de validación — `distribucion`

8 `BaseModel`, 15 endpoints de escritura (censo confirmado).

## Endpoints y modelos

| Endpoint | Modelo/param | Hallazgo | Corrección |
|---|---|---|---|
| `POST /sellos`, `PUT /sellos/{id}` | `SelloBody` | `nombre`/`pais` sin cota; `sello_id` sin cota inferior | `max_length` + `Path(ge=1)` |
| `POST /admin/paises`, `PUT .../{id}` | `PaisConfigBody` | `nombre`/`codigo_iso`/`moneda_codigo` sin cota ni formato; `tasa_cambio_a_usd` sin `gt=0` (una tasa 0/negativa rompe cualquier conversión aguas abajo); `iva_tasa`/`retencion_fiscal_pct` sin `ge/le`; `pais_id` sin cota inferior | corregido íntegro (ver detalle abajo) |
| `POST .../{id}/desactivar`, `/activar` | path | `pais_id` sin cota inferior | `Path(ge=1)` |
| `PUT /artistas/{id}/sello`, `/albumes/{id}/sello` | `AsignarSelloBody` | `sello_id` sin cota; `artist_id`/`album_id` sin cota inferior | `Field(ge=1)` + `Path(ge=1)` |
| `POST /licencias` | `LicenciaBody` | `sello_id`/`pais_id` sin cota; **`fecha_fin` sin validar contra `fecha_inicio`** | corregido |
| `POST /licencias/{id}/revocar` | `RevocarLicenciaBody` | `motivo` sin cota; `licencia_id` sin cota inferior | `max_length=500` + `Path(ge=1)` |
| `POST /solicitudes-licencia` | `SolicitudLicenciaBody` | `sello_id` sin cota; listas sin tope de tamaño; **`fecha_fin_propuesta` sin validar** | corregido |
| `.../aprobar`, `.../rechazar` | path / `RechazarSolicitudBody` | `solicitud_id` (UUID) sin cota; `motivo` sin cota | `Path(min_length=1, max_length=64)` + `max_length=500` |
| `POST /restricciones`, `DELETE /restricciones/{...}/{...}/{...}` | `RestriccionBody` / path | los 4 IDs sin cota inferior | `Field(ge=1)` / `Path(ge=1)` en los 3 del DELETE |

## Hallazgo: fechas de fin sin validar contra fecha de inicio (2 modelos)

`LicenciaBody.fecha_fin` y `SolicitudLicenciaBody.fecha_fin_propuesta` no se comparaban contra
su `fecha_inicio` correspondiente — se agregó `field_validator` en ambos (mismo patrón que
`publicidad.CampanaBody`, sin el caso de PATCH parcial: estos dos son solo de creación, ambas
fechas siempre llegan juntas).

## `PaisConfigBody`: el modelo más débil del paquete, ahora completo

- `nombre`: sin cota → `min_length=1, max_length=100`.
- `codigo_iso`: sin formato (ISO 3166-1 alpha-2) → `min_length=2, max_length=2` +
  `field_validator` que fuerza mayúsculas y exige solo letras.
- `moneda_codigo`: mismo caso (ISO 4217) → `min_length=3, max_length=3` + mismo validator.
- `tasa_cambio_a_usd`: **sin ninguna validación** — una tasa `0` o negativa rompe cualquier
  conversión de moneda aguas abajo (facturación, regalías) → `Field(gt=0)`.
- `iva_tasa`/`retencion_fiscal_pct`: sin `ge`/`le` → `Field(ge=0, le=100)`, mismo criterio de
  escala 0-100 que `facturacion.EmpresaBody`.

## Otros IDs sin cota inferior

`sello_id`, `pais_id`, `artist_id`, `album_id`, `licencia_id`, `fact_id_track`, `canal_id` en 8
path params distintos y en 4 campos de body — todos ya protegidos contra inyección (queries
parametrizadas o verificados contra `*_EXISTE`), pero sin `ge=1`/`Field(ge=1)` cualquier valor
negativo o cero llegaba hasta la query. Corregido en los 8 endpoints afectados.

`SolicitudLicenciaBody.paises_solicitados`/`canales_solicitados`: se acotó el **tamaño de la
lista** (`max_length=300`/`50`, catálogo real de bajo volumen) pero no se agregó `ge=1` por
elemento — cada `pais_id`/`canal_id` de la lista ya se valida contra `DIM_PAIS`/
`DIM_CANAL_DISTRIBUCION` real en el handler (`PAIS_EXISTE`/`CANAL_EXISTE`, 404 si no existe),
que es una validación más fuerte que un simple `ge=1` (rechaza cualquier ID inventado, no solo
los negativos).

## PK inmutable

Ningún body de edición incluye el ID del recurso que edita (siempre viaja por el path).

## Inyección SQL

Sin hallazgos — todas las escrituras usan `parameters` o `get_client().insert()`.

## Frontend

- `SellosTab.tsx`: `maxLength` en nombre (150) y país (100), creación y edición inline.
- `ConfiguracionGlobalTab.tsx`: `maxLength` en nombre/código ISO/moneda; `min="0.0001"` en tasa
  de cambio (antes `min="0"`, inconsistente con el `gt=0` real); `max="100"` en IVA/retención.
  El input de precio de plan (`suscripcionesApi.actualizarPrecioPlan`, referenciado desde
  `docs/auditoria_validacion/suscripciones.md`) ya tenía `min="0"`, coincide con el backend —
  sin cambios necesarios ahí.
- `LicenciasTab.tsx`/`SolicitudesLicenciaTab.tsx`: `min={fechaInicio}` en el input de fecha fin,
  validación `fechaFinInvalida` que bloquea el envío y muestra un mensaje (nueva clase
  `.errorText` en el CSS module, mismo patrón de tokens que el resto del archivo); `maxLength`
  en los textarea de motivo (revocación/rechazo).
