# Bitácora S11 · P2 — Descubrimiento y comunidad

Change OpenSpec: **`p2-descubrimiento-comunidad`** (archivable como `2026-07-19-p2-descubrimiento-comunidad`).
Fecha: 2026-07-19.

El sistema tenía un catálogo grande y un modelo de comunidad, pero **no sabía descubrir ni sabía convivir**. Descubrir: la búsqueda obligaba a saber de antemano si se buscaba un track, un artista o un álbum; no existía reproducción generativa pese a que cada track ya trae sus atributos de audio; y `GET /recomendaciones` filtraba por exclusión en vez de recomendar por afinidad, sin poder explicar nunca sus sugerencias. Convivir: no había forma de bloquear a nadie; las denuncias (P1) y la suspensión (P0) eran dos mecanismos sin nada en medio que acumulara reincidencia; cualquiera podía registrarse con un correo inventado y comentar de inmediato; y el ciclo de derechos del usuario tenía baja de cuenta pero no exportación.

Este bloque cierra esos siete huecos sin crear paquetes ni capabilities nuevas y sin ML externo: la similitud se calcula en SQL de ClickHouse sobre los atributos de audio que ya viven en `FACT_TRACKS`. Toda acción administrativa se autoriza con `require_rol_admin` y se audita en `FACT_AUDIT_LOG`. Todo movimiento de datos ocurre desde Python (RT-01).

## 1. Tablas y columnas nuevas

### ClickHouse (`tracklytics`) — en `init_clickhouse.py` (idempotente, `docker compose up` las crea sin pasos manuales)

| Objeto | Cambio |
|---|---|
| `BRIDGE_BLOQUEO_USUARIO` | **Tabla nueva** (ReplacingMergeTree(actualizado_en) ORDER BY (bloqueador_id, bloqueado_id)): bloqueador_id, bloqueado_id, activo, created_at, actualizado_en |
| `FACT_STRIKE_USUARIO` | **Tabla nueva** (ReplacingMergeTree(actualizado_en) ORDER BY strike_id): strike_id, usuario_id, motivo, origen_tipo, origen_id, emitido_por, activo, created_at, actualizado_en |
| `DIM_USUARIO.email_verificado` | `UInt8 DEFAULT 0` — verificación de correo simulada |
| `FACT_TOKEN_RECUPERACION.proposito` | `String DEFAULT 'recuperacion'` — discrimina token de recuperación vs. de verificación |

Total de tablas: **71 → 73**.

**Backfill de `email_verificado`**: las cuentas anteriores a la migración quedan verificadas. El corte es una **fecha fija** (`FECHA_CORTE_VERIFICACION = 2026-07-19 00:00:00`), no `email_verificado = 0` a secas: este bloque corre en cada `docker compose up`, y un filtro por el flag volvería a verificar a cualquiera registrado desde el arranque anterior que aún no hubiera verificado su correo. Acotado por `fecha_registro` el backfill es idempotente y solo alcanza lo que existía cuando se añadió la columna. En esta corrida marcó **91 usuarios previos**.

## 2. Endpoints agregados por capability

- **catalogo** — `GET /search?q=&limit=` (búsqueda unificada; sesión **opcional**). Devuelve `{tracks, artistas, albumes, playlists}`.
- **experiencia** — `GET /radio/track/{fact_id}` (~25 similares), `GET /mix-diario` (~30, `require_b2c_user`). `GET /recomendaciones` conserva su contrato y cambia su motor interno.
- **social** — `POST /bloqueos`, `DELETE /bloqueos/{usuario_id}`, `GET /bloqueos` (`require_b2c_user`). `PUT /admin/denuncias/{id}` acepta ahora `emitir_strike` y `motivo`.
- **seguridad** — `POST /admin/usuarios/{id}/strikes`, `GET /admin/usuarios/{id}/strikes` (`admin_comunidad`); `POST /auth/verificar-email`, `POST /auth/reenviar-verificacion`; `GET /perfil/mis-datos`.

Cambios de contrato **aditivos** (no rompen clientes): `POST /auth/registro` devuelve además `email_verificado` y `token_verificacion`; `GET /perfil` devuelve `email_verificado`; `GET /admin/usuarios/{id}` (vista 360°) devuelve `strikes`; cada track de `GET /recomendaciones` devuelve `motivo`.

