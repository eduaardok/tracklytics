## Context

`social` es la cuarta capability nueva del semestre (tras `seguridad`, `facturacion`, `creadores`), y sigue exactamente el mismo precedente arquitectónico ya establecido y documentado: las cuatro tablas nuevas viven en ClickHouse aunque su patrón de acceso sea transaccional (lecturas y escrituras individuales, no analíticas por lotes) — decisión pedagógica deliberada, no un error de arquitectura (`docs/decisiones-refactorizacion.md`, sección 4). No se introduce PostgreSQL ni ninguna otra base relacional para estas entidades.

`social` no introduce ninguna identidad nueva: reutiliza `DIM_USUARIO` (String `usuario_id`, capability `seguridad`) para quién sigue/comenta/comparte y quién modera, y `DIM_ARTISTS`/`FACT_TRACKS` (UInt32 `artist_id` / UInt64 `fact_id`, capability `catalogo`) para el objeto de la interacción. Ninguna tabla nueva duplica esas dos entidades.

## Goals / Non-Goals

**Goals:**
- Permitir que un Usuario B2C siga y deje de seguir artistas, y consulte su propia lista de seguidos.
- Permitir que un Usuario B2C comente un track y responda a un comentario existente (hilo de un nivel vía auto-referencia).
- Permitir que cualquier usuario autenticado (incluye Cliente B2B, solo lectura) liste los comentarios visibles de un track.
- Permitir que `admin` oculte o elimine un comentario, con auditoría en `FACT_AUDIT_LOG`.
- Permitir que un Usuario B2C registre la intención de compartir un track, playlist o perfil de artista por un canal dado, sin llamada externa real.
- Bloquear a Cliente B2B (`analyst`) de seguir, comentar y compartir — solo lectura, mismo patrón ya aplicado en `biblioteca`.

**Non-Goals:**
- Integración real con APIs de X/WhatsApp — `FACT_COMPARTICION` solo registra que se generó el link/texto de compartir.
- Notificaciones push/email al seguir, comentar o responder.
- Likes/reacciones a comentarios — no forman parte de las 4 tablas confirmadas para esta capability.
- Reportes de usuarios sobre comentarios — la moderación es exclusivamente administrativa y reactiva (el admin revisa, no reacciona a reportes de terceros).
- Límite de profundidad de hilos de comentarios (respuestas a respuestas) — `comentario_padre_id` permite anidar sin restricción; no se valida ni se representa un árbol de profundidad arbitraria en el frontend, solo un nivel visible de "respuesta a".

## Decisions

### Las 4 tablas nuevas viven en ClickHouse, no en PocketBase
Mismo criterio ya aplicado a `DIM_USUARIO`/`FACT_SESION` (`seguridad`) y `DIM_CUENTA_ARTISTA`/`FACT_SUBIDA_TRACK` (`creadores`): son datos operativos con ciclo de vida propio que además interesa poder analizar (cuántos usuarios siguen a un artista, volumen de comentarios por track). No se fragmenta el estado social entre dos bases de datos.

### `BRIDGE_SEGUIMIENTO_ARTISTA`: soft-delete vía `activo`, nunca `DELETE`
Dejar de seguir es `ALTER TABLE BRIDGE_SEGUIMIENTO_ARTISTA UPDATE activo = 0 WHERE usuario_id = ... AND artista_id = ... AND activo = 1` — no se borra la fila. Es el mismo patrón de fricción OLTP-sobre-columnar ya documentado como hallazgo pedagógico deliberado (RT-05) en `seguridad`, no un problema a esconder. Antes de un nuevo `INSERT` al seguir, el endpoint valida en Python (`SELECT 1 ... WHERE usuario_id=... AND artista_id=... AND activo=1 LIMIT 1`) que no exista ya una fila activa para ese par usuario/artista, porque ClickHouse no ofrece una restricción `UNIQUE` real. Alternativa descartada: usar `ReplacingMergeTree` con versión para modelar seguir/dejar de seguir como una sola fila "vigente" (como `DIM_CUENTA_ARTISTA`) — se rechaza porque perdería el historial de cuándo empezó cada período de seguimiento, que sí tiene valor analítico aquí (a diferencia del estado binario de una cuenta de artista).

