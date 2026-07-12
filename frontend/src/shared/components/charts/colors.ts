// Paleta categórica validada (dataviz skill, scripts/validate_palette.js) ya
// en uso en el proyecto — mismos 3 tonos que DataQualityPage
// (packages/ingesta), reusados aquí para que los 6 dashboards nuevos (S10
// Día 3) compartan la misma identidad visual en vez de inventar una paleta
// por dashboard.
export const CHART_COLORS = {
  violeta: 'oklch(0.64 0.15 290)',
  teal:    'oklch(0.65 0.14 195)',
  ambar:   'oklch(0.62 0.16 70)',
} as const

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
