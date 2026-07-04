## Context

`experiencia` es la sexta y última capability operativa nueva del proyecto. Las cinco
anteriores (`seguridad`, `facturacion`, `creadores`, `social`, `distribucion`) ya están
implementadas y archivadas; sus patrones de autorización, generación de identificadores y
ubicación de datos (PocketBase vs. ClickHouse) son precedente directo para esta capability, no
un punto de partida a redefinir.

Estado actual relevante:
- El historial de reproducción ya escribe un evento ligero en `FACT_ENGAGEMENT_USUARIO`
  (`event_type='reproduccion'`) desde el endpoint de reproducción de `biblioteca`. Esa tabla
  sigue siendo la fuente del score de engagement en `analitica` — no se toca ni se reemplaza.
- Las playlists del usuario viven enteramente en PocketBase (colecciones `playlists`,
  `playlist_tracks`), proxied por `api/paquetes/biblioteca/` — nunca hubo reflejo en
  ClickHouse.
- El reproductor persistente (`PlayerContext`/`PlayerBar`, frontend React) ya existe y ya
  gestiona track activo, cola y posición — pero la posición avanza por temporizador simulado,
  sin fuente de audio real.
- Las tarjetas de track en el catálogo ya reservan el espacio visual para portada, pero
  renderizan un bloque vacío estilizado — no hay ninguna imagen real ni un reemplazo visual
  generado.
- Los tres roles del sistema (`user`, `analyst`, `admin`) y sus dependencias de autorización
  (`get_current_user`, `require_b2c_user`, `require_admin`) ya están resueltos en `seguridad` y
  `core.deps` — esta capability los consume, no los redefine.

## Goals / Non-Goals

**Goals:**
- Capturar telemetría de consumo enriquecida (reproducción, recomendaciones) sin duplicar ni
  romper el score de engagement que `analitica` ya calcula sobre `FACT_ENGAGEMENT_USUARIO`.
- Dar a Usuario B2C un canal de soporte, y a Lead Data Engineer/CTO la capacidad de
  gestionarlo.
- Reflejar playlists de usuario en ClickHouse para análisis táctico, sin convertir a
  ClickHouse en la fuente de verdad de esa entidad — PocketBase sigue siéndolo.
- Permitir que varios usuarios compartan una suscripción bajo un titular, con un límite fijo
  simple, sin introducir un plan nuevo ni tocar el modelo de precios existente.
- Completar las dos piezas de experiencia visual/auditiva que quedaron diferidas
  explícitamente en `catalogo` (portada real, reproducción real), con fallback obligatorio en
  ambas — nunca una dependencia dura de un servicio externo.

**Non-Goals:**
- Motor de recomendación con machine learning — el algoritmo es una regla simple documentada
  como tal (ej. mismo género que los favoritos del usuario), no un sistema de ML real.
- Cobro diferenciado por miembro de un plan familiar — esta capability modela solo la relación
  titular/miembros; el cobro sigue siendo el de la suscripción del titular, sin cambios en
  `facturacion`.
- Streaming de archivos de audio propios — la reproducción real depende de un directorio de
  video externo (búsqueda por texto), no de audio alojado por Tracklytics.
- Cualquier cambio al modelo de planes de `suscripciones` (ya cerrada y verificada) — el límite
  de miembros del plan familiar es una regla propia de `experiencia`, aplicable sobre cualquier
  plan pago existente, no un plan ni un campo nuevo en `suscripciones`.

## Decisions

### Ubicación de cada entidad nueva (PocketBase vs. ClickHouse)

| Entidad | Vive en | Por qué |
|---|---|---|
| `FACT_REPRODUCCION_EVENTO` | ClickHouse | Evento analítico de alto volumen, append-only, agregable por track/fecha — encaja de forma natural en un motor columnar, sin tensión pedagógica (a diferencia de `seguridad`/`facturacion`). |
| `FACT_IMPRESION_RECOMENDACION` | ClickHouse | Mismo perfil que el anterior: evento append-only de alto volumen. |
| `FACT_TICKET_SOPORTE` | ClickHouse, a propósito | Es un dato de forma transaccional (crear, actualizar estado) — misma decisión pedagógica deliberada que ya se documentó para `seguridad`/`facturacion` (forzar un dominio OLTP dentro de un motor columnar para que el proyecto encuentre y documente esa fricción como parte del aprendizaje). No es un error de arquitectura, es consistente con el precedente ya establecido. |
| `FACT_AB_TEST_EXPOSICION` | ClickHouse | Evento append-only, mismo perfil que reproducción/recomendación. |
| `BRIDGE_TRACK_PLAYLIST_USUARIO` | ClickHouse (reflejo); **la fuente de verdad sigue siendo PocketBase** | La entidad operativa (crear/editar playlist, agregar/quitar tracks) sigue viviendo 100% en PocketBase, sin cambios — este bridge es un reflejo de solo lectura para análisis táctico (ej. "tracks más agregados a playlists"), poblado por un job batch, nunca escrito directamente por el usuario. |
| `FACT_TICKET_SOPORTE` (repetido arriba) | — | — |
| `BRIDGE_SUSCRIPTOR_FAMILIA` | ClickHouse, a propósito | Igual que `FACT_TICKET_SOPORTE`: es una relación transaccional (agregar/quitar miembro), pero se fuerza en ClickHouse siguiendo el mismo precedente pedagógico ya establecido para `seguridad`/`facturacion`. |
| `DIM_ARTISTS.imagen_url` / `DIM_ALBUMS.imagen_url` | ClickHouse (columnas nuevas en dimensiones existentes) | Extiende el modelo dimensional ya existente; se puebla vía ETL, no vía escritura del frontend. |

