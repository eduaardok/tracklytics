# Bitácora de Desarrollo — Semana 8
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 8 de 16
**Fecha:** Junio 2026
**Cierre de semana:** las 5 capabilities del módulo operativo especificadas en S7 quedan **implementadas, verificadas end-to-end y archivadas** en OpenSpec (`catalogo`, `suscripciones`, `analitica`, `ingesta`, `partners`); una segunda ronda de prueba manual real sobre el stack completo encuentra y corrige 5 problemas de UX/infraestructura (incluyendo la eliminación de un frontend legado duplicado) y agrega la UI de partners

---

## Resumen ejecutivo

La semana 8 cierra el ciclo de Spec Driven Development abierto en S7: las tres capabilities que quedaron especificadas pero sin implementar (`analitica`, `ingesta`, `partners`) se construyen, se verifican con requests reales contra el stack vivo en Docker y se archivan con `/opsx:archive`. Con esto, el módulo operativo completo (16 casos de uso CU-O01–CU-O16) queda con código funcional y trazabilidad completa desde la especificación de negocio hasta el commit.

Cada capability se implementó siguiendo el mismo flujo: leer `proposal.md`/`design.md`/`tasks.md` → identificar dependencias externas faltantes y pedir confirmación antes de crearlas → implementar paquete FastAPI (`api/paquetes/<capability>/`) y frontend si aplica → verificar con `curl` contra el stack real → documentar desviaciones de diseño en `design.md`/`tasks.md` → sincronizar specs principales (`openspec-sync-specs`) → archivar.

Las tres implementaciones encontraron divergencias reales entre lo especificado y la arquitectura existente — documentadas explícitamente como "Decisiones tomadas durante la implementación" en cada `design.md`, siguiendo el mismo principio aplicado a `catalogo` en S7: actualizar la especificación para reflejar la realidad verificable, no forzar el código a coincidir con un diseño que asumía infraestructura inexistente.

---

## Capabilities cerradas esta semana

| Capability | Casos de uso | Estado al cierre de S7 | Estado al cierre de S8 |
|---|---|---|---|
| `analitica` | CU-O07–CU-O11, CU-O16 | Especificada, 0/28 tareas | **Implementada y archivada** — 8/8 secciones de tasks.md completas |
| `ingesta` | CU-O13–CU-O15 | Especificada, 0/25 tareas | **Implementada y archivada** — 7/7 secciones + gating agregado |
| `partners` | CU-O12 | Especificada, 0/18 tareas | **Implementada y archivada** — 5/5 secciones completas |

Las 5 capabilities del módulo operativo viven ahora en `openspec/changes/archive/2026-06-25-<capability>/`, con sus specs principales sincronizadas en `openspec/specs/<capability>/spec.md`.

---

## `analitica` — paneles de KPIs, engagement y reporte diario

**Implementado:**
- Gating de acceso B2B: `api/paquetes/analitica/deps.py::require_b2b_panel_access` reutiliza `suscripciones` (no redefine lógica de planes) — exige `role=analyst` + suscripción activa, exime a `role=admin`. Aplicado tanto a los endpoints legacy como a los nuevos `/app/v1/analitica/*`.
- `GET /app/v1/analitica/dashboard` — KPIs agregados (tracks, artistas, géneros, popularidad/energy/danceability promedio) sobre 713,550 tracks reales.
- Perfil de audio por género, comparación de dos artistas, benchmark de artista contra el promedio de su género predominante (sin exclusión de outliers, por decisión explícita RN-ANA-002).
- Tendencias temporales por semana de carga (`load_week`), con manejo controlado de rango inválido (422) o vacío (`data: []`).
- `engagement_score` (0–100) e índice de desempeño relativo "Mercado vs. Tracklytics", con mensaje explícito de "datos insuficientes" cuando el track no tiene interacciones.
- Reporte diario operativo, exclusivo de `role=admin` (Data Analyst/BI Lead).
- Frontend: páginas existentes (`dashboard.html`, `genres.html`, `compare-artists.html`, `trends.html`) actualizadas con token de auth y manejo de 403; páginas nuevas `benchmark.html`, `mercado-vs-tracklytics.html`, `reporte-diario.html`.

