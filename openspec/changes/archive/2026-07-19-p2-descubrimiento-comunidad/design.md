## Contexto

Siete huecos de descubrimiento y comunidad, todos sobre paquetes existentes. Este documento registra las decisiones de diseño y, sobre todo, los **puntos donde el modelo de datos real obligó a apartarse de la formulación inicial**.

## Decisión 1 — Métrica de similitud de audio

Distancia euclídea al cuadrado sobre cinco atributos ya presentes en `FACT_TRACKS`, calculada íntegramente en SQL de ClickHouse (sin ML externo):

```
pow(ft.danceability - {d:Float64}, 2)
+ pow(ft.energy       - {e:Float64}, 2)
+ pow(ft.valence      - {v:Float64}, 2)
+ pow(ft.acousticness - {a:Float64}, 2)
+ pow((ft.tempo - {t:Float64}) / 250.0, 2)
+ if(ft.genre_id = {genre_id:UInt16}, 0.0, 0.35)
```

- `danceability`, `energy`, `valence` y `acousticness` ya viven en el rango 0–1, así que contribuyen de forma comparable sin normalizar.
- `tempo` está en BPM (rango real ~50–250), por lo que se divide entre 250 antes de elevar al cuadrado. Sin esa normalización, el tempo dominaría por completo la distancia.
- **El género pesa como penalización aditiva, no como filtro duro**: un track de otro género puede entrar en la cola si es muy cercano en audio, pero parte con una desventaja (0.35) mayor que la distancia típica entre tracks del mismo género. Esto cumple "el mismo género con mayor peso" sin encerrar la radio en un solo género, que es justamente lo que la haría inútil.

### Consecuencia del modelo de género: deduplicación obligatoria

Un track existe en `FACT_TRACKS` como **N filas, una por género** (`genre_id` forma parte de la ORDER KEY). Sin agrupar, la radio devolvería el mismo track repetido tantas veces como géneros tenga.

La deduplicación sigue la convención ya establecida en `experiencia/queries.py`: **`GROUP BY ft.track_name, a.name`** con `min(ft.fact_id)` como `fact_id` canónico, y **no** `GROUP BY track_id`. El motivo está documentado en el propio archivo y es más fuerte de lo que parece: en el dataset, una misma grabación puede tener **varios `track_id` distintos** (ediciones y compilaciones diferentes), así que agrupar por `track_id` deduplica los géneros pero **no** las ediciones — es el bug que se encontró en verificación visual en S10. Agrupar por nombre+artista cubre los dos casos.

Como efecto colateral, la penalización de género no puede evaluarse fila a fila dentro del grupo: se aplica sobre `min(ft.genre_id = semilla ? 0 : 0.35)` agregado, es decir, un track que comparte **alguno** de sus géneros con la semilla no recibe penalización.

## Decisión 2 — Determinismo del mix diario

Semilla `hash(usuario_id + fecha)` implementada como `cityHash64(concat({usuario_id:String}, {fecha:String}))` en ClickHouse.

- La **porción de afinidad** (~80 %, 24 tracks) es determinista por construcción: ordenar por distancia ascendente sobre datos que no cambian dentro del día produce siempre el mismo resultado. El desempate se fija con `ORDER BY distancia ASC, ft.track_id ASC` — sin ese segundo criterio, dos tracks equidistantes podrían alternar entre llamadas.
- La **porción de exploración** (~20 %, 6 tracks) toma tracks fuera de los géneros habituales del usuario ordenados por `cityHash64(concat(toString(ft.track_id), {seed:String}))`, lo que da una selección pseudoaleatoria pero estable para ese usuario y ese día.

El mix cambia al día siguiente porque cambia la fecha de la semilla, no porque se recalcule nada.

## Decisión 3 — `motivo` en recomendaciones sin romper el contrato

`GET /recomendaciones` devuelve `{"secciones": [{"id", "titulo", "data": [...]}]}` y cada track lleva ya dos campos añadidos en Python (`impresion_id`, `algoritmo`) sobre las 6 columnas SQL. `motivo` se añade por el mismo mecanismo, en `_registrar_impresiones`. Añadir una clave a un objeto JSON es compatible hacia atrás: el frontend actual la ignora hasta que se actualice.

El texto del motivo se deriva del algoritmo que produjo la fila, no se inventa por track: `"similar a tus favoritos de <género>"`, `"porque sigues a <artista>"`, `"lo escuchaste hace tiempo"`, `"popular ahora mismo"`.

## Decisión 4 — El bloqueo choca con el modelo social real

La formulación pedía que "un usuario bloqueado no pueda **seguir** ni comentar el perfil de quien lo bloqueó". Contra el código:

1. **No existe el seguimiento usuario-a-usuario.** Solo hay `BRIDGE_SEGUIMIENTO_ARTISTA` (seguir artistas), y así está documentado en `social/queries.py`. No hay nada que impedir, y crear el seguimiento entre usuarios sería una capability nueva, fuera del alcance de este cambio.
2. **No existen los comentarios de perfil.** Los comentarios (`FACT_COMENTARIO`) siempre cuelgan de un track (`fact_id_track`), opcionalmente anidados en otro comentario. No hay un muro de perfil que comentar.

El efecto del bloqueo se traduce entonces a lo que sí existe en el modelo, conservando la intención (cortar el contacto dirigido):

- **Lectura**: los comentarios de un usuario bloqueado desaparecen para quien lo bloqueó, filtrando en `COMENTARIOS_VISIBLES_DE_TRACK` y en `FEED_ACTIVIDAD_SEGUIDOS` (los dos únicos puntos de lectura donde aparece un autor).
- **Escritura**: un usuario bloqueado no puede **responder a un comentario** de quien lo bloqueó (`POST /comentarios` con `comentario_padre_id` cuyo autor lo tiene bloqueado → 403). Esta es la forma real de "dirigirse a alguien" en el modelo, y es el análogo directo de comentar su perfil.

