# Package: partners

> `PartnersConsolePage` (`/seguridad/partners`, admin-only vía `SeguridadShell`) — réplica
> funcional mínima de `app/partners/console.html`: prueba `/partners/v1/*` con una API key real,
> igual que un partner externo, sin usar la sesión del admin. La API `/partners/v1/*` en sí NO es
> admin-only en el backend — se autentica con `X-API-Key` (`require_partner`), no con
> `role=admin`; solo esta consola de verificación lo es (`require_lead_data_engineer`-equivalente
> aplicado al nivel de shell, no a la API). No se replicó `landing.html` (demo pública para
> partners externos, sin sesión — ver `openspec/specs/partners/spec.md`, "Herramientas de
> verificación y demo").

## Estructura

```
packages/partners/
├── pages/          # Vistas de nivel ruta (cada archivo = una ruta)
├── components/     # Componentes internos — NO exportar desde aquí
├── api/            # Llamadas tipadas a los endpoints FastAPI de este paquete
├── types.ts        # Tipos del dominio de esta capability
└── index.ts        # Única interfaz pública — lo único importable por otros paquetes
```

## Regla de aislamiento

Otros paquetes **solo pueden importar desde `index.ts`** de este módulo.
Nunca importar directamente desde `components/`, `pages/`, ni `api/`.
