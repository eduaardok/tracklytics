## 1. Backend — búsqueda de usuarios (seguridad)

- [x] 1.1 Agregar `USUARIOS_BUSQUEDA` a `api/paquetes/seguridad/queries.py`: `SELECT usuario_id, nombre, email, rol FROM DIM_USUARIO WHERE lower(nombre) LIKE lower({pattern:String}) OR lower(email) LIKE lower({pattern:String}) ORDER BY nombre LIMIT {limit:UInt32}`.
- [x] 1.2 Agregar `GET /app/v1/seguridad/usuarios/buscar?q=&limit=` en `api/paquetes/seguridad/router.py`, gateado por `require_admin`, siguiendo el mismo estilo que `tracks_search` (query vacía → sin resultados, `pattern = f"%{q.strip()}%"`, `limit` acotado con `Query(20, ge=1, le=50)`).
- [x] 1.3 Verificar con curl: sin token (401/403), con token no-admin (403), con token admin y coincidencia parcial de nombre, con coincidencia parcial de correo, y sin coincidencias (lista vacía).

## 2. Frontend — componentes de selección compartidos

- [x] 2.1 Crear `frontend/src/shared/components/TrackPicker.tsx` + `.module.css`, generalizando el patrón de `frontend/src/packages/analitica/components/ArtistPicker.tsx` (debounce 300ms, `onMouseDown` para seleccionar, botón de limpiar, `role="listbox"`), consumiendo `GET /tracks/search` y mostrando `AlbumArt` + nombre + artista por resultado.
- [x] 2.2 Crear `frontend/src/shared/components/UserPicker.tsx` + `.module.css`, mismo patrón, consumiendo el endpoint nuevo de 1.2 y mostrando nombre + correo por resultado.
- [x] 2.3 Ambos componentes solo disparan búsqueda con 2+ caracteres, igual que `ArtistPicker`.

## 3. Frontend — reemplazo de los 5 inputs de ID crudo

- [x] 3.1 `frontend/src/packages/distribucion/pages/DisponibilidadPage.tsx`: reemplazar el input numérico de `fact_id` por `TrackPicker`, adaptando el submit para usar el `fact_id` del track seleccionado.
- [x] 3.2 `frontend/src/packages/social/pages/SeguidosSocialPage.tsx`: reemplazar el input numérico de `fact_id` por `TrackPicker`, manteniendo la navegación a `/social/track/:factId` al seleccionar.
- [x] 3.3 `frontend/src/packages/seguridad/pages/PermisosPage.tsx`: reemplazar el input de `usuario_id` por `UserPicker`.
- [x] 3.4 `frontend/src/packages/facturacion/pages/AuditoriaFacturacionPage.tsx`: reemplazar el input de `usuario_id` por `UserPicker`.
- [x] 3.5 `frontend/src/packages/experiencia/pages/FamiliaAdminPage.tsx`: reemplazar los dos inputs de `usuario_id` (titular, miembro) por `UserPicker`.

## 4. Validación

- [x] 4.1 `tsc --noEmit` y `npm run build` limpios en `frontend/`.
- [x] 4.2 Playwright: recorrer las 7 vistas tocadas por este cambio y por el fix visual del header (AnalyticaShell, SeguridadShell, DisponibilidadPage, SeguidosSocialPage, PermisosPage, AuditoriaFacturacionPage, FamiliaAdminPage — esta última con 2 selectores, titular y miembro), confirmar 0 errores de consola y que la búsqueda/selección funciona contra datos reales. Screenshot antes/después de cada vista.
