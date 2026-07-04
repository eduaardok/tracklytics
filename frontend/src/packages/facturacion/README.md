# Package: facturacion

> Registro de métodos de pago, pago simulado de suscripciones e historial de transacciones/
> invoices (CU-O20/21/22), con auditoría admin de terceros (CU-O23) en `/seguridad/facturacion`.
>
> Estas páginas requieren sesión autenticada — la ruta `/facturacion` está envuelta en
> `RequireAuth` (paquete `seguridad`) y `apiClient` inyecta el token automáticamente. La brecha
> descrita en `docs/decisiones-refactorizacion.md` sección 13 (login/registro solo en el
> frontend vanilla) ya se resolvió para el frontend React.

## Estructura

```
packages/facturacion/
├── pages/          # Vistas de nivel ruta (cada archivo = una ruta)
├── components/     # Componentes internos — NO exportar desde aquí
├── api/            # Llamadas tipadas a los endpoints FastAPI de este paquete
├── types.ts        # Tipos del dominio de esta capability
└── index.ts        # Única interfaz pública — lo único importable por otros paquetes
```

## Regla de aislamiento

Otros paquetes **solo pueden importar desde `index.ts`** de este módulo.
Nunca importar directamente desde `components/`, `pages/`, ni `api/`.
