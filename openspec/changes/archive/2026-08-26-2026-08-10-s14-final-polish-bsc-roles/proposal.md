## Why

Pre-inspección real del repo (S14-FINAL) encontró que casi todo lo que el prompt de la sesión
pedía en performance/PDF/lazy-loading ya estaba hecho (ver `docs/BITACORA_S14.md`, bloque
S14-FINAL, tabla de premisas). Lo genuinamente nuevo/pendiente: (1) el sidebar administrativo
solo distinguía "admin vs. no admin" a nivel de un único link (Simulación) en vez de reflejar
los 6 roles de área reales que el backend ya autoriza de forma distinta por endpoint
(`require_rol_admin` por capability); (2) `RequireAuth.tsx` tenía un bug latente donde
`roles={['admin', otroRol]}` nunca miraba `otroRol`; (3) ningún rol admin/analyst aterrizaba en
un panel propio tras el login, todos caían en el catálogo B2C genérico; (4) no existía ninguna
vista de nivel estratégico (Balanced Scorecard) pese a que las 4 perspectivas clásicas del BSC
son calculables con las tablas Gold ya pobladas.

## What Changes

- **Sidebar administrativo dinámico por rol real**: `SeguridadShell.tsx` gana un campo
  `roles?: string[]` por sección/link, poblado leyendo directamente los `require_rol_admin(...)`
  de cada capability backend (`grep` en 9 archivos `deps.py`/`router.py`), no una tabla asumida
  — corrigiendo 3 casos donde una suposición razonable habría sido incorrecta (Publicidad es
  `admin_finanzas`, no `admin_comercial`; Suscripciones admin es `admin_comercial`, no
  `admin_finanzas`; Strikes es `admin_comunidad`, no superadmin). Un admin de área ya no ve
  secciones/links que el backend le rechazaría con 403 de todos modos.
- **Fix de `RequireAuth`**: el chequeo de `roles` combinados (ej. `['admin', 'analyst']`) ahora
  evalúa ambas condiciones con OR real, no un ternario que descartaba la segunda rama.
- **Landing post-login por rol**: `superadmin`/`analyst` → dashboard ejecutivo; cada uno de los
  5 roles de área → su panel principal (finanzas, catálogo, social, ingesta, partners) — nuevo
  módulo `shared/lib/roles.ts` (`landingPostLogin`), aplicado solo cuando el flujo de onboarding
  B2B existente (`resolverDestinoPostAuth`) ya determinó que no hace falta onboarding, para no
  interferir con esa lógica de planes.
- **Balanced Scorecard estratégico** (`GET /analitica/bsc/resumen`, `require_staff`): 4
  perspectivas (Financiera, Cliente, Procesos Internos, Aprendizaje y Crecimiento) × 2 KPIs cada
  una, con semáforo/progreso/tendencia calculados sobre agregaciones reales de 6 tablas Gold.

## Capabilities

### Modified Capabilities

- `seguridad`: `RequireAuth` con lista de roles combinados SHALL evaluar cada rol
  independientemente (OR), no solo el primero que matchee un caso especial.

### Added Capabilities

- `analitica`: el sistema SHALL exponer un resumen de Balanced Scorecard estratégico (4
  perspectivas, 2 KPIs cada una) calculado sobre datos reales de la capa Gold, accesible solo a
  staff interno (mismo criterio que reporte diario/churn/funnel/P&L/MRR-ARR).

## Impact

- **Backend**: `api/paquetes/analitica/bsc.py` (nuevo), `api/paquetes/analitica/router.py`
  (+`GET /bsc/resumen`).
- **Frontend**: `shared/lib/roles.ts` (nuevo), `RequireAuth.tsx` (fix), `SeguridadShell.tsx`
  (sidebar por rol + pie de cuenta), `UserMenu.tsx`/`RoleBadge.tsx` (badge), `LoginPage.tsx`
  (landing por rol), `analitica/pages/BalancedScorecardPage.tsx` (nuevo), `app/router.tsx`
  (+ruta `/analitica/bsc`).
- **Compatibilidad**: ningún endpoint existente cambia de contrato; `GET /bsc/resumen` es un
  endpoint nuevo. El sidebar oculta links que antes eran visibles pero siempre devolvían 403 al
  hacer clic — no revoca ningún acceso real, solo deja de mostrar lo que ya no funcionaba.
