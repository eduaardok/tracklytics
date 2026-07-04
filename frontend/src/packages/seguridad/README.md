# Package: seguridad

> Gestión de permisos granulares (CU-O17), auditoría de operaciones sensibles (CU-O18) y
> errores de sistema (CU-O19) — panel admin en `/seguridad`.
>
> El registro/login/logout (CU-O01) tiene backend en `api/paquetes/seguridad/` y dos frontends:
> `app/js/auth.js` (vanilla, sigue en producción en el puerto 8081) y `LoginPage`/`RegisterPage`
> de este paquete (React, `/login` y `/register`). Este paquete también posee la sesión del
> frontend React (`shared/lib/session.ts` para el storage de bajo nivel, `auth.api.ts` para
> login/registro/logout, `RequireAuth` como guard de ruta genérico) — `apiClient`
> (`shared/lib/api-client.ts`) inyecta el token en todas las llamadas API automáticamente.
> MFA sigue fuera de alcance.

## Estructura

```
packages/seguridad/
├── pages/          # Vistas de nivel ruta (cada archivo = una ruta)
├── components/     # Componentes internos — NO exportar desde aquí
├── api/            # Llamadas tipadas a los endpoints FastAPI de este paquete
├── types.ts        # Tipos del dominio de esta capability
└── index.ts        # Única interfaz pública — lo único importable por otros paquetes
```

## Regla de aislamiento

Otros paquetes **solo pueden importar desde `index.ts`** de este módulo.
Nunca importar directamente desde `components/`, `pages/`, ni `api/`.
