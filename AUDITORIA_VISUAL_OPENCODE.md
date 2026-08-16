# Auditoría Visual — Tracklytics (pre-videos demo)

**Auditor:** opencode · **Modo:** solo lectura (sin ediciones, sin commits, sin `docker compose`) · **Fecha:** 2026-08-15

---

## 1. Resumen ejecutivo

La identidad base ya está bien plantada: tokens oklch coherentes, mono para datos, subtítulos `//` en mono, chips de género con color, semáforos B2B y transiciones de página. El trabajo de Prompt 05 está correctamente aplicado en lo verificado. Sin embargo, el producto aún carga dos marcas típicas de "generado": **(1)** empty states con el glifo de texto `( ∅ )` en 24 lugares, y **(2)** eyebrow labels en mayúsculas + letter-spacing repartidos en ~20 módulos CSS que el propio `DESIGN.md` prohíbe explícitamente ("no eyebrow labels", "no uppercase/tracked eyebrow en sidebar"). Ambas son visibles en las pantallas de los videos. Hay además una tensión con DESIGN.md §6 en la navegación activa (`border-left` 3px en los 3 shells) y una escala tipográfica plana (nadie usa el token Display 2.25rem reservado para héroes B2C). Ninguno de los hallazgos es un bug de funcionamiento; todos son de pulido visual, y el top 3 se resuelve con cambios mecánicos de pocas líneas. **Fuera de lo visual, el reproductor tiene un hueco de producto mayor: tocar play sobre un track suelto reproduce solo esa canción y se detiene al terminar** (la cola solo se llena vía radio, mix diario o encolado manual), y no existen ni repetición ni aleatorio — ver sección 5 (Opiniones del auditor).

**Alcance:** auditoría por código + `DESIGN.md`. No se ejecutó el stack (frontend/API/DB no estaban corriendo), así que no hay capturas; cada hallazgo cita archivo:línea.

---

## 2. Verificación de los fixes de Prompt 05

| Ítem | Estado | Evidencia |
|---|---|---|
| `navActive` sin pill, activo por color + borde lateral | Aplicado | `AppShell.module.css:241-244` (color Violet Light, `border-left-color`), sin fill detrás. Ver salvedad **E2** |
| Botones antes invisibles | Aplicado | `TrackCard.tsx` usa lucide `Play/ListPlus/Radio/Heart` con fondo visible |
| Favorito violeta (no rojo) | Aplicado | `TrackCard.module.css:133` |
| Colores hardcoded → tokens | Resuelto en pantalla | Solo quedan `#000` en color-mix de backdrops de modales (dim intencional) y `#ccc !important` dentro de `@media print` de `ReporteDiarioPage.module.css:206-211` (no visible en pantalla) |
| Glifos crudos de play/favorito → lucide | Aplicado | `TrackCard.tsx:3,121,130,140,151` |
| `KPICard` y `PageTransition` "con 0 usos" | **Desmentido** | `KPICard` en `DashboardPage`/`BenchmarkSqlPage.tsx:53-59`; `PageTransition` en los 3 shells (`AppShell.tsx:210`, `AnalyticaShell.tsx:175`, `SeguridadShell.tsx:404`) |

---

## 3. Hallazgos por categoría

### Categoría 1 — Patrones "demasiado IA" / genéricos

