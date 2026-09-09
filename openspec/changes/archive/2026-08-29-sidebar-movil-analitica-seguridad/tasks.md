## 1. `MobileSidebarOverlay` (componente nuevo compartido)

- [x] 1.1 Crear `frontend/src/shared/components/MobileSidebarOverlay.tsx`: recibe `open: boolean`, `onClose: () => void`, `children: ReactNode`; retorna `null` si `!open` (mismo criterio que `MobileNavDrawer`).
- [x] 1.2 Crear `MobileSidebarOverlay.module.css`: `.overlay` a pantalla completa (`position: fixed; inset: 0`), `.backdrop` semitransparente, `.panel` ocupando el 100% del overlay (sin ancho fijo tipo `min(280px, 80vw)`), `.panelHeader` con título y botón `.closeBtn` (✕) — mismo look & feel que `MobileNavDrawer.module.css` pero sin el `slideIn` lateral (usar fade o mantenerlo sin animación).
- [x] 1.3 El botón ✕ y el backdrop llaman a `onClose`; el componente no gestiona Escape ni bloqueo de scroll del body — eso queda a cargo del shell que lo usa (mismo patrón que `AppShell` hace con `MobileNavDrawer`).

## 2. `AnalyticaShell`: hamburguesa + overlay

- [x] 2.1 En `AnalyticaShell.tsx`, agregar estado local `mobileNavOpen` (useState) y los tres `useEffect` de `AppShell.tsx` adaptados: cerrar al cambiar `location.pathname`, cerrar si `matchMedia('(min-width: 769px)')` pasa a cumplirse, bloquear `document.body.style.overflow` mientras está abierto, y cerrar con tecla Escape.
- [x] 2.2 Agregar botón hamburguesa en `styles.brandBar` (antes de `ZoneSwitcher`, mismo lugar que en `AppShell.tsx`), con `aria-label="Abrir navegación"` y `aria-expanded={mobileNavOpen}`.
- [x] 2.3 Envolver el `<nav className={styles.sidebar}>` existente para que, además de renderizarse en su posición sticky de escritorio, se monte dentro de `<MobileSidebarOverlay open={mobileNavOpen} onClose={() => setMobileNavOpen(false)}>` cuando está abierto — reutilizando el mismo JSX del `<nav>` (nav base + `AreaSwitcher` + `groups.map(...)`) sin duplicar el cálculo de `groups`/`superadminArea` ya existente. Extraer ese JSX a una función/variable local si hace falta para no repetirlo dos veces en el árbol.
- [x] 2.4 En `AnalyticaShell.module.css`: agregar `.hamburger`/`.hamburger span` (copiando el patrón de `AppShell.module.css:55-83`, oculto por defecto), mostrarlo dentro del `@media (max-width: 768px)` existente (línea ~179), y agregar una regla para que el `.sidebar` dentro del overlay móvil no herede `position: sticky`/`height: calc(100vh - 56px)` (usar un modificador de clase, ej. `.sidebarMobile`, aplicado solo quando se renderiza dentro de `MobileSidebarOverlay`).

## 3. `SeguridadShell`: hamburguesa + overlay

- [x] 3.1 Repetir 2.1 en `SeguridadShell.tsx` (estado `mobileNavOpen` + mismos `useEffect`).
- [x] 3.2 Repetir 2.2 en `SeguridadShell.tsx` (botón hamburguesa en `styles.brandBar`, antes de `ZoneSwitcher`).
- [x] 3.3 Repetir 2.3 en `SeguridadShell.tsx`: el `<nav>` con `AreaSwitcher` + `seccionesVisibles.map(...)` (incluye `InformesCompuestosMenu` dentro de la sección "Reportes") se monta también dentro de `MobileSidebarOverlay` cuando está abierto, sin duplicar `seccionesVisibles`/`departamentosVisibles`.
- [x] 3.4 Repetir 2.4 en `SeguridadShell.module.css` (hamburguesa + modificador para el `.sidebar` dentro del overlay, línea ~270 del media query existente).

## 4. Verificación manual

- [x] 4.1 `npm run build` en `frontend/` sin errores de tipos.
- [x] 4.2 Con Playwright (o el navegador), simular viewport <768px en `/analitica` con una cuenta B2B: abrir el overlay, confirmar que aparecen los mismos grupos que en desktop para esa cuenta, cerrar con backdrop/✕/Escape/navegación.
- [x] 4.3 Repetir 4.2 en `/seguridad` con una cuenta admin de área (confirmar que el submenú de Informes Compuestos es usable dentro del overlay) y con una cuenta superadmin (confirmar que `AreaSwitcher` aparece y filtra igual que en desktop).
- [x] 4.4 Confirmar en ≥768px que ambos shells no muestran cambios visuales ni de comportamiento respecto al estado actual (hamburguesa oculta, overlay nunca se monta).
