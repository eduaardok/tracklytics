## 1. Backend — guard y router interno

- [x] 1.1 `api/paquetes/partners/deps.py`: agregar `require_partner_admin` (`role == "admin"` sobre `get_current_user`, mismo patrón thin que `seguridad/deps.py::require_admin` y `analitica/deps.py::require_staff`).
- [x] 1.2 `api/paquetes/partners/router.py`: agregar `v1_router = APIRouter(prefix="/app/v1/partners", tags=["Partners v1"], dependencies=[Depends(require_partner_admin)])`, sin tocar el `router` existente (`/partners/v1`, autenticado por API key de partner).
- [x] 1.3 `api/main.py`: importar `v1_router as partners_v1_router` e incluirlo junto al `partners_router` ya existente.

## 2. Backend — agregación y enriquecimiento

- [x] 2.1 `api/paquetes/partners/queries.py`: agregar `METRICAS_POR_PARTNER` — agrega `LOG_LLAMADAS_PARTNER` por `partner_id` (total de llamadas, `countIf(resultado = 'success')`/`countIf(resultado != 'success')`, `avgIf(duracion_ms, resultado = 'success')` como latencia promedio de llamadas exitosas) y una segunda agregación por `(partner_id, tier_usado)` para el desglose por tier.
- [x] 2.2 `api/paquetes/partners/pb_client.py`: agregar función para resolver nombre de partner por id (reutilizando el token de superusuario cacheado ya existente en `_get_admin_token`), usada solo para el conjunto de `partner_id` distintos devuelto por la agregación.
- [x] 2.3 `GET /app/v1/partners/metricas` en `v1_router`: combina la agregación de ClickHouse con el nombre resuelto desde PocketBase; responde lista vacía si `LOG_LLAMADAS_PARTNER` no tiene filas, sin error.

## 3. Frontend — `frontend/src/packages/partners/`

- [x] 3.1 `types.ts`: agregar tipo para la métrica agregada por partner (id, nombre, total_llamadas, tasa_exito, latencia_promedio_ms, desglose_por_tier).
- [x] 3.2 `api/partners.api.ts` (o archivo nuevo en el mismo paquete, sin tocar el objeto `partnersApi.probe` existente): agregar función que llama a `GET /app/v1/partners/metricas` vía el cliente HTTP autenticado por sesión (`shared/lib/api-client.ts`), a diferencia de `probe()` que deliberadamente no usa ese cliente.
- [x] 3.3 `pages/PartnersMetricasPage.tsx` + módulo CSS: tabla/tarjetas por partner (total de llamadas, tasa de éxito/error, latencia promedio, desglose por tier), mismos tokens `oklch`, Space Grotesk (encabezados) y JetBrains Mono (valores numéricos) ya usados en el resto de `seguridad`/`partners`. Estado vacío explícito si no hay datos.
- [x] 3.4 `index.ts`: exportar `PartnersMetricasPage`.
- [x] 3.5 `frontend/src/app/router.tsx`: agregar ruta `/seguridad/partners/metricas` dentro del árbol de `SeguridadShell` (`roles={['admin']}` ya heredado del shell, sin guard adicional por ruta).
- [x] 3.6 `frontend/src/app/layout/SeguridadShell.tsx`: agregar link de nav "Métricas de partners" junto al ya existente de la consola.

## 4. Verificación

- [x] 4.1 Backend: `curl` real contra Docker — sin sesión → `401`; sesión `role=user`/`analyst` → `403`; sesión `role=admin` → `200` con datos reales de `LOG_LLAMADAS_PARTNER` ya poblada en producción (tráfico generado por la propia consola de partners y por pruebas previas).
- [x] 4.2 Confirmar con `clickhouse-client` real que los totales/tasas devueltos por el endpoint coinciden con un `SELECT` manual equivalente contra `LOG_LLAMADAS_PARTNER`.
- [x] 4.3 Frontend: `tsc --noEmit` y `npm run build` limpios. Verificado en navegador real (Playwright): sesión admin ve la página con datos reales y sin errores de consola; sesión no-admin no ve el link de nav y recibe 403 si navega directo a la ruta.
- [x] 4.4 Confirmar que `partnersApi.probe()` (consola existente) sigue funcionando sin cambios — este trabajo no debe tocar la superficie pública `/partners/v1/*` ni su guard `require_partner`.
