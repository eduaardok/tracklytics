## Context

Tracklytics modela hoy un catálogo global sin fronteras: cualquier usuario ve y reproduce cualquier track, y el "sello discográfico" es un campo de texto libre (`DIM_ARTISTS.record_label`, `DIM_ALBUMS.label`) sin relación con nada. Un sistema de streaming real licencia su catálogo sello por sello, país por país, y puede restringir un track a un mercado o canal específico. Esta capability introduce esa capa de mercado/licencias, reutilizando `FACT_TRACKS`/`DIM_ARTISTS`/`DIM_ALBUMS` de `catalogo` sin duplicarlos.

Restricciones de arquitectura ya establecidas que aplican aquí:

- **RT-01**: toda escritura (alta de sello, licencia, restricción, y el evento de bloqueo de reproducción) ocurre desde código Python en FastAPI, nunca desde el frontend directo a ClickHouse.
- **RT-05**: ClickHouse es la única fuente analítica; las 7 tablas nuevas viven ahí, igual que el resto del modelo técnico y de negocio.
- Patrón de auditoría ya implementado (`audit.record` en `seguridad`, usado en `social`): toda escritura administrativa queda en `FACT_AUDIT_LOG`.
- Patrón de `fact_id` sintético para eventos de alto volumen sin lock: `random.getrandbits(50)` en Python (corregido en `social` desde 63 bits, que excedía `Number.MAX_SAFE_INTEGER` en el cliente React).
- Patrón de soft-delete para configuración estática: columna `activo` (UInt8), igual que `BRIDGE_SEGUIMIENTO_ARTISTA` en `social`.
- El endpoint que hoy registra una reproducción es `POST /app/v1/biblioteca/historial/{fact_id}` (`api/paquetes/biblioteca/router.py`), protegido con `require_b2c_user` y ya escribiendo síncronamente en ClickHouse (`FACT_ENGAGEMENT_USUARIO`) — es el punto natural para insertar la verificación de restricción sin crear un segundo camino de "intento de reproducción".
- `DIM_USUARIO.pais` (capability `seguridad`) es un campo de texto libre capturado en el registro (`<input type="text">`, sin catálogo fijo de países) — no una FK. Esto tiene implicación directa en cómo se resuelve el país del usuario contra `DIM_PAIS` (ver Decisiones).

## Goals / Non-Goals

**Goals:**
- Modelar sellos discográficos como entidad propia, con migración del campo de texto libre existente a una FK real.
- Modelar licencias de distribución a nivel sello-país, con vigencia y estado.
- Permitir restringir la reproducción de un track por país y canal, con motivo tipificado.
- Enforzar esa restricción en el flujo real de reproducción existente, registrando cada intento bloqueado como evento analítico.
- Dar al Usuario B2C una forma de consultar disponibilidad antes de reproducir, sin que esa consulta por sí sola bloquee nada.

**Non-Goals:**
- Integración con sistemas reales de gestión de derechos (DRM, PROs).
- Cálculo o liquidación de regalías a sellos (pertenece a `facturacion`).
- UI de mapa geográfico interactivo — una tabla/lista simple es suficiente para el nivel P4 del proyecto.
- Resolver de forma robusta (geolocalización por IP, normalización ISO real) el país del usuario — se usa el país declarado en su perfil, con las limitaciones que eso implica (ver Decisiones).

## Decisions

### 1. Migración de `record_label`/`label` a `sello_id` (BREAKING)

**Decisión:** reemplazo directo, no coexistencia de ambos campos (mismo criterio que `is_synthetic` → `source_type` en `creadores`: mantener ambos genera inconsistencia si se actualiza uno y no el otro).

Pasos:
1. Script Python de una sola ejecución: `SELECT DISTINCT record_label FROM DIM_ARTISTS WHERE record_label != ''` y equivalente sobre `DIM_ALBUMS.label`, unión de ambos conjuntos.
2. Poblar `DIM_SELLO_DISCOGRAFICO` con esos valores distintos (`sello_id` autoincremental en Python, igual que el resto de dimensiones nuevas del proyecto — sin `SELECT max()+1` bajo concurrencia porque esta población es un script único, no un endpoint concurrente).
3. `ALTER TABLE DIM_ARTISTS ADD COLUMN sello_id UInt32 DEFAULT 0`, mismo `ALTER` en `DIM_ALBUMS`.
4. `UPDATE`-equivalente en ClickHouse (`ALTER TABLE ... UPDATE sello_id = ... WHERE record_label = ...`, mutación asíncrona) para poblar `sello_id` a partir del texto existente.
5. Se elimina `record_label`/`label` en el mismo cambio (`ALTER TABLE ... DROP COLUMN`) una vez verificado que `sello_id` quedó poblado — no se deja como campo deprecado en paralelo, siguiendo la misma decisión que RT-07.
6. Cualquier query en `catalogo`, `analitica` o `partners` que hoy proyecte `record_label`/`label` como texto se reescribe con un `JOIN DIM_SELLO_DISCOGRAFICO USING sello_id`.

