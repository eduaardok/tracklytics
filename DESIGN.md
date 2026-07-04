<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->

---
name: Tracklytics
description: Music intelligence platform — consumer music app and industry analytics, violet-on-dark
colors:
  primary: "oklch(0.48 0.15 290)"
  primary-light: "oklch(0.68 0.14 290)"
  accent: "oklch(0.70 0.14 195)"
  bg: "oklch(0.09 0.010 285)"
  surface: "oklch(0.14 0.012 285)"
  surface-raised: "oklch(0.18 0.014 285)"
  ink: "oklch(0.92 0.008 285)"
  muted: "oklch(0.58 0.010 285)"
  error: "oklch(0.65 0.22 25)"
  warning: "oklch(0.78 0.18 70)"
  success: "oklch(0.72 0.16 150)"
typography:
  display:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0em"
  body:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0em"
  label:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  data:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "oklch(0.54 0.16 290)"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  track-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  track-card-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  badge-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Tracklytics

## 1. Overview

**Creative North Star: "The Signal Room"**

A mixing engineer's control room at midnight: every surface earns its presence, the dark field makes the signal glow, and nothing decorates what isn't functional. Tracklytics is not a music app with a dashboard bolted on — it is a platform where listener behavior becomes industry intelligence, and the interface is the conduit between those two registers. The reference points are Figma (deep dark, violet-tinted, precision tool) and Apple Music (immersive dark, editorial, album art as content). Neither is imitated; both inform.

The dark surface is not a stylistic choice — it is the physical environment that makes the signal legible. Album art on near-black, a violet playhead advancing through a waveform, a data trend glowing teal against deep space: these are signal, not decoration. When the B2C side works, users are immersed in music. When the B2B side works, analysts feel like they are reading the room, not reading a spreadsheet. Both surfaces share the same design vocabulary but express it differently: B2C uses generous padding, Space Grotesk display headings, and violet as immersion; B2B uses dense tables, JetBrains Mono data values, and teal for positive signal.

This system explicitly rejects cheap startup template patterns (identical card grids, eyebrow labels on every section, stock gradients), bloated enterprise gray-on-gray data tables, Spotify's 2024 oversaturated green aesthetic, and generic dark SaaS where dark is a badge rather than a design decision. Every dark surface must pass contrast, carry rhythm, and have a reason to exist.

**Key Characteristics:**
- Dark-native: surfaces at L 0.09–0.18 in OKLCH, never a light-mode default with dark paint applied
- Dual-register: B2C and B2B surfaces share one token system but express it categorically differently
- Signal-forward: color, hierarchy, and space guide the eye to what matters; nothing else gets color
- Typography as register: Space Grotesk signals B2C personality, JetBrains Mono signals B2B data authority
- Tonal elevation: depth expressed through lightness steps, not shadows
- Earned violet: the primary accent appears on ≤15% of any screen; its rarity is the point

## 2. Colors: The Signal Palette

A deep space near-black anchored by muted twilight violet — confident without being neon, editorial without being cold. Two accents, each with a job: violet for brand and interaction state, teal for data signal only.

### Primary
- **Twilight Violet** (`oklch(0.48 0.15 290)`): The brand color. Used as fill on primary buttons, the active player progress bar, and decorative brand accents. Never on large surface fills. At this lightness it earns white/pale text at WCAG large-text sizes (bold ≥14px = 3:1 threshold); button text must be 0.875rem/600 weight minimum.
- **Violet Light** (`oklch(0.68 0.14 290)`): The text-state variant. Used wherever violet appears as text on the dark background — active nav labels, active filter text, link color. Lighter by 20 L-points, sufficient contrast (≈8:1) against Deep Space bg for small-text AA compliance.

### Secondary
- **Signal Teal** (`oklch(0.70 0.14 195)`): The analytics accent. Used on positive data trends, chart highlights, active/healthy system status badges, and upward trend indicators. Hue is 95° away from violet (195° vs 290°), and 22 L-points lighter — visually unambiguous from a distance. Never used on navigation, headings, or UI chrome. If teal appears on a button, something is wrong.

