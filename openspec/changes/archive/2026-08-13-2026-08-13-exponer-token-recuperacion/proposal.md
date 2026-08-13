## Why

`POST /auth/recuperar` generaba y persistía el token de recuperación (correcto según el spec de
`seguridad`), pero nunca lo exponía en ningún lado alcanzable: ni en la respuesta de la API ni en
la UI. El propio comentario de `reenviarVerificacion` en `auth.api.ts` decía "mismo patrón que la
recuperación de contraseña" asumiendo que ya funcionaba así — no era cierto. Sin un proveedor de
correo real (patrón de simulación de todo el proyecto), esto dejaba el flujo de "olvidé mi
contraseña" imposible de completar por cualquier vía: el usuario quedaba pidiendo un token que
nunca podía obtener. Reportado en vivo por el usuario ("no veo que me lleguen instrucciones").

## What Changes

- **Backend**: `POST /auth/recuperar` agrega `token_recuperacion` a la respuesta cuando el correo
  corresponde a un usuario real — mismo patrón ya usado por `reenviar_verificacion`. Un correo
  inexistente sigue recibiendo la respuesta genérica sin el campo, sin revelar su inexistencia
  por ausencia/presencia de otra cosa que el campo del token en sí (mismo trade-off ya aceptado
  en el flujo de verificación de email).
- **Frontend**: `LoginPage.tsx` precarga automáticamente el campo "Token de recuperación" con el
  valor recibido y lo indica explícitamente ("entorno de demostración: no se envía correo real,
  tu token ya quedó cargado abajo"), en vez de dejar un campo vacío que el usuario no tiene forma
  de completar.

## Capabilities

### Modified Capabilities

- `seguridad`: la recuperación de contraseña SHALL exponer el token generado en la propia
  respuesta cuando el correo corresponde a un usuario real, no solo persistirlo.

## Impact

- **Backend**: `api/paquetes/seguridad/router.py` (`recuperar_password` agrega
  `token_recuperacion` a la respuesta).
- **Frontend**: `packages/seguridad/api/auth.api.ts` (`recuperarPassword` tipa el campo nuevo),
  `packages/seguridad/pages/LoginPage.tsx` (precarga el token, aviso de entorno de demo).
- **Compatibilidad**: `token_recuperacion` es un campo nuevo y opcional en la respuesta — ningún
  consumidor existente se rompe por su presencia.