**Alternativa descartada:** mantener `record_label`/`label` como campo deprecado junto a `sello_id`. Se descarta por el mismo motivo que en RT-07: riesgo de desincronización y de que código nuevo siga leyendo el campo viejo por accidente.

### 2. Nivel de licencia: sello-país, no track-país

Una `DIM_LICENCIA` cubre todo el catálogo de un sello en un país (no fila por track). Un track hereda su cobertura vía `DIM_ARTISTS.sello_id` o `DIM_ALBUMS.sello_id` → `DIM_LICENCIA`. Esto evita una tabla de licencias del tamaño de `FACT_TRACKS × países`, y refleja cómo licencian realmente los sellos (acuerdos por territorio, no por canción).

**Trade-off aceptado:** la app no distingue licencias distintas para el artista vs. el álbum de un mismo track si ambos tienen sellos distintos asignados. Para este alcance (P4 académico) se resuelve usando el sello del álbum como fuente de verdad cuando existe, y el del artista como fallback — se documenta en tasks.md, no requiere una tabla adicional.

### 3. Restricción (`BRIDGE_RESTRICCION_TRACK`) es independiente de la licencia

Una restricción de reproducción (`no_disponible` / `solo_preview` / `geo_bloqueado`) es configuración administrativa explícita por track/país/canal — no se deriva automáticamente de si existe o no una licencia vigente. Esto es intencional: permite al admin restringir un track específico (ej. explícito, o con un problema de derechos puntual) sin tener que modelar eso como una licencia. La relación entre licencia vencida y restricciones nuevas es la Open Question de la sección siguiente.

### 4. Punto de enforcement: dentro de `POST /app/v1/biblioteca/historial/{fact_id}`

**Decisión:** la verificación de restricción se agrega como paso previo dentro del endpoint existente que registra una reproducción (`api/paquetes/biblioteca/router.py::add_historial`), no como un endpoint nuevo separado. Motivo: ese endpoint ya es el único lugar donde el sistema registra "esto se reprodujo", protegido con `require_b2c_user` y con escritura síncrona a ClickHouse — es el mismo patrón de RT-01 que `FACT_ENGAGEMENT_USUARIO`. Duplicar la lógica en un endpoint paralelo de `distribucion` crearía dos caminos de verdad para "intento de reproducción".

Flujo dentro de `add_historial`:
1. Resolver `pais_id` del usuario a partir de `DIM_USUARIO.pais` (ver Decisión 5).
2. Consultar `BRIDGE_RESTRICCION_TRACK` por `(fact_id_track, pais_id, canal_id='streaming', activo=1)`.
3. Si existe una restricción activa: no insertar en `FACT_ENGAGEMENT_USUARIO`, insertar en `FACT_RESTRICCION_REPRODUCCION`, y responder `403` con el motivo (`tipo_restriccion`).
4. Si no existe: comportamiento actual sin cambios (inserta en `FACT_ENGAGEMENT_USUARIO`).

El `canal_id` se fija a `'streaming'` en este endpoint porque es el único canal que expone la app hoy (no hay descarga ni sync licensing en el producto real); los otros dos valores de `DIM_CANAL_DISTRIBUCION` existen para que el admin pueda configurar restricciones realistas aunque el frontend actual solo ejercite streaming.

### 5. Resolución de país del usuario contra `DIM_PAIS`

`DIM_USUARIO.pais` es texto libre sin normalizar (ver Context). Para RF-DIS-007/008 se resuelve por comparación case-insensitive contra `DIM_PAIS.nombre`. Si no hay coincidencia (país no reconocido, vacío, o typo del usuario), **no se aplica ninguna restricción** (fail open) — se prioriza no bloquear reproducciones legítimas por un dato de perfil no normalizado, sobre un enforcement estricto que el proyecto no tiene forma de garantizar sin un selector de país real en el registro. **Confirmado (2026-07-02):** se mantiene el fail-open sin normalizar `DIM_USUARIO.pais` en esta ronda — ver limitación conocida a continuación.

#### Limitación conocida: bloqueo geográfico depende de país normalizado