### Neutral
- **Deep Space** (`oklch(0.09 0.010 285)`): Body background and the lowest tonal surface. The subtle violet chroma (0.010) is nearly imperceptible but makes the black feel intentional rather than defaulted. Used for the root background, full-bleed sections, and the app shell.
- **Raised Surface** (`oklch(0.14 0.012 285)`): Cards, panels, sidebar backgrounds, list item rows. Five lightness points above bg — enough to read as a surface without requiring a border.
- **Lifted Surface** (`oklch(0.18 0.014 285)`): Hovered interactive rows, dropdown backgrounds, modals. Four lightness points above Raised Surface. Tonal elevation over dark theme — shadows are not used here.
- **Pale Ink** (`oklch(0.92 0.008 285)`): Primary text and high-emphasis labels. Near-white with an ultra-subtle violet cast. Contrast against Deep Space bg: ≈15:1. Never gray this down beyond Muted Ink for any secondary purpose.
- **Muted Ink** (`oklch(0.58 0.010 285)`): Secondary text, metadata, supporting labels, placeholder text. Contrast against Deep Space: ≈6:1. Contrast against Raised Surface: ≈4.8:1. Do not go lower — muted does not mean inaccessible.
- **Error Red** (`oklch(0.65 0.22 25)`): Validation errors, destructive action indicators, ETL pipeline failure badges. Used with Pale Ink text.
- **Warning Amber** (`oklch(0.78 0.18 70)`): Non-critical warnings, throttle states, data quality flags. Used with Deep Space text (dark text on light fill at this L-value).
- **Success Emerald** (`oklch(0.72 0.16 150)`): Positive completions, healthy system states, upward trend indicators. Used with Deep Space text.

**The One Voice Rule.** Twilight Violet (`oklch(0.48 0.15 290)`) appears on ≤15% of any given screen. Its rarity is the point. When violet is everywhere, the signal disappears. Use it to mark what matters: the currently-playing track, the selected filter, the primary action. Never decoration.

**The Signal Rule.** Signal Teal (`oklch(0.70 0.14 195)`) carries data meaning. It appears on charts, trend badges, and live-state indicators — never on navigation, headings, or UI chrome. Color should confirm what the label already says; teal should never be the only signal.

## 3. Typography

**Sans Font:** Space Grotesk (Google Fonts, weights 400–700) — geometric with a mechanical edge and a generous x-height that keeps it legible at label sizes while retaining its character. Covers every non-mono role: display headings at 700, section headlines at 600, body at 400. Its distinctive geometry persists through the weight range, so the brand voice is present at every size — not just at hero scale.

**Data Font:** JetBrains Mono (Google Fonts, weight 400) — monospaced, compact, optically calibrated for aligned numeric columns. Used exclusively for numeric data values from the API: play counts, engagement scores, popularity indices, track durations, timestamps. Never used for prose.

**Character:** Two fonts, not three. Space Grotesk carries the brand at every size and weight; JetBrains Mono says "this is a measured value, trust it." Register differentiation comes from weight, size, and layout density — not from switching families.

### Hierarchy
- **Display** (Space Grotesk 700, 2.25rem, line-height 1.1, −0.02em): B2C page hero headings, full-scale "Now Playing" track title, primary catalog section anchors. `text-wrap: balance`. Maximum one per screen.
- **Headline** (Space Grotesk 600, 1.5rem, line-height 1.25, −0.01em): Page titles on both B2C and B2B surfaces, primary section headers. `text-wrap: balance`.
- **Title** (Space Grotesk 600, 1.125rem, line-height 1.35, 0em): Card headings, panel section labels, list group headers, dialog titles.
- **Body** (Space Grotesk 400, 0.9375rem, line-height 1.6, 0em): Prose, descriptions, onboarding copy. Max line length 65–75ch. `text-wrap: pretty` on multi-line content.
- **Label** (Space Grotesk 500, 0.8125rem, line-height 1.4, +0.01em): Navigation items, button text, input labels, metadata fields, chip text, table column headers. Space Grotesk's x-height keeps this legible at 13px.
- **Data** (JetBrains Mono 400, 0.875rem, line-height 1.5, 0em): Popularity scores, play counts, track durations, timestamps, engagement metrics, analytics values. Even single numbers like "3:42" or "★ 98" get mono treatment when they are data values.

