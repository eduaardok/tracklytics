## Context

`api/paquetes/analitica/deps.py::require_b2b_panel_access` gatea 10 endpoints (9 bajo `v1_router`
+ `dashboard_executive` bajo el `router` legacy) verificando únicamente `role == "analyst"` +
suscripción `activa` en PocketBase (colección `suscripciones`, ya consumida vía
`pb_client.list_activas`). El campo `tipo_plan` de esa suscripción existe y viaja en cada registro
que devuelve `list_activas` (es el mismo campo que `PlanesPage.tsx` ya lee como `activa.tipo_plan`),
pero `deps.py` nunca lo mira. El resultado: Básico ($199), Pro ($499) y Enterprise ($1,499) son
hoy tres precios para el mismo producto.

Los 3 planes B2B viven en PocketBase como strings libres (`"basico" | "pro" | "enterprise"`,
`api/paquetes/suscripciones/planes.py`), no en ClickHouse — es configuración de producto/acceso,
no un hecho analítico, así que el ranking de tier y la matriz de acceso por endpoint viven en
código Python (backend), no en una tabla nueva.

## Goals / Non-Goals

**Goals:**
- Gating por tier real (`basico < pro < enterprise`) sobre los paneles comparativos de `analitica`,
  sin tocar `require_staff`.
- Categoría nueva de paneles predictivos/estratégicos, exclusiva de Enterprise, calculada con
  estadística simple (regresión lineal) sobre datos ya existentes en ClickHouse — sin ML, sin
  dependencias nuevas.
- `PlanesPage.tsx` con features por plan; estado "disponible desde plan X" + CTA de upgrade en vez
  de 403 genérico.
- Trazabilidad completa de 5 niveles (tier → feature → endpoint → componente frontend → CU) para
  todo lo tocado por este change, y auditoría retroactiva de los CU ya archivados de `analitica` y
  `suscripciones`.

**Non-Goals:**
- Ningún modelo de Machine Learning entrenado ni servicio de inferencia — la "proyección" es una
  extrapolación estadística simple (regresión lineal con `numpy`, ya en `requirements.txt`).
- No se toca el modelo de precios, regalías, publicidad ni finanzas.
- No se toca `require_staff` (reporte diario, churn, funnel, P&L, MRR/ARR) — sigue siendo
  admin-only, independiente del tier B2B.
- No se gatea por tier ningún endpoint legacy huérfano (`/genres/trends`, `/artists/search`,
  `/trends/weekly`, `/artists/{id}/stats`, `/genres/{id}/audio-profile` bajo el `router` sin
  prefijo `/app/v1`) — son remanentes de `app/js` vanilla, retirado por completo en S10 (ver
  memoria de proyecto); no tienen consumidor real en el frontend React actual, así que ampliar su
  gating no cambia ninguna experiencia de cliente y solo agrega superficie de prueba sin valor.

## Decisions

### 1. Matriz de permisos por tier: dict estático en código, no tabla PocketBase/ClickHouse

Se evaluó reusar el patrón de `seguridad` (`FACT_PERMISO_USUARIO`, permisos granulares por usuario,
asignables en runtime vía `/permisos`, CU-O17). Se descarta para este caso: esa matriz existe
porque los permisos de `seguridad` son *asignables por un admin en runtime, por usuario individual*
(un admin puede otorgar/revocar un permiso puntual a una persona). El acceso por tier B2B, en
cambio, es una regla de negocio fija por plan (Básico/Pro/Enterprise), no configurable por usuario
ni por admin — es un atributo del plan que el cliente compra, igual que el precio. Modelarlo como
filas en una tabla que un admin podría editar en runtime introduciría una superficie de
inconsistencia (¿qué pasa si un admin le da acceso Enterprise a un usuario Básico sin que factura
o Suscripciones se enteren?) que no aporta nada al alcance de este proyecto.

En su lugar: un dict estático `_TIER_RANK = {"basico": 0, "pro": 1, "enterprise": 2}` en
`deps.py`, y un dependency factory `require_tier(minimo: str)` que se aplica por endpoint via
`dependencies=[Depends(require_tier("pro"))]`, igual que ya se hace con `require_staff`. Es el
mismo idioma que el resto de `deps.py` (funciones/factories de FastAPI `Depends`), sin introducir
un mecanismo nuevo.