**Desviaciones de diseño encontradas y documentadas** (`design.md`, sección "Decisiones tomadas durante la implementación"):
- No existe una segunda instancia de ClickHouse para agregaciones, como anticipaba el pendiente dejado en S7 — se descartó esa restricción: todas las queries van contra la base `tracklytics` única, y el `engagement_score` se calcula on-the-fly por agregación ClickHouse en cada request (no en un pipeline ETL nuevo), lo que sigue cumpliendo el límite de 3 segundos sin infraestructura adicional.
- `FACT_ENGAGEMENT_USUARIO.event_type` no incluye un evento de "adición a playlist": el término `playlist_adds × 5` de la fórmula de engagement es siempre 0 hoy; se deja en la fórmula para cuando exista esa fuente.
- `FACT_SUSCRIPCION` y `FACT_ADQUISICION` no existen en el esquema ClickHouse real — el reporte diario agrega ingestas (`ETL_LOGS`) y engagement reales, y devuelve esos dos campos como `null` con nota aclaratoria en vez de inventar una fuente de datos.
- El gating se extendió también a los endpoints legacy de `analytics/` (no solo a los nuevos `/app/v1/analitica/*`), porque CA-ANA-003 exige bloquear "cualquier panel analítico" — esto requirió agregar el header `Authorization` a páginas que antes llamaban a la API sin token.

**Verificación:** las 4 actas de aceptación (CA-ANA-001 a CA-ANA-004) verificadas con `curl` contra datos reales, incluyendo un caso real de `engagement_score` calculado (fact_id=350150 → 67.0) y 403 confirmado en todos los endpoints sin suscripción activa.

---

## `ingesta` — gestión del pipeline ETL y CRUD de dimensiones

**Implementado:**
- `POST /app/v1/ingesta/ejecuciones` dispara la carga de un período vía Airflow (nunca síncrono en el request); `forzar_recarga: bool` explícito y deshabilitado por defecto.
- `GET /app/v1/ingesta/ejecuciones/{id}` reporta la etapa en tiempo real leyendo `taskInstances` de Airflow.
- Idempotencia contra `ETL_BATCH_CONTROL`; historial de cargas con tasa de rechazo (`tasa_rechazo_pct`) y bandera `requiere_revision` cuando supera 1%.
- CRUD de dimensiones técnicas ya existente (`/dim/{table}`) se mantiene; verificado que `FACT_TRACKS` sigue siendo inalcanzable desde la interfaz (`POST`/`PUT`/`DELETE` → 404/405).
- `DELETE /dim/{table}/{id}` exige `confirmar=true` cuando el valor está referenciado por `FACT_TRACKS` (409 sin confirmación, 204 con ella sobre un valor sin referencias).
- Gating nuevo: `require_lead_data_engineer` (`role=admin`) aplicado a todo el router `gestion_datos` — ningún endpoint, legacy ni nuevo, tenía control de acceso antes de esta implementación.
- Frontend: `etl.html` con checkbox de recarga forzada, `stage-tracker` con poll cada 5s, columna de tasa de rechazo; `crud.html` con diálogo de confirmación ante 409 por referencia.

**Bugs reales encontrados y corregidos durante la verificación** (no detectables por revisión estática, solo con requests reales):

| Bug | Causa | Corrección |
|---|---|---|
| Dos disparos casi simultáneos del mismo período recibían ambos 202 | El guard de concurrencia verificaba "¿hay una ejecución activa?" antes de que el primer disparo registrara su `dagRun` en Airflow — ventana de carrera de ~0.3–0.5s | `asyncio.Lock` de proceso serializando todo el tramo verificar→truncar→disparar |
| El guard no detectaba una ejecución recién encolada | Ordenar `dagRuns` por `-start_date` excluía `queued` (sin `start_date` hasta pasar a `running`) del límite de 10 resultados | Filtrar directamente por `state=queued|running` en la API de Airflow, sin depender de una columna nullable para el orden |
| Una ejecución fallida no dejaba ningún registro en `ETL_LOGS` | `gold/loader.py::run_log` solo corría si todas las tareas previas tenían éxito | Nueva task `task_log_failure` (`trigger_rule=ONE_FAILED`) en la DAG, sin tocar la lógica de las tasks existentes |

