# Bitácora de Desarrollo — Semana 7
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 7 de 16
**Fecha:** Junio 2026
**Cierre de semana:** 5 capabilities del módulo operativo especificadas con OpenSpec (`catalogo`, `suscripciones`, `analitica`, `partners`, `ingesta`); `catalogo` y `suscripciones` implementadas y verificadas end-to-end

---

## Resumen ejecutivo

La semana 7 introduce una metodología nueva para el proyecto — Spec Driven Development con OpenSpec — y la usa de inmediato para cerrar dos capabilities reales. Tres frentes en paralelo:

1. **Especificación:** constitución técnica del proyecto (`openspec/config.yaml`) y especificación formal de las 5 capabilities del módulo operativo con Spec Driven Development (OpenSpec).
2. **Conciliación e implementación:** `catalogo` (gaps reales resueltos contra el código existente) y `suscripciones` (implementada desde cero), ambas verificadas end-to-end con requests reales.
3. **Documentación de entrega:** documento de especificaciones, documento UML con 8 diagramas, guion de video.

> **Nota de alcance:** esta bitácora documenta en detalle los frentes 1 y 2 (especificación e implementación), que son verificables directamente en el repositorio. El frente 3 (documento de especificaciones, UML, guion de video) es un entregable de la semana que vive fuera del código versionado en este repositorio y no se detalla aquí.

---

## Constitución técnica del proyecto

`openspec/config.yaml` formaliza, por primera vez en un solo artefacto versionado, las reglas que hasta ahora vivían dispersas entre el código y el conocimiento tácito del equipo:

- **Stack obligatorio (no negociable):** PocketBase (fuente real + entidades operativas), Parquet (staging transitorio), ClickHouse/MergeTree (única base analítica), Airflow (orquestación), FastAPI (con `threading.local` para el cliente ClickHouse, nunca singleton global), Docker Compose, Bootstrap 5 local + Plotly.js + Lucide SVG en el frontend.
- **Reglas del docente (RT-01 a RT-06):** movimiento de datos solo desde Python; dataset >100k registros y >12 columnas; todos los servicios en Docker; interfaz web con dashboards interactivos; ClickHouse como única fuente analítica principal; mínimo 10 tablas relacionadas al negocio.
- **Modelo de datos técnico:** FACT_TRACKS + 11 dimensiones + 3 tablas de infraestructura (ya documentado en el README desde sprints anteriores).
- **Modelo de datos de negocio (separado del técnico):** FACT_SUSCRIPCION, FACT_ADQUISICION, FACT_INTEGRACION_PARTNER, FACT_DISPONIBILIDAD, FACT_INGESTA_DATOS, FACT_ENGAGEMENT_USUARIO, con sus dimensiones (DIM_TIEMPO, DIM_REGION, DIM_CLIENTE, DIM_PARTNER, DIM_PLAN_SUSCRIPCION, DIM_CANAL_MARKETING, DIM_COMPONENTE_INFRAESTRUCTURA) — explícitamente independiente del modelo técnico, para no conflactar ambos en ningún artefacto.
- **Regla crítica de framing:** la generación de datos sintéticos (seeds reproducibles, flag `is_synthetic`) es simulación académica únicamente y nunca debe aparecer en specs, propuestas o diseños de cara a negocio; la ingesta de nuevos lotes se describe siempre como integración desde fuentes externas de streaming con validación de calidad.
- **Estándares de calidad (ISO 25010):** adecuación funcional, eficiencia de rendimiento (batches ≥50.000 filas), compatibilidad (8 servicios Docker), capacidad de interacción, fiabilidad (idempotencia vía `ETL_BATCH_CONTROL`), seguridad (credenciales solo por variables de entorno), mantenibilidad, flexibilidad, safety.
- **Convenciones de documentación:** toda especificación de capability debe incluir una tabla de trazabilidad de 5 niveles (empresarial → departamento/actor → paquete → caso de uso CU-O → historia de usuario "Como/quiero/para").

---

## Capabilities especificadas

Las 5 capabilities cubren los 16 casos de uso operativos (CU-O01 a CU-O16) de la especificación de negocio, confirmados leyendo `openspec/changes/*/specs/*/spec.md`:

| Capability | Casos de uso cubiertos | Estado al cierre de S7 |
|---|---|---|
| `catalogo` | CU-O01–CU-O05 | **Implementada** — reconciliada con el código real existente (24/34 tareas de `tasks.md`) |
| `suscripciones` | CU-O06 | **Implementada desde cero** (21/22 tareas de `tasks.md`) |
| `analitica` | CU-O07–CU-O11, CU-O16 | Especificada y aprobada, pendiente de implementación (0/28 tareas) |
| `partners` | CU-O12 | Especificada y aprobada, pendiente de implementación (0/18 tareas) |
| `ingesta` | CU-O13–CU-O15 | Especificada y aprobada, pendiente de implementación (0/25 tareas) |

Cada `spec.md` sigue la convención de la constitución: tabla de trazabilidad de 5 niveles antes del detalle de requisitos, requisitos funcionales/no funcionales con escenarios WHEN/THEN, y criterios de aceptación verificables.