### `fact_id` de `FACT_COMENTARIO`/`FACT_COMPARTICION`: `UInt64` aleatorio generado en Python, sin lock
A diferencia de la promoción de tracks en `creadores` (que necesita `fact_id` secuencial para reservar un rango que nunca colisione con el pipeline batch de `FACT_TRACKS`), aquí no existe ese requisito: son tablas nuevas sin otro escritor concurrente, y su `ORDER BY` no depende del valor de `fact_id` (es `(fact_id_track, fecha_creacion)` y `(usuario_id, fecha)` respectivamente) — no necesita ser monótono. Se genera con `random.getrandbits(63)` en el momento del insert, sin `SELECT max(fact_id)+1` ni `asyncio.Lock`. Alternativa descartada: reutilizar el patrón `max(fact_id) + 1` bajo lock de `creadores` — se rechaza porque introduciría un cuello de botella de un solo lock de proceso sobre una acción de alta frecuencia (comentar/compartir es mucho más común que la aprobación manual de un track), a cambio de una propiedad (orden secuencial) que ninguna consulta necesita.

### Riesgo aceptado: fact_id generado sin lock

`FACT_COMENTARIO.fact_id` y `FACT_COMPARTICION.fact_id` se generan con
`random.getrandbits(50)` en Python, sin lock ni verificación de unicidad contra
ClickHouse. ClickHouse (MergeTree) no impone UNIQUE constraint: una colisión no
fallaría el insert, produciría dos filas con el mismo fact_id.

Riesgo real: para el volumen de este proyecto (uso académico, cientos-miles de
filas, no millones), la probabilidad de colisión en un espacio de 2^50 (~1.1e15)
es despreciable. Se acepta conscientemente en vez de usar un lock global (que
penalizaría acciones de alta frecuencia como comentar/compartir) o un rango
reservado con SELECT max()+1 (que no aporta valor aquí, a diferencia de
FACT_SUBIDA_TRACK en `creadores`, donde sí hacía falta reservar rango para la
promoción a FACT_TRACKS).

**Corrección aplicada durante el craft de frontend (no en la revisión original
de este spec):** el diseño original especificaba `random.getrandbits(63)`. Al
planear el consumo desde React se detectó que un `UInt64` de 63 bits excede
`Number.MAX_SAFE_INTEGER` (2^53-1) — el valor pierde precisión al pasar por
`JSON.parse` en el cliente, lo que rompería el round-trip de
`comentario_padre_id` (responder a un comentario) y la búsqueda por `fact_id`
al moderar. Se redujo a `random.getrandbits(50)`: sigue siendo un espacio
astronómicamente mayor al volumen esperado de esta capability (misma
tolerancia al riesgo de colisión ya aceptada arriba), pero ahora todo valor
generado cae dentro del rango seguro de un JS `number`. Aplicado en
`api/paquetes/social/router.py::_gen_fact_id` (backend ya verificado con curl
antes de este ajuste — los IDs de prueba usados en la verificación de la
sección 9 de tasks.md son válidos igual, el cambio de rango no invalida esas
pruebas, solo previene el problema en el consumo futuro desde React).

### `FACT_COMENTARIO`: publicación inmediata, moderación reactiva y posterior
Un comentario nace en `estado_moderacion='visible'` sin aprobación previa — patrón opuesto y complementario al de `creadores` (donde el contenido nuevo del catálogo sí requiere aprobación previa antes de ser visible). Aquí la moderación es una acción de `admin` que ocurre *después* de la publicación, sobre contenido ya visible, no una cola de aprobación previa.

### Listado público de comentarios: excluye `eliminado`, conserva `oculto`
`RF-SOC-006` filtra por `estado_moderacion != 'eliminado'`, no por `estado_moderacion = 'visible'`. Esto es intencional, no un descuido: como los comentarios pueden tener respuestas (`comentario_padre_id`), ocultar por completo un comentario padre dejaría a sus respuestas "huérfanas" en la UI (se pierde el contexto de a qué respondían). Un comentario `oculto` se sigue devolviendo en el listado —con su campo `estado_moderacion` expuesto, para que el frontend pueda sustituir su `contenido` por un placeholder tipo "comentario oculto por moderación" en vez de mostrar el texto original— mientras que uno `eliminado` desaparece por completo del listado (incluidas sus respuestas visibles, que quedan igualmente excluidas si su padre está eliminado; ver más abajo). **Punto a confirmar en la revisión de este spec**: si se prefiere que `oculto` también desaparezca del todo (perdiendo el contexto de hilo), es un cambio de una sola cláusula `WHERE` antes de pasar a `tasks`.

