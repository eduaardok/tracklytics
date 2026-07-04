# Package: creadores

> Solicitud y aprobación de cuenta de artista, subida de tracks y aprobación/rechazo individual
> con promoción real al catálogo (`FACT_TRACKS`) — `CuentaArtistaPage` (autoservicio, cualquier
> rol) y `RevisionCreadoresPage` (admin-only, en `/seguridad/creadores`).
>
> Estas páginas requieren sesión autenticada — la ruta `/creadores` está envuelta en
> `RequireAuth` (paquete `seguridad`) y `apiClient` inyecta el token automáticamente. La brecha
> descrita en `docs/decisiones-refactorizacion.md` sección 13 (login/registro solo en el
> frontend vanilla) ya se resolvió para el frontend React.

## Estructura

```
packages/creadores/
├── pages/          # Vistas de nivel ruta (cada archivo = una ruta)
├── components/     # Componentes internos — NO exportar desde aquí
├── api/            # Llamadas tipadas a los endpoints FastAPI de este paquete
├── types.ts        # Tipos del dominio de esta capability
└── index.ts        # Única interfaz pública — lo único importable por otros paquetes
```

## Regla de aislamiento

Otros paquetes **solo pueden importar desde `index.ts`** de este módulo.
Nunca importar directamente desde `components/`, `pages/`, ni `api/`.