---

## Hallazgo de conciliación: `catalogo`

Al aplicar la capability `catalogo` (`/opsx:apply`) se detectó una divergencia real entre el diseño original de la propuesta y el código que ya estaba en producción:

- **Diseño original (asumido al proponer la capability):** favoritos e historial de reproducción viven en PocketBase como colecciones CRUD, igual que `playlists`/`playlist_tracks`.
- **Implementación real encontrada en el código:** favoritos e historial se escriben como eventos (`favorito_add`, `favorito_remove`, `reproduccion`) directamente en ClickHouse (`FACT_ENGAGEMENT_USUARIO`), de forma **síncrona y fila por fila**, desde los endpoints de `api/paquetes/biblioteca/router.py` — sin pasar por PocketBase ni por el pipeline batch Parquet/Airflow del catálogo.

**Decisión tomada:** actualizar la especificación (`design.md` y `specs/catalogo/spec.md`) para reflejar la arquitectura real, en vez de migrar el código funcional a PocketBase para que coincidiera con el diseño original. Razones documentadas en `design.md`:

1. El código real ya funciona en producción y migrarlo introduciría una doble escritura (PocketBase → ETL → ClickHouse) sin beneficio funcional.
2. La escritura síncrona desde FastAPI sigue cumpliendo RT-01 ("todo movimiento de datos ocurre desde Python") porque la inserción ocurre desde un proceso Python (`clickhouse-connect` dentro de FastAPI) — RT-01 exige que el movimiento sea código Python, no que sea necesariamente batch.
3. La capability `analitica` (especificada esta misma semana) ya depende de `FACT_ENGAGEMENT_USUARIO` como tabla de eventos disponible en tiempo real para calcular `engagement_score`; forzar un ETL intermedio retrasaría esa dependencia sin necesidad.

Esta excepción quedó documentada explícitamente en `design.md` como riesgo conocido (dos round-trips a ClickHouse por evento: verificación de existencia del `fact_id` + insert), con su mitigación (volumen bajo por usuario, patrón de inserts pequeños y frecuentes compatible con MergeTree).

---

## Gaps resueltos en `catalogo`

Cuatro gaps reales identificados al comparar `tasks.md` contra el código existente, resueltos en esta semana:

| Gap | Problema que resolvía |
|---|---|
| **Gating B2B/analyst** (`require_b2c_user` en `api/core/deps.py`, aplicado en los 5 endpoints de `api/paquetes/biblioteca/router.py`) | Un Cliente B2B (rol `analyst`) podía llamar a los endpoints de biblioteca personal (favoritos/historial), violando RN-CAT-004 — la biblioteca personal es exclusiva de Usuario B2C |
| **Paginación real** en `GET /app/v1/tracks/search` (`limit`/`offset` + `total` en la respuesta) | El endpoint devolvía un `LIMIT` fijo sin forma de pedir la página siguiente ni saber cuántos resultados totales existían |
| **Filtro de género en la UI** (`app/catalogo/search.html`) | La búsqueda no permitía acotar resultados por género desde el frontend, aunque el endpoint ya soportaba el parámetro |
| **Rename de playlist** (PocketBase + `app/biblioteca/library.html` / `app/js/playlists.js`) | Una playlist creada con un nombre no podía corregirse sin eliminarla y crear una nueva, perdiendo sus tracks |

Verificación end-to-end del gating: se registraron usuarios de prueba reales con rol `analyst` y rol `user`, se autenticaron contra PocketBase para obtener tokens reales, y se hicieron requests reales contra los 5 endpoints de `/app/v1/biblioteca` con cada token — confirmando 403 para `analyst` y 200/normal para `user` en los 5 casos, no solo revisión de código.

---

## `suscripciones` — implementada desde cero

Capability nueva construida en su totalidad esta semana, cubriendo CU-O06:

- **Persistencia:** colección PocketBase `suscripciones` (`usuario_o_cliente` → relación a `users`, `tipo_plan`, `monto`, `moneda`, `estado`, `created`), creada vía `pb_init.py` con reglas de acceso por propietario (`usuario_o_cliente = @request.auth.id`) y sin `deleteRule` — las suscripciones no se borran, solo cambian de `estado` a `"cancelada"`, preservando el rastro auditable.
- **API (`api/paquetes/suscripciones/`):**
  - `planes.py` — catálogo de planes: `free`/`premium` para B2C, `basico`/`pro`/`enterprise` para B2B.
  - `pb_client.py` — helpers async contra PocketBase (`list_activas`, `crear`, `cancelar`).
  - `deps.py` — `require_active_subscription`, dependencia reutilizable que verifica en tiempo real contra PocketBase (no contra `FACT_SUSCRIPCION`), pensada para que `analitica` la consuma sin redefinirla.
  - `router.py` — 5 endpoints: `GET /app/v1/suscripciones/planes`, `POST /app/v1/suscripciones` (confirmar, valida plan vs rol y método de pago, cancela cualquier suscripción previa activa antes de crear la nueva), `GET /app/v1/suscripciones/activa`, `POST /app/v1/suscripciones/{id}/cancelar`.