### Comentarios cuyo padre está `eliminado` se excluyen también del listado
Para no mostrar una respuesta colgando de un comentario que ya no existe visualmente, el filtro de `RF-SOC-006` excluye tanto los comentarios con `estado_moderacion='eliminado'` como cualquier comentario cuyo `comentario_padre_id` apunte a uno eliminado (join/subconsulta sobre la misma tabla). No se propaga recursivamente más allá de un nivel, consistente con el hilo de un solo nivel ya declarado en Non-Goals.

### `FACT_COMPARTICION`: solo registra intención, sin llamada externa
Mismo nivel de simulación ya aceptado para los pagos en `facturacion`: el endpoint valida el canal (uno de los tres soportados), inserta la fila, y devuelve un texto/link armado en el propio backend (no se llama a ninguna API de X/WhatsApp). La validación de existencia del objeto compartido se ramifica según `tipo_interaccion_id`, porque cada tipo de objeto vive en un lugar distinto (o en ninguno validable):
- `compartir_track` → valida `fact_id_track` contra `FACT_TRACKS` (404 si no existe), mismo patrón que `_assert_fact_exists` en `biblioteca`.
- `compartir_perfil_artista` → valida `artista_id` contra `DIM_ARTISTS` (404 si no existe), mismo patrón que la validación de artista en `BRIDGE_SEGUIMIENTO_ARTISTA` (tarea 3.1 de seguir a un artista).
- `compartir_playlist` → `playlist_id` se acepta sin validación de existencia. Las playlists viven en PocketBase (capability `catalogo`), fuera del dominio de ClickHouse que resuelve `social`; validar contra PocketBase desde este endpoint agregaría una dependencia cruzada de base de datos solo para una acción de simulación (no se llama a ninguna API externa de todos modos), así que se acepta el mismo nivel de confianza en el cliente que ya existe para el resto de la simulación de esta tabla.

`FACT_COMPARTICION` gana dos columnas para soportar esta ramificación sin sobrecargar `fact_id_track`: `artista_id Nullable(UInt32)` y `playlist_id Nullable(String)`. Exactamente una de las tres columnas (`fact_id_track`/`artista_id`/`playlist_id`) está poblada por fila, según `tipo_interaccion_id`; las otras dos quedan `NULL`. No se valida en la base de datos que solo una esté poblada (ClickHouse no tiene `CHECK` constraints) — la invariante se aplica en Python al construir el insert.

### `DIM_TIPO_INTERACCION_SOCIAL`: dimensión compartida entre `FACT_COMENTARIO` y `FACT_COMPARTICION`
Constelación de hechos (fact constellation): una única tabla de dimensión pequeña, sembrada una vez al iniciar (mismo patrón que `DIM_ESTADO_REVISION` en `creadores`), referenciada como FK desde dos FACT distintas de la misma capability. Evita duplicar el catálogo de tipos de interacción en dos tablas separadas.

### Autorización: `require_b2c_user` para escritura, `require_admin` solo para moderación
`RN-SOC-001` (Cliente B2B no puede seguir, comentar ni compartir) se implementa reutilizando `core.deps.require_b2c_user` — la misma dependencia ya usada por los 5 endpoints de `biblioteca` para el requirement equivalente `RN-CAT-004` — en los endpoints de escritura de `social` (`POST /seguimiento`, `DELETE /seguimiento`, `POST /comentarios`, `POST /comparticiones`). No se crea una dependencia nueva. La lectura de comentarios (`RF-SOC-006`) y de la propia lista de seguidos (`RF-SOC-003`) usa `get_current_user` sin restricción de rol — un Cliente B2B puede leer, solo no puede escribir. La moderación (`RF-SOC-007`, `RF-SOC-008`) usa `paquetes.seguridad.deps.require_admin`, igual que en `creadores`/`facturacion`.

