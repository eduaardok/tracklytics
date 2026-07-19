## 1. Datos (ClickHouse `tracklytics`)

- [x] 1.1 `CREATE TABLE IF NOT EXISTS BRIDGE_BLOQUEO_USUARIO` (ReplacingMergeTree(actualizado_en) ORDER BY (bloqueador_id, bloqueado_id)) con bloqueador_id, bloqueado_id, activo, created_at, actualizado_en
- [x] 1.2 `CREATE TABLE IF NOT EXISTS FACT_STRIKE_USUARIO` (ReplacingMergeTree(actualizado_en) ORDER BY strike_id) con strike_id, usuario_id, motivo, origen_tipo, origen_id, emitido_por, activo, created_at, actualizado_en
- [x] 1.3 `ALTER TABLE DIM_USUARIO ADD COLUMN IF NOT EXISTS email_verificado UInt8 DEFAULT 0`
- [x] 1.4 `ALTER TABLE FACT_TOKEN_RECUPERACION ADD COLUMN IF NOT EXISTS proposito String DEFAULT 'recuperacion'`
- [x] 1.5 Backfill idempotente: usuarios existentes en el momento de la migración quedan `email_verificado = 1` (design.md decisión 7)
- [x] 1.6 `docker compose up` deja todo creado y backfilleado sin pasos manuales

## 2. Búsqueda unificada (`catalogo`)

- [x] 2.1 `core/deps.py`: `get_current_user_optional` — resuelve usuario si hay token válido, `None` si no hay token o es inválido, sin lanzar 401
- [x] 2.2 `catalogo/queries.py`: `SEARCH_TRACKS_GRUPO`, `SEARCH_ARTISTAS_GRUPO`, `SEARCH_ALBUMES_GRUPO` — los tres sobre tracks con `disponible = 1`, con dedup por `track_id`/entidad
- [x] 2.3 `GET /search?q=&limit=` — devuelve `{tracks, artistas, albumes, playlists}`, `limit` default 5
- [x] 2.4 Grupo de playlists vía `pb_playlists`: públicas + propias del usuario autenticado (si lo hay)
- [x] 2.5 No romper `/tracks/search`, `/artists/search`, `/albums/search` existentes

## 3. Motor de similitud de audio (`experiencia`)

- [x] 3.1 `experiencia/queries.py`: fragmento de distancia reutilizable (5 atributos + penalización de género 0.35, tempo normalizado /250) según design.md decisión 1
- [x] 3.2 Dedup obligatorio por `track_id` (un track = N filas, una por género) con desempate estable por `track_id`
- [x] 3.3 Query de perfil de audio del usuario a partir de favoritos + historial (`FACT_ENGAGEMENT_USUARIO`, patrón `argMax` + `HAVING last_event = 'favorito_add'`)

## 4. Radio por track (`experiencia`)

- [x] 4.1 `GET /radio/track/{fact_id}` — cola de ~25 tracks similares a la semilla
- [x] 4.2 Excluye la semilla y los tracks con `disponible = 0`; 404 si la semilla no existe o no está disponible
- [x] 4.3 Predomina el género de la semilla sin ser un filtro duro

## 5. Mix diario (`experiencia`)

- [x] 5.1 `GET /mix-diario` — `require_b2c_user`, ~30 tracks
- [x] 5.2 ~80 % afinidad (perfil de audio + géneros habituales) y ~20 % exploración fuera de sus géneros
- [x] 5.3 Determinismo por `cityHash64(usuario_id + fecha)` y desempate por `track_id`; estable el mismo día, distinto al siguiente
- [x] 5.4 Sin historial ni favoritos: degradar a populares

## 6. Recomendaciones por similitud (`experiencia`)

- [x] 6.1 Reemplazar la lógica interna de `GET /recomendaciones` por afinidad al perfil de audio del usuario
- [x] 6.2 Excluir lo ya escuchado y lo ya marcado como favorito; solo tracks `disponible = 1`
- [x] 6.3 Añadir `motivo` por track en `_registrar_impresiones`, derivado del algoritmo de la sección
- [x] 6.4 Conservar el contrato `{"secciones": [{"id","titulo","data"}]}` y el registro de impresiones existente
- [x] 6.5 Sin historial ni favoritos: degradar a populares de géneros diversos

## 7. Bloqueo usuario-a-usuario (`social`)

- [x] 7.1 `POST /bloqueos` (body `usuario_id`) — `require_b2c_user`, 422 si es auto-bloqueo, 404 si el usuario no existe
- [x] 7.2 `DELETE /bloqueos/{usuario_id}` — borrado lógico (`activo = 0`)
- [x] 7.3 `GET /bloqueos` — mis bloqueados
- [x] 7.4 Filtrar autores bloqueados en `COMENTARIOS_VISIBLES_DE_TRACK`
- [x] 7.5 Filtrar autores bloqueados en `FEED_ACTIVIDAD_SEGUIDOS`
- [x] 7.6 `POST /comentarios`: 403 si se responde a un comentario cuyo autor bloqueó al solicitante
- [x] 7.7 El bloqueo es unidireccional en la lectura (design.md decisión 4)

