## Context

`AnalyticaShell` (`frontend/src/app/layout/AnalyticaShell.tsx`) y
`SeguridadShell` (`frontend/src/app/layout/SeguridadShell.tsx`) son los dos
shells con sidebar de la aplicación — sirven al panel B2B de analítica y al
panel de administración de los seis roles admin de área, respectivamente.
Ambos siguen el mismo patrón: un `<nav className={styles.sidebar}>` sticky
de 220px (64px colapsado) construido con `SidebarSection` por grupo, más
`AreaSwitcher` cuando el usuario es superadmin viendo un área específica.

En `AnalyticaShell.module.css:180` y `SeguridadShell.module.css:271`, la
media query `@media (max-width: 768px)` fija `.sidebar { display: none; }`
sin ningún reemplazo — por debajo de ese ancho el `<main>` queda sin forma
de navegar entre secciones.

El shell hermano B2C, `AppShell.tsx`, ya resuelve el mismo breakpoint con
`MobileNavDrawer`: un panel deslizante de `min(280px, 80vw)` que recibe
arrays planos `primary`/`secondary` de `NavItem`. Ese contrato no sirve para
`AnalyticaShell`/`SeguridadShell` porque su navegación no es plana: son
grupos colapsables (`SidebarSection`) con gating por rol calculado en cada
shell (`seccionesVisibles`/`groups`, con filtro adicional por
`superadminArea` para superadmin) y, en `SeguridadShell`, un submenú
anidado de dos niveles más (`InformesCompuestosMenu` con hasta 30 rutas).
Aplanar esa estructura para reutilizar `MobileNavDrawer` duplicaría la
lógica de gating en un segundo formato de datos y perdería la jerarquía
visual de grupos que ya existe.

Todo esto vive en PocketBase (sesión de usuario, roles) y ClickHouse
(datos que consumen las páginas detrás de la navegación) sin cambios: esta
propuesta es puramente de presentación en el frontend, no toca ninguna
entidad de datos.

## Goals / Non-Goals

**Goals:**
- Dar a los usuarios de `AnalyticaShell` y `SeguridadShell` una forma de
  navegar bajo 768px, con el mismo criterio de apertura/cierre que
  `MobileNavDrawer` (backdrop, botón ✕, Escape, cambio de ruta).
- Reutilizar el `<nav>` de sidebar existente de cada shell tal cual está
  hoy (mismos componentes `SidebarSection`/`AreaSwitcher`, mismo cálculo de
  gating por rol/plan), en vez de construir una segunda estructura de
  navegación para móvil.
- Mantener `MobileNavDrawer` intacto, sirviendo solo a `AppShell`.

**Non-Goals:**
- No se cambia el sidebar de escritorio (≥768px) de ningún shell.
- No se generaliza `MobileNavDrawer` para aceptar `children` u otro
  contrato — nace un componente nuevo en su lugar.
- No se toca el gating por rol/plan ni las rutas: el overlay renderiza el
  mismo árbol de navegación que el sidebar de escritorio ya calcula.
- No se aplica a `AppShell`, que ya tiene su propia solución.

## Decisions

**1. Overlay a pantalla completa, no drawer lateral de 280px.**
`MobileNavDrawer` usa un panel de `min(280px, 80vw)` porque `AppShell` solo
tiene 9 ítems planos. `SeguridadShell` tiene 6 grupos colapsables (hasta 30
rutas contando el submenú anidado de Informes Compuestos); forzar esa
jerarquía en un panel angosto produciría scroll vertical dentro de un grupo
expandido dentro del scroll vertical del panel completo — dos scrolls
anidados en un espacio ya reducido. Un overlay a pantalla completa da
espacio suficiente para que los grupos se expandan sin ese anidamiento.

**2. Componente nuevo `MobileSidebarOverlay`, no una extensión de
`MobileNavDrawer`.**
Alternativa considerada: agregar una prop `children` opcional a
`MobileNavDrawer` para que acepte contenido arbitrario además de
`primary`/`secondary`. Se descarta porque mezclaría dos contratos
distintos (lista plana vs. contenido libre) en un componente que hoy tiene
una responsabilidad clara y probada en producción para `AppShell`; el
riesgo de romper ese caso ya funcionando no se justifica. `MobileSidebarOverlay`
recibe solo `open`, `onClose` y `children`, y deja que cada shell le pase
su propio `<nav>` de sidebar ya armado — el overlay no sabe nada de
navegación, roles ni grupos.

**3. El `<nav>` que se renderiza dentro del overlay es el mismo que el de
escritorio, sin una segunda copia.**
Cada shell sigue calculando `seccionesVisibles`/`groups` una sola vez;
tanto el sidebar de escritorio como el overlay móvil consumen ese mismo
resultado. Esto evita que el gating por rol/plan diverja entre ambas
superficies (un bug donde un link aparece en desktop pero no en móvil, o
viceversa, por una segunda lista desincronizada).

**4. Criterio de cierre idéntico a `MobileNavDrawer`.**
Backdrop, botón ✕, tecla Escape y cambio de ruta (`useEffect` sobre
`location.pathname`) — mismo patrón ya validado en `AppShell.tsx`, sin
inventar un criterio nuevo. El toggle de apertura vive en cada shell
(estado local `mobileOpen`), igual que `mobileNavOpen` en `AppShell`.

## Risks / Trade-offs

- [El sidebar colapsado (`collapsed` a 64px) no tiene sentido dentro de un
  overlay móvil a pantalla completa] → El overlay siempre renderiza el
  `<nav>` en su variante expandida (ignora el estado `collapsed` de
  escritorio, que es una preferencia de desktop persistida en
  localStorage vía `ui-prefs.ts`); no se agrega un botón de colapso dentro
  del overlay.
- [Icono hamburguesa duplicado con ligeras diferencias visuales entre
  `AppShell`, `AnalyticaShell` y `SeguridadShell`] → Se replica el mismo
  marcado (`<button><span/><span/><span/></button>`) y clase base que ya
  usa `AppShell.module.css` (`.hamburger`), copiando su CSS a cada
  `.module.css` de shell para no crear una dependencia cruzada entre
  shells hermanos.
- [Doble scroll accidental si el `<nav>` conserva su `overflow-y: auto` y
  `height: calc(100vh - 56px)` propios de la variante sticky de
  escritorio] → Dentro del overlay, el `<nav>` se renderiza con las
  mismas clases (`styles.sidebar`), así que una regla `@media (max-width:
  768px)` adicional ajusta `position`/`height` del `.sidebar` cuando está
  dentro de `MobileSidebarOverlay` para que sea el overlay quien controle
  el scroll, no el nav anidado.

## Open Questions

Ninguna — la propuesta es autocontenida y no depende de decisiones
pendientes de otras capabilities.
