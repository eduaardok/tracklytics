# Product

## Register

product

## Users

**B2C — Music listeners (end consumers)**
Casual to enthusiastic music listeners who want a Spotify-like experience: browsing a catalog of 900k+ tracks, building playlists, tracking favorites and listening history. Their context is leisure; the primary job is discovering and playing music. This surface must feel like a premium consumer product — emotional, immediate, personal.

**B2B — Music industry analysts (labels, producers, curators)**
Data professionals who need actionable intelligence from behavioral and catalog data: genre trends, artist benchmarking, engagement scores, ETL health. Their context is professional; the primary job is extracting insight from data and acting on it. This surface must feel like serious, trustworthy analytical tooling — not a toy.

**Evaluators — Professors assessing the system**
Secondary audience who judge both surfaces convincingly: B2C must read as a consumer product, B2B must read as professional data tooling. Both registers must hold independently.

## Product Purpose

Tracklytics is a music intelligence platform that closes the loop between listener behavior and industry insight. It processes 900k+ Spotify records through a ClickHouse dimensional model, exposes them via FastAPI, and surfaces them through two distinct interfaces: a Spotify-like consumer music app that generates behavioral data, and a B2B analytics dashboard that transforms that behavioral data into intelligence for music industry professionals.

The product succeeds when evaluators cannot tell the difference between the B2C layer and a real consumer app, and cannot tell the difference between the B2B layer and a real BI tool.

## Brand Personality

**Sharp · Confident · Premium**

The brand does not hedge. Interfaces are precise, intentional, and uncluttered. The visual language is high-end dark: deep space backgrounds, violet accent, crisp typography. The tone is confident without being loud — the product knows what it does and doesn't need to explain itself.

Emotional goal for B2C: feel immersive and personal, like music software deserves to feel.
Emotional goal for B2B: feel authoritative and clear, like decision-making tooling should feel.

## Anti-references

- **Cheap startup templates**: hero sections with stock gradients, identical card grids with icon + heading + text, sections with eyebrow labels on everything. The app exists long past the marketing-site phase.
- **Bloated enterprise tools**: cluttered sidebars, tiny font, gray-on-gray data tables, no visual hierarchy. The B2B side is professional, not punishing.
- **Spotify's 2024 colorful rebrand**: oversaturated album art splashes, heavy use of green. Tracklytics has its own visual identity — violet-on-dark, not green-on-black.
- **Generic dark SaaS**: dark theme as a badge rather than a design decision. Dark here earns its existence through depth and contrast, not just because "tools look cool dark."

## Design Principles

1. **Dual-register excellence** — The B2C surface must feel consumer-premium; the B2B surface must feel professional-analytical. Each surface owns its register. Never default to one aesthetic for both; always ask which side of the product you're on before designing.

2. **Data as storytelling** — Analytics are not tables to read; they are insights to feel. Visualizations, hierarchy, typography weight, and motion should make data speak without narration. If a chart requires a legend to be understood, reconsider the chart.

3. **Earned premium** — The dark theme exists to feel immersive, not to hide poor contrast or lazy layout. Every surface must pass contrast checks, every spacing decision must carry rhythm, and every component must be there because it earns its place — not because it ships with a framework.

4. **Confident precision** — No decorative padding, no hedging with generic components, no copy that explains what a button already says. When in doubt, remove. When something must stay, make it sharp.

5. **Behavioral coherence** — Three user roles with different permissions, three distinct areas of the app. Navigation, empty states, access gates, and permission toasts should never leave any user uncertain about where they are, what they can see, or what to do next.

## Accessibility & Inclusion

Target: **WCAG 2.1 AA**

- Body text minimum 4.5:1 contrast against background. Check `--text-muted` (#8b8ba0) on dark surfaces — muted doesn't mean inaccessible.
- All interactive elements keyboard-navigable with visible focus states.
- Animations respect `prefers-reduced-motion`. The equalizer, skeleton loaders, and player animations all need reduced-motion alternatives.
- No information conveyed by color alone (especially in analytics charts — use labels, patterns, or shape as secondary signals).
- Touch targets minimum 44×44px on mobile surfaces.