## 8. Strikes y sanciones (`seguridad` + `social`)

- [x] 8.1 `POST /admin/usuarios/{usuario_id}/strikes` — `require_rol_admin("admin_comunidad")`, body con motivo; auditado
- [x] 8.2 `GET /admin/usuarios/{usuario_id}/strikes` — historial del usuario
- [x] 8.3 Función compartida de emisión de strike + evaluación de la regla de 3 strikes activos
- [x] 8.4 Al tercer strike activo: `estado_cuenta = 'suspendido'` reutilizando el mecanismo de P0, auditado como suspensión automática
- [x] 8.5 `PUT /admin/denuncias/{id}` acepta `emitir_strike` y `motivo`; resuelve el autor del contenido (comentario o track)
- [x] 8.6 Si el autor no es resoluble (track del dataset original), resolver la denuncia e informar que no se emitió strike
- [x] 8.7 Integrar los strikes en la vista 360° existente de `GET /admin/usuarios/{usuario_id}`

## 9. Verificación de email simulada (`seguridad`)

- [x] 9.1 Registro: crear el usuario con `email_verificado = 0` y generar token con `proposito = 'verificacion'`
- [x] 9.2 Las queries de vigencia de token filtran por `proposito` (un token no sirve para el otro propósito)
- [x] 9.3 `POST /auth/verificar-email` — recibe token, marca `email_verificado = 1`; 400 si inválido/caducado/usado
- [x] 9.4 `POST /auth/reenviar-verificacion` — regenera token invalidando el anterior
- [x] 9.5 `deps.py`: `require_email_verificado` — 403 con mensaje accionable
- [x] 9.6 Aplicar la restricción en comentar (`social`), subir track (`creadores`) y contratar plan pago (`suscripciones`)
- [x] 9.7 El registro devuelve el token en la respuesta (patrón de simulación de P0, sin correo real)

## 10. Exportación de datos personales (`seguridad`)

- [x] 10.1 `paquetes/seguridad/exportacion.py` con queries propias de solo lectura (design.md decisión 8)
- [x] 10.2 `GET /perfil/mis-datos` — `get_current_user`; JSON con perfil, suscripción y pagos, favoritos, playlists, historial, comentarios, seguimientos, tickets y denuncias emitidas
- [x] 10.3 Solo datos del propio solicitante

## 11. Frontend (sistema de diseño Impeccable)

- [x] 11.1 Barra de búsqueda global en el header B2C (`AppShell`) + página de resultados con secciones por tipo
- [x] 11.2 Tarjeta "Tu mix diario" en el home B2C
- [x] 11.3 Acción "Iniciar radio" en el menú contextual de track, encolando en el player existente
- [x] 11.4 Mostrar el `motivo` en la página de recomendaciones
- [x] 11.5 "Bloquear usuario" en comentarios + sección "Usuarios bloqueados" en el perfil con desbloqueo
- [x] 11.6 Strikes visibles en la vista 360° de `UsuariosAdminPage` + checkbox "emitir strike al resolver" en la bandeja de denuncias
- [x] 11.7 Banner persistente "Verifica tu correo" con reenvío y enlace de verificación directo (patrón simulado)
- [x] 11.8 Botón "Descargar mis datos" en `ProfilePage`, junto a la baja de cuenta
- [x] 11.9 `npm run build` verde

## 12. Verificación (curl real + navegador contra Docker)

- [x] 12.1 `GET /search?q=love` devuelve los 4 grupos; un track con takedown no aparece
- [x] 12.2 Radio de un track: ~25 similares del género esperado, sin la semilla
- [x] 12.3 Mix diario idéntico en dos llamadas el mismo día
- [x] 12.4 Recomendaciones traen `motivo` y excluyen lo escuchado/favorito
- [x] 12.5 A bloquea a B → comentarios de B invisibles para A → B no puede responder a A → A desbloquea y todo vuelve
- [x] 12.6 Denuncia resuelta con `emitir_strike` → strike registrado → al tercero la cuenta queda suspendida y el acceso devuelve 403
- [x] 12.7 Registro nuevo → comentar sin verificar → 403 → verificar con token → comentar OK
- [x] 12.8 `GET /perfil/mis-datos` devuelve todas las secciones pobladas para el usuario demo

## 13. Documentación

- [x] 13.1 `docs/BITACORA_S11_P2.md`: decisiones, tablas y columnas nuevas, endpoints por capability, verificación, avance de portadas, archivos frontend
- [x] 13.2 README: conteo de tablas (71 → 73) y funcionalidades
