## Why

Los 3 planes B2B (`api/paquetes/suscripciones/planes.py`) prometen una escalera de valor explícita
en su propia descripción — Básico ("paneles esenciales"), Pro ("paneles avanzados y comparativas"),
Enterprise ("inteligencia de negocio completa") — pero el gating real
(`api/paquetes/analitica/deps.py::require_b2b_panel_access`) solo verifica `role == "analyst"` +
una suscripción `activa` en PocketBase, sin mirar `tipo_plan`. Los 10 endpoints de `analitica`
protegidos por ese dependency son hoy idénticamente accesibles para los 3 tiers: un Cliente B2B
que paga $199/mes (Básico) ve exactamente lo mismo que uno que paga $1,499/mes (Enterprise). La
escalera de precio no tiene una escalera de acceso real detrás, lo que debilita el argumento
comercial de subir de tier y expone contenido "premium" (comparativas, benchmark, adquisición) sin
que el cliente tenga que pagar por él. Además, Enterprise no tiene ningún diferenciador de
contenido propio: paga 3x más que Pro por el mismo panel, sin ningún panel exclusivo.

## What Changes

- Gating por tier real en `analitica`: se introduce un rango de tier (`basico < pro < enterprise`)
  comparado contra el `tipo_plan` de la suscripción `activa` del Cliente B2B. Los paneles
  comparativos (comparar artistas, benchmark, índice de desempeño relativo, adquisición por canal)
  pasan a requerir Pro o superior; el resto de paneles operativos base siguen accesibles desde
  Básico. `require_staff` (reporte diario, churn, funnel, P&L, MRR/ARR) no cambia — sigue siendo
  exclusivo de `role == "admin"`, sin relación con el tier B2B.
- Nueva categoría de paneles **predictivos/estratégicos**, exclusiva de Enterprise: proyección de
  tendencia de género (extrapolación estadística simple sobre la serie semanal de popularidad de
  un género) y proyección de trayectoria de artista vs. su género predominante — presentados al
  cliente como "proyección"/"tendencia estimada", no como predicción de IA. Cada proyección incluye
  una señal de alerta temprana embebida (pendiente sostenidamente negativa) en vez de un tercer
  panel/endpoint separado.
- `PlanesPage.tsx` pasa de mostrar solo nombre + precio a listar las features incluidas por plan,
  para que el cliente entienda qué gana al subir de tier antes de pagar.
- Los paneles de `analitica` con tier insuficiente muestran un estado "disponible desde el plan X"
  con CTA de upgrade, en vez de un 403 genérico — reutilizando el patrón de guard ya existente
  (`RequireSuscripcionActiva`).
- Auditoría retroactiva de trazabilidad de 5 niveles (tier → feature → endpoint → componente
  frontend → CU) para las capabilities `analitica` y `suscripciones`, completando huecos en los CU
  ya archivados que carecían de ese mapeo explícito.

## Capabilities

### New Capabilities
(ninguna — este change extiende dos capabilities operativas existentes, no introduce una nueva)

### Modified Capabilities
- `analitica`: nuevo requisito de acceso graduado por tier B2B sobre los paneles comparativos
  existentes (CU-O09, CU-O11, CU-O54); dos nuevos casos de uso de paneles predictivos exclusivos de
  Enterprise (proyección de tendencia de género, proyección de trayectoria de artista).
- `suscripciones`: el requisito "Mostrar planes disponibles" (CU-O06) se extiende para exigir que
  cada plan B2B liste sus features incluidas, no solo descripción y precio.

## Impact

- **Backend**: `api/paquetes/analitica/deps.py` (nuevo dependency `require_tier`), `router.py`
  (dependencies por endpoint), `queries.py` (2 queries nuevas de serie semanal por género/artista),
  nuevo módulo de cálculo de proyección simple (regresión lineal con `numpy`, ya en
  `requirements.txt` — sin dependencias nuevas). `api/paquetes/suscripciones/planes.py` gana un
  campo `features` por plan B2B.
- **Frontend**: `frontend/src/packages/suscripciones/pages/PlanesPage.tsx` (features por plan),
  `frontend/src/packages/analitica/components/RequireSuscripcionActiva.tsx` (o un componente
  hermano) para el estado "disponible desde plan X", 2 páginas nuevas para los paneles predictivos,
  navegación de `AnalyticaShell.tsx`.
- **Specs**: `openspec/specs/analitica/spec.md`, `openspec/specs/suscripciones/spec.md` (delta +
  completar trazabilidad retroactiva de CU ya archivados).
- **Sin cambios**: precios, modelo de regalías/publicidad/finanzas, gating de `require_staff`.
