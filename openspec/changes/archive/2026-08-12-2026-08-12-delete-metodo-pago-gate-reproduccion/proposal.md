## Why

Auditoría rápida pre-demo (S16) encontró dos huecos reales:

1. `facturacion` nunca tuvo un `DELETE /metodos-pago/{id}` — ni backend ni UI. No es un bug de
   lógica: la operación simplemente no existe en ninguna capa, así que un método de pago
   registrado por error (o vencido) no se puede quitar nunca.
2. `GET /experiencia/radio/track/{fact_id}` no tenía ningún `Depends` de autenticación —
   cualquier cliente sin sesión podía armar la cola completa de radio. El único punto que hoy
   corta el flujo de reproducción es `GET /reproduccion/youtube-video-id` (`get_current_user`),
   pero corta tarde: el cliente ya arma la cola y el player arranca progreso simulado (fallback
   de audio ante cualquier error, incluido un 401) sin que el usuario sepa que necesita cuenta.

## What Changes

- **`DELETE /metodos-pago/{id}`** (facturacion): elimina un método de pago propio del usuario
  autenticado. Rechaza con 404 si el método no existe o pertenece a otro usuario (mismo
  `metodo_pago_existe` que ya usan `registrar_metodo_pago`/`procesar_pago`). Rechaza con 409 si
  el método está cubriendo el período de facturación EN CURSO de un cobro exitoso de suscripción
  (`FACT_TRANSACCION_PAGO.periodo_fin >= today()`), para no dejar sin forma de pago vigente una
  suscripción activa a mitad de período. Registra `accion="eliminacion_metodo_pago"` en el log de
  auditoría, mismo patrón que el registro. UI: botón de eliminar por método, con confirmación.
- **Gate de sesión antes de reproducir/iniciar radio** (experiencia): `GET
  /experiencia/radio/track/{fact_id}` ahora exige `get_current_user` (mismo umbral que
  `youtube-video-id` — sesión iniciada, no un rol B2C específico). `GET /mix-diario` ya exigía
  `require_b2c_user`, sin cambios ahí. Frontend: `PlayerContext.play()` corta ANTES de cualquier
  llamada de red si no hay sesión (ni reproducción real ni fallback simulado) y muestra un aviso
  invitando a iniciar sesión; `useRadio.iniciarRadio` hace el mismo chequeo antes de golpear el
  endpoint. `LoginPage` gana un enlace para seguir explorando el catálogo sin cuenta (la
  navegación del catálogo público ya no requería sesión — el hueco era solo de reproducción).

## Capabilities

### Modified Capabilities

- `facturacion`: nueva operación de eliminación de método de pago, con las reglas de propiedad y
  de período vigente descritas arriba.
- `experiencia`: la Radio basada en una canción SHALL exigir sesión iniciada.

## Impact

- **Backend**: `api/paquetes/facturacion/queries.py` (+`METODO_PAGO_DETALLE`,
  +`METODO_PAGO_EN_USO_VIGENTE`), `api/paquetes/facturacion/router.py`
  (+`DELETE /metodos-pago/{id}`), `api/paquetes/experiencia/router.py` (`radio_por_track` gana
  `Depends(get_current_user)`).
- **Frontend**: `packages/facturacion/api/facturacion.api.ts` (+`eliminarMetodoPago`),
  `packages/facturacion/pages/FacturacionPage.tsx` (+botón eliminar con confirmación),
  `packages/facturacion/pages/FacturacionPages.module.css` (+`.deleteBtn`),
  `shared/context/PlayerContext.tsx` (gate de sesión en `play()`),
  `packages/catalogo/hooks/useRadio.ts` (gate de sesión en `iniciarRadio`),
  `packages/seguridad/pages/LoginPage.tsx` (+enlace "explorar sin cuenta").
- **Compatibilidad**: ningún endpoint existente cambia de contrato. `radio/track/{fact_id}` pasa
  de público a autenticado — cualquier cliente sin sesión que lo llamaba directamente ahora recibe
  401 en vez de 200 (cambio de comportamiento intencional, es el hueco que se cierra).