El bloqueo es **unidireccional en la lectura**: A deja de ver a B, pero B sigue viendo a A. Ocultarle a B los comentarios de A le revelaría que fue bloqueado, que es justo lo que un bloqueo debe evitar señalar.

## Decisión 5 — Borrado lógico en bloqueos y strikes

La formulación listaba `BRIDGE_BLOQUEO_USUARIO (bloqueador_id, bloqueado_id, created_at)`. Con solo esas columnas, `DELETE /bloqueos/{usuario_id}` no tendría forma de expresarse: el repo **nunca hace DELETE físico** (RT-01 y el patrón de todo el modelo). Se añaden por tanto `activo UInt8 DEFAULT 1` y `actualizado_en DateTime DEFAULT now()`, y el desbloqueo inserta una fila nueva con `activo = 0`, resuelta con `argMax` — exactamente el patrón de `BRIDGE_SEGUIMIENTO_ARTISTA`.

Por la misma razón `FACT_STRIKE_USUARIO` gana `activo` y `actualizado_en`: la regla de negocio habla de "3 strikes **activos**", lo que presupone que un strike puede revocarse.

## Decisión 6 — Reutilizar `FACT_TOKEN_RECUPERACION` para la verificación de email

La tabla de P0 tiene `token, usuario_id, expira_en, usado, created_at` y **ninguna columna de propósito**, por lo que tal cual no distingue un token de recuperación de uno de verificación. Dos opciones: tabla nueva `FACT_TOKEN_VERIFICACION`, o una columna discriminadora.

Se elige **`ALTER TABLE FACT_TOKEN_RECUPERACION ADD COLUMN IF NOT EXISTS proposito String DEFAULT 'recuperacion'`**:

- El ciclo de vida es idéntico (token UUID, expiración, un solo uso, marcado por inserción de fila nueva con `usado=1` + `argMax`). Una tabla nueva sería una copia literal del DDL y de la query de vigencia.
- El `DEFAULT 'recuperacion'` deja las filas existentes correctamente clasificadas sin backfill.
- `proposito` no está en la ORDER KEY (`(token, created_at)`), así que la columna es añadible sin reescribir la tabla.

Las queries de vigencia pasan a filtrar por `proposito`, de modo que un token de verificación no puede usarse para restablecer una contraseña ni al revés.

## Decisión 7 — Los usuarios existentes nacen verificados

`email_verificado UInt8 DEFAULT 0` bloquearía de golpe a **todas las cuentas ya registradas** (incluidas las de demo y las de prueba por tier), que no podrían comentar ni suscribirse. El `ALTER` se acompaña por eso de un backfill único que marca `email_verificado = 1` para los usuarios con `fecha_registro` anterior a la migración. La regla solo aplica a registros nuevos, que es su intención.

La regla es **suave y explícita**: un usuario no verificado navega el catálogo con normalidad y solo recibe 403 (con mensaje accionable, no genérico) al comentar, subir un track o contratar un plan pago.

## Decisión 8 — Acoplamiento de la exportación de datos personales

`GET /perfil/mis-datos` necesita datos de siete capabilities. Tres formas de resolverlo:

1. Llamar a los routers de cada paquete → obliga a fabricar `Request` y dependencias, y crea ciclos de import.
2. Importar las constantes de query de cada paquete (`from paquetes.social.queries import ...`) → acopla `seguridad` a los nombres internos de todos los demás.
3. **Un módulo propio `paquetes/seguridad/exportacion.py` con sus propias queries de solo lectura sobre las tablas.**

Se elige la 3. El acoplamiento real es **a las tablas de ClickHouse, no al código de los paquetes**, que es el contrato más estable del sistema (el modelo dimensional es la fuente de verdad compartida y ya lo consultan varios paquetes de forma cruzada, p. ej. `finanzas` sobre las queries de `analitica`). Las queries de exportación son además distintas de las de producto: sin paginación, sin filtros y orientadas al volcado completo, así que reutilizarlas tampoco ahorraría gran cosa. El coste asumido es que un cambio de esquema obliga a tocar también este módulo.

## Decisión 9 — Autenticación opcional en la búsqueda unificada

`GET /search` debe incluir las playlists públicas **y** las privadas del usuario autenticado, pero el resto de la búsqueda es pública y no puede exigir sesión. El repo no tiene hoy un dep de sesión opcional, así que se añade `get_current_user_optional` en `core/deps.py`: resuelve el usuario si llega un token válido y devuelve `None` si no llega token o si es inválido, sin lanzar 401.

Las playlists viven en **PocketBase**, no en ClickHouse (`BRIDGE_TRACK_PLAYLIST_USUARIO` es solo un espejo analítico batch). La búsqueda de playlists usa por tanto `pb_playlists`, igual que ya hace `social/router.py` con `listar_publicas`.

## Decisión 10 — Disponibilidad en la búsqueda unificada

`tracks_search_sql` ya filtra `disponible = 1`, pero `ARTISTS_SEARCH` y `ALBUMS_SEARCH` **no filtran nada**: un artista cuyos tracks fueron todos retirados por takedown sigue apareciendo. `GET /search` calcula sus grupos de artistas y álbumes sobre tracks disponibles, de modo que el takedown de P1 se respeta en los cuatro grupos. Los endpoints por entidad existentes se dejan como están para no cambiar su contrato; la corrección vive en el endpoint nuevo.