## 3. Decisiones de diseño

1. **Métrica de similitud**. Distancia euclídea al cuadrado sobre 5 atributos (`danceability`, `energy`, `valence`, `acousticness` en 0–1, y `tempo` normalizado `/250` porque en BPM dominaría la suma), más una **penalización aditiva de 0.35 por no compartir género**. El género **pesa, no filtra**: un filtro duro encerraría la radio en un solo género, que es justo lo que la haría inútil.

2. **Deduplicación por `(track_name, artist_name)`, no por `track_id`**. Se sigue la convención ya documentada en `experiencia/queries.py`: en el dataset una misma grabación puede tener varios `track_id` (ediciones/compilaciones) además de repetirse una fila por género. Agrupar por `track_id` deduplicaría los géneros pero no las ediciones — es el bug encontrado en verificación visual en S10. Efecto colateral asumido: la penalización de género se agrega con `min()`, así que un track que comparte **alguno** de sus géneros con la semilla no queda penalizado.

3. **Determinismo del mix diario**. La porción de afinidad (~24 tracks) es determinista por construcción, con desempate explícito por `track_name` (sin él, dos tracks equidistantes podrían alternar entre llamadas). La porción de exploración (~6) ordena por `cityHash64(track_name + artist_name + seed)` con `seed = usuario_id + fecha`: pseudoaleatoria pero estable para ese usuario y ese día. El mix cambia al día siguiente porque cambia la fecha, no porque se recalcule nada. No se cachea.

4. **El bloqueo chocó con el modelo social real** y hubo que traducirlo. La formulación pedía impedir que un bloqueado "siga o comente el perfil" de quien lo bloqueó. Contra el código: **no existe el seguimiento usuario-a-usuario** (solo `BRIDGE_SEGUIMIENTO_ARTISTA`) ni **los comentarios de perfil** (todo comentario cuelga de un track). Crear cualquiera de las dos cosas sería una capability nueva, fuera de alcance. El efecto se tradujo a lo que sí existe, conservando la intención de cortar el contacto dirigido:
   - **Lectura**: los comentarios del bloqueado desaparecen para quien lo bloqueó (`COMENTARIOS_VISIBLES_DE_TRACK` y `FEED_ACTIVIDAD_SEGUIDOS`, los dos únicos puntos donde aparece un autor).
   - **Escritura**: el bloqueado no puede **responder a un comentario** de quien lo bloqueó (403) — el análogo directo de dirigirse a alguien en este modelo.
   - **Unidireccional en la lectura**: A deja de ver a B, pero B sigue viendo a A. Ocultarle a B los comentarios de A le revelaría que fue bloqueado, que es justo lo que un bloqueo no debe señalar.

5. **Borrado lógico en bloqueos y strikes**. Se añadieron `activo` y `actualizado_en` a ambas tablas (no estaban en la formulación original): el repo nunca hace DELETE físico, así que `DELETE /bloqueos/{id}` no tendría forma de expresarse, y "3 strikes **activos**" presupone que un strike puede revocarse. Desbloquear/revocar es insertar una fila nueva con `activo = 0`, resuelta con `argMax` — mismo patrón que `BRIDGE_SEGUIMIENTO_ARTISTA`.

6. **Reutilizar `FACT_TOKEN_RECUPERACION` para la verificación de correo** en vez de crear `FACT_TOKEN_VERIFICACION`. El ciclo de vida es idéntico (UUID, expiración, un solo uso marcado por fila nueva + `argMax`); una tabla nueva sería una copia literal del DDL y de la query de vigencia. Se añadió `proposito` con `DEFAULT 'recuperacion'`, que deja las filas de P0 bien clasificadas sin backfill y no está en la ORDER KEY. Las queries de vigencia filtran por propósito, de modo que **un token de verificación no sirve para restablecer una contraseña** (verificado: devuelve 400 "Token inválido").

