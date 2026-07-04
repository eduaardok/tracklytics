# Package: suscripciones

> Selección/confirmación de plan B2C (Free/Premium) o B2B (Básico/Pro/Enterprise), consulta y
> cancelación del plan activo, en una sola pantalla (`PlanesPage`, ruta `/suscripciones`) — igual
> que el legacy `app/autenticacion/planes.html`, que ya combinaba ambos flujos.
>
> Expone también `resolverDestinoPostAuth` (orquestación post-login/registro: auto-asigna Free a
> B2C sin plan, redirige B2B sin plan a `/suscripciones?onboarding=1`) y `usePlanActivo` (hook de
> estado de plan para gating parcial de contenido, ej. paywall de audio features en `catalogo`).
> Ambos se consumen desde otros paquetes vía `index.ts`.
>
> Esta ruta requiere sesión autenticada — envuelta en `RequireAuth` (paquete `seguridad`).

## Estructura

```
packages/suscripciones/
├── pages/          # Vistas de nivel ruta (cada archivo = una ruta)
├── components/     # Componentes internos — NO exportar desde aquí
├── api/            # Llamadas tipadas a los endpoints FastAPI de este paquete
├── hooks/          # Hooks reutilizables del dominio de esta capability
├── types.ts        # Tipos del dominio de esta capability
└── index.ts        # Única interfaz pública — lo único importable por otros paquetes
```

## Regla de aislamiento

Otros paquetes **solo pueden importar desde `index.ts`** de este módulo.
Nunca importar directamente desde `components/`, `pages/`, `api/`, ni `hooks/`.