| ID | Ubicación | Hallazgo | Sev. | Sugerencia |
|---|---|---|---|---|
| G1 | `EmptyState` usado con `icon="( ∅ )"` en 24 sitios: `CatalogPage.tsx:323,399,495,584`, `PlaylistsTab.tsx:239,355`, `FavoritosTab.tsx:21`, `RankingTable.tsx:38`, `DistributionChart.tsx:30`, `NotificationBell.tsx:95`, `AlbumDetailPage.tsx:95`, `ArtistDetailPage.tsx:99`, `AdminTracksPage.tsx:84,106`, `ErroresPage.tsx:46`, `AuditoriaPage.tsx:78`, `PermisosPage.tsx:85`, `SesionesActivasPage.tsx:183`, `TicketsAdminPage.tsx:151`, `PartnersMetricasPage.tsx:48`, `AdminPartnersPage.tsx:142`, `PublicidadAdminPage.tsx:297,384`, `InformeCompuestoPage.tsx:29`, `AddToPlaylistMenu.tsx:103` — estilado en `EmptyState.module.css:10-13` | El empty state usa un **glifo de texto** `( ∅ )` como ícono. Es la marca "placeholder de IA" más repetida del repo y aparece justo en los momentos que se graban cuando no hay datos | **Alta** | `EmptyState.icon` ya es `ReactNode` (`EmptyState.tsx:5,21`): pasar un icono lucide contextual por sitio (`Music2`, `SearchX`, `Inbox`, `Disc3`…) con `stroke-width` 1.5 y color `--color-muted` |
| G2 | Eyebrow labels en mayúsculas + `letter-spacing` (0.03–0.08em) en ~20 módulos: `CatalogPage.module.css:251-252` ("GÉNEROS"), `QueuePanel.module.css:38-39` ("EN COLA"), `BibliotecaPage.module.css:48-49`, `SearchResultsPage.module.css:37-38,97`, `DetailPages.module.css:30-31,56,172-173`, `MixDiarioCard.module.css:77-78`, `MobileNavDrawer.module.css:54-55`, `UserMenu.module.css:62-63`, `UsuariosAdminPage.module.css:71-72,97-98`, `SeguridadShell.module.css:166-167`, `AdBanner.module.css:27-28`, `AdContext.module.css:29-30`, `TierUpsell.module.css:20-21`, `SimulacionPage.module.css:199-200`, `PlanesPage.module.css:133-134`, `ProyeccionArtistaPage.module.css:61-62`, `TrackCard.module.css:59`, `TrackGridCard.module.css:136`, `LibraryTrackRow.module.css:61`, `UserPicker.module.css:105-106`, y títulos de perspectiva del BSC (`BalancedScorecardPage.tsx:191` + `.module.css:90`) | **Prohibido por el propio sistema**: `DESIGN.md:120,264` ("no eyebrow labels", "no uppercase/tracked eyebrow sobre cada sección") y `DESIGN.md:230` (sidebar B2B: "no uppercase, no tracked eyebrow style"). Es la desviación más extendida del design system | **Alta** | Sentence-case con `font-weight:600` + `--color-muted` (el patrón que ya usan `KpiCards`/`ReportLayout`), o el motivo mono `//` que ya existe; quitar `uppercase` + `letter-spacing` |
| G3 | `KPICard.module.css:15` (`.icon { color: var(--color-primary-light) }`) | Ícono de métrica en violeta: en "The Signal Palette" el violeta es marca/interacción y el teal los datos | Baja | `--color-muted` o `--color-data`/teal para íconos de datos; violeta solo en acciones |
| G4 | `AuthHero.tsx:10-15,91-103` | La lista de features del login/register repite 4 veces "icono + título + desc" — el patrón *identical card grid (icon + heading + text, repeated)* que `DESIGN.md:264` prohíbe | Media | Reemplazar por 1-2 elementos con peso propio (o el número real de tracks como dato destacado) e integrar el resto al tagline; el collage + stat card ya hacen el trabajo de relleno |

### Categoría 2 — Espacios vacíos / sin terminar

| ID | Ubicación | Hallazgo | Sev. | Sugerencia |
|---|---|---|---|---|
| E1 | `ComingSoonPage.tsx` + `.module.css:22-37` (y clase `.page` vacía en `:1`) | La única página "próximamente" es un panel pelado: título + una línea de descripción, sin ícono, sin CTA, sin arte | Media (solo si el video toca secciones Partners) | Panel con ícono de estado + texto secundario + acción deshabilitada o hero pequeño |
| E2 | `AppShell.module.css:157,243`, `AnalyticaShell.module.css:98,150`, `SeguridadShell.module.css:94,146` | El fix S15 de navegación activa está aplicado, pero usa `border-left: 3px`, y `DESIGN.md:261,271` **prohíbe** `border-left` >1px como acento de color en sidebar/rows/callouts: exige `box-shadow: inset 3px 0 0` | Media | En `.navActive` de los 3 shells: quitar `border-left` y poner `box-shadow: inset 3px 0 0 var(--color-primary-light)` (mismo patrón que ya usa el playing state de `TrackCard` per `DESIGN.md:215`) |
| E3 | `EngagementPage.tsx:37-52` (`PanelSkeleton`) | Skeleton de panel reescrito a mano con `style={}` inline y widths hardcoded, mientras ya existen `SkeletonLoader`/`SkeletonCard` en `shared/components/SkeletonLoader.tsx` | Baja | Reusar `SkeletonCard`/`SkeletonLoader` compartidos |
| E4 | `AuthPages.module.css:1-7` (`.split` 1fr/1fr) + `.formPanel:237-260` | En viewports anchos/altos el login siente un vacío "en el medio": el contenido del hero vive contra el borde izquierdo y la card (max 380px) queda centrada en la mitad derecha — entre ambos y alrededor de la card solo hay fondo `--color-bg`. Afecta login y register (comparten `.split` + `AuthHero`) | Media | Ver Opción A (CSS puro, convergente) y Opción B (hero a fondo completo) en §5.3; el split 55/60-40/45 de la revisión externa (P4/P6) es una variante directa de la Opción A |