### Validación de existencia del objeto de la interacción, mismo patrón que `biblioteca`
Antes de insertar en `BRIDGE_SEGUIMIENTO_ARTISTA` (artista existe en `DIM_ARTISTS`) o en `FACT_COMENTARIO`/`FACT_COMPARTICION` (track existe en `FACT_TRACKS`), el endpoint ejecuta un `SELECT 1 ... LIMIT 1` y devuelve 404 si no existe — mismo patrón ya usado por `_assert_fact_exists`/`FACT_ID_EXISTS` en `api/paquetes/biblioteca/router.py`, reimplementado localmente en `paquetes/social` (no se importa la función privada de otro paquete).

### Auditoría de moderación 100% reutilizada de `seguridad`
`RN-SOC-002`: solo la moderación (`RF-SOC-007`) llama a `paquetes.seguridad.audit.record(usuario_id=admin_id, accion="moderacion_comentario", tabla_afectada="FACT_COMENTARIO", antes={...}, despues={...})`. Seguir/comentar/compartir (acciones propias de un Usuario B2C sobre su propio contenido) no se auditan — mismo criterio ya aplicado en `creadores` y `facturacion`, donde solo las resoluciones administrativas quedan en `FACT_AUDIT_LOG`, no cada acción de un Usuario B2C.

## Risks / Trade-offs

- [Riesgo] La validación de unicidad de `BRIDGE_SEGUIMIENTO_ARTISTA` (una fila activa por par usuario/artista) es un `SELECT` seguido de un `INSERT` en Python, no una restricción atómica de la base de datos — dos requests concurrentes del mismo usuario podrían crear dos filas activas para el mismo artista. → Mitigación: aceptado; mismo riesgo ya asumido explícitamente para la unicidad de `DIM_CUENTA_ARTISTA` en `creadores`, y de volumen de escritura mucho más bajo que el de un `INSERT` por lotes. No se introduce locking adicional por una condición de carrera de baja probabilidad y bajo impacto (like duplicado, no pérdida de datos).
- [Riesgo] `fact_id` aleatorio (`UInt64`, 50 bits) de `FACT_COMENTARIO`/`FACT_COMPARTICION` tiene una probabilidad de colisión no nula. → Ver Decisions, "Riesgo aceptado: fact_id generado sin lock", para el detalle de por qué se acepta sin mitigación adicional.
- [Riesgo] Un comentario `oculto` sigue siendo legible por cualquier consumidor de la API que no respete el campo `estado_moderacion` (la fila completa, incluido su `contenido` original, se devuelve en la respuesta JSON; solo el frontend decide sustituir el texto por un placeholder). → Mitigación: aceptado para este alcance — el frontend propio hace la sustitución; no hay redacción a nivel de API. Si se requiere ocultar el contenido real incluso a nivel de payload, es un cambio de una línea en la query (`if estado_moderacion='oculto' THEN '[comentario oculto]' ELSE contenido`), a decidir en la revisión de este spec junto con el punto anterior sobre listado público.
- [Riesgo] `FACT_COMPARTICION.playlist_id` no tiene una tabla de playlists en ClickHouse contra la cual validar existencia (las playlists viven en PocketBase, capability `catalogo`). → Mitigación: aceptado; se acepta `playlist_id` sin validación de existencia (ver Decisions, "`FACT_COMPARTICION`: solo registra intención, sin llamada externa") — a diferencia de `compartir_track`/`compartir_perfil_artista`, que sí validan contra `FACT_TRACKS`/`DIM_ARTISTS` respectivamente por vivir ambos en ClickHouse.

## Migration Plan

Se agregan las 4 tablas nuevas (`BRIDGE_SEGUIMIENTO_ARTISTA`, `FACT_COMENTARIO`, `FACT_COMPARTICION`, `DIM_TIPO_INTERACCION_SOCIAL`) a `init_clickhouse.py` (idempotente, `CREATE TABLE IF NOT EXISTS`). `DIM_TIPO_INTERACCION_SOCIAL` se siembra una vez (5 filas: `comentario_raiz`, `comentario_respuesta`, `compartir_track`, `compartir_playlist`, `compartir_perfil_artista`) al iniciar, mismo patrón que `DIM_ESTADO_REVISION`. El paquete `api/paquetes/social/` se monta en `main.py`. No hay backfill: no existe historial de seguimientos/comentarios/comparticiones antes de este cambio. Despliegue vía `docker compose up`, sin pasos manuales adicionales.

## Open Questions

- Si se prefiere que un comentario `oculto` desaparezca del todo del listado público (en vez de mostrarse con placeholder) — ver Decisions, "Listado público de comentarios".