## 1. Mini-dashboard de datos reales (AuthHero)

- [x] 1.1 Consumir `tracksTop(5)` (endpoint público) para el resumen de catálogo.
- [x] 1.2 Reemplazar el collage decorativo por la lista de tracks con portada real
      (`AlbumArt`, con su propio fallback de gradiente por género) + popularidad.
- [x] 1.3 Omitir la sección si la consulta falla, sin bloquear el resto del panel.

## 2. Limpieza del card de login/register

- [x] 2.1 Mover "Acerca de Tracklytics" fuera del card a un footer de página.
- [x] 2.2 Dar a "Explorar el catálogo sin iniciar sesión" un estilo propio con más
      peso visual.
- [x] 2.3 Reducir el padding vertical del card.

## 3. Jerarquía visual

- [x] 3.1 Split de doble panel de 50/50 a 55/45.
- [x] 3.2 Headline con la escala Display (reutilizando el token de Catálogo), tagline
      mono como kicker sobre el headline.
- [x] 3.3 Compactar la lista de 4 features a una grilla de 2 columnas.
- [x] 3.4 Logo con más presencia (40px → 48px).

## 4. Verificación

- [x] 4.1 Type-check del frontend sin errores nuevos.
- [x] 4.2 curl real a `/tracks/top` y `/tracks/search`, confirmar que los valores
      mostrados en pantalla coinciden exactamente.
- [x] 4.3 Playwright: login y register, light y dark, 1920×1080 y 1366×768 — tracks
      reales visibles, headline en escala Display, logo en 48px, "Acerca de" fuera
      del card, split en proporción no 50/50.