**Decisión de alcance respetada:** no se insertaron datos sintéticos en `FACT_TRACKS` para forzar el camino de eliminación de dimensión referenciada — el harness de ejecución bloqueó ese intento explícitamente por ser una mutación no solicitada sobre una tabla compartida. Se verificó en su lugar el camino 409 contra un género real, el camino 204 contra una dimensión creada y eliminada para la prueba, y por inspección de código que ambos caminos solo difieren en la bandera `confirmar`.

**Hallazgo documentado, no corregido (fuera de alcance):** `dim_create`/`dim_update` siguen construyendo SQL por interpolación de strings no parametrizada — código preexistente a esta capability, registrado como riesgo en `design.md` sin ampliar el alcance de `ingesta` para arreglarlo.

---

## `partners` — API de catálogo para integradores externos

**Dependencias externas creadas** (con confirmación explícita previa, al no existir ningún directorio de partners en el proyecto):
- Colección PocketBase `partners` (`nombre`, `api_key`, `tier`, `estado`, `fecha_expiracion`) — admin-only, sin reglas de usuario final; FastAPI se autentica contra ella con credenciales de superusuario, no con un flujo de sesión.
- Tabla ClickHouse `LOG_LLAMADAS_PARTNER` — log operativo por llamada (partner, endpoint, tier, resultado, registros, duración), explícitamente distinto de `FACT_INTEGRACION_PARTNER` (que queda fuera de alcance, a alimentar por un futuro pipeline ETL de CU-T03).

**Implementado:**
- Autenticación exclusivamente por header `X-API-Key` (RNF-PAR-002): cualquier intento de enviarla por query string se rechaza con 400, incluso con un header válido presente simultáneamente.
- Validación de formato (`^[A-Za-z0-9_-]{16,128}$`) antes de interpolar el valor en cualquier filtro de PocketBase, por ser un valor de un llamador externo no autenticado.
- Resolución de partner/tier con caché TTL de 30s; rechazo genérico (401) sin distinguir si la llave no existe, expiró o el partner está inactivo (RN-PAR-001).
- Segmentación por tier (`basico`/`pro`/`enterprise`) declarada por endpoint vía `require_partner(min_tier)`; comparación antes de ejecutar cualquier consulta, nunca después.
- Endpoints de solo lectura: `tracks` (lista/detalle, campos filtrados por tier), `tracks/export` (exclusivo enterprise), `artistas`, `albumes`, `generos`.
- Registro de cada llamada (exitosa o rechazada) vía middleware HTTP scoped a `/partners/v1/*`, sin duplicar lógica de logging en cada endpoint.

**Bug encontrado y corregido durante la verificación:** las queries de artistas/álbumes/géneros devolvían claves ambiguas (`a.artist_id` en vez de `artist_id`) — ClickHouse desambigua el nombre de columna cuando el mismo nombre existe simultáneamente en la fact table (FK) y la dimensión unida por JOIN (PK). Corregido agregando alias explícito (`AS artist_id`, etc.) en `queries.py`.

**Verificación:** las 4 actas de aceptación (CA-PAR-001 a CA-PAR-004) y RNF-PAR-002 verificadas con `curl` usando dos partners de prueba (tier básico y enterprise), creados y eliminados de PocketBase específicamente para la prueba. Confirmado en `LOG_LLAMADAS_PARTNER` que las llamadas exitosas, rechazadas por autenticación y rechazadas por tier quedan todas registradas.

---

## Decisiones técnicas clave de la semana