- **Frontend:** `app/autenticacion/planes.html` — vista de plan activo, grilla de planes filtrada por tipo de actor, formulario de confirmación con método de pago, cancelación.

### Bugs reales encontrados durante la verificación end-to-end

| Bug | Causa | Corrección |
|---|---|---|
| Confirmar el plan `free` (monto `0.0`) fallaba con `400 validation_required: "Cannot be blank."` | PocketBase trata el número `0` como campo vacío en un campo `number` con `required: true` | Campo `monto` cambiado a `required: False` en `pb_init.py` (`0` es un valor legítimo, no una ausencia de dato); parchado también en la colección ya creada vía PATCH al esquema |
| La UI mostraba "Plan activo: premium 9.99 USD · desde **Invalid Date**" | La colección `suscripciones` no tenía ningún campo `created`/`updated` — en esta versión de PocketBase (modelo de esquema "fields") esos campos **no** se agregan automáticamente en colecciones base, hay que declararlos explícitamente | Agregado `{"name": "created", "type": "autodate", "onCreate": true, "onUpdate": false}` al esquema en `pb_init.py`, parchado también en la colección ya creada |

Ambos bugs solo se detectaron porque la verificación se hizo con requests reales (registro de usuarios de prueba, tokens reales, confirmaciones reales contra la colección viva) en lugar de quedarse en revisión de código — una revisión estática del esquema no habría mostrado que PocketBase interpreta `0` como vacío, ni que `created` no se autogenera en este modelo de esquema.

---

## Decisiones técnicas clave

- **Excepción razonada al principio de trazabilidad de movimiento de datos:** favoritos e historial de `catalogo` se escriben de forma síncrona, fila por fila, directo desde FastAPI a ClickHouse (`FACT_ENGAGEMENT_USUARIO`) — un patrón distinto al batch del catálogo (Bronze→Silver→Gold vía Parquet/Airflow). Se documentó como excepción consciente porque ambos patrones cumplen RT-01 igual de válidamente: RT-01 exige que el movimiento de datos ocurra desde código Python, no que sea necesariamente un proceso batch orquestado por Airflow. El pipeline Parquet/Airflow sigue siendo exclusivo del catálogo técnico; `catalogo` nunca lo invoca para registrar biblioteca personal.
- **Fórmula de `engagement_score` definida para `analitica`** (especificada esta semana, implementación pendiente para el siguiente sprint): `raw_score = (reproducciones × 1) + (favoritos × 3) + (playlist_adds × 5)`, normalizado por `engagement_score = MIN(100, ROUND(raw_score / max_raw_score_del_catalogo × 100))`, donde `max_raw_score_del_catalogo` es el `raw_score` más alto entre los tracks con al menos una interacción registrada. El cálculo se documentó como parte de la agregación que alimenta `FACT_ENGAGEMENT_USUARIO` en el pipeline ETL, no en tiempo de request en FastAPI — se descartó calcularlo on-the-fly por riesgo de exceder el límite de 3 segundos de RNF-ANA-001 a escala.
- **Gating de acceso B2B en `analitica` delegado a `suscripciones`:** los endpoints de `analitica` para Cliente B2B reutilizarán `require_active_subscription` ya construida esta semana, en vez de introducir una tabla o lógica de suscripción paralela.
- **`fact_id` como identificador único de track en biblioteca:** se mantiene como decisión vigente (no nueva esta semana) — un mismo `track_id` puede repetirse por género, por lo que toda referencia desde `catalogo`/`suscripciones`/`analitica` a un track concreto usa `fact_id`.

---

## Pendientes para el siguiente sprint

- Implementación de `analitica` (CU-O07–CU-O11, CU-O16), `partners` (CU-O12) e `ingesta` (CU-O13–CU-O15) — ya especificadas y aprobadas en OpenSpec, con `design.md` y `tasks.md` listos para guiar el desarrollo.
- **Nota de diseño para `analitica`:** al implementarla, el diseño debe anticipar una **segunda instancia de ClickHouse exclusiva para agregaciones** (separada de la instancia que sirve el catálogo técnico), para no competir por recursos con las consultas de `catalogo` bajo carga. No se implementa esta semana — solo se deja como restricción a tener en cuenta en el `design.md` de `analitica` antes de empezar esa capability.
- Tareas de medición de rendimiento aún sin verificar formalmente (más allá de timing informal con `curl`): 3.5 en `catalogo/tasks.md` (búsqueda <1s) y 3.5 en `suscripciones/tasks.md` (confirmación <3s).
- Tarea 7.4 de `catalogo/tasks.md` (ocultar/deshabilitar vistas de biblioteca personal en la UI para Cliente B2B) sigue pendiente — el gating ya está resuelto en el backend, falta el equivalente visual en frontend.
- Tareas 2.1–2.3 de `catalogo/tasks.md` (endpoints proxy de auth en FastAPI) quedan deliberadamente sin implementar: `design.md` documentó la decisión de que el frontend siga hablando directo con PocketBase para registro/login/logout, sin proxy.