7. **La regla de verificación es suave y explícita**. Sin verificar se navega el catálogo con total normalidad; solo se frena comentar, subir track y contratar **plan de pago** (el plan free sigue contratable, o la regla sería un muro para entrar al producto). El 403 devuelve un código estable `email_no_verificado` para que el frontend reaccione con el banner en vez de parsear el mensaje. `require_email_verificado` es **fail-open** ante fallo de lectura, mismo criterio que `_rechazar_si_cuenta_inactiva`.

8. **Acoplamiento de la exportación de datos**. `paquetes/seguridad/exportacion.py` tiene sus **propias queries de solo lectura** sobre las tablas de las demás capabilities, en vez de importar sus routers (ciclos de import) o sus constantes de query (acoplaría `seguridad` a los nombres internos de todos los paquetes). El acoplamiento real es **al modelo dimensional de ClickHouse**, el contrato más estable del sistema y ya consultado de forma cruzada (p. ej. `finanzas` sobre queries de `analitica`). Las queries de exportación son además de otra naturaleza — volcado completo, sin paginación ni filtros. Coste asumido y explícito: un cambio de esquema obliga a tocar también este módulo. Playlists y suscripción viven en PocketBase y se inyectan desde el router para que la función siga siendo un volcado síncrono sin I/O de red.

9. **Autenticación opcional en la búsqueda**. Se añadió `get_current_user_optional` en `core/deps.py`: resuelve el usuario si hay token válido y devuelve `None` si no hay token o es inválido, sin lanzar 401. Un token inválido degrada a anónimo (el resultado sigue siendo correcto, solo más pequeño), pero **una cuenta suspendida o dada de baja sigue bloqueada**: solo el 401 degrada, el 403 se propaga.

10. **Disponibilidad en la búsqueda unificada**. `ARTISTS_SEARCH`/`ALBUMS_SEARCH` no filtran nada, así que un artista con todos sus tracks retirados sigue apareciendo en el buscador por entidad. Los tres grupos de `/search` se calculan sobre tracks con `disponible = 1`, de modo que el takedown de P1 se respeta en los cuatro. Los endpoints por entidad se dejaron intactos para no cambiar su contrato: la corrección vive en el endpoint nuevo.

11. **`enqueueMany` / `replaceQueue` en `PlayerContext`**. La cola solo tenía `enqueue` de a uno y la radio produce ~25 tracks. `replaceQueue` es lo que hace que "iniciar radio" **sustituya** la cola en vez de acumularse detrás de lo que hubiera: una radio que se encolara al final no sería una radio.

## 4. Hallazgos durante la implementación

- **`reload_portadas` no es el backfill completo.** El DAG procesa `_BATCH_LIMIT = 50` por corrida (`etl/gold/portada.py:110`) y termina en ~3 minutos; la corrida inicial de esta sesión resolvió solo ~54 portadas. El backfill de las ~90k restantes es `etl/gold/backfill_portadas.py`, un script standalone pensado explícitamente para lanzarse en background y correr varias horas. Es el que quedó corriendo.
- **ClickHouse no acepta identificadores no-ASCII.** Un alias `n_señales` rompía el parser con `Syntax error ... ('\xc3')`. Los alias de SQL van en ASCII.
- **Alias que colisionan con el nombre de columna dentro de un agregado** fallan con `ILLEGAL_AGGREGATION` (`min(fecha_inicio) AS fecha_inicio`): en la exportación de seguimientos el alias pasó a `desde`.
- **`MI_PERFIL` leía `DIM_USUARIO` sin `argMax`** pese a ser ReplacingMergeTree — un perfil recién editado podía devolver la versión anterior. Corregido de paso al añadir `email_verificado`.

## 5. Verificación

**curl real contra la API en Docker** (usuarios `p2_alice@`, `p2_bob@`, `p2_carol@demo.tracklytics.com` y `p2_admin@demo.tracklytics.com`, password `Demo12345!`):