**The Mono Gate Rule.** If a number comes from the API, it is a data value and renders in JetBrains Mono. The question: "could this number change?" Yes → mono. Static copy ("5 genres to choose from") → body or label. Apply to every numeric value, even inline ones in prose contexts.

## 4. Elevation

This system uses **tonal elevation exclusively** in the dark theme. Surfaces get lighter as they rise; drop shadows are not used because dark shadows on dark surfaces read as mud rather than depth.

The three-step tonal ladder:
- **Ground** (`oklch(0.09 0.010 285)`): The floor. App background, full-bleed layout sections, the AppShell body.
- **Raised** (`oklch(0.14 0.012 285)`): Standard elevated surface. Cards, sidebars, panels, track list rows. The primary container color.
- **Lifted** (`oklch(0.18 0.014 285)`): Interactive elevated state. Dropdown menus, modals, hovered list rows, drawer overlays. One step above Raised.

### Shadow Vocabulary
Shadows are reserved for state feedback on interactive elements — never for ambient depth:

- **Focus glow** (`box-shadow: 0 0 0 2px oklch(0.48 0.15 290 / 0.5)`): Applied to focused form inputs, buttons with keyboard focus, and selected interactive elements. A tight violet ring, not a diffuse glow.
- **Modal veil** (`0 24px 64px oklch(0.03 0.000 0 / 0.85)`): Applied beneath modal dialogs only. Creates enough separation from the page content without a bright, artificial-looking shadow.

**The Tonal Ladder Rule.** Never introduce a fourth surface color between the three tonal steps. If a component needs to feel more prominent, move it up one step on the ladder. If it is already at Lifted, reconsider the information architecture before adding color.

**The Shadow Prohibition.** Drop shadows are banned in the dark theme as ambient or decorative elements. The tonal ladder is the depth model. Shadows appear only as direct state feedback (focus ring, modal veil). A component that feels "flat" in dark mode is working correctly — add tonal contrast before adding shadows.

## 5. Components

### Buttons
Confident and precise — gently squared corners (8px) that sit between approachable and serious. Button text is Inter at 0.875rem/600 weight minimum to qualify as WCAG large text (bold ≥14px, 3:1 threshold), since Twilight Violet fill is in the medium-lightness range where 4.5:1 with pale text is not achievable.

- **Shape:** 8px border-radius (`{rounded.md}`)
- **Primary:** Twilight Violet fill (`{colors.primary}`) with Pale Ink text. Padding 10px/20px. Font: Inter, 0.875rem, weight 600, +0.01em tracking. Hover: fill shifts to `oklch(0.54 0.16 290)` (+0.06 L), 150ms ease-out. Focus: violet glow ring `0 0 0 2px oklch(0.48 0.15 290 / 0.5)`.
- **Ghost:** Transparent background, Pale Ink text, 1px border at `oklch(0.28 0.012 285)`. Hover: background fills to Raised Surface, border lightens to `oklch(0.38 0.012 285)`, 150ms ease-out. Used for secondary and cancel actions.
- **Danger:** Error Red fill (`{colors.error}`), Pale Ink text. Same shape as Primary. Reserved for destructive confirmations only — never the first choice for a risky action.
- **Disabled:** Opacity 0.38 on any variant. No separate background color; `cursor: not-allowed`.

### Inputs and Search Fields
- **Style:** Raised Surface background (`{colors.surface}`), 1px border at `oklch(0.25 0.010 285)`, 8px radius, 10px/14px padding
- **Placeholder text:** Muted Ink (`{colors.muted}`) — already verified ≥4.5:1 on Raised Surface; do not lighten further
- **Focus:** Border color shifts to Twilight Violet (`{colors.primary}`). No glow — glow is reserved for buttons. 150ms ease-out transition.
- **Error state:** Border shifts to Error Red; error message below in Error Red at label scale with an error icon preceding the text
- **Disabled:** Background shifts to ground (`{colors.bg}`), opacity 0.38

