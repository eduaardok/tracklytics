## 1. Backend — gating por tier

- [x] 1.1 `api/paquetes/analitica/deps.py`: agregar `_TIER_RANK`, extender
      `require_b2b_panel_access` para devolver `tier` (tipo_plan de la suscripción activa, o
      `"enterprise"` para admin), agregar `require_tier(minimo: str)` factory.
- [x] 1.2 `api/paquetes/analitica/router.py`: aplicar `Depends(require_tier("pro"))` a
      `/artistas/search`, `/artistas/comparar`, `/artistas/{id}/benchmark`,
      `/desempeno-relativo`, `/adquisicion`.
- [x] 1.3 Verificar que los 403 de `require_tier` devuelven un `detail` estructurado
      (`{"error": "tier_insuficiente", "tier_requerido": ..., "tier_actual": ...}`).

## 2. Backend — paneles predictivos Enterprise

- [x] 2.1 `api/paquetes/analitica/queries.py`: agregar `GENRE_WEEKLY_POPULARITY` y
      `ARTIST_WEEKLY_POPULARITY` (agrupadas por `load_week`, filtradas por `genre_id`/`artist_id`).
- [x] 2.2 Nuevo módulo `api/paquetes/analitica/proyeccion.py`: función de regresión lineal simple
      (`numpy.polyfit`) sobre `(load_week, avg_popularity)`, umbral mínimo de 3 semanas, umbral de
      alerta temprana (caída acumulada >10% del promedio en el horizonte proyectado de 4 semanas).
- [x] 2.3 `GET /app/v1/analitica/generos/{genero_id}/proyeccion` — `Depends(require_tier("enterprise"))`.
- [x] 2.4 `GET /app/v1/analitica/artistas/{artist_id}/proyeccion` — `Depends(require_tier("enterprise"))`,
      reutiliza `ARTIST_PREDOMINANT_GENRE` para resolver el género de comparación.
- [x] 2.5 Tipos de respuesta con `tipo: "proyeccion_estadistica"` explícito (nunca "predicción de IA").

## 3. Backend — verificación real

- [x] 3.1 Crear/confirmar 3 cuentas B2B de prueba (una por tier) vía `pb_client.crear_usuario` +
      alta de suscripción `activa` con el `tipo_plan` correspondiente.
- [x] 3.2 curl: cuenta Básico — 200 en paneles base, 403 estructurado en paneles Pro/Enterprise.
- [x] 3.3 curl: cuenta Pro — 200 en paneles base + comparativos, 403 en paneles Enterprise.
- [x] 3.4 curl: cuenta Enterprise — 200 en todos los paneles, incluidos los 2 nuevos predictivos.
- [x] 3.5 curl: admin — 200 en todo (bypass sin cambios), `require_staff` sigue exclusivo de admin.
- [x] 3.6 curl: verificar caso de datos insuficientes (`suficiente: false`) en un género/artista
      con menos de 3 semanas de datos, y el caso de alerta temprana con uno en declive real.

## 4. Frontend — planes con features

- [x] 4.1 `api/paquetes/suscripciones/planes.py`: agregar `features: list[str]` a cada plan B2B.
- [x] 4.2 `frontend/src/packages/suscripciones/types.ts`: agregar `features?: string[]` a `Plan`.
- [x] 4.3 `PlanesPage.tsx`: renderizar la lista de features bajo la descripción de cada plan B2B.

## 5. Frontend — estado "disponible desde plan X"

- [x] 5.1 `analitica.api.ts`: capturar el cuerpo del 403 (no solo el status) en las llamadas
      gateadas por tier.
- [x] 5.2 Nuevo componente `TierInsuficiente.tsx` (o extensión de `RequireSuscripcionActiva`):
      mensaje "disponible desde el plan {tier}" + CTA a `/suscripciones`, sin redirect duro.
- [x] 5.3 Envolver las páginas Pro/Enterprise (`ComparacionPage`, `ArtistaBenchmarkPage`,
      `EngagementPage`, `AdquisicionPage`, y las 2 páginas predictivas nuevas) con el nuevo manejo
      de 403 por tier.

## 6. Frontend — paneles predictivos

- [x] 6.1 `analitica.api.ts` + `types.ts`: cliente y tipos para los 2 endpoints de proyección.
- [x] 6.2 `ProyeccionGeneroPage.tsx`: selector de género + gráfico de serie histórica + extrapolación
      proyectada, con badge de alerta temprana cuando aplique.
- [x] 6.3 `ProyeccionArtistaPage.tsx`: selector de artista + comparación de trayectoria vs. género,
      con badge de alerta temprana cuando aplique.
- [x] 6.4 `AnalyticaShell.tsx` + `router.tsx`: nueva sección de nav "Predictivo" (visible solo para
      quien tenga tier Enterprise — igual criterio que la sección admin-only existente) con las 2
      páginas nuevas, lazy-loaded igual que el resto de `analitica`.

## 7. Frontend — verificación real (Playwright)

- [x] 7.1 Levantar frontend (`npm run dev`, puerto 5173) contra el backend con las 3 cuentas de
      prueba ya creadas.
- [x] 7.2 Navegar `PlanesPage` y confirmar que las features por plan se ven.
- [x] 7.3 Con cuenta Básico: navegar a un panel Pro y confirmar el estado "disponible desde plan
      Pro" con CTA, no un error genérico.
- [x] 7.4 Con cuenta Pro: confirmar acceso a paneles comparativos y bloqueo de los predictivos.
- [x] 7.5 Con cuenta Enterprise: confirmar acceso completo, incluidos los 2 paneles predictivos
      nuevos con su gráfico y badge de alerta cuando corresponda.

## 8. Documentación y cierre

- [x] 8.1 Completar la tabla de trazabilidad de `openspec/specs/analitica/spec.md` y
      `openspec/specs/suscripciones/spec.md` con la cadena de 5 niveles (tier → feature → endpoint
      → componente → CU) documentada en `design.md`, incluidos los CU retroactivos auditados.
- [x] 8.2 `openspec sync-specs` / archivar el change (`openspec archive`).
- [x] 8.3 Actualizar `docs/BITACORA_S11.md` con un bloque nuevo describiendo este change.
- [x] 8.4 Actualizar `README.md` (tabla de Capabilities, sección de Analítica, conteo de CU).
- [x] 8.5 Dejar el frontend corriendo (`npm run dev`, 5173) al finalizar la sesión.