### Categoría 3 — Oportunidades "más pro"

| ID | Ubicación | Hallazgo | Sev. | Sugerencia |
|---|---|---|---|---|
| P1 | Token Display existe en `index.css` pero **0 usos**; todos los headings de página son 1.5rem uniformes (`CatalogPage.module.css`, `BibliotecaPage`, `DetailPages`, páginas analitica, `ComingSoonPage.module.css:5`, `ReportLayout.module.css:37-46`) | No hay escala hero B2C: `DESIGN.md:164` reserva Display (2.25rem) para "B2C page hero headings", máximo uno por pantalla. Hoy la capa B2C y la B2B se ven con el mismo peso tipográfico | Media | Aplicar Display 2.25rem en el hero del Catálogo (y solo ahí) para dar registro visual diferenciado a la capa operativa del demo |
| P2 | `AdminSuscripcionesPage.module.css:64`, `PublicidadAdminPage.module.css:297`, `RegaliasPages.module.css:246`, `DenunciarButton.module.css:16` | `.modalBackdrop` duplicado 4+ veces con `color-mix(..., #000 62%)` hardcoded en vez de token/componente | Baja | Token `--color-backdrop` en `index.css` (o componente `<Modal>` compartido) |
| P3 | Todo el repo | Diferenciadores a conservar y **mostrar en los videos**: chips de género con borde de color por género (`CatalogPage.module.css:266-274`), subtítulos mono con `//`, KPIs mono + `tabular-nums` (`KPICard.module.css:23-28`), semáforos BSC con token de estado + texto (`BalancedScorecardPage.tsx`), `PageTransition` con respeto a `prefers-reduced-motion` | — | — |
| P4 | `AuthHero.tsx` (hero del login/register) | **Visualización de datos en el hero** — la mejora #1 del rediseño propuesto (ver §5.4): un mini "Top tracks" o barras de géneros haría que el producto "se vea funcionando" antes de autenticarse. Factible con datos públicos: `tracksTop(5)` → `/tracks/top` devuelve `popularity` + `imagen_url` por track (`catalogo.api.ts:13-14`, `types.ts:7,15`); `genresList()` → `/genres` devuelve `track_count` + `avg_popularity` (`types.ts:76-83`). Reusar `MiniBarChart`/`Sparkline` de `shared/components/charts` | **Alta** | Card "Top tracks" con 4-5 filas (portada + nombre + popularidad) o "Géneros" con barras de `track_count`; anclar el `.heroGlow` detrás. NO usar `analiticaApi` (detrás de auth: el login es público) |
| P5 | `AuthHero.tsx:83-89` (collage) | Las 4 portadas del collage son decorativas (`AlbumArt` a secas). Convertirlas en tarjetas de contenido con una métrica: `albumsSearch` ya trae `avg_popularity` (`types.ts:72`) — portada + nombre + variación de popularidad | Media | Reemplazar el collage por las mini-cards del P4 (Top tracks), que sí tienen portada + nombre + métrica en un solo endpoint; si se conserva el collage, añadir `avg_popularity` como badge |
| P6 | `LoginPage.tsx:148-162`, `AuthPages.module.css:248-260` | El card de login es un formulario "suplemento genérico": 4 links secundarios de igual peso en el pie. "Explorar el catálogo sin iniciar sesión" (la CTA alternativa importante) tiene el mismo peso que "Acerca de" | Media | Sacar "Acerca de Tracklytics" del card (a un footer/`<footer>` de página); dar a "Explorar el catálogo…" un link con más peso (chevron `→`, estilo `btnGhost`); reducir el padding vertical del card |

---

## 4. Top 5 priorizados (para los 3 videos)

