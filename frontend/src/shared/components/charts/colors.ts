// Paleta categórica validada (dataviz skill, scripts/validate_palette.js) ya
// en uso en el proyecto — mismos 3 tonos que DataQualityPage
// (packages/ingesta), reusados aquí para que los 6 dashboards nuevos (S10
// Día 3) compartan la misma identidad visual en vez de inventar una paleta
// por dashboard.
export const CHART_COLORS = {
  violeta: 'oklch(0.64 0.15 290)',
  teal:    'oklch(0.65 0.14 195)',
  ambar:   'oklch(0.62 0.16 70)',
  // Agregados en S13-P3b para los informes compuestos (RankingTable/
  // DistributionChart con más de 3 categorías, ej. planes/formatos de
  // campaña) — mismo lightness/chroma que los 3 de arriba, hue elegido a
  // ~40-95° de separación de los existentes y de STATUS_COLORS para
  // mantener distinción perceptual sin correr el validador completo
  // (scripts/validate_palette.js no está en este repo, ver BITACORA_S13.md).
  azul:    'oklch(0.62 0.15 250)',
  verde:   'oklch(0.62 0.15 140)',
} as const

// Orden fijo de asignación categórica (dataviz skill: "nunca cíclico") — usar
// siempre en este orden para que la misma entidad conserve el mismo color
// entre vistas distintas del mismo informe.
export const CATEGORICAL_ORDER = [
  CHART_COLORS.violeta, CHART_COLORS.azul, CHART_COLORS.teal, CHART_COLORS.verde, CHART_COLORS.ambar,
] as const

// Colores de estado — reservados, nunca reusados como "serie 4" (dataviz
// skill, non-negotiables). Mismos valores que --color-accent/--color-warning/
// --color-error/--color-muted (frontend/src/index.css) — literales, no
// `var(--x)`: los `fill`/`stroke` de recharts se aplican como atributo SVG
// crudo en algunos nodos, no siempre vía CSSOM, y no resuelven custom
// properties de forma confiable ahí (mismo motivo por el que DataQualityPage
// ya usa oklch() literal en vez de var() para sus Cell).
export const STATUS_COLORS = {
  good:    'oklch(0.70 0.14 195)',
  warning: 'oklch(0.78 0.18 70)',
  error:   'oklch(0.65 0.22 25)',
  neutral: 'oklch(0.58 0.010 285)',
} as const