### `BRIDGE_TRACK_PLAYLIST_USUARIO` — frecuencia de sincronización

**Decisión:** sincronización batch como parte de la corrida semanal de ingesta ya existente
(mismo `week_number`/`ETL_BATCH_CONTROL` que ya orquesta la carga del catálogo), más un
endpoint on-demand (`POST`, admin-only) para forzar una resincronización sin esperar a la
próxima corrida semanal.

**Por qué:** la cadencia semanal ya es el ritmo establecido de todo el pipeline de ingesta
(`week_number`, `ETL_BATCH_CONTROL`, `EtlPage` en el frontend admin) — atarse a ese mismo
ritmo evita introducir un segundo scheduler o una tarea cron independiente solo para esta
tabla. El endpoint on-demand cubre el caso real de que un admin quiera ver el reflejo
actualizado antes de la próxima semana (ej. para depurar o demostrar la funcionalidad), sin
que la sincronización automática dependa de que alguien lo dispare manualmente.

**Alternativa considerada:** sincronización en tiempo real (webhook de PocketBase o polling
frecuente). Descartada — el propósito declarado de esta tabla es análisis táctico
("tracks más agregados a playlists"), no un reflejo en vivo; introducir tiempo real aquí
agregaría complejidad (manejo de eventos, posible duplicación) sin un caso de uso que lo
justifique en el alcance definido.

### `BRIDGE_SUSCRIPTOR_FAMILIA` — límite de miembros

**Decisión:** hasta 5 miembros por suscripción, incluido el titular. Regla fija de
`experiencia`, aplicable sobre cualquier plan pago existente (no introduce un plan "familiar"
nuevo en `suscripciones`, que ya está cerrada y verificada).

**Por qué:** no existe hoy ningún campo de límite en el modelo de planes real
(`api/paquetes/suscripciones/planes.py`, 5 planes estáticos sin tier familiar) — inventar un
límite ahí habría significado reabrir y modificar una capability ya cerrada por una regla que
pertenece conceptualmente a `experiencia`. Un límite fijo, simple y documentado en esta
capability logra el mismo resultado funcional sin ese costo. 5 es un número consistente con
el tamaño típico de planes familiares reales (Spotify/Apple Music: 6 personas incluido el
titular) sin necesitar justificación adicional de negocio.

### `BRIDGE_SUSCRIPTOR_FAMILIA` — elegibilidad de plan

**Decisión:** `BRIDGE_SUSCRIPTOR_FAMILIA` aplica únicamente cuando `suscripcion_id`
corresponde a un plan `premium` (B2C). No aplica a planes B2B (`basico`/`pro`/`enterprise`)
— un analista/empresa no tiene el caso de uso de "miembros de familia". Dado que no existe
`DIM_PLAN_SUSCRIPCION` ni columna de tipo de plan en ClickHouse hoy, la validación de que
`suscripcion_id` sea `premium` debe hacerse en Python contra la fuente de verdad real (la
suscripción activa vive en PocketBase, colección gestionada por
`api/paquetes/suscripciones/pb_client.py`, con su `tipo_plan` cruzado contra `PLANES` en
`api/paquetes/suscripciones/planes.py`), no asumida ni validada a nivel de ClickHouse.

**Por qué:** sin esta restricción, `POST /app/v1/experiencia/familia/titular` aceptaría
cualquier `suscripcion_id` activa, incluidas suscripciones B2B — un caso sin sentido de
producto (un titular "empresa" con "miembros de familia") y sin caso de uso declarado en
`proposal.md`. Restringir a `premium` mantiene la funcionalidad acotada al único plan pago
B2C que existe hoy, consistente con el precedente de otras capabilities de no inventar
comportamiento no pedido.

### Reproducción rica vs. historial existente

**Decisión:** `FACT_REPRODUCCION_EVENTO` es una tabla nueva, no una migración de
`FACT_ENGAGEMENT_USUARIO`. El endpoint de reproducción ya existente en `biblioteca` gana un
segundo insert síncrono (a la tabla nueva), además del que ya hace hoy.