`require_b2b_panel_access` se extiende para devolver el `tipo_plan` de la suscripción activa junto
al `user` (`{**user, "tier": tipo_plan}`); admin recibe `tier: "enterprise"` implícito (ya
bypassaba todo, mantiene el mismo comportamiento sin necesitar una rama especial en
`require_tier`). `require_tier(minimo)` depende de `require_b2b_panel_access` (FastAPI cachea la
dependencia dentro del mismo request, sin round-trip extra a PocketBase) y compara
`_TIER_RANK[tier] >= _TIER_RANK[minimo]`; si no alcanza, 403 con
`detail={"error": "tier_insuficiente", "tier_requerido": minimo, "tier_actual": tier}` — un cuerpo
estructurado (no solo un string) para que el frontend pueda armar el mensaje "disponible desde
plan X" sin adivinar por texto.

### 2. Asignación de tier por endpoint

| Tier mínimo | Endpoints |
|---|---|
| Básico (piso, sin dependency adicional) | `/dashboard` (v1), `/dashboard/executive` (legacy, dashboard real consumido por `DashboardPage.tsx`), `/generos/{id}/perfil`, `/tendencias`, `/disponibilidad`, `/engagement`, `/artistas/search` |
| Pro (`require_tier("pro")`) | `/artistas/comparar`, `/artistas/{id}/benchmark`, `/desempeno-relativo`, `/adquisicion` |
| Enterprise (`require_tier("enterprise")`) | `/generos/{id}/proyeccion` (nuevo), `/artistas/{id}/proyeccion` (nuevo) |

Decisión no trivial: `/engagement` (engagement_score de un track/artista individual) se clasifica
Básico, no Pro. El prompt de negocio lista "paneles comparativos" como el diferenciador Pro
(comparar, benchmark, desempeño relativo, adquisición); `/engagement` no compara nada — es una
métrica de un solo track/artista, misma naturaleza que "perfil de audio por género". Se deja como
Básico para no penalizar una consulta que no es comparativa.

Decisión corregida durante la implementación: `/artistas/search` (v1) se había planeado como Pro
("paso previo a comparar/benchmark"), pero al revisar su consumidor real en el frontend
(`analiticaApi.artistsSearch`) resultó ser exclusivamente `EngagementPage.tsx` — el buscador de
artista para ver su engagement, un panel Básico. `ComparacionPage.tsx`/`ArtistaBenchmarkPage.tsx`
usan en cambio el `ArtistPicker` compartido (`@shared/components/ArtistPicker.tsx`), que golpea el
endpoint legacy `/artists/search` (sin `/app/v1`, sin este dependency). Gatear `/artistas/search` a
Pro habría bloqueado el buscador de un panel Básico sin restringir ningún panel Pro — se deja en
Básico. Queda como aprendizaje para cualquier endpoint nuevo de `analitica`: verificar el
consumidor real en el frontend antes de asignar tier por similitud de nombre/ruta.

### 3. Paneles predictivos Enterprise: regresión lineal simple sobre series semanales por género/artista

Ni `GENRES_TRENDS` (snapshot agregado por género, sin dimensión temporal) ni
`ARTIST_AUDIO_STATS_V1` (agregado histórico completo) traen una serie temporal por género o por
artista — son promedios de todo el histórico. Se agregan 2 queries nuevas a `queries.py`
(`GENRE_WEEKLY_POPULARITY`, `ARTIST_WEEKLY_POPULARITY`), siguiendo el mismo patrón que
`TENDENCIAS_LOAD_WEEK` (agrupar `FACT_TRACKS` por `load_week`, columna ya poblada por el ETL), pero
filtradas por `genre_id`/`artist_id` respectivamente:

```sql
SELECT load_week, count() AS track_count, round(avg(popularity), 2) AS avg_popularity
FROM FACT_TRACKS WHERE genre_id = {genre_id:Int32}
GROUP BY load_week ORDER BY load_week ASC
```