1. **G2 — Quitar eyebrow labels en mayúsculas** (sentencia normal, `font-weight:600` + muted, o motivo mono `//`). Impacto alto y visible en operativo ("GÉNEROS", "EN COLA", tarjetas de biblioteca) y táctico (BSC). Es el cambio que más elimina la "firma IA" por menor riesgo: puramente CSS, ~15 archivos, mecánico.
2. **G1 — Reemplazar `( ∅ )` por iconos lucide contextuales** en los 24 empty states. Si en la demo un listado sale vacío (playlist sin tracks, notificaciones, filtros sin resultados), es la primera imagen que se ve; con `EmptyState.icon` como `ReactNode` es un cambio por sitio.
3. **E2 — `navActive` a `box-shadow: inset 3px 0 0`** en los 3 shells. La solución actual funciona, pero choca con `DESIGN.md:261,271`; 1 propiedad por shell y queda alineada con el playing state de TrackCard.
4. **P1 — Hero Display 2.25rem en Catálogo** (máximo 1 por pantalla). Sube el "wow" de la vista operativa sin tocar la jerarquía B2B; es la oportunidad de escala más visible con el menor esfuerzo.
5. **E1 — ComingSoonPage** (solo si el video pasa por secciones Partners) o, si no entra en el guion, **G3 + E3** (ícono KPI y skeleton compartido) como cierre fino.

---

## 5. Opiniones del auditor (reproductor y landings)

> La auditoría es de solo lectura: todo lo de abajo son opiniones y recomendaciones priorizadas, no implementaciones.

### 5.1 No hay repetición (bucle) ni aleatorio (shuffle)

**Evidencia:** `PlayerBar.tsx` solo expone Anterior / Play-Pausa / Siguiente / progreso / volumen / cola (`PlayerBar.tsx:83-168`); un grep exhaustivo de `repeat|repetir|shuffle|aleator|loop|bucle` en todo `frontend/src` no devuelve nada en el reproductor. No hay estado de repetición ni de mezcla.

**Opinión:** La ausencia es defendible en un alcance de demo, pero bucle y aleatorio son lo que separa "un reproductor" de "un servicio de música". La buena noticia: la infraestructura ya está. `advanceQueue()` (`PlayerContext.tsx:549-554`) encadena automáticamente al terminar un track; solo falta un `repeatMode: 'none' | 'all' | 'one'` en el estado y ramificar `advanceQueue`. Prioridad por ROI para los videos:
1. **Repetir uno (`repeat-one`)** — el más barato y el mejor "wow" en cámara (el track vuelve a arrancar en bucle infinito sin tocar la cola).
2. **Repetir todo (`repeat-all`)** — casi igual de barato (al agotar la cola, reencolarla).
3. **Aleatorio (`shuffle`)** — el más caro (mantener un orden mezclado sin repetir hasta agotar) y el de menor retorno para una demo de 3 videos.

### 5.2 "Pones una canción y se deja de reproducir" — el hueco de producto más grande

**Evidencia:** `play(track)` desde una card no encola nada (`PlayerContext.tsx:317-341`). La cola solo se puebla con radio (`useRadio.ts:46-47`), mix diario (`MixDiarioCard.tsx:46`) o encolado manual `ListPlus` track por track. Al terminar el audio, `advanceQueue()` no encuentra siguiente y **corta la reproducción en silencio** (`PlayerContext.tsx:549-554`; `onStateChange ENDED` en `:419-423`; ticker simulado en `:268-274`). En el caso más común `hasNext` es `false`, así que el botón "Siguiente" aparece deshabilitado.

**Opinión:** Este es el hueco de producto más grande de toda la app — por encima de cualquier hallazgo visual. El modelo mental universal de un servicio de música es "reproducción en contexto": tocar play a una canción dentro de un álbum, playlist, artista o búsqueda debería continuar con el resto de esa lista. Hoy solo radio y mix diario encadenan; el resto se siente como un bug (el audio "se muere" sin explicación a los 3-4 minutos). Recomendación barata y de alto impacto: cuando `play()` se invoque desde un listado, encolar el resto vía `replaceQueue`, exactamente como ya hace la radio (`useRadio.ts:46-47`). Eso además reactiva `hasNext`, hace coherentes los botones de transporte y habilita repeat/shuffle (5.1). En el video, este cambio convierte la demo de reproducción en algo con vida en lugar de "play → silencio".

### 5.3 Espacios vacíos en login y landings

**Evidencia:** El login es un split 50/50 (`AuthPages.module.css:1-7`). Izquierda: `AuthHero` con glows, marca, tagline, stat card con total real, collage de portadas, 4 features y techs (`AuthHero.tsx:59-109`). Derecha: `formPanel` con una card de 380px centrada (`AuthPages.module.css:237-260`). El collage solo se pinta si la API devuelve álbumes (`AuthHero.tsx:83-89`) y el stat cae a un caption cuando no hay `total` (`:72-79`).