- **Gating de acceso es responsabilidad de cada capability consumidora, no de un middleware central:** `analitica` reutiliza `require_active_subscription`/lógica de `suscripciones` sin redefinirla; `ingesta` define su propio `require_lead_data_engineer`; `partners` define su propio `require_partner` por tier. Cada paquete compone su propio `deps.py` en vez de centralizar en `core/deps.py` (salvo `get_current_user`, que sí es central).
- **Ningún spec asumía correctamente la ausencia de infraestructura que el código real no tenía** (segunda instancia ClickHouse en `analitica`, columna de estado en `ETL_BATCH_CONTROL` en `ingesta`, directorio de partners en `partners`). En los tres casos la resolución fue la misma: adaptar el diseño a la arquitectura real verificable, documentando la decisión explícitamente en `design.md` en vez de forzar infraestructura nueva no solicitada.
- **Verificación end-to-end con `curl` contra el stack real encontró bugs que la revisión de código no hubiera detectado:** la condición de carrera de `ingesta` y el bug de columna ambigua de `partners` solo aparecieron al ejecutar requests reales, no en la lectura del código.
- **El harness de ejecución bloqueó una mutación no solicitada sobre datos compartidos** (insertar una fila sintética en `FACT_TRACKS` solo para una prueba) — se respetó el bloqueo y se verificó el comportamiento por las vías alternativas disponibles, sin intentar evadirlo.

---

## Verificación manual end-to-end y correcciones de UX (segunda mitad de S8)

Tras implementar y archivar las 3 capabilities, se levantó el stack completo (`docker compose up`)
y se probó manualmente cada caso de uso operativo con las 3 cuentas demo (`usuario.b2c`,
`cliente.b2b`, `admin.demo`). Esta ronda de prueba real encontró 5 problemas que la verificación
con `curl` de la implementación no había cubierto, porque eran de experiencia de usuario o de
infraestructura, no de lógica de negocio:

1. **Hallazgo de infraestructura — frontend duplicado.** El error "401 Missing or invalid token"
   reportado al probar ETL como `analyst` y como `admin` no era un bug del backend ni del gating:
   existía un segundo frontend completo en `frontend/` (puerto 80), código muerto sin ningún
   `Authorization` header, que llevaba sprints coexistiendo con el frontend real `app/` (puerto
   8081) sin que nadie lo hubiera notado. Confirmado con `diff -rq app frontend` (estructuras
   totalmente distintas) y con `grep` (cero referencias a `token`/`Authorization` en
   `frontend/pages/etl.html`). Se eliminó `frontend/` completo (carpeta + servicio en
   `docker-compose.yml`) — `app/` es ahora el único frontend del proyecto.
2. **Sidebar:** el nombre de usuario se cortaba detrás del botón de logout porque `.user-name`
   no tenía `flex:1; min-width:0; text-overflow:ellipsis` — el contenido desbordaba el contenedor
   en vez de truncarse. Corregido en `main.css`, junto con una separación visual más clara entre
   el bloque de perfil y el botón de logout.
3. **Biblioteca sin feedback en bloqueos:** los 403 de `/app/v1/biblioteca/*` (RN-CAT-004, Cliente
   B2B sin acceso) solo se veían en la consola del navegador — `favorites.js`/`history.js` los
   capturaban con `console.warn`/`.catch(console.error)`, sin ninguna señal visible. No existía
   ningún componente de toast en el proyecto; se construyó uno nuevo (`app/js/toast.js`, sin
   dependencias para evitar un ciclo de imports con `api.js`/`components.js`) y se conectó a
   `apiFetch` para que cualquier 403 muestre el mensaje real del backend automáticamente.
   `library.html` además detecta el rol `analyst` de forma proactiva antes de intentar cargar
   nada, mostrando un bloqueo inline claro en vez de fallar en silencio.