Sobre esa serie `(load_week, avg_popularity)` se ajusta una regresión lineal de mínimos cuadrados
con `numpy.polyfit(x, y, 1)` (pendiente + intercepto) — `numpy` ya está en `requirements.txt`, cero
dependencias nuevas. Se requieren al menos 3 semanas distintas con datos; con menos, el endpoint
responde `{"suficiente": false, "mensaje": "..."}`, mismo patrón que
`v1_desempeno_relativo` cuando no hay engagement suficiente (consistencia con un idioma de
respuesta ya establecido en el paquete). Con datos suficientes, se extrapola
`N_SEMANAS_PROYECCION = 4` semanas adelante (ventana fija, mismo criterio pragmático que
`_altas_por_semana_y_grupo` en `router.py` usa una ventana fija de 6 semanas en vez de resolver
dinámicamente el rango real de datos).

Umbral de alerta temprana: si la pendiente proyectada es negativa y representa una caída acumulada
mayor al 10% del valor promedio de la serie en las `N_SEMANAS_PROYECCION` semanas de proyección,
la respuesta incluye `"alerta": true` con un mensaje ("género con tendencia sostenida a la baja" /
"artista perdiendo tracción frente a su género"). Se evaluó un tercer endpoint/panel dedicado de
"alerta temprana" (paralelo a `AlertasTab.tsx` de `finanzas`, CU-O89) y se descarta: en `finanzas`
las alertas cruzan múltiples fuentes (gastos, presupuesto, cuentas por cobrar) y ameritan una vista
propia; aquí la alerta es un derivado directo del mismo cálculo de proyección (mismo dato, mismo
endpoint) — un endpoint separado solo repetiría la consulta y la regresión sin aportar información
nueva. Se embebe como campo en la respuesta de los dos endpoints de proyección.

Proyección de artista vs. género: se reutiliza `ARTIST_PREDOMINANT_GENRE` (ya usada por
`/artistas/{id}/benchmark`) para resolver el género del artista, se calculan ambas pendientes
(artista y género) y se agrega un campo `trayectoria` (`"ganando_terreno" | "perdiendo_terreno" |
"estable"`) comparando la pendiente del artista contra la del género — responde directamente
"¿el artista está ganando o perdiendo tracción respecto al género?" del brief de negocio.

Presentación al cliente: la respuesta JSON y la UI usan siempre "proyección" / "tendencia
estimada" / "estimación estadística", nunca "predicción de IA" ni "machine learning" — mismo
criterio que la regla de framing de datos sintéticos (no prometer más precisión de la que un
cálculo estadístico simple puede sostener).

### 4. Frontend: extensión de `RequireSuscripcionActiva`, no un componente nuevo desde cero

`RequireSuscripcionActiva` ya distingue 401 (sin sesión) de 403 (sin acceso) reaccionando al status
HTTP real de un endpoint gateado, sin reimplementar la regla de negocio en el cliente. Se extiende
para leer el cuerpo estructurado del 403 (`tier_insuficiente` con `tier_requerido`) cuando
corresponda: en vez de redirigir siempre a `/suscripciones`, si el 403 trae ese cuerpo se
renderiza inline un estado "disponible desde el plan {tier_requerido}" con CTA a `/suscripciones`
(no redirect duro) — el Cliente B2B ya tiene una suscripción activa (por eso llegó al panel en
primer lugar, `RequireSuscripcionActiva` ya lo dejó pasar), así que redirigirlo de nuevo a la
pantalla de selección de plan sin contexto sería confuso; se le mantiene en el panel pero con el
contenido bloqueado y el motivo explícito. El caso ya existente (403 sin `tier_insuficiente`, es
decir, sin ninguna suscripción activa) conserva el redirect a `/suscripciones` sin cambios.

### 5. `PlanesPage.tsx`: features como array estático por plan, no una nueva tabla en PocketBase

Las features por plan (qué incluye Básico/Pro/Enterprise) son texto de catálogo de producto, no un
dato transaccional — se agregan como un array `features: string[]` en el objeto de cada plan B2B en
`planes.py` (mismo lugar que ya define `nombre`/`precio`/`descripcion`), expuesto tal cual por
`GET /app/v1/suscripciones/planes` sin tocar el modelo de PocketBase. `PlanesPage.tsx` itera ese array bajo
la descripción existente, sin depender de un dato nuevo del backend más allá de un campo adicional
en la misma respuesta ya consumida.

