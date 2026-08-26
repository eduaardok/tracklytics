## 1. Selector de granularidad (frontend)
- [x] 1.1 `ReportLayout` gana el selector (Día/Semana/Mes/Trimestre/Año)
- [x] 1.2 `useCompoundReport`/`reportes.api.ts` propagan `granularidad`, reset de Desde/Hasta al cambiar
- [x] 1.3 Verificado en navegador real (Playwright): cambiar a Trimestre recarga con etiquetas de período distintas

## 2. Corrección de exportación PDF
- [x] 2.1 `data-pdf-export-ignore` en filtros de `ReportLayout` y en ~25 páginas con `ExportPDFButton` directo
- [x] 2.2 Botón de exportación en el dashboard ejecutivo (`/analitica`), antes inexistente

## 3. Bug de gating admin en el frontend (hallazgo de verificación)
- [x] 3.1 `GET /seguridad/perfil` expone `roles_admin` propios
- [x] 3.2 `authApi.login` calcula y guarda `esAdmin`/`rolesAdmin` en la sesión
- [x] 3.3 `RequireAuth` usa `esAdmin` en vez de comparar `role` crudo
- [x] 3.4 `require_b2b_panel_access`/`require_staff` (analitica) con fallback a `BRIDGE_USUARIO_ROL_ADMIN`
- [x] 3.5 Verificado en navegador real: 3 cuentas admin_* distintas + superadmin, antes y después del fix

## 4. Mapeo monto→plan con fallback de cercanía
- [x] 4.1 `resolver_plan()` en `etl/gold_ch/adquisicion.py`
- [x] 4.2 Verificado contra ClickHouse real: 42 transacciones antes sin plan, ahora asignadas por cercanía, 0 sin plan

## 5. Pulido visual
- [x] 5.1 Estados vacío/carga en `ConfiguracionGlobalTab`
- [x] 5.2 Botón nativo sin estilizar en el error state del dashboard ejecutivo

## 6. Verificación
- [x] 6.1 `npm run build` verde
- [x] 6.2 Playwright contra el stack real: granularidad, gating de Simulación, export PDF del dashboard
- [x] 6.3 `openspec validate --strict` verde
