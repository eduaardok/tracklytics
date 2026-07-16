## 1. ClickHouse / PocketBase — columnas y tablas nuevas

- [x] 1.1 `init_clickhouse.py`: `ALTER TABLE DIM_PAIS ADD COLUMN IF NOT EXISTS` para
      `moneda_codigo`, `tasa_cambio_a_usd`, `iva_tasa`, `retencion_fiscal_pct`, `activo`.
- [x] 1.2 `ALTER TABLE DIM_EMPRESA ADD COLUMN IF NOT EXISTS iva_tasa_global`,
      `retencion_fiscal_pct_global`.
- [x] 1.3 `ALTER TABLE DIM_SELLO_DISCOGRAFICO ADD COLUMN IF NOT EXISTS pais String DEFAULT ''`.
- [x] 1.4 `ALTER TABLE FACT_TRANSACCION_PAGO ADD COLUMN IF NOT EXISTS concepto Enum8('suscripcion'=1, 'ajuste_prorrateo'=2) DEFAULT 'suscripcion'`.
- [x] 1.5 `ALTER TABLE FACT_LIQUIDACION_REGALIA ADD COLUMN IF NOT EXISTS` para `monto_bruto`,
      `retencion_pct`, `monto_retenido` (columna `monto` existente pasa a significar neto).
- [x] 1.6 Nueva tabla `DIM_PLAN` (ReplacingMergeTree), sembrada condicionalmente con los precios
      de `planes.py`.
- [x] 1.7 Nueva tabla `FACT_EMAIL_ENVIADO` (notificación simulada de factura).
- [x] 1.8 `pb_init.py`: `ensure_collection_field` para `intentos_fallidos` en `suscripciones`.

## 2. Suscripciones — cambio de plan y dunning

- [x] 2.1 `pb_client.py`: `actualizar_plan(token, suscripcion_id, tipo_plan, monto, moneda)`
      (PATCH in-place, conserva `created`).
- [x] 2.2 `router.py`: `PUT /{id}/plan` — cálculo de prorrateo, cobro/crédito, rechazo si el cobro
      del ajuste falla.
- [x] 2.3 `router.py`: `POST /{id}/procesar-cobro` — dunning (intentos, `pago_pendiente`,
      degradación B2C→free / B2B→cancelada a los 3 intentos), acepta `forzar_resultado`.
- [x] 2.4 `planes.py`/nuevo módulo: `precio_efectivo(plan_id)` consultando `DIM_PLAN` con
      fallback al precio hardcodeado.
- [x] 2.5 `router.py`: `PUT /admin/planes/{plan_id}/precio` (admin).
- [x] 2.6 `etl/gold/facturacion_recurrente.py`: reemplazar cancelación inmediata por la misma
      política de 3 intentos.
- [x] 2.7 `finanzas`: sumar categoría de alerta "cobro pendiente de resolución" (CU-O89).

## 3. Regalías — retención fiscal

- [x] 3.1 `regalias/queries.py`: query de resolución de país del rightsholder (artista vía
      `DIM_CUENTA_ARTISTA`→`DIM_USUARIO.pais`; sello vía `DIM_SELLO_DISCOGRAFICO.pais`).
- [x] 3.2 `regalias/router.py`: función `resolver_retencion_pct(pais_nombre)` reusando
      `resolver_pais_id`/`PAIS_ID_POR_TEXTO` de `distribucion`.
- [x] 3.3 `liquidar_periodo_interno`: calcular bruto/retención/neto por fila, insertar columnas
      nuevas.
- [x] 3.4 Extender `GANANCIAS_ARTISTA`/`GANANCIAS_SELLO` para exponer bruto/retención/neto.
- [x] 3.5 `distribucion/router.py`: extender `crear_sello`/`editar_sello` con campo `pais`
      opcional.

## 4. Distribución — configuración de país