## Tabla de trazabilidad de 5 niveles

### Features nuevas o que suben de nivel de acceso (este change)

| Tier | Feature | Endpoint | Componente frontend | CU |
|---|---|---|---|---|
| Pro | Comparar artistas A vs. B | `GET /app/v1/analitica/artistas/comparar` | `ComparacionPage.tsx` | CU-O09 |
| Pro | Benchmark de artista vs. género | `GET /app/v1/analitica/artistas/{id}/benchmark` | `ArtistaBenchmarkPage.tsx` | CU-O09 |
| Pro | Índice de desempeño relativo (Mercado vs. Tracklytics) | `GET /app/v1/analitica/desempeno-relativo` | `EngagementPage.tsx` | CU-O11 |
| Pro | Adquisición de usuarios por canal | `GET /app/v1/analitica/adquisicion` | `AdquisicionPage.tsx` | CU-O54 |
| Enterprise (nuevo) | Proyección de tendencia de género | `GET /app/v1/analitica/generos/{id}/proyeccion` | `ProyeccionGeneroPage.tsx` | **CU-O92** |
| Enterprise (nuevo) | Proyección de trayectoria de artista vs. género | `GET /app/v1/analitica/artistas/{id}/proyeccion` | `ProyeccionArtistaPage.tsx` | **CU-O93** |
| Todos (B2B) | Selección de plan con features listadas | `GET /app/v1/suscripciones/planes` | `PlanesPage.tsx` | CU-O06 |

### Features que permanecen en Básico (piso, sin cambio de nivel)

| Tier | Feature | Endpoint | Componente frontend | CU |
|---|---|---|---|---|
| Básico | Dashboard ejecutivo de KPIs | `GET /dashboard/executive` | `DashboardPage.tsx` | CU-O07 |
| Básico | Perfil de audio por género | `GET /app/v1/analitica/generos/{id}/perfil` | `GenerosPage.tsx` | CU-O08 |
| Básico | Tendencias temporales por semana | `GET /app/v1/analitica/tendencias` | `TendenciasPage.tsx` | CU-O10 |
| Básico | Disponibilidad de infraestructura | `GET /app/v1/analitica/disponibilidad` | `DisponibilidadInfraPage.tsx` | CU-O55 |
| Básico | engagement_score de track/artista | `GET /app/v1/analitica/engagement` | `EngagementPage.tsx` | CU-O11 (base) |
| Básico | Búsqueda de artista (soporte de engagement) | `GET /app/v1/analitica/artistas/search` | `EngagementPage.tsx` | CU-O11 (base) |

### Auditoría retroactiva de trazabilidad (`analitica` y `suscripciones` archivados)

Se revisaron `openspec/specs/analitica/spec.md` y `openspec/specs/suscripciones/spec.md`: ambos ya
tienen la tabla de 5 niveles "de negocio" (nivel empresarial → departamento → paquete → CU →
historia de usuario) exigida por la convención docente, pero **ninguno de los dos** documenta el
mapeo técnico CU → endpoint → componente frontend en ningún artefacto — esa cadena solo existía
implícita en el código (nombres de rutas, imports). Hueco encontrado y completado en este mismo
change (no amerita un change aparte: es documentación, no código nuevo):