4. **Bugs reales en `planes.html`** (suscripciones), encontrados solo al usar la UI, no visibles
   en la verificación por `curl` de S7:
   - "Plan activo: undefined / Invalid Date" tras cancelar — el operador
     `(activaRes.data ?? activaRes) || null` devolvía el objeto `{data: null}` completo en vez de
     `null` cuando no hay suscripción activa, porque `null ?? X` evalúa a `X`. Confirmado contra
     la API real (`{"data":null}` vs `{"data":{...}}`) antes de corregir.
   - No había forma de saber si ya tenías un plan — el botón "Suscribirme" se mostraba igual para
     el plan activo. Se agregó comparación contra `activa.tipo_plan` y un estado "Ya tienes este
     plan".
   - La descripción de los planes se truncaba a una línea (`.card-sub` genérico, pensado para
     tarjetas de catálogo) — se agregó un estilo dedicado multilínea para tarjetas de plan.
5. **Doble toast en analítica:** al bloquear el acceso por falta de suscripción, el mensaje
   aparecía dos veces (toast flotante + tarjeta duplicada dentro del dashboard). Causa: páginas
   como `dashboard.html` y `genres.html` llaman a dos funciones de carga en paralelo
   (`loadDashboard()` + `loadGenreCharts()`), y cada una golpeaba `fetchJSON`, cada una disparando
   su propio toast+redirect de forma independiente. Se agregó un guard `_accessDenied` por página
   (en las 11 páginas de analítica/gestión de datos que tienen este patrón) para que el toast y el
   redirect se disparen una sola vez sin importar cuántas llamadas paralelas fallen con 403, y para
   que la tarjeta de error inline no duplique el mismo mensaje que ya muestra el toast.

**UI de partners agregada** (a pedido explícito, no parte del CU-O12 original): consola de
pruebas interna (`app/partners/console.html`, solo `admin`) para probar cualquier endpoint de
`/partners/v1/*` pegando una API key, sin `curl`; y una landing pública de demo
(`app/partners/landing.html`, sin login) que muestra tiers y autenticación a modo de developer
portal, con aviso explícito de que es una demostración previa a producción. Documentado en
`openspec/specs/partners/spec.md` como herramienta de verificación/demo, distinta de la
documentación interactiva formal (Swagger/Redoc) que sigue fuera de alcance.

**Exploración sin implementar:** reproducción de audio real. Confirmado que no existe ningún
`<audio>` ni archivo de sonido en el proyecto — el dataset de Spotify no trae audio, solo
metadata y *features*. Opción recomendada: iTunes Search API (sin auth, gratis) para previews
reales de 30s por nombre de track + artista, con fallback para los tracks sintéticos (no van a
tener match). Ya se había anticipado en `docs/PLAN_MEJORAS_FRONTEND_P2.md` §3.1. Queda en
`docs/PENDIENTES.md` a la espera de decisión.

---

## Pendientes para el siguiente sprint

- **CU-T03 (administración táctica de partners)** sigue sin especificar ni implementar — la colección PocketBase `partners` creada esta semana es un placeholder mínimo (alta/edición manual vía superusuario) hasta que esa capability exista.
- **Alimentación de `FACT_INTEGRACION_PARTNER`** desde `LOG_LLAMADAS_PARTNER` vía un pipeline ETL — fuera de alcance de `partners`, queda como trabajo futuro explícito.
- **Riesgo de SQL no parametrizado en `dim_create`/`dim_update`** (`gestion_datos`), documentado en `design.md` de `ingesta` pero no corregido por estar fuera del alcance de esa capability.
- **Reproducción de audio real** — explorado (ver arriba), sin decisión de implementación tomada.
- **`api/routers/app_router.py`** parece código muerto (no se importa desde ningún paquete ni desde `main.py`) — heredado del refactor a paquetes funcionales documentado en `TRACKLYTICS_PLAN.md`. Verificar y eliminar.
- Medición formal de rendimiento más allá de timing informal con `curl` sigue pendiente para varias capabilities (arrastrado desde S7).
- Con las 5 capabilities operativas cerradas, el siguiente frente natural es el módulo táctico (CU-T01–CU-T0x) o la consolidación de los hallazgos de esta semana en la documentación de entrega (UML, guion de video) — pendiente de definir alcance con el equipo.
