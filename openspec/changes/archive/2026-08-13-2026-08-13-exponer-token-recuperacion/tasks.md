## Tasks

- [x] `recuperar_password` (backend): agrega `token_recuperacion` a la respuesta cuando el
      correo existe, mismo patrón que `reenviar_verificacion`.
- [x] `auth.api.ts` / `LoginPage.tsx`: precarga el token recibido en el campo correspondiente,
      con aviso de entorno de demostración.
- [x] Verificar con curl: email existente trae `token_recuperacion`, email inexistente no.
- [x] Verificar el ciclo completo con curl: solicitar → restablecer con el token → login con la
      contraseña nueva, 200 en cada paso.
- [x] Verificar con Playwright el flujo completo en la UI real: solicitar, token precargado,
      cambiar contraseña, confirmación visible, login con la contraseña nueva.
- [x] `npm run build` sin errores.
