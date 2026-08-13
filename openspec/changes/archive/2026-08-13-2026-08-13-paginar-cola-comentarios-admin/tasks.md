## Tasks

- [x] `comentarios_admin_sql`/`comentarios_admin_count_sql` (backend): LIMIT/OFFSET + conteo
      total, mismo patrón que `denuncias_admin_sql`.
- [x] `listar_comentarios_admin`: acepta `page`/`limit`, responde `{data, total, page, limit}`.
- [x] `social.api.ts` / `ModeracionSocialPage.tsx`: paginador con el mismo patrón visual que
      `UsuariosAdminPage`, reset de página al cambiar filtro.
- [x] Verificar con curl: payload de ~11.5MB/2.2s → ~6KB/0.3s, `total` sigue reflejando el
      conteo real (37753).
- [x] Verificar con Playwright: `/seguridad/social` carga en ~2s, el DOM renderiza ~20 filas (no
      37753), el paginador muestra "Página 1 / 1888".
- [x] `npm run build` sin errores.