### Track Cards (B2C Signature Component)
The primary B2C list item. A horizontal row component — not a grid card. Layout expresses music-first hierarchy: cover art leads, track name and artist follow, data trails.

- **Structure:** Horizontal flex — 40×40 album art thumbnail (4px radius) · center info block (track name in Title weight + artist · genre in Label/Muted Ink) · right-aligned data block (popularity ★ score + duration in JetBrains Mono/Muted Ink)
- **Background:** Raised Surface at rest (`{colors.surface}`); Lifted Surface on hover (`{colors.surface-raised}`). Transition: background 150ms ease-out.
- **Playing state:** `box-shadow: inset 3px 0 0 oklch(0.48 0.15 290)` on the row container — a left-side indicator using inset box-shadow, not `border-left`, to avoid disrupting layout flow. The violet inset is the only color on the row in playing state.
- **Focus:** Violet glow ring (`0 0 0 2px oklch(0.48 0.15 290 / 0.4)` offset 1px) visible on keyboard navigation
- **No external border at rest.** The tonal contrast between bg and Raised Surface defines the row boundary. Borders appear only on focus.

### Analytics Table Rows (B2B)
Dense, data-forward. Categorically different from Track Cards: higher density, mono values throughout, no cover art.

- **Structure:** Full-width table row. Column headers in Label (Inter, 500, 0.8125rem, +0.01em). Sortable headers add a directional chevron icon inline. Data cells in JetBrains Mono, 0.875rem. Min row height 44px for touch compliance.
- **Background:** Alternating bg/surface for zebra readability — no color coding except teal for positive-trend values
- **Hover state:** Row shifts from surface to Lifted Surface, 100ms ease-out. Intentionally faster than B2C cards — analysts are scanning, not browsing.
- **Selected row:** Left inset indicator `box-shadow: inset 3px 0 0 oklch(0.70 0.14 195)` in Signal Teal (matches the data context)
- **Positive values:** Teal (`{colors.accent}`) on metrics showing upward trend only. Never decorative teal.

### Navigation
- **B2C (top bar):** Background matches Deep Space (`{colors.bg}`) — no separate panel shadow. Brand wordmark left, primary nav center, user controls right. Active item: Violet Light (`{colors.primary-light}`, `oklch(0.68 0.14 290)`) on label text — lighter violet used here to meet 4.5:1 contrast. Inactive: Muted Ink, hover to Pale Ink, 150ms.
- **B2B (left sidebar):** Same color logic. Section groups with Label headers at Muted Ink (no uppercase, no tracked eyebrow style). Active indicator: Violet Light on text + Raised Surface background on the row.
- **Typography:** Label scale (Inter, 500, 0.8125rem) throughout both navigations
- **The active state is color, not shape.** No rounded highlight pill behind the active label. The Violet Light text color is sufficient; adding a background pill doubles the signal.

### Status Badges
- **Active / Healthy:** Signal Teal fill (`{colors.accent}`), Deep Space text (`{colors.bg}`), pill radius. Deep Space text on Teal fill: ≈8:1 contrast. ✓
- **Warning:** Warning Amber fill (`{colors.warning}`), Deep Space text, pill radius.
- **Error:** Error Red fill (`{colors.error}`), Pale Ink text, pill radius.
- **Inactive / Filtered:** Transparent background, 1px border at `oklch(0.28 0.012 285)`, Muted Ink text, pill radius.

### Player Controls (B2C Signature Component)
The persistent bottom player is the B2C surface most visible at all times. It occupies a fourth tonal tier: `oklch(0.11 0.011 285)` — just above ground, below Raised, suggesting it is part of the bg but has its own layer.