- [x] 4.1 `distribucion/queries.py`: extender `PAISES_LIST` con las columnas nuevas.
- [x] 4.2 `distribucion/router.py`: `POST /admin/paises`, `PUT /admin/paises/{id}`,
      `POST /admin/paises/{id}/desactivar` (mismo patrón que sellos).

## 5. Facturación — IVA configurable, checkout, notificación simulada

- [x] 5.1 `facturacion/router.py`: `EmpresaBody` gana `iva_tasa_global`,
      `retencion_fiscal_pct_global`.
- [x] 5.2 `procesar_pago`: resolver IVA efectivo (override de país del usuario o global) en vez
      de `IVA_RATE` fijo.
- [x] 5.3 `MetodoPagoBody`: agregar `numero_tarjeta`/`fecha_expiracion` (validación, nunca
      persistidos), derivar `ultimos_4_digitos` del número recibido.
- [x] 5.4 `FACT_EMAIL_ENVIADO`: insertar en `procesar_pago` al emitir invoice exitoso.
- [x] 5.5 `GET /facturacion/notificaciones` (propio + admin vía `usuario_id`).
- [x] 5.6 `suscripciones/planes.py` o `facturacion`: función de conversión a moneda local usando
      `DIM_PAIS.tasa_cambio_a_usd` del país del usuario, expuesta en `listar_planes`.

## 6. Frontend

- [x] 6.1 `PlanesPage.tsx`: opción de cambio de plan con resumen de prorrateo antes de confirmar.
- [x] 6.2 `PlanesPage.tsx`: estado "pago pendiente" con botón de reintentar cobro (dunning).
- [x] 6.3 `PlanesPage.tsx`: precio mostrado en moneda local convertida.
- [x] 6.4 `FacturacionPage.tsx`: campos de tarjeta/expiración simulada en el formulario de método
      de pago.
- [x] 6.5 `FacturacionPage.tsx`: pestaña/sección de notificaciones de factura enviadas.
- [x] 6.6 Nueva página `ConfiguracionGlobalPage.tsx` (área admin de `distribucion`): CRUD de
      países (moneda/tasa/IVA/retención) + precios de plan.
- [x] 6.7 `MisGananciasPage.tsx`: mostrar bruto/retención/neto por liquidación.

## 7. Verificación real

- [x] 7.1 curl: cambio de plan (upgrade con cobro, downgrade con crédito, rechazo por cobro
      fallido, rechazo por plan inválido para el rol).
- [x] 7.2 curl: ciclo de dunning completo (forzar 2 fallos → `pago_pendiente`, forzar 3er fallo →
      degradación B2C/B2B, reintento exitoso que resetea).
- [x] 7.3 curl: liquidación de regalías con retención (país con override, país sin override →
      global), verificar bruto/retenido/neto en `mis-ganancias`.
- [x] 7.4 curl: crear país nuevo con moneda/tasa/IVA/retención propios, confirmar que un plan se
      muestra convertido a esa moneda.
- [x] 7.5 curl: editar precio de plan como admin, confirmar que no cambia el tier de acceso.
- [x] 7.6 curl: checkout con tarjeta simulada válida/ inválida, confirmar que solo quedan los
      últimos 4 dígitos persistidos; notificación de factura visible tras un pago exitoso.
- [x] 7.7 Playwright: cambio de plan, estado de cobro pendiente + reintento, checkout con tarjeta,
      pantalla de configuración global (países/precios), ganancias con retención visible.

## 8. Documentación y cierre

- [x] 8.1 Completar trazabilidad en `openspec/specs/{suscripciones,regalias,distribucion,
      facturacion}/spec.md` (incluida la corrección retroactiva del requirement de método de
      pago).
- [x] 8.2 `openspec archive`.
- [x] 8.3 Actualizar `docs/BITACORA_S11.md` (o `S12` según fecha) con el bloque de este change.
- [x] 8.4 Actualizar `README.md` (tablas ClickHouse nuevas, capabilities, secciones afectadas).
- [x] 8.5 Dejar frontend corriendo (`npm run dev`, 5173) sin apagarlo.
