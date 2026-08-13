## Why

`GET /social/admin/comentarios` (la cola de moderación de `/seguridad/social`) no tenía LIMIT ni
paginación — devolvía TODA `FACT_COMENTARIO` en una sola respuesta. Con el dataset real (~37.7k
comentarios) eso es un JSON de ~11.5MB que la pestaña tardaba ~2.2s en traer y luego colgaba al
renderizar una lista sin virtualizar con 37.7k `<li>` — reportado como "la página no responde"
al entrar a `/seguridad/social`. `denunciasAdmin` (mismo router) ya paginaba correctamente
(`page`/`limit`/`total` + `LIMIT/OFFSET`); comentarios se había quedado sin ese mismo tratamiento.

## What Changes

- **Backend**: `GET /social/admin/comentarios` gana `page`/`limit` (default 20, máx 100, mismo
  contrato que `denunciasAdmin`) y responde `{data, total, page, limit}` en vez de `{data}`. La
  query gana `LIMIT/OFFSET` y una query de conteo separada, mismo patrón que
  `denuncias_admin_sql`/`denuncias_count_sql`.
- **Frontend**: `ModeracionSocialPage.tsx` gana estado de página y un paginador (← Anterior /
  Página X de Y / Siguiente →, mismo patrón que `UsuariosAdminPage`), reseteando a página 1 al
  cambiar de filtro. El encabezado "Comentarios (N)" ahora usa el `total` real del servidor en
  vez de `data.length` de la página actual.

## Capabilities

### Modified Capabilities

- `social`: la cola administrativa de comentarios SHALL devolverse paginada, no completa en una
  sola respuesta.

## Impact

- **Backend**: `api/paquetes/social/queries.py` (+`comentarios_admin_count_sql`,
  `comentarios_admin_sql` gana LIMIT/OFFSET), `api/paquetes/social/router.py`
  (`listar_comentarios_admin` gana `page`/`limit` y responde con `total`).
- **Frontend**: `packages/social/api/social.api.ts` (`comentariosAdmin` gana `page`/`limit`,
  tipo de retorno cambia de `ApiResponse<Comentario>` a `{data, total, page, limit}`),
  `packages/social/pages/ModeracionSocialPage.tsx` (paginador nuevo).
- **Compatibilidad**: cambio de contrato en `GET /social/admin/comentarios` — el único
  consumidor es `ModeracionSocialPage.tsx`, actualizado en el mismo cambio. Sin parámetros,
  ahora devuelve la página 1 (20 más recientes) en vez de la tabla completa — un cliente externo
  que dependiera de recibir todo de una vez tendría que paginar explícitamente.
