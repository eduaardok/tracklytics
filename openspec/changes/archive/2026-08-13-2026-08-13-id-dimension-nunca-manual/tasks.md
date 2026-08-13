## Tasks

- [x] `dim_create` (backend): descarta cualquier `pk` del payload, siempre calcula
      `max(pk) + 1`, reconfirma unicidad antes de insertar (hasta 5 intentos).
- [x] `CrudDimensionesPage.tsx`: el formulario de creación ya no muestra el campo id.
- [x] Limpieza: fila duplicada `album_id=34011` (2015) eliminada de `DIM_ALBUMS`, verificado que
      el original (1999) y los 39 tracks que lo referencian quedaron intactos.
- [x] Verificar con curl: enviar `album_id=34011` a mano en la creación ya NO lo usa — el sistema
      asigna un id nuevo (`46597` en la prueba) y el registro 34011 original no se toca.
- [x] Verificar con Playwright: el formulario de "Nuevo" no renderiza el campo `artist_id`.
- [x] `npm run build` sin errores.
