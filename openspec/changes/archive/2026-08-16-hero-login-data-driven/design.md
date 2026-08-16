## Context

`LoginPage`/`RegisterPage` son rutas públicas, montadas eager (no lazy) junto con el
resto del shell de autenticación — `AuthHero` ya consumía un endpoint público
(`tracks/search` para el total) antes de este cambio, así que el patrón de "datos
reales sin sesión" ya existía; este cambio lo extiende a una vista más informativa en
vez de introducirlo desde cero.

## Goals / Non-Goals

**Goals:**
- Mostrar datos reales del catálogo (no inventados) en el panel de marca público.
- Mantener el layout de doble panel ya validado — sin rediseño estructural mayor.
- Que el panel nunca dependa por completo de la red: si el mini-dashboard falla, el
  resto del panel sigue siendo una superficie de marca completa.

**Non-Goals:**
- No se reproduce contenido con fotos de personas reales identificables (la
  referencia visual externa usaba fotos de artistas reales en su sección "Top
  artistas" — deliberadamente no se copia esa parte).
- No se usa ningún endpoint que requiera sesión (`analiticaApi` queda fuera).

## Decisions

- **`/tracks/top` en vez de agregar un endpoint nuevo**: ya devuelve `popularity` +
  `imagen_url` por track y es público — no hay necesidad de exponer superficie nueva
  de API para esto.
- **El mini-dashboard reemplaza al collage decorativo anterior**: portada + nombre +
  popularidad en una sola lista cubre el rol visual del collage (textura real de
  contenido) y el rol de dato (P4) a la vez, en vez de mantener ambos por separado.
- **Omitir la sección en vez de mockear datos si la carga falla**: el resto del hero
  (marca, headline, features) es contenido estático — nunca depende de la red — así
  que el panel no queda vacío aunque el mini-dashboard puntual no cargue.
- **`AlbumArt` ya resuelve el fallback de portada individual** (gradiente
  determinístico por género) — no se duplica esa lógica para las portadas del
  mini-dashboard.

## Risks / Trade-offs

- [El mini-dashboard depende de que `/tracks/top` responda rápido en la carga inicial
  de una página pública, sensible a percepción de velocidad] → Aceptado: es un
  `staleTime` de 5 minutos con reintento único, mismo criterio ya usado por el resto
  de queries de `AuthHero`; si falla, se omite sin bloquear el resto del render.