- **Progress bar track:** `oklch(0.25 0.012 285)` — visible against the player's slightly-lifted bg
- **Progress bar fill:** Twilight Violet (`{colors.primary}`) — the most concentrated violet on the screen
- **Play/pause control:** 40×40 circular button, Violet fill, Pale Ink icon. The only circular element in the system; the circle signals "this is a player, not a tool."
- **Scrubber handle:** 10px dot at the progress head position, same Twilight Violet
- **Track info:** Title weight track name + Label weight artist name, both Pale Ink
- **Controls (skip, repeat, shuffle):** Icon-only at 20×20, Muted Ink at rest, Pale Ink on hover

## 6. Do's and Don'ts

### Do:
- **Do** use JetBrains Mono for every numeric value that comes from the API — play counts, popularity scores, durations, engagement metrics. Even a single inline number.
- **Do** use tonal elevation (three lightness steps) to convey surface depth. Ground → Raised → Lifted.
- **Do** verify Muted Ink (`oklch(0.58 0.010 285)`) at ≥4.5:1 against every surface it appears on, including Raised Surface. This is the most common failure point.
- **Do** use Violet Light (`oklch(0.68 0.14 290)`) for violet text on dark backgrounds (active nav labels, links). The primary fill violet (`oklch(0.48 0.15 290)`) does not have sufficient contrast for small text on dark bg.
- **Do** keep Twilight Violet on ≤15% of any screen surface. Rarity creates meaning.
- **Do** differentiate registers through the same token set: Space Grotesk + generous padding for B2C, dense tables + mono values for B2B. Never let the two registers bleed into each other on the same surface.
- **Do** add `@media (prefers-reduced-motion: reduce)` to every transition and animation. Default to `transition: none` (not a crossfade, unless the transition is strictly a crossfade).
- **Do** maintain 44×44px minimum touch targets — especially player controls, track row tap zones, and nav items on mobile.
- **Do** use `box-shadow: inset 3px 0 0 <color>` for playing/selected row indicators. Never `border-left` — it disrupts layout flow and triggers the absolute ban.

### Don't:
- **Don't** use cheap startup template patterns. No identical card grids (icon + heading + text, repeated), no eyebrow labels (`CATALOG`, `ANALYTICS` in tracked uppercase above every section), no stock gradient hero fills. The product exists long past the marketing-site phase.
- **Don't** build generic dark SaaS. Dark theme as a badge is the anti-reference. Every dark surface must pass contrast, carry rhythm, and earn its darkness. If a surface could be light without losing anything, it should be light.
- **Don't** reference Spotify's 2024 aesthetic: oversaturated album-art color splashes, heavy green as the primary accent, neon highlights. Tracklytics is violet-on-dark. The primary accent is violet; green is forbidden as a brand color.
- **Don't** build bloated enterprise analytics: cluttered sidebars packed with sub-items, 11px font, gray-on-gray data tables with no hierarchy, label-less form controls. The B2B side is professional, not punishing.
- **Don't** use Signal Teal (`{colors.accent}`) on navigation, decorative highlights, hover backgrounds, or button fills. It carries data meaning exclusively. Misusing teal is a semantic error, not a visual one.
- **Don't** allow Muted Ink to drop below 4.5:1 contrast on its surface. PRODUCT.md calls this out specifically. `oklch(0.58 0.010 285)` on Deep Space bg passes; on Raised Surface it also passes. Do not lighten it further for "elegance."
- **Don't** add drop shadows in the dark theme as ambient depth. Shadows belong only to focus rings and modal veils. Use tonal elevation.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on track cards, analytics rows, callouts, or sidebar items. Use `box-shadow: inset` for playing/selected indicators, and background tints for callouts.
- **Don't** use Space Grotesk on B2B analytics surfaces. Display typography has a register; using it outside that register breaks the signal that register differentiation carries.
- **Don't** use modal dialogs as first choice for B2B data actions. Inline expansions, row detail drawers, and progressive disclosure exhaust first. Modals for destructive confirmations and critical interruptions only.
- **Don't** add gradient text (`background-clip: text` with a gradient fill). Color carries meaning; gradients on text dissolve it. Single solid color only.
