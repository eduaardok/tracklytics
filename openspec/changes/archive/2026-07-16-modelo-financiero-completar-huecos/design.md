## Context

Auditoría verificada en el repo (no hipótesis): `suscripciones/router.py` solo tiene listar/crear/
consultar/cancelar — ningún cambio de plan in-place. `etl/gold/facturacion_recurrente.py` cancela
de inmediato ante un cobro fallido, sin reintentos. `regalias/router.py::liquidar_periodo_interno`
paga el 100% del monto calculado a rightsholders. `planes.py` tiene precios hardcodeados,
`facturacion/queries.py::IVA_RATE = 0.15` es una constante fija, y `DIM_PAIS` (`init_clickhouse.py`)
solo tiene `pais_id/nombre/codigo_iso`, con únicamente endpoints de lectura
(`distribucion/router.py::listar_paises`). `MetodoPagoBody` YA tiene `nombre_titular/direccion/
ciudad/codigo_postal` (`facturacion/router.py`, ya implementado en un change anterior) — el checkout
realista de este change solo necesita agregar tarjeta/expiración simulada, no repetir ese trabajo.

## Goals / Non-Goals

**Goals:**
- Cambio de plan sin perder continuidad ni historial, con ajuste prorrateado.
- Cobro fallido con reintentos visibles antes de degradar, no cancelación silenciosa inmediata.
- Retención fiscal real y transparente en la liquidación de regalías.
- País, precios de plan e IVA administrables sin tocar código ni redeployar.
- Checkout con captura de tarjeta simulada (nunca persistida completa) y notificación de factura
  simulada, visible en pantalla.

**Non-Goals:**
- Ninguna pasarela de pago real, API de forex real, ni proveedor de email real — todo sigue
  simulado y documentado como tal.
- Compliance fiscal real (formularios, integraciones tributarias) — retención fiscal es un %
  simple configurable, no un motor de impuestos.