| # | Escenario | Resultado |
|---|---|---|
| 1 | `GET /search?q=love` | 4 grupos con resultados; tras ocultar "Unholy" por takedown desaparece del grupo de tracks y vuelve al restaurar |
| 2 | Radio de un track breakbeat | 25 similares, todos del género de la semilla, ordenados por distancia (0.0148 → …), sin la semilla |
| 3 | Mix diario dos veces el mismo día | Idéntico. 24 de afinidad (breakbeat) + 6 de exploración (psych-rock, j-pop, hardstyle, house, alt-rock, rock) |
| 4 | Recomendaciones | `motivo = "similar a tus favoritos de breakbeat"`; solapamiento con favoritos/historial = **0** |
| 5 | Bloqueo A↔B | A bloquea a B → comentarios de B invisibles para A (1 → 0), B sigue viendo a A (unidireccional); B no puede responder a A (403); auto-bloqueo 422; A desbloquea → comentarios vuelven y B puede responder |
| 6 | Strikes | 2 manuales (activos 1, 2, sin suspensión) + 3.º al resolver una denuncia con `emitir_strike` → `cuenta_suspendida: true` → acceso de B devuelve **403 "Cuenta suspendida"**; historial 3/3 activos con orígenes `denuncia, manual, manual` |
| 7 | Verificación de correo | Registro → `email_verificado: false` + token → comentar da **403 `email_no_verificado`** → verificar → comentar **ok**. El token de verificación en `/auth/restablecer` da 400 |
| 8 | `GET /perfil/mis-datos` | 11 secciones; pobladas las que el usuario tiene (3 favoritos, 6 reproducciones, 1 comentario, 1 denuncia) |

**Navegador real (Playwright, Chromium 1400×950, contra el frontend compilado en `:8082`)** — 7/7 y **cero errores de consola**:

1. Barra de búsqueda global visible en el header.
2. Tarjeta "Tu mix diario" en el home.
3. `/buscar?q=love` con secciones Mejor resultado, Canciones, Artistas, Álbumes.
4. "Iniciar radio" → toast `Radio de "Unholy (feat. Kim Petras)" · 25 canciones` y cola poblada.
5. Motivo visible en recomendaciones: "Similar a tus favoritos de breakbeat".
6. "Descargar mis datos" → descarga `tracklytics-mis-datos-2026-07-19.json`.
7. Banner "Verifica tu correo" en una cuenta recién registrada.

`npm run build` en verde. Bundle principal **511.6 kB → 526.7 kB** (+15 kB medidos contra la línea base con el árbol de trabajo guardado); el aviso de >500 kB es preexistente.

## 6. Archivos de frontend

**Nuevos**: `catalogo/components/GlobalSearch.tsx(.module.css)`, `catalogo/components/MixDiarioCard.tsx(.module.css)`, `catalogo/pages/SearchResultsPage.tsx(.module.css)`, `catalogo/hooks/useRadio.ts`, `social/components/BloquearButton.tsx`, `seguridad/components/VerificacionEmailBanner.tsx(.module.css)`.

**Modificados**: `app/layout/AppShell.tsx(.module.css)` (búsqueda en el header — el wordmark deja de crecer y cede el espacio libre — y banner de verificación), `app/router.tsx` (ruta `/buscar`), `catalogo/components/TrackCard.tsx` (botón de radio), `catalogo/pages/CatalogPage.tsx` (tarjeta de mix), `experiencia/pages/RecomendacionesPage.tsx` (prefiere el `motivo` del backend), `seguridad/pages/ProfilePage.tsx` (usuarios bloqueados + descargar datos), `seguridad/pages/UsuariosAdminPage.tsx` (sección de strikes), `social/pages/TrackSocialPage.tsx` (botón de bloqueo), `social/pages/ModeracionSocialPage.tsx(SocialPages.module.css)` (checkbox de strike al resolver), `shared/context/PlayerContext.tsx` (`enqueueMany`/`replaceQueue`), más los `api/` y `types.ts` de catalogo, experiencia, social y seguridad.

## 7. Avance de portadas

Backfill de portadas por canción corriendo en background durante toda la sesión (`etl/gold/backfill_portadas.py`, reanudable, secuencial por el rate limit de Spotify).

| Momento | Filas `source_type='real'` con `imagen_url` |
|---|---|
| Inicio de sesión | 10 906 |
| Cierre de sesión | **20 322** |
| Resueltas en la sesión | **+9 416** |
| Pendientes al cierre | 93 228 |

Los conteos son de **filas** de `FACT_TRACKS`, no de tracks distintos (un track ocupa una fila por género). El backfill sigue siendo reanudable: cada corrida salta lo ya resuelto.