**Opinión:** La mitad izquierda fue claramente mejorada en S15 (glows, dato real, collage, equalizador) y ya no está pelada. El aire grande que se ve proviene de dos lugares: **(a)** la columna del formulario — una card de 380px centrada deja ~350px de vacío a cada lado en 1920×1080 y bastante arriba/abajo — y **(b)** el estado sin backend: si la API no está corriendo al capturar, el collage desaparece por completo y el número real baja a caption, achicando mucho el hero. Recomendaciones: que el collage/fallback se pinte siempre (gradiente determinístico por género, que ya aporta `AlbumArt`, `AlbumArt.tsx:48`) para que el hero nunca dependa del backend; compactar o anclar la card del formulario y darle al `formPanel` un motivo de fondo sutil para que el aire no domine; y resolver la lista de features repetitiva (G4), el patrón "card grid idéntica" que `DESIGN.md:264` prohíbe.

#### 5.3.1 El vacío "del medio" (E4) y estructuras alternativas

El login (y register, mismo layout) es un grid de 2 columnas iguales (`AuthPages.module.css:1-7`). Por cómo está montado, el contenido vive en los extremos y el centro del viewport queda como fondo plano:

- Columna izquierda `.hero`: `justify-content: center` solo centra en vertical; el contenido se extiende contra el borde izquierdo (`:21-34`).
- Columna derecha `.formPanel`: `align-items/justify-content: center` centra la card en *su* mitad (`:237-242`), así que la card (380px) queda ~75% del ancho total.
- Resultado en 1920×1080: banda continua de contenido hasta ~930px, luego ~320px de fondo hasta la card (1250-1630px) y otro bloque de fondo a la derecha — ese hueco horizontal + el aire vertical sobre/bajo la card es lo que se percibe como "vacío en el medio".

**Opción A — Split convergente (mismo markup, CSS puro, mínimo riesgo):** hacer que ambos bloques se encuentren en el centro en vez de vivir en los bordes.
- `.heroInner`: añadir `max-width: 520px; margin-left: auto` para pegar el hero al eje central.
- `.formPanel`: `padding: var(--space-xl)` y `justify-content: flex-end` sobre una card con `margin-right: 0`, o simplemente quitar el centrado horizontal y alinear la card al borde interior de su columna.
- Extra que llena el aire vertical: mover los badges `.techs` (hoy al final del hero, `AuthHero.tsx:105-108`) a debajo de la card en la columna derecha, y/o dar al `formPanel` un glow radial tenue (misma receta que `.heroGlow`, `AuthPages.module.css:36-43`) para que la mitad derecha no sea plano `--color-bg` puro.

**Opción B — Hero a fondo completo con card flotante (restructuración real, estilo Spotify/Deezer):** eliminar el grid de 2 columnas; el hero (glows + collage + dato + tagline) pasa a ser capa de fondo a ancho completo (position absolute, contenido anclado a la izquierda/fondo), y la card flota centrada en el viewport por encima. El "medio" deja de existir por definición porque el arte recorre todo el fondo. Costo: refactor de `AuthHero` + el markup de `LoginPage`/`RegisterPage`, y el `border-right` actual (`AuthPages.module.css:31`) desaparece. Es la opción que más cambia la estructura, como pedís.

**Mi recomendación para los videos:** la Opción A si se quiere mantener la identidad de doble panel ya pulida en S15 (cambio de pocas líneas CSS); la Opción B solo si se quiere un salto estructural evidente y se acepta retocar `AuthHero` + ambas páginas. En ambos casos, lo no negociable es el fallback determinístico del collage (que el hero no dependa de la API para no volver a verse vacío).

#### 5.4 Rediseño propuesto por revisión externa (imagen + IA)

El usuario envió la captura a una revisión externa de IA; su diagnóstico (abajo) **valida por imagen dos hallazgos que ya estaban en esta auditoría por código**: la lista de features repetida (G4) y el espacio mal aprovechado (E4). El resto son propuestas de estructura. Las mapeé contra el código real para separar lo factible de lo decorativo:

