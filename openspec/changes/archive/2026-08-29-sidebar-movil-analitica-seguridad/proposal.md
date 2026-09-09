## Why

`AnalyticaShell` y `SeguridadShell` ocultan el sidebar por completo bajo 768px
(`.sidebar { display: none; }` en `AnalyticaShell.module.css:180` y
`SeguridadShell.module.css:271`) sin ningún reemplazo. A diferencia del shell
B2C (`AppShell`), que resuelve el mismo breakpoint con `MobileNavDrawer`,
estos dos paneles dejan a analistas B2B y a los seis roles administrativos
sin forma de navegar entre secciones cuando abren el panel desde un
celular o tablet en modo retrato.

## What Changes

- Botón hamburguesa en el `brandBar` de `AnalyticaShell` y `SeguridadShell`,
  visible solo bajo 768px, que abre un panel overlay a pantalla completa
  (no un drawer lateral de 280px como `MobileNavDrawer` — los seis grupos de
  `SeguridadShell` no caben en un panel angosto sin scroll anidado dentro de
  otro scroll).
- El overlay reutiliza el `<nav>` del sidebar existente tal cual (nav base +
  `SidebarSection` por grupo + `AreaSwitcher` para superadmin) — mismo
  gating por rol/plan que cada shell ya calcula, sin aplanar ni duplicar esa
  lógica en una segunda estructura de datos.
- Cierre del overlay: click en backdrop, botón ✕, tecla Escape, cambio de
  ruta — mismo criterio que `MobileNavDrawer` en `AppShell`.
- Componente nuevo compartido `MobileSidebarOverlay` en
  `frontend/src/shared/components/` (recibe `open`, `onClose`, `children`).
  `MobileNavDrawer` no se toca ni se generaliza: sigue sirviendo solo a
  `AppShell` con su contrato plano `primary`/`secondary`.
- El sidebar de escritorio (≥768px) no cambia en ningún shell.

## Capabilities

### New Capabilities
(ninguna)

### Modified Capabilities
- `analitica`: nuevo requirement — navegación del panel de analítica
  accesible en móvil.
- `seguridad`: nuevo requirement — navegación del panel de administración
  accesible en móvil.

## Impact

Frontend only, sin cambios de backend, rutas ni gating:
- `frontend/src/app/layout/AnalyticaShell.tsx` / `.module.css`
- `frontend/src/app/layout/SeguridadShell.tsx` / `.module.css`
- `frontend/src/shared/components/MobileSidebarOverlay.tsx` (nuevo) y su
  `.module.css`