- `DIM_USUARIO.pais` es un campo de texto libre (capturado con `<input type="text">` en `register.html`), sin normalización ni catálogo fijo contra `DIM_PAIS`.
- El fail-open (Decisión 5) es la decisión correcta como default — no tiene sentido bloquear reproducciones de todos los usuarios por mala calidad de un dato de perfil. Pero implica que **RF-DIS-007 (bloqueo por restricción geográfica) solo funciona de forma confiable cuando el texto de `pais` del usuario coincide exacto (case-insensitive) con `DIM_PAIS.nombre` o `DIM_PAIS.codigo_iso`**. Un usuario con un país mal escrito, vacío, o en un idioma/formato distinto simplemente no queda sujeto a ninguna restricción geográfica, aunque exista una activa para su país real.
- Normalizar `DIM_USUARIO.pais` a una FK real contra `DIM_PAIS` queda **fuera de alcance de esta capability**: esta ronda ya incluye la migración breaking de `record_label`/`label` → `sello_id` (Decisión 1), y forzar una segunda migración de datos existentes (`seguridad`, no `distribucion`) en el mismo cambio agrega riesgo y alcance no pedido. Queda como candidato a resolver en una ronda futura si se prioriza (ej. reemplazar el `<input>` de país en `register.html` por un `<select>` sembrado desde `DIM_PAIS`).
- **Implicación para verificación (tasks.md, sección 10):** para que la demo/verificación curl de esta capability sea representativa, los usuarios de prueba que se creen específicamente para verificar RF-DIS-007/008 deben registrarse con un valor de `pais` que calce exacto contra una fila ya sembrada en `DIM_PAIS` (su `nombre` o `codigo_iso`), no un texto arbitrario — de lo contrario el bloqueo no se activará y la verificación dará un falso negativo.

### 6. Escritura de `FACT_RESTRICCION_REPRODUCCION`: síncrona, sin ETL

Igual que `FACT_ENGAGEMENT_USUARIO` en `catalogo` (RT-01): inserción directa desde Python en el mismo request, `fact_id` generado con `random.getrandbits(50)`, sin batch ni Airflow. El volumen esperado (intentos bloqueados) es órdenes de magnitud menor que `FACT_TRACKS`, no justifica un pipeline batch.

## Risks / Trade-offs

- **[Riesgo] País de usuario no normalizado hace el enforcement de país poco confiable** → Mitigado con fail-open (Decisión 5) y documentado explícitamente en "Limitación conocida: bloqueo geográfico depende de país normalizado" (Decisión 5), no oculto en una justificación de paso.
- **[Riesgo] `ALTER TABLE ... DROP COLUMN` sobre `DIM_ARTISTS`/`DIM_ALBUMS` es irreversible una vez ejecutado** → Mitigación: el script de migración se ejecuta en un paso de `tasks.md` separado y verificable (contar filas con `sello_id=0` tras el `UPDATE` antes de hacer `DROP`), no como parte del arranque automático de la app.
- **[Riesgo] Doble fuente de sello si un artista y su álbum tienen `sello_id` distintos** → Aceptado como trade-off de alcance (Decisión 2), resuelto con precedencia álbum > artista, documentado en tasks.md.
- **[Trade-off] Restricción no se deriva de licencia vencida automáticamente** → Ver Open Question.

## Migration Plan

1. Crear las 7 tablas nuevas en ClickHouse (`init_clickhouse.py` o script equivalente de la capability).
2. Poblar `DIM_PAIS` (catálogo fijo de países), `DIM_TIPO_RESTRICCION` y `DIM_CANAL_DISTRIBUCION` con las filas iniciales especificadas.
3. Ejecutar el script de extracción/población de `DIM_SELLO_DISCOGRAFICO` a partir de `record_label`/`label` distintos.
4. `ALTER TABLE` para agregar `sello_id` en `DIM_ARTISTS`/`DIM_ALBUMS`, `UPDATE` de backfill, verificación de cobertura, luego `DROP COLUMN` de los campos de texto libre.
5. Migrar queries de `catalogo`/`analitica`/`partners` que leían `record_label`/`label` a `JOIN` por `sello_id`.
6. Desplegar el paquete `distribucion` (router + queries) y el cambio en `biblioteca/router.py::add_historial`.
7. No hay rollback automático del `DROP COLUMN`; si algo falla entre el paso 3 y 4, se revierte restaurando `record_label`/`label` desde el snapshot de `DIM_SELLO_DISCOGRAFICO` (join inverso) antes de reintentar el `DROP`.

## Open Questions

- **RN-DIS-001 — ¿Una licencia vencida bloquea automáticamente, o solo informa al admin?** No está decidido si el sistema debe impedir programáticamente que un admin cree una restricción nueva de un sello sin licencia vigente en ese país, o si eso es solo una regla de negocio que se muestra como advertencia (ej. un badge "sin licencia vigente" en la UI de administración) sin bloquear la operación.

  **Recomendación:** tratarlo como informativo, no como enforcement automático, para este alcance. Motivo: el enforcement automático requeriría decidir qué pasa con restricciones/reproducciones ya activas cuando una licencia vence (¿se desactivan solas? ¿mediante qué proceso, si no hay batch/cron en este proyecto fuera de Airflow semanal?), lo cual agrega alcance no pedido explícitamente en los requisitos mínimos (RF-DIS-001 a 008). Un admin ya audita cada acción (RN-DIS-002); mostrar la advertencia y dejar la decisión final en manos del admin es consistente con el resto del sistema, donde el admin es la autoridad operativa. Pendiente de confirmación antes de reflejarse en tasks.md.
