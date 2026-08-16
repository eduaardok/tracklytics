## Why

El panel de marca de login/register mostraba principalmente contenido decorativo
(collage de portadas sin métrica, lista de features genérica) — se sentía como una
plantilla en vez de mostrar que el producto ya está funcionando antes de que alguien
se autentique. El login es una superficie pública: puede exponer datos reales del
catálogo sin comprometer ninguna sesión.

## What Changes

- El panel de marca (`AuthHero`) pasa a mostrar un mini-dashboard de datos reales del
  catálogo (top 5 tracks por popularidad, con portada real y su valor de popularidad),
  consumiendo únicamente endpoints públicos sin autenticación.
- Si la carga de ese mini-dashboard falla, la sección se omite en vez de mostrar datos
  inventados — el resto del panel (marca, headline, features) es contenido estático
  que nunca depende de la red.
- El card de login/register se simplifica: el link institucional "Acerca de
  Tracklytics" se mueve fuera del card a un footer de página; el link alternativo
  "Explorar el catálogo sin iniciar sesión" gana peso visual propio.
- La proporción del layout de dos columnas pasa de 50/50 a 55/45 a favor del panel de
  marca.

## Capabilities

### New Capabilities
(ninguna)

### Modified Capabilities
- `seguridad`: se agrega el comportamiento del panel de marca público de login/
  register (antes no documentado en ninguna spec — vivía solo como implementación).

## Impact

- Frontend: `AuthHero.tsx`, `AuthPages.module.css`, `LoginPage.tsx`, `RegisterPage.tsx`.
- Sin cambios de backend — reusa endpoints públicos ya existentes (`/tracks/top`,
  `/tracks/search`).