**Por qué:** `FACT_ENGAGEMENT_USUARIO` alimenta el score de engagement que `analitica` ya
expone y que otras capabilities ya consumen (ver `ENGAGEMENT_BY_FACT`/`ENGAGEMENT_BY_ARTIST`
en `api/paquetes/analitica/queries.py`) — migrar su forma rompería ese contrato sin necesidad.
Mantener ambas tablas separadas, cada una con un propósito claro (agregación de engagement vs.
evento crudo enriquecido), es más simple y más seguro que fusionarlas.

### Generación de identificadores

**Decisión:** `fact_id` de las 4 tablas FACT nuevas se genera con `random.getrandbits(50)` en
Python antes del insert, mismo patrón ya corregido en `social` — no se reintroduce un
generador de IDs distinto.

### Portada real (RF-EXP-009) y reproducción real (RF-EXP-010)

Ambas ya fueron diseñadas en una decisión previa del proyecto (fallback obligatorio, nunca
dependencia dura de un servicio externo) — este documento no las rediseña, las hereda:
- Portada: ETL busca en un directorio musical externo público (sin necesidad de credencial)
  solo para tracks del catálogo licenciado base, guarda la URL resuelta en
  `DIM_ARTISTS.imagen_url`/`DIM_ALBUMS.imagen_url`. Si no hay resultado, o el track no
  pertenece al catálogo base, el frontend usa un reemplazo visual local generado con los
  tokens de diseño ya establecidos — cero llamada externa en ese camino.
- Reproducción: se agrega una fuente de audio real al reproductor persistente ya existente,
  por búsqueda de texto desde el propio cliente. Si no hay conexión o no hay resultado, el
  control de reproducción de ese track queda deshabilitado o en estado "no disponible" — el
  resto de la aplicación sigue funcionando igual.

> **Addendum histórico (2026-07-04), decisión posterior del usuario — no de este documento
> original:** el punto de reproducción ("no disponible" cuando falla YouTube) fue reemplazado.
> Ver `openspec/specs/experiencia/spec.md`, sección "Reproducción de audio real", para el
> comportamiento vigente (reproducción simulada con Web Audio API en vez de deshabilitar el
> control). El punto de portada también se amplió: ahora es iTunes + Deezer como segundo
> intento, no solo iTunes — mismo documento de spec. Este `design.md` queda sin modificar en lo
> demás porque es un artefacto archivado de la capability ya cerrada; este addendum es solo para
> que quien lo lea después no asuma que el diseño original sigue vigente en ambos puntos.

## Risks / Trade-offs

- **[Riesgo] El reflejo de playlists puede quedar desactualizado hasta la próxima corrida
  semanal.** → Mitigación: el endpoint on-demand de resincronización cubre el caso en que se
  necesite el dato actualizado antes; el propósito declarado de la tabla es análisis táctico,
  no operación en tiempo real, así que un desfase de días es aceptable por diseño.
- **[Riesgo] Condición de carrera al agregar miembros a un plan familiar cerca del límite.** →
  Mitigación: se verifica el conteo actual antes de insertar, aceptando una ventana de carrera
  de bajo riesgo dado el volumen esperado (altas de miembros no son una operación de alta
  concurrencia) — no se introduce un lock distribuido para un caso de uso académico de este
  tamaño.
- **[Riesgo] Dependencia de un servicio externo para portadas y reproducción.** → Mitigación:
  ambas rutas tienen fallback obligatorio ya definido (ver arriba); ninguna funcionalidad
  existente deja de funcionar si el servicio externo no responde.
- **[Riesgo] Confusión entre `FACT_ENGAGEMENT_USUARIO` (existente) y `FACT_REPRODUCCION_EVENTO`
  (nueva) por tener un propósito superficialmente similar.** → Mitigación: se documenta
  explícitamente en spec.md que una es la agregación de engagement (no se toca) y la otra es
  el evento crudo enriquecido (nueva) — no son intercambiables ni se fusionan.

## Migration Plan

- Las 6 tablas nuevas y las 2 columnas nuevas en `DIM_ARTISTS`/`DIM_ALBUMS` son aditivas — no
  hay `ALTER ... DROP` ni migración de datos existentes, a diferencia del cambio breaking que
  sí tuvo `distribucion`.
- Orden de despliegue: tablas ClickHouse primero (DDL), luego el paquete FastAPI
  (`api/paquetes/experiencia/`), luego el job de sincronización de playlists y la extensión
  del ETL de portadas, y por último el frontend (React) — mismo orden que las capabilities
  anteriores (`opsx:apply` → verificar con curl real → construir UI).
- Sin plan de rollback especial más allá de lo ya establecido para el resto del proyecto: las
  tablas nuevas no tienen dependientes fuera de esta capability, así que un rollback se reduce
  a dejar de escribir en ellas y, si hace falta, un `DROP TABLE`.

## Open Questions

- Ninguna bloqueante para `tasks.md`. El límite de 5 miembros y la cadencia semanal de
  sincronización de playlists son decisiones ya tomadas arriba, no preguntas abiertas.