| Propuesta externa | Realidad en el código | Factibilidad | Veredicto |
|---|---|---|---|
| Hero con título grande tipo "Entiende la música detrás de los números" | No hay ninguna página con Display 2.25rem (hallazgo P1); `DESIGN.md:164` lo reserva para héroes B2C. El tagline mono `// analiza. descubre. escucha.` (`AuthHero.tsx:67`) se conserva como kicker | Trivial (CSS) | **Adoptar** — convierte el tagline decorativo en propuesta de valor; 1 headline máximo por pantalla |
| Visualización de datos musicales en el hero (barras de géneros, mini ranking, tendencia) | Datos públicos disponibles: `tracksTop()` con `popularity`+`imagen_url` (`catalogo.api.ts:13`, `types.ts:7,15`), `genresList()` con `track_count`+`avg_popularity` (`types.ts:76-83`); `MiniBarChart`/`Sparkline` ya existen en `shared/components/charts` | Alta | **Adoptar — es la mejora más importante del rediseño** (ver P4). Convierte la landing de "plantilla" en "producto data-driven" y llena el vacío inferior izquierdo de una vez |
| Portadas como tarjetas de información (con métrica), no decoración | El collage actual (`AuthHero.tsx:83-89`) usa `albumsSearch`; `Album.avg_popularity` existe (`types.ts:72`) | Alta | **Adoptar** (P5): o bien mini-cards "Top tracks" (portada + nombre + popularidad) o badge de `avg_popularity` sobre el collage |
| Split 55-60% izquierda / 40-45% derecha | `.split` es `1fr 1fr` (`AuthPages.module.css:5`) | 1 línea CSS (`grid-template-columns: 1.3fr 1fr`) | **Adoptar** — variante directa de la Opción A |
| Card de login más limpia: menos padding, "Acerca de" fuera, "Explorar catálogo" con más protagonismo | `LoginPage.tsx:148-162` mete 4 links de igual peso en el pie del card | Trivial (JSX + CSS) | **Adoptar** (P6) |
| Logo con más presencia y lenguaje de ondas/ecualizador reusado | `MiniEqualizer` ya existe (`AuthHero.tsx:22-31`); `brandLogo` 40px (`AuthPages.module.css:92-96`) | Trivial | **Adoptar menor** — subir el logo a ~48px y reusar el ecualizador detrás de la visualización de datos |
| Features compactadas a 2 columnas o 3 | Lista vertical de 4 (`AuthHero.tsx:10-15,91-103`) = G4 | Trivial | **Adoptar** — 2 columnas (grilla) o recortar a 3; conservar la 4.ª solo si aporta |
| Gradiente como parte de la identidad (detrás de datos, no decoración) | `.heroGlow` ya existe (`AuthPages.module.css:36-43`) | Trivial | **Adaptar** — anclar los glows detrás de la visualización (P4), no eliminarlos |
| "Evitar" (no rellenar con elementos, no animar de más, no convertir en dashboard) | Coincide con `DESIGN.md:120,264` y PRODUCT.md | — | **Adoptar como criterio de no-sobrecarga** |

**Mi opinión sobre la dirección propuesta** (`identidad → propuesta de valor → demostración visual → autenticación`): es correcta y compatible con el design system sin copiar el wireframe literal. La pieza clave es **la visualización de datos (4.2/P4)** porque ataca las tres críticas a la vez (vacío, genérico, poca identidad) usando lo que Tracklytics ya es: una plataforma de análisis. El resto de los puntos son ajustes de jerarquía de bajo riesgo. Orden sugerido si se implementa: P4 (visualización) → P6 (card + links) → split 55/45 → P1 (headline) → G4 (features) → logo → P5 (collage). Mantener el doble panel: la Opción B (fondo completo) no es necesaria si se aplica P4 + split 55/45.

---

## 6. No-hallazgos y aclaraciones

- `ReporteDiarioPage.module.css:210` (`#ccc !important`) está dentro de `@media print` (CU-O16): no es visible en pantalla, no se reporta como hallazgo.
- Los hits de hex restantes son `#000` en dims de backdrops (intencionales): la deuda de colores hardcoded quedó resuelta en pantalla.
- `KPICard` y `PageTransition` **sí están en uso**; la premisa del prompt de "0 usos" era un falso positivo y no amerita trabajo.
- Glifos crudos que quedan fuera del alcance de S15 (no son play/favorito) y podrían sumarse al plan de G1/G2 si se quiere pulir todo: `✕` (`MobileNavDrawer.tsx:36`, `PlaylistsTab.tsx:200,386`), `♪` (`AlbumArt.tsx:48`, `SearchResultsPage.tsx:139`, `PlaylistCollage.tsx:26`), `♥` (`FavoritosTab.tsx:21`), `←`/`↑`/`↓` en paginadores y reordenar (`PlaylistsTab.tsx:256,266`, `DisponibilidadPage.tsx:169`, `LoginPage.tsx:185`, etc.).
