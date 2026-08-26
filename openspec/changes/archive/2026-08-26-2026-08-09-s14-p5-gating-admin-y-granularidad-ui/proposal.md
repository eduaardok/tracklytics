## Why

Verificación real de S14-P5 (arranque limpio + Playwright, no solo curl) encontró dos huecos
que ninguna verificación anterior por `curl` con Bearer token podía detectar, porque un
Bearer token nunca pasa por los guards de React Router: `RequireAuth roles={['admin']}`
(que protege TODO `/seguridad/*` y `/reportes/*`, 30 informes compuestos) comparaba contra el
`role` crudo de PocketBase, que solo vale `admin` para la cuenta superadmin bootstrap — las 6
cuentas `admin_*` de demo (asignadas por `BRIDGE_USUARIO_ROL_ADMIN`, no por PocketBase)
quedaban redirigidas a `/` (catálogo B2C) al intentar entrar al panel administrativo desde el
navegador, aunque el backend las autorizara sin problema. El mismo patrón bloqueaba
`require_b2b_panel_access`/`require_staff` (paquete `analitica`) para cualquier superadmin
cuyo `record.role` de PocketBase no fuera literalmente `admin` — el caso real encontrado fue
la propia cuenta `superadmin@demo.tracklytics.com`, con fila `superadmin` vigente en
`BRIDGE_USUARIO_ROL_ADMIN` pero `role: "user"` en PocketBase (drift de datos previo a este
sprint). Además, el selector de granularidad de los 30 informes compuestos (backend listo
desde S14-P2) nunca se conectó al frontend.

## What Changes

- **`RequireAuth` reconoce el modelo de autorización real**: en vez de comparar
  `getRole() === 'admin'` literal, usa `esAdmin` (calculado en el login: `role === 'admin'`
  O al menos un rol vigente en `BRIDGE_USUARIO_ROL_ADMIN`) para decidir acceso a rutas
  `roles={['admin']}`.
- **`GET /seguridad/perfil` (autoservicio) expone `roles_admin` propios** — necesario para
  que el frontend pueda calcular `esAdmin` sin depender de `GET /admin/usuarios/{id}`, que es
  `superadmin`-only y por lo tanto inútil para que un `admin_datos` consulte sus propios
  roles.
- **`require_b2b_panel_access`/`require_staff` (paquete `analitica`) ganan el mismo fallback
  a `BRIDGE_USUARIO_ROL_ADMIN`** que ya tenía `require_rol_admin` (paquete `seguridad`) —
  antes solo miraban `record.role`, dejando fuera a cualquier superadmin cuyo campo de
  PocketBase no coincidiera exactamente.
- **Selector de granularidad en los 30 informes compuestos**: `ReportLayout` gana un select
  (Día/Semana/Mes/Trimestre/Año, default Mes), propagado por `useCompoundReport` →
  `reportesApi.compuesto(..., { granularidad })` → el parámetro `granularidad` que el
  backend ya aceptaba desde S14-P2. Cambiar de granularidad limpia el filtro de rango
  Desde/Hasta (el formato de período cambia, un filtro heredado ya no compara nada sensato).
- **Corrección de exportación PDF**: los bloques de filtros/selectores (granularidad,
  Desde/Hasta, y ~25 toolbars/searchbars equivalentes en páginas con `ExportPDFButton`
  directo) se excluyen de la captura vía `data-pdf-export-ignore="true"`. El dashboard
  ejecutivo (`/analitica`) gana su propio botón de exportación, que antes no existía.
- **Mapeo monto→plan con fallback de cercanía** (`etl/gold_ch/adquisicion.py`): una
  transacción cuyo monto no calza exacto con ningún `DIM_PLAN.precio_usd` ya no queda fuera
  de `activos_por_plan`/`conversiones_por_plan` — se asigna al plan de precio más cercano en
  valor absoluto. `GOLD_ETL_LOG.detalle` distingue exactos vs. aproximados.
- **Pulido visual** (estados vacíos/carga faltantes en `ConfiguracionGlobalTab`, botón nativo
  sin estilizar en el error state del dashboard ejecutivo).

## Capabilities

### Modified Capabilities

- `seguridad`: el frontend SHALL reconocer el mismo modelo de autorización administrativa
  (superadmin o cualquier rol de área vigente por `BRIDGE_USUARIO_ROL_ADMIN`) que ya usa el
  backend, no solo `record.role == 'admin'` de PocketBase. El autoservicio de perfil SHALL
  incluir los roles administrativos propios del usuario autenticado.
- `analitica`: el gating de "staff interno" (paneles B2B sin suscripción, reporte diario
  operativo) SHALL reconocer tanto `record.role == 'admin'` como un rol `superadmin` vigente
  en `BRIDGE_USUARIO_ROL_ADMIN`, igual que el resto de la autorización administrativa del
  sistema.
- `reportes`: los 30 informes compuestos SHALL exponer en la interfaz el control de
  granularidad temporal que la capa Gold y la API ya soportan desde S14-P2, con Mes como
  valor por defecto.

## Impact

- **Frontend**: `RequireAuth.tsx`, `session.ts` (+`rolesAdmin`/`esAdmin` en `SessionUser`),
  `auth.api.ts` (login resuelve `esAdmin` vía `/seguridad/perfil`), `SeguridadShell.tsx`
  (gating del link "Simulación" usa la sesión, no un endpoint superadmin-only),
  `ReportLayout.tsx`, `useCompoundReport.ts`, `reportes.api.ts`, `InformeCompuestoPage.tsx`,
  `DashboardPage.tsx`/`.module.css` (botón export + fix de botón nativo), ~26 páginas con
  `ExportPDFButton` directo (atributo `data-pdf-export-ignore`), `ConfiguracionGlobalTab.tsx`
  (estados vacío/carga).
- **Backend**: `api/paquetes/seguridad/router.py` (`GET /perfil` +`roles_admin`),
  `api/paquetes/analitica/deps.py` (`_es_staff_interno` con fallback BRIDGE).
- **ETL**: `etl/gold_ch/adquisicion.py` (`resolver_plan` con fallback de cercanía).
- **Compatibilidad**: ningún contrato de endpoint existente cambia de forma incompatible —
  `granularidad` ya era un query param opcional; `roles_admin` es un campo nuevo agregado a
  una respuesta existente, no un campo removido o renombrado.
