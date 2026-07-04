# Package: social

> Seguir/dejar de seguir artistas, comentar tracks (con respuestas y placeholder para comentarios
> ocultos) y registrar la intención de compartir contenido — `SeguidosSocialPage` (hub, `/social`),
> `ArtistaSocialPage` (`/social/artista/:artistaId`), `TrackSocialPage` (`/social/track/:factId`)
> y `ModeracionSocialPage` (admin-only, en `/seguridad/social`).
>
> Estas páginas requieren sesión autenticada — las rutas `/social/*` están envueltas en
> `RequireAuth` (paquete `seguridad`) y `apiClient` inyecta el token automáticamente. La brecha
> descrita en `docs/decisiones-refactorizacion.md` sección 13 (login/registro solo en el
> frontend vanilla) ya se resolvió para el frontend React.
>
> **`ArtistaSocialPage`/`TrackSocialPage` son vistas mínimas temporales**, no el perfil de
> artista ni el detalle de track reales: al momento de implementar `social`, `catalogo` todavía
> no tiene esas vistas en React (`TrackCard.tsx` tiene su click deliberadamente deshabilitado) —
> esa migración es responsabilidad de la capability `experiencia`, que reactivará el click y
> podrá reincorporar los componentes de seguir/comentar/compartir de aquí dentro de esa vista
> real. Mientras tanto, la única entrada de navegación es el hub `SeguidosSocialPage`
> (`/social`): lista los artistas seguidos (cada uno enlaza a su `ArtistaSocialPage`) y ofrece un
> campo para saltar manualmente a los comentarios de un track por `fact_id` — no hay enlace
> natural desde el catálogo todavía.

## Estructura

```
packages/social/
├── pages/          # Vistas de nivel ruta (cada archivo = una ruta)
├── components/     # Componentes internos — NO exportar desde aquí
├── api/            # Llamadas tipadas a los endpoints FastAPI de este paquete
├── types.ts        # Tipos del dominio de esta capability
└── index.ts        # Única interfaz pública — lo único importable por otros paquetes
```

## Regla de aislamiento

Otros paquetes **solo pueden importar desde `index.ts`** de este módulo.
Nunca importar directamente desde `components/`, `pages/`, ni `api/`.
