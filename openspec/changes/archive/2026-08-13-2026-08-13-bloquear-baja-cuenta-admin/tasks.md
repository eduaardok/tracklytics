## Tasks

- [x] `baja_cuenta` (backend): rechazar con 403 si `role == 'admin'` o `roles_admin_vigentes`
      no está vacío.
- [x] `ProfilePage.tsx`: ocultar la zona de peligro cuando `user.esAdmin`.
- [x] Verificar con `curl` real: superadmin 403, admin_finanzas (rol de área) 403, usuario
      normal 200 (cuenta descartable de prueba).
- [x] Verificar con Playwright que la sección no aparece en el DOM para superadmin ni
      admin_finanzas, y sí aparece para un usuario normal.
- [x] `npm run build` sin errores.