- Un scheduler real para dunning — se resuelve con un endpoint que el usuario/admin dispara
  (mismo criterio ya aceptado en `suscripciones` para el trial: "se resuelve en el siguiente
  acceso autenticado").
- No se toca `_TIER_RANK`/`require_tier` (`analitica/deps.py`) ni el pool de regalías 70/30 /
  split 80/20.

## Decisions

### 1. Cambio de plan: PATCH in-place de la suscripción activa, no cancelar+crear

`confirmar_suscripcion` ya cancela cualquier activa previa al crear una nueva — ese camino pierde
`created` (fecha de inicio real) y no distingue "cambié de opinión sobre qué plan quiero" de
"cancelé del todo". Se agrega `pb_client.actualizar_plan(token, suscripcion_id, tipo_plan, monto,
moneda)` (PATCH sobre el mismo registro PocketBase, sin tocar `created`) y un endpoint nuevo
`PUT /app/v1/suscripciones/{id}/plan`. El ajuste prorrateado se calcula sobre un ciclo fijo de 30
días (mismo `DIAS_CICLO` que ya usa `facturacion_recurrente.py`) a partir de `created` de la
suscripción actual: `dias_restantes = 30 - (hoy - created).days % 30`, `ajuste = (precio_nuevo -
precio_actual) * dias_restantes / 30`. Si `ajuste > 0` (upgrade), se cobra como una transacción
`concepto='ajuste_prorrateo'` (nuevo campo `concepto` en `FACT_TRANSACCION_PAGO`, Enum8
`suscripcion`/`ajuste_prorrateo`, no una tabla nueva) usando el `metodo_pago_id` de la suscripción
si lo tiene, o el que el cliente indique en el body. **Corrección durante la verificación con
curl**: el diseño inicial asumía que toda suscripción de pago guarda su `metodo_pago_id`, pero
`confirmar_suscripcion` solo lo persiste en el camino de trial — un plan de pago normal activado
sin trial nunca lo guarda (comportamiento preexistente, no introducido por este change). Se
corrigió `PUT /{id}/plan` para aceptar `metodo_pago_id` opcional en el body como fallback,
verificado con curl contra una suscripción real sin ese campo. Si falla el cobro del ajuste, se
rechaza el cambio de plan entero (no se aplica un downgrade a medias).
Si `ajuste < 0` (downgrade), se registra la misma transacción con monto negativo y `estado`
`'exitosa'` sin cobro real — es un crédito informativo, no hay reembolso real a un método de pago
simulado (fuera de alcance: reembolsar a la tarjeta simulada). Aplica a B2C y B2B por igual,
reusando `plan_valido_para_rol` para validar el plan destino.

### 2. Dunning: estado `pago_pendiente` + endpoint de reintento, sin scheduler real

`estado` de `suscripciones` (PocketBase) es texto libre, no un enum cerrado — se agrega el valor
`pago_pendiente` sin migración de schema. Se agrega el campo `intentos_fallidos` (number,
`ensure_collection_field`, mismo patrón que `en_prueba`/`fecha_fin_trial`). Nuevo endpoint
`POST /app/v1/suscripciones/{id}/procesar-cobro` (reemplaza el camino de
`facturacion_recurrente.py` para la simulación en vivo, y es el mismo endpoint que la propia DAG
podría llamar): intenta `procesar_pago`; si es exitosa, `estado='activa'`, `intentos_fallidos=0`;
si falla, incrementa `intentos_fallidos` y pone `estado='pago_pendiente'`; al llegar a 3 intentos,
degrada — B2C: `tipo_plan='free'`, `monto=0`, vuelve a `estado='activa'` (no se queda sin acceso,
igual que el downgrade real de Spotify); B2B: `estado='cancelada'` + `FACT_CANCELACION_SUSCRIPCION`
(motivo `'precio'`, `voluntaria=0`), lo que automáticamente le quita acceso a `analitica` vía
`require_b2b_panel_access` (ya valida `estado='activa'`). Acepta `forzar_resultado` opcional
(mismo patrón ya usado en `TransaccionBody`) para poder demostrar el ciclo completo de 3 fallos en
vivo sin depender de la tasa de éxito aleatoria. `facturacion_recurrente.py` (DAG) se actualiza
para usar la misma política de 3 intentos en vez de cancelar en la primera falla — documentado
que, al no haber garantía de que el scheduler de Airflow corra cada 30 días exactos (memoria de
proyecto: puede morir en silencio), el camino demostrable en vivo es el endpoint, no el DAG.
`finanzas` (alertas, CU-O89) suma una categoría "suscripciones con cobro pendiente de resolución"
(cuenta de `estado='pago_pendiente'`).

### 3. Retención fiscal: override por país, fallback global en `DIM_EMPRESA`

`DIM_PAIS` gana `retencion_fiscal_pct Nullable(Float32)` (override); `DIM_EMPRESA` gana
`retencion_fiscal_pct_global Float32 DEFAULT 10.0` (fallback, editable vía el mismo
`PUT /facturacion/empresa` ya existente para CU-O81, extendiendo `EmpresaBody`). País del
rightsholder: para artista, `DIM_CUENTA_ARTISTA.usuario_id` → `DIM_USUARIO.pais` (texto ya
existente); para sello, se agrega `DIM_SELLO_DISCOGRAFICO.pais String DEFAULT ''` (nueva columna,
el admin la setea al crear/editar el sello, mismo endpoint `POST/PUT /distribucion/sellos`
extendido). Resolución reutiliza `resolver_pais_id`/`PAIS_ID_POR_TEXTO` de `distribucion` (ya
existe para RF-DIS-007) — no se duplica la lógica de texto→país. `FACT_LIQUIDACION_REGALIA` gana
`monto_bruto`, `retencion_pct`, `monto_retenido`; la columna `monto` existente pasa a significar el
neto (bruto − retenido) — es lo que ya consume `SALDO_DISPONIBLE_RIGHTSHOLDER`/retiros, así que ese
código no cambia, solo el valor que contiene. Criterio contable: la retención es un **pasivo por
remitir a la autoridad fiscal**, no ingreso de la plataforma — no se suma al margen neto de
`finanzas` (`v1_pnl`), se muestra solo como dato informativo en "Mis ganancias" y en la liquidación
admin.

### 4. País como configuración real: extensión de `DIM_PAIS`, no tabla paralela

`DIM_PAIS` gana `moneda_codigo String DEFAULT 'USD'`, `tasa_cambio_a_usd Float32 DEFAULT 1.0`
(valor congelado simulado, no forex real — documentado explícitamente), `iva_tasa
Nullable(Float32)` (override de IVA), `retencion_fiscal_pct Nullable(Float32)` (decisión 3),
`activo UInt8 DEFAULT 1`. CRUD admin nuevo en `distribucion/router.py` (dueño actual de
`DIM_PAIS`): `POST /admin/paises`, `PUT /admin/paises/{id}`, `POST /admin/paises/{id}/desactivar`
— mismo patrón que `crear_sello`/`editar_sello` ya existente en el mismo router (ID autoincremental
vía `MAX(pais_id)+1`, `execute(ALTER ... UPDATE ...)` para editar). No se crea un paquete de
configuración transversal nuevo: es una ampliación de la misma tabla y el mismo dueño, no un
concepto nuevo — evita fragmentar dónde vive "país" en dos lugares.

### 5. Precios de plan configurables: `DIM_PLAN` nuevo, desacoplado de `_TIER_RANK`

Nueva tabla `DIM_PLAN(plan_id String, precio_usd Float32, activo UInt8 DEFAULT 1, actualizado_en
DateTime DEFAULT now())` (`ReplacingMergeTree(actualizado_en)`, `ORDER BY plan_id`), sembrada al
arrancar con los precios actuales de `planes.py` si está vacía (mismo patrón condicional que
`DIM_EMPRESA`/`DIM_PAIS`). `planes.py` sigue siendo dueño de `id`/`tipo_actor`/`nombre`/
`descripcion`/`features` (catálogo de producto, no cambia) — el **precio efectivo** se resuelve en
runtime con una función `precio_efectivo(plan_id) -> float` que consulta `DIM_PLAN` y cae al precio
hardcodeado de `planes.py` si no hay fila (defensivo, nunca deja un plan sin precio). Admin nuevo:
`PUT /app/v1/suscripciones/admin/planes/{plan_id}/precio`. Esto es deliberadamente una tabla
separada de `_TIER_RANK` (`analitica/deps.py`): el admin puede cambiar cuánto cuesta "Pro", nunca
qué endpoints desbloquea "Pro" — `DIM_PLAN` no tiene ninguna columna de nivel de acceso, y
`require_tier` sigue leyendo únicamente el dict estático en código. Se documenta explícitamente
para que un cambio futuro no fusione ambos conceptos por conveniencia.

### 6. IVA global + override por país

`DIM_EMPRESA` gana `iva_tasa_global Float32 DEFAULT 15.0` (reemplaza `IVA_RATE = 0.15` como
constante fija; el valor por defecto conserva el mismo 15% para no cambiar el comportamiento
existente al desplegar). `procesar_pago` (`facturacion/router.py`) resuelve la tasa efectiva:
`DIM_PAIS.iva_tasa` del país del usuario (vía `resolver_pais_id(DIM_USUARIO.pais)`) si existe, si
no `DIM_EMPRESA.iva_tasa_global`. Se elige "global + override" (no IVA obligatorio por país, no un
único valor fijo sin excepciones) porque reflejan realistamente que la mayoría de países de la
demo (sembrados sin IVA propio) comparten una tasa de referencia de la plataforma, mientras un
país con régimen fiscal conocido y distinto (ej. un país sin IVA, o con una tasa mayor) puede
declararlo sin tener que definir los 15 países sembrados manualmente — la alternativa de "IVA
obligatorio por país" exigiría poblar 15 tasas para poder facturar a cualquiera, lo que no aporta
nada en un proyecto académico donde el dato real que importa es que el mecanismo de override
exista y sea administrable.

### 7. Checkout: número de tarjeta simulado truncado inmediatamente, nunca persistido completo

`MetodoPagoBody` gana dos campos **solo de validación** (no columnas nuevas en `DIM_METODO_PAGO`):
`numero_tarjeta` (`str`, validado con regex de 16 dígitos) y `fecha_expiracion` (`str`, validado
formato `MM/YY` y no vencida). El endpoint valida el formato, deriva `ultimos_4_digitos` del propio
`numero_tarjeta` recibido (ignora el que el cliente mande directo, evita inconsistencia), y
descarta el número completo y la expiración antes de construir el insert — nunca tocan
`DIM_METODO_PAGO` ni ningún log. Mismo criterio ya documentado en el proyecto para credenciales
(ISO 25010, "nunca hardcodeadas/persistidas más de lo necesario"): se valida la forma, se guarda
solo lo mínimo necesario para mostrarlo de vuelta al usuario (últimos 4 dígitos), igual que
cualquier plataforma real. La conversión de precio a moneda local (decisión 4) se resuelve en
`listar_planes`/`confirmar_suscripcion` usando el país del usuario (`DIM_USUARIO.pais`, ya existe —
no se pide un campo nuevo de país al usuario, se reusa el que ya declaró al registrarse).

### 8. Factura "enviada por correo": tabla dedicada, no reutilizar `FACT_NOTIFICACION`

`FACT_NOTIFICACION` (paquete `social`) ya existe para notificaciones in-app (campana), con `tipo`
como Enum8 cerrado de 3 valores no relacionados con facturación y sin campos de
`asunto`/`cuerpo`/`destinatario` (es un mensaje corto de campana, no un registro de email). Se crea
`FACT_EMAIL_ENVIADO(notificacion_id, usuario_id, tipo Enum8('factura'=1), referencia_id,
destinatario, asunto, cuerpo, estado Enum8('enviado'=1), fecha_envio)` en `facturacion` (dueño del
invoice) en vez de forzar ese concepto dentro de `FACT_NOTIFICACION` — evita un `ALTER MODIFY
COLUMN` sobre un Enum8 ya en uso y mantiene separados "alerta corta en la app" de "registro de un
email simulado con asunto/cuerpo". Se inserta una fila cada vez que `procesar_pago` emite un
`FACT_INVOICE` exitoso. Nuevo endpoint `GET /app/v1/facturacion/notificaciones` (propio + variante
admin vía `usuario_id`, mismo patrón que `/facturacion/invoices`).

## Tabla de trazabilidad de 5 niveles (features nuevas de este change)

| Feature | Endpoint | Componente frontend | CU | Paquete |
|---|---|---|---|---|
| Cambio de plan con prorrateo | `PUT /app/v1/suscripciones/{id}/plan` | `PlanesPage.tsx` | CU-O94 | `suscripciones` |
| Dunning / reintento de cobro fallido | `POST /app/v1/suscripciones/{id}/procesar-cobro` | `PlanesPage.tsx` (estado "pago pendiente" + botón reintentar) | CU-O95 | `suscripciones` |
| Retención fiscal en liquidación de regalías | `POST /admin/liquidar` (extendido), `GET /regalias/{artista,sello}/mis-ganancias` (extendido) | `MisGananciasPage.tsx` | CU-O96 | `regalias` |
| Configuración de país (moneda/tasa/IVA/retención) | `POST/PUT/POST /distribucion/admin/paises*` | `ConfiguracionGlobalPage.tsx` (nueva) | CU-O97 | `distribucion` |
| Precios de plan configurables | `PUT /app/v1/suscripciones/admin/planes/{id}/precio` | `ConfiguracionGlobalPage.tsx` | CU-O98 | `suscripciones` |
| Checkout realista + factura enviada por correo (simulado) | `POST /facturacion/metodos-pago` (extendido), `GET /facturacion/notificaciones` | `FacturacionPage.tsx` | CU-O99 | `facturacion` |

## Auditoría retroactiva de trazabilidad

Se revisaron `openspec/specs/{facturacion,regalias,publicidad,distribucion,finanzas}/spec.md`.
Los 5 ya tienen la tabla de 5 niveles "de negocio" (nivel empresarial → departamento → paquete →
CU → historia) exigida por convención, pero ninguno documentaba explícitamente CU → endpoint →
componente frontend en un solo lugar — mismo hueco ya encontrado y corregido para `analitica`/
`suscripciones` en el change anterior (`b2b-tier-access-analitica`). Cadena completada para los CU
de dinero relevantes a este change:

| CU | Endpoint | Componente frontend |
|---|---|---|
| CU-O06 (suscripciones) | `POST /app/v1/suscripciones` | `PlanesPage.tsx` |
| CU-O20 (facturacion) | `POST /facturacion/metodos-pago` | `FacturacionPage.tsx` |
| CU-O21 (facturacion) | `POST /facturacion/transacciones` | `FacturacionPage.tsx` |
| CU-O63 (regalias) | `POST /regalias/admin/liquidar` | *(sin UI dedicada — solo admin backend, disparado desde `simulacion` o manual; hueco de UI preexistente, fuera del alcance de este change: no hay pantalla admin de "liquidar ahora" en el frontend)* |
| CU-O64/CU-O65 (regalias) | `GET /regalias/{artista,sello}/mis-ganancias` | `MisGananciasPage.tsx` |
| CU-O81 (facturacion) | `PUT /facturacion/empresa` | `EmpresaConfigPage.tsx` |
| CU-O82–CU-O90 (finanzas) | ver `openspec/specs/finanzas/spec.md` | `FinanzasAdminPage.tsx` (8 pestañas, ya documentado 1:1 en la bitácora del bloque 7) |

Segundo hueco encontrado (documentación, no código): el requirement "Registro de método de pago"
de `openspec/specs/facturacion/spec.md` seguía describiendo el endpoint como "tipo, últimos 4
dígitos, país" — pero el código (`MetodoPagoBody`, `facturacion/router.py`) ya captura
`nombre_titular`/`direccion`/`ciudad`/`codigo_postal` desde un change anterior que nunca sincronizó
la spec. Corregido en la delta spec de este change (MODIFIED Requirements) al extenderlo con
tarjeta/expiración simulada — se actualiza el texto completo, no solo lo nuevo.

Hueco real encontrado: **CU-O63 (liquidar período de regalías) no tiene ningún componente
frontend** — solo se dispara desde `POST /regalias/admin/liquidar` (backend) o desde `simulacion`.
No se agrega en este change (no forma parte de los 4 huecos solicitados y ampliar el alcance a una
pantalla admin de liquidación manual no es parte del pedido de negocio); se documenta aquí para que
quede explícito y no se pierda como hallazgo.

## Risks / Trade-offs

- [Riesgo] El prorrateo de cambio de plan usa un ciclo fijo de 30 días de calendario, no el
  ciclo de facturación real del proveedor de pago (que no existe, es simulado) → Mitigación: es
  el mismo criterio que ya usa `facturacion_recurrente.py` (`DIAS_CICLO=30`), consistente con el
  resto del sistema, documentado como simplificación académica.
- [Riesgo] La degradación de dunning a los 3 intentos es una política fija en código, no
  configurable → Mitigación: aceptable para el alcance — no se pidió que fuera configurable, y
  hacerlo tabla-driven sin necesidad real solo añade complejidad.
- [Riesgo] El país del rightsholder para retención fiscal se resuelve por texto libre
  (`DIM_USUARIO.pais`/`DIM_SELLO_DISCOGRAFICO.pais` vs. `DIM_PAIS.nombre`), mismo "fail-open" ya
  aceptado en `distribucion` para restricción geográfica → Mitigación: si no hay match, cae al
  `retencion_fiscal_pct_global`, nunca deja la retención sin calcular.
- [Riesgo] La conversión de moneda usa una tasa de cambio congelada en `DIM_PAIS`, no forex real →
  Mitigación: documentado explícitamente en la respuesta de la API y en el frontend como valor de
  referencia simulado, nunca como cotización real.

## Migration Plan

- Todas las columnas nuevas son aditivas (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` con
  `DEFAULT`), idempotentes, sin backfill manual — mismo patrón que `imagen_url`/`tipo_anuncio` ya
  usado en `init_clickhouse.py`.
- `DIM_PLAN` se siembra condicionalmente (`if count == 0`) con los precios actuales de
  `planes.py`, igual que `DIM_EMPRESA`/`DIM_PAIS`.
- `intentos_fallidos` en PocketBase se agrega vía `ensure_collection_field` (no rompe registros
  existentes, quedan con el default `0`/vacío).
- Rollback: revertir el código basta — ninguna columna se elimina de datos existentes, y los
  defaults preservan el comportamiento anterior (`iva_tasa_global=15.0` igual al `IVA_RATE`
  anterior, `tasa_cambio_a_usd=1.0` no altera precios existentes).

## Open Questions

Ninguna pendiente — decisiones resueltas arriba con su justificación.
