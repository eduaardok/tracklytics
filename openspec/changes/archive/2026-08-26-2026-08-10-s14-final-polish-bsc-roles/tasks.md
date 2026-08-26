## Tasks

- [x] Auditar `roles` reales por endpoint (`require_rol_admin`) en las 9 capabilities con
      panel admin y mapear cada link de `SeguridadShell` al rol correcto.
- [x] Fix del bug de OR en `RequireAuth` con listas de roles combinadas.
- [x] `shared/lib/roles.ts`: `rolesDeUsuario`, `puedeVer`, `landingPostLogin`, `ROL_LABELS`/`ROL_COLORS`.
- [x] `RoleBadge.tsx` en `UserMenu` y pie de `SeguridadShell`.
- [x] Landing post-login por rol en `LoginPage.tsx`, sin romper el flujo de onboarding B2B.
- [x] `GET /analitica/bsc/resumen` (backend) + `BalancedScorecardPage.tsx` (frontend).
- [x] Verificar con `curl` real: superadmin 200, analyst/admin_finanzas 403.
- [ ] Playwright: login real por rol, landing correcta, sidebar diferenciado, export PDF — verificación E2E pendiente, requiere stack levantado (Docker + Playwright).
- [x] Clon limpio + `npm run build` — verificado en S17 (26 ago 2026) sin Docker levantado.
