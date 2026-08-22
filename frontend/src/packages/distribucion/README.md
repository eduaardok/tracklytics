# Package: distribucion

> Sellos discográficos, licencias de distribución por país y restricciones de reproducción por
> país/canal — `DistribucionAdminPage` (admin-only, con pestañas Sellos/Licencias/Restricciones,
> en `/seguridad/distribucion`) y `DisponibilidadPage` (B2C, `/distribucion/disponibilidad`).
>
> Al igual que `facturacion`/`creadores`/`social`, estas páginas requieren sesión autenticada en
> el frontend React, que todavía no está wireada — login/registro siguen en el frontend vanilla
> `app/` (puerto 8081). Ver `docs/decisiones-refactorizacion.md` sección 13: es una brecha
> conocida y pendiente a nivel de todo el frontend React, no un defecto de esta capability.
>
> **`DisponibilidadPage` es una vista mínima temporal**, no el detalle de track real: al momento
> de implementar `distribucion`, `catalogo` todavía no tiene esa vista en React (`TrackCard.tsx`
> tiene su click deliberadamente deshabilitado) — esa migración es responsabilidad de la
> capability `experiencia`. Mientras tanto, la consulta de disponibilidad (RF-DIS-008) se hace por
> `fact_id` manual, mismo patrón que `TrackSocialPage` en `social`.
>
> **El bloqueo real de reproducción (RF-DIS-007) no se ve en el frontend React**: el
> "reproductor persistente" que efectivamente llama a `POST /app/v1/biblioteca/historial/{fact_id}`
> vive en el frontend vanilla (`app/js/history.js`), no en `packages/catalogo` de React (que
> todavía no tiene esa integración). El backend devuelve el `403` con un `detail` de texto plano
> (no un objeto) a propósito: el manejo global de errores en `app/js/api.js::apiFetch` ya muestra
> un toast para cualquier `403` de la API leyendo `err.detail` como string — no fue necesario
> tocar ese código para que el bloqueo se vea en la app real.
>
> **Limitación conocida heredada de `seguridad` (design.md, Decisión 5):** el país del usuario
> (`DIM_USUARIO.pais`) es texto libre sin normalizar contra `DIM_PAIS`. El bloqueo geográfico y la
> consulta de disponibilidad solo funcionan de forma confiable si ese texto coincide con el
> nombre o código ISO de un país sembrado — de lo contrario el sistema no bloquea (fail-open).

## Estructura

```
packages/distribucion/
├── pages/          # Vistas de nivel ruta (cada archivo = una ruta)
├── components/     # Componentes internos — NO exportar desde aquí
├── api/            # Llamadas tipadas a los endpoints FastAPI de este paquete
├── types.ts        # Tipos del dominio de esta capability
└── index.ts        # Única interfaz pública — lo único importable por otros paquetes
```

## Regla de aislamiento

Otros paquetes **solo pueden importar desde `index.ts`** de este módulo.
Nunca importar directamente desde `components/`, `pages/`, ni `api/`.