| Tier | Feature | Endpoint | Componente frontend | CU |
|---|---|---|---|---|
| Básico | Dashboard ejecutivo de KPIs | `GET /dashboard/executive` | `DashboardPage.tsx` | CU-O07 |
| Básico | Perfil de audio por género | `GET /app/v1/analitica/generos/{id}/perfil` | `GenerosPage.tsx` | CU-O08 |
| Pro (tras este change) | Comparar artistas / benchmark | `GET /app/v1/analitica/artistas/comparar`, `.../benchmark` | `ComparacionPage.tsx`, `ArtistaBenchmarkPage.tsx` | CU-O09 |
| Básico | Tendencias temporales | `GET /app/v1/analitica/tendencias` | `TendenciasPage.tsx` | CU-O10 |
| Pro (tras este change) | Índice de desempeño relativo | `GET /app/v1/analitica/desempeno-relativo` | `EngagementPage.tsx` | CU-O11 |
| Staff (`require_staff`, sin cambio) | Reporte diario operativo | `GET /app/v1/analitica/reporte-diario` | `ReporteDiarioPage.tsx` | CU-O16 |
| Pro (tras este change) | Adquisición por canal | `GET /app/v1/analitica/adquisicion` | `AdquisicionPage.tsx` | CU-O54 |
| Básico | Disponibilidad de infraestructura | `GET /app/v1/analitica/disponibilidad` | `DisponibilidadInfraPage.tsx` | CU-O55 |
| Staff (sin cambio) | Churn mensual | `GET /app/v1/analitica/churn` | `ChurnPage.tsx` | CU-O72 |
| Staff (sin cambio) | Funnel de conversión | `GET /app/v1/analitica/funnel-conversion` | `FunnelConversionPage.tsx` | CU-O73 |
| Staff (sin cambio) | P&L consolidado | `GET /app/v1/analitica/pnl` | `PnlPage.tsx` | CU-O74 |
| Staff (sin cambio) | MRR/ARR | `GET /app/v1/analitica/mrr-arr` | `MrrArrPage.tsx` | CU-O77 |
| Todos (B2B/B2C) | Suscribirse a plan | `POST /app/v1/suscripciones` | `PlanesPage.tsx` | CU-O06 |
| Todos (B2B/B2C) | Cancelar suscripción con motivo | `POST /app/v1/suscripciones/{id}/cancelar` | `PlanesPage.tsx` | CU-O70 |
| B2C | Trial + plan estudiante | `POST /app/v1/suscripciones` | `PlanesPage.tsx` | CU-O71 |

No se encontraron CU sin ningún componente frontend asociado (todos los CU operativos de ambos
paquetes tienen una vista real en producción) — el hueco era puramente de documentación explícita
de esa cadena, no de cobertura funcional.

## Risks / Trade-offs

- [Riesgo] Un Cliente B2B Básico que hoy usa comparación/benchmark/adquisición pierde acceso al
  desplegar este change → Mitigación: es el comportamiento correcto según lo que su plan promete
  y paga; se comunica con el estado "disponible desde plan X" en vez de un 403 mudo, y no afecta a
  ningún tier que ya pagaba por ese nivel de acceso.
- [Riesgo] La proyección estadística simple puede leerse como "predicción" y generar expectativas
  de precisión que un ajuste lineal sobre pocas semanas de datos no puede sostener → Mitigación:
  copy explícito de "proyección estimada, no predicción de IA" tanto en el JSON (`tipo:
  "proyeccion_estadistica"`) como en la UI, y el requisito de mínimo 3 semanas de datos antes de
  proyectar (si no, `suficiente: false`).
- [Riesgo] `require_tier` depende de `require_b2b_panel_access` — si algún endpoint nuevo se agrega
  a futuro sin recordar aplicar el tier correcto, quedaría accesible desde Básico por omisión →
  Mitigación: el piso por defecto (sin `require_tier` explícito) es Básico, que es la opción segura
  por defecto (fail-closed hacia el tier más restrictivo de gating adicional, no hacia acceso
  total); se documenta la tabla de asignación por endpoint en este design.md como referencia para
  cualquier endpoint nuevo de `analitica`.

## Migration Plan

- Sin migración de datos: `tipo_plan` ya existe en cada registro de la colección `suscripciones` de
  PocketBase, no se agrega ningún campo nuevo a PocketBase ni a ClickHouse.
- Despliegue: cambio de código puro (backend + frontend), sin backfill. Al desplegar, cualquier
  Cliente B2B Básico/Pro con una sesión activa que refresque un panel ahora fuera de su alcance
  verá el nuevo estado "disponible desde plan X" en la siguiente carga de esa pantalla — no
  requiere logout/login.
- Rollback: revertir el commit de backend basta para volver al gating anterior (uniforme por rol);
  no hay estado persistente nuevo que limpiar.

## Open Questions

Ninguna pendiente — todas las decisiones de diseño quedaron resueltas arriba con su justificación.
