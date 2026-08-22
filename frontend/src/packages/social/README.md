# Package: social

> Seguir/dejar de seguir artistas, comentar tracks (con respuestas y placeholder para comentarios
> ocultos) y registrar la intención de compartir contenido — `SeguidosSocialPage` (hub, `/social`),
> `TrackSocialPage` (`/social/track/:factId`) y `ModeracionSocialPage` (admin-only, en
> `/seguridad/social`). La página social del artista (`ArtistaSocialPage`, antes en
> `/social/artista/:artistaId`) se eliminó en S16 (F8): duplicaba el follow del perfil de catálogo
> — esa ruta ahora redirige a `/catalogo/artista/:artistaId`, que concentra Seguir + Compartir.
>
> Estas páginas requieren sesión autenticada — las rutas `/social/*` están envueltas en
> `RequireAuth` (paquete `seguridad`) y `apiClient` inyecta el token automáticamente. La brecha
> descrita en `docs/decisiones-refactorizacion.md` sección 13 (login/registro solo en el
> frontend vanilla) ya se resolvió para el frontend React.
>
> **`TrackSocialPage` sigue siendo una vista de hilo, no el detalle real del track**: el detalle
> vive en `catalogo` (`/catalogo/track/:factId`) y desde S16 (F1) ambos lados se enlazan entre sí.
> El hub `SeguidosSocialPage` (`/social`) lista los artistas seguidos (cada uno enlaza al perfil
> de catálogo) y ofrece un campo para saltar manualmente a los comentarios de un track por
> `fact_id`; el feed de actividad también enlaza cada fila a su hilo.

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
