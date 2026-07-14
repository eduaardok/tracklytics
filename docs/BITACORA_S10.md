# Bitácora de Desarrollo — Semana 10
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 10 de 16
**Fecha:** 9–12 de julio de 2026
**Cierre de semana:** auditoría de los 55 casos de uso operativos con mejoras de realismo, retiro del frontend legado, cierre del modelo de negocio real (regalías + publicidad), cierre de la capa operativa (dashboards administrativos, sesiones multi-dispositivo, búsqueda avanzada, feed social, playlists colaborativas), y una ronda final de auditoría/verificación visual que corrige 3 bugs de producto encontrados navegando la app en vivo.

---

## Resumen ejecutivo

La semana 10 no abre con una capability nueva planeada — abre con una auditoría exhaustiva de los
55 casos de uso operativos (CU-O01–58) contra el stack vivo, que encuentra un bug crítico de
integridad de datos y una tanda de gaps de "se siente falso" (pagos sin verificar, permisos sin
UI, país sin validar). De ahí en adelante el trabajo se organiza en 5 bloques dentro de la misma
semana: cierre de esos hallazgos, retiro del frontend legado + cierre del modelo de negocio real
(regalías y publicidad), cierre de la capa operativa (6 dashboards, sesiones, búsqueda avanzada,
feed social, playlists colaborativas), una auditoría de cierre documental/de seguridad, y una
ronda final de verificación visual con Playwright que encuentra y corrige 3 bugs de producto que
ningún curl había detectado. El resultado: **13 capabilities OpenSpec** (11 archivadas desde antes
+ `regalias`/`publicidad` archivadas esta semana), **61 tablas físicas en ClickHouse**, un único
frontend (React), y un módulo operativo verificado de punta a punta con datos reales, no
sintéticos inventados para la demo.

---

## Bloque 1 — Auditoría de 55 CUs operativos + mejoras de realismo (9 jul 2026)

Auditoría exhaustiva de CU-O01–58 contra el stack vivo. Encuentra un bug crítico y una serie de
gaps de "entorno de juguete" reportados aparte por el usuario.

### Fix crítico de integridad de datos: `fact_id` reasignado en cada corrida sintética
`etl/gold/loader.py` calculaba `next_id` para los tracks sintéticos como `n_real + 1` **fijo** en
cada corrida, en vez de `MAX(fact_id)` real. Cada semana adicional (o cualquier recarga forzada)
reescribía el mismo rango de `fact_id`, así que un mismo id terminaba apuntando a tracks distintos
según el orden de merge de ClickHouse — corrompiendo en silencio favoritos, playlists, historial,
comentarios y restricciones ya guardados por cualquier usuario. Corregido calculando `next_id`
desde `MAX(fact_id) FROM FACT_TRACKS` real. Los ~800K registros sintéticos duplicados generados
por el bug durante las pruebas de esta auditoría no se limpiaron como parte del cambio — es una
operación destructiva sobre datos vivos que quedó pendiente de decisión explícita.

### 5 pantallas de analítica rotas (CU-O07/08/09/10)
`genres.html`, `trends.html`, `dashboard.html` (parcial) y `compare-artists.html` llamaban a
endpoints que nunca se habían montado en el backend (`/genres/trends`,
`/genres/{id}/audio-profile`, `/trends/weekly`, `/artists/search`, `/artists/{id}/stats`) pese a
que las queries SQL ya existían, huérfanas, en `analitica/queries.py`. Se montaron los 5
endpoints reusando esas queries, sin tocar el frontend.

### Bug `id=0` en CRUD de dimensiones (CU-O15)
`dim_create` no calculaba un PK real, dejando todo registro nuevo con `id=0` — riesgo de que un
DELETE/UPDATE afectara a todos los registros con ese mismo defecto. Corregido calculando
`MAX(pk) + 1` antes del insert.

### CU-O58 — audio real
Reproducción real vía YouTube IFrame Player API (búsqueda `listType=search` por "artista +
track"), con manejo explícito de error en vez de simulación silenciosa (la simulación como
fallback llegaría después, en la sección 25 de `docs/decisiones-refactorizacion.md`).

### Suscripción con pago integrado
Antes se podía "activar" un plan de pago escribiendo cualquier texto, sin verificar contra un
método de pago real — dos flujos completamente desconectados. Ahora activar un plan de pago exige
un `metodo_pago_id` real (`DIM_METODO_PAGO`) y dispara el cobro (transacción + invoice) en la
misma operación, como cualquier checkout real.

### Feedback visual, permisos, facturas, país real, plan familiar
Toasts de éxito/error en favoritos/playlists/suscripción (antes silenciosos); panel de
administración "Permisos" con tabla completa de usuarios y auditoría con nombre/email (antes solo
`usuario_id` crudo); facturas con vista imprimible profesional (branding, IVA, método de pago);
catálogo público de países con `<select>` en registro/perfil (antes texto libre que casi nunca
resolvía contra `DIM_PAIS`, por lo que la disponibilidad geográfica de CU-O41 nunca aplicaba en la
práctica); plan familiar en autoservicio para que el propio titular premium lo cree y gestione sin
depender de un administrador.

### Artefactos entregados (bloque 1)

| Artefacto | Estado |
|---|---|
| `etl/gold/loader.py` | Corregido — `next_id` real vía `MAX(fact_id)` |
| `api/paquetes/analitica/{router,queries}.py` | Actualizado — 5 endpoints montados |
| `api/paquetes/gestion_datos/router.py` | Corregido — `dim_create` con PK real |
| `app/js/ytplayer.js` | Nuevo — YouTube IFrame Player API |
| `api/paquetes/{suscripciones,facturacion,seguridad,distribucion,experiencia}/*` | Actualizado — pago integrado, permisos, país real, plan familiar autoservicio |
| `app/analytics/{permisos,auditoria}.html`, `app/facturacion/invoice.html` | Nuevos |
| `openspec/changes/2026-07-09-mejoras-produccion/` | Change con specs de `distribucion`, `experiencia`, `facturacion`, `ingesta`, `seguridad`, `suscripciones` |

---

## Bloque 2 — Retiro del frontend legado + modelo de negocio real (S10 Día 1, 11 jul 2026)

### Retiro completo de `app/`
El frontend vanilla HTML/CSS/JS que coexistía con React desde S9 se eliminó por completo del
repositorio y de `docker-compose.yml` (~25 archivos, puerto 8081). React (`frontend/`) queda como
único frontend del proyecto — ya no se levanta ningún servicio adicional en Docker para el legado.

### Regalías y publicidad — dos capabilities nuevas, 9 tablas
La auditoría de esta semana encontró que dos piezas centrales del modelo de negocio real de
streaming musical no existían en absoluto, ni en datos ni en código: **regalías** (cómo se le paga
a un sello/artista/productor por sus streams) y **publicidad** (cómo se financia el tier free, y
cómo ese ingreso entra al mismo pool que reparte regalías). Se agrupan en un solo change porque
están acopladas por diseño.

- **`regalias`** (`DIM_PRODUCTOR`, `BRIDGE_PRODUCTOR_TRACK`, `DIM_CONTRATO_REGALIA`,
  `FACT_LIQUIDACION_REGALIA`, `DIM_CUENTA_SELLO`): dos tipos de derecho (master/grabación y
  publishing/composición, sin `DIM_EDITORIAL` — decisión explícita del usuario, la publicidad de
  un track sin editorial separada se reparte entre sello/artista), contratos de reparto por track
  con vigencia, y liquidación real por período: `pool_rightsholders = (Σ transacciones exitosas +
  Σ ingreso publicitario del período) × 70%`, repartido pro-rata entre tracks por su
  participación real en streams (`FACT_ENGAGEMENT_USUARIO`, `event_type='reproduccion'`), y
  dentro de cada track entre sello/artista/productor según su contrato vigente. Login propio de
  sello (`DIM_CUENTA_SELLO`, alta exclusiva de admin — un sello ya es una entidad de catálogo
  administrada, no de autoservicio como una cuenta de artista).
- **`publicidad`** (`DIM_ANUNCIANTE`, `DIM_CAMPANA_PUBLICITARIA`, `FACT_IMPRESION_ANUNCIO`,
  `FACT_INGRESO_PUBLICITARIO`): anunciantes y campañas con CPM real, impresión de anuncio entre
  canciones a un usuario del plan free, e ingreso publicitario reconocido en tiempo real por cada
  impresión completada (`monto = cpm/1000`), sin agregación diferida.
- **`finanzas_periodicas`** (Airflow, `schedule_interval="@weekly"`, cron real — no disparo
  manual): primero renueva suscripciones vencidas cobrando de verdad contra
  `DIM_METODO_PAGO`/`FACT_TRANSACCION_PAGO` del usuario (cierra el hueco de "facturación
  recurrente" señalado en la auditoría del bloque 1), y luego liquida regalías del período con el
  ingreso ya actualizado.
- **React**: vista de ganancias para artista (sus tracks, streams del período, monto) y para
  sello (ganancias agregadas de todos sus artistas), anuncio real entre canciones para usuarios
  free (interrumpe el reproductor, requiere completarse antes de continuar) con registro de
  impresión.
- **Fuera de alcance** (decisión explícita, no pendiente): pasarela de anuncios de video/display
  fuera del reproductor de audio; segmentación de campañas por audiencia (toda campaña activa es
  elegible para cualquier usuario free); `DIM_EDITORIAL`/gestión de composición separada del
  artista.

### Artefactos entregados (bloque 2)

| Artefacto | Estado |
|---|---|
| `app/` | Eliminado — ~25 archivos, servicio retirado de `docker-compose.yml` |
| `api/paquetes/regalias/`, `api/paquetes/publicidad/` | Nuevos |
| `etl/gold/regalias_liquidacion.py`, `etl/gold/facturacion_recurrente.py` | Nuevos |
| `etl/dags/finanzas_periodicas_dag.py` | Nuevo — cron semanal real |
| `frontend/src/packages/{regalias,publicidad}/` | Nuevos |
| `openspec/changes/2026-07-11-regalias-publicidad/` | Change con specs de ambas capabilities (archivado en el bloque 4) |

---

## Bloque 3 — Cierre de la capa operativa (S10 Día 3)

Seis capabilities de negocio no tenían panel administrativo visual (RT-04) y quedaban gaps
operativos concretos: sin forma de ver/cerrar sesiones abiertas en otro dispositivo, búsqueda de
catálogo sin filtros de audio, feed social solo con la lista de artistas seguidos, y playlists sin
reorder ni forma de compartirlas.

### Dashboards administrativos (RT-04) — 6 capabilities
Nuevo endpoint `GET /admin/dashboard` (rol `admin`) y página React con gráficos reales (Recharts,
paleta oklch validada del proyecto) para `seguridad` (acciones/errores por día, sesiones
abiertas), `facturacion` (ingreso por día, transacciones 24h), `creadores` (subidas por estado,
cuentas de artista), `social` (actividad social por día, artistas más seguidos), `distribucion`
(restricciones por país, licencias activas) y `experiencia` (tickets por estado) — todo agregado
sobre filas ya existentes en ClickHouse, sin datos sintéticos inventados para el gráfico.
`shared/components/charts/` nuevo, reusable entre las 6 páginas.

**Regresión de bundle encontrada y corregida:** agregar Recharts a 6 páginas previamente livianas
subió el bundle principal de 445 kB a 805 kB pese a usar `lazyNamed()` en las 6. Causa: barrels
(`index.ts`) que re-exportan tanto componentes eager como lazy-loaded filtran los lazy al bundle
principal si cualquier import eager de un archivo hermano del mismo barrel ocurre en cualquier
parte de la app. Corregido convirtiendo todos los imports eager de los 6 paquetes afectados a
ruta directa (`router.tsx`, 3 shells, y 3 páginas más), verificado con `npm run build` + grep de
strings de cada dashboard en el bundle principal hasta 0 coincidencias.

### Sesiones activas multi-dispositivo (`seguridad`)
`GET /seguridad/sesiones` (las propias sesiones abiertas del usuario) y `DELETE
/seguridad/sesiones/{sesion_id}` (cierre remoto, con verificación de ownership) — antes solo se
podía cerrar la sesión del propio dispositivo (logout). Sección "Mis sesiones" nueva en el perfil.
Bug encontrado y corregido durante la implementación: `Code 184 ILLEGAL_AGGREGATION` en la query
de sesiones abiertas — un `WHERE` referenciando una columna que también era alias de un agregado
en el mismo `SELECT` se reescribía por ClickHouse hacia la expresión agregada; solución: envolver
en un `SELECT * FROM (...) WHERE ...` externo (mismo patrón ya usado en otras queries del
proyecto).

### Búsqueda avanzada de catálogo
`GET /tracks/search` acepta `popularity_min`, `tempo_min`, `tempo_max` y `energy_min` opcionales,
combinables con el término de búsqueda y el filtro de género. Panel de filtros colapsable en la UI
de catálogo.

### Feed de actividad social
`GET /social/feed` agrega comentarios y comparticiones recientes de tracks de artistas que el
usuario sigue (UNION de ambos eventos, ordenado por fecha). El modelo de `social` sigue a nivel
artista, no usuario — el feed hereda esa misma semántica en vez de simular un follow de usuarios
que no existe (documentado explícitamente, no una limitación silenciosa).

### Playlists colaborativas y reordenables
Campo `colaboradores` (relation multi a `users`) en la colección `playlists` de PocketBase, con
reglas ampliadas para que un colaborador pueda ver la playlist y agregar/quitar/reordenar tracks
(nunca renombrarla ni eliminarla, exclusivo del owner). Nuevos endpoints: `PUT
/biblioteca/playlists/{id}/reordenar`, `POST`/`DELETE
/biblioteca/playlists/{id}/colaboradores[/{usuario_id}]`.

**Dos bugs preexistentes encontrados y corregidos durante la verificación** (no introducidos en
este bloque, expuestos por él):
- `eliminar_playlist` fallaba con 500 opaco para cualquier playlist con ≥1 track — PocketBase
  rechaza borrar un registro referenciado por una relation `required` con `cascadeDelete: false`.
  Corregido con cascada manual en `pb_playlists.eliminar()` (borra los `playlist_tracks` antes de
  la playlist).
- `position` es un campo numérico `required` en PocketBase, que trata `0` como "vacío" — el
  reorder debía arrancar en 1, no en 0 (mismo criterio que `agregar_track`).
- Traducción de 404-oculto-de-PocketBase a 403 legible en `renombrar_playlist`,
  `eliminar_playlist`, `reordenar_playlist` y gestión de colaboradores: PocketBase responde 404
  (no 403) cuando una `updateRule`/`deleteRule` rechaza la operación (oculta el registro en vez
  de admitir que existe); antes de playlists colaborativas esto nunca era alcanzable (solo el
  owner conocía el `playlist_id`), ahora un colaborador puede intentarlo legítimamente.

### Artefactos entregados (bloque 3)

| Artefacto | Estado |
|---|---|
| `api/paquetes/{seguridad,facturacion,creadores,social,distribucion,experiencia}/*` | Actualizado — dashboards + sesiones |
| `frontend/src/shared/components/charts/` | Nuevo |
| `frontend/src/packages/*/pages/{Auditoria,AuditoriaFacturacion,RevisionCreadores,ModeracionSocial,DistribucionAdmin,Tickets}Page.tsx` | Nuevos — 6 dashboards |
| `api/paquetes/biblioteca/{pb_playlists,router}.py` | Actualizado — reorder + colaboradores |
| `scripts/migrar_playlists_colaborativas.py` | Nuevo — migración de instancia PocketBase viva |
| `openspec/changes/2026-07-11-dia3-operaciones-avanzadas/` | Change con specs de las 7 capabilities tocadas |

---

## Bloque 4 — Auditoría final de cierre (S10 Día 4)

### README.md actualizado como documento consolidado del estado operativo
Se decidió mantener `README.md` como el único documento de estado operativo (en vez de crear un
`OPERACIONES.md` aparte, que habría arriesgado desincronizarse con el tiempo). Actualizado a 13
capabilities / 61 tablas, todas las referencias a `app/` como frontend vigente eliminadas,
secciones nuevas "Regalías y publicidad" y "Dashboards administrativos" con la tabla de los 6
`GET /admin/dashboard`, DAG `finanzas_periodicas` agregado al pipeline documentado.

### Auditoría del patrón 404-oculto-como-500 en el resto del repo
El hallazgo del bloque 3 (PocketBase devuelve 404, no 403, cuando una regla de update/delete
rechaza la operación) solo se había corregido en los 4 endpoints de playlists. Se auditaron los 5
archivos que hablan directo con PocketBase (`pb_playlists.py` y los `pb_client.py` de
`seguridad`/`suscripciones`/`experiencia`/`partners`) buscando operaciones de update/delete
alcanzables por un usuario que no sea el dueño del registro. Conclusión verificada, no asumida:
**ningún otro caso es alcanzable hoy** —
`seguridad::actualizar_usuario` siempre opera sobre el propio `usuario_id` del caller (nunca
viene del request); el único endpoint de `suscripciones::cancelar` con un id en la URL ya verifica
ownership en Python antes de llegar a PocketBase, y esa verificación coincide exactamente con el
`updateRule` de la colección; `experiencia`/`partners` son de solo lectura. El patrón necesita la
combinación específica de mutación + registro compartido entre usuarios para ser explotable, y
ninguna otra colección tiene todavía esa feature.

### Limpieza de datos de prueba + fix de `cascadeDelete`
Un usuario de prueba no se podía borrar por la misma clase de bug del bloque 3, un nivel más
arriba en la cadena: `playlists.user` y `playlist_tracks.playlist` tenían `cascadeDelete: false`,
así que borrar un usuario dueño de una playlist quedaba bloqueado por PocketBase. Se activó
`cascadeDelete: true` en ambas relations (`pb_init.py` para instalaciones nuevas +
`scripts/migrar_cascade_delete_playlists.py` para la instancia viva), verificado end-to-end:
borrar el usuario ahora borra en cascada su playlist y sus tracks sin intervención manual.

### Cierre del gap de formato OpenSpec + archivado de `regalias-publicidad`
Los specs de `regalias`/`publicidad` (bloque 2) estaban escritos como spec completa (`##
Purpose`/`## Requirements`) en vez del formato delta (`## ADDED Requirements`) que exige un change
activo. Se evaluó corregir el formato vs. archivar directamente, dado que el código ya estaba en
producción — se optó por archivar. Encontrado en el proceso: la propia herramienta
`openspec archive` no sabe fusionar secciones narrativas (Purpose/Objetivo/Contexto/Actores/Tabla
de trazabilidad) al mezclar el delta hacia el spec final — las descartó y dejó un placeholder
`"Purpose: TBD"`. Reconstruido a mano en `openspec/specs/{regalias,publicidad}/spec.md` a partir
del contenido preservado en el change archivado, igualando el patrón del resto de capabilities.
`openspec validate --strict --all`: 15/15 (13 specs + 2 changes activos).

### Artefactos entregados (bloque 4)

| Artefacto | Estado |
|---|---|
| `README.md` | Actualizado exhaustivamente — 13 capabilities, sin `app/`, regalías/publicidad, dashboards |
| `pb_init.py` | Actualizado — `cascadeDelete: true` en `playlists.user`/`playlist_tracks.playlist` |
| `scripts/migrar_cascade_delete_playlists.py` | Nuevo |
| `openspec/specs/{regalias,publicidad}/spec.md` | Reconstruidos tras el archivado |
| `openspec/changes/archive/2026-07-11-regalias-publicidad/` | Archivado |

---

## Bloque 5 — Verificación visual y fixes finales (S10 Día 5, 12 jul 2026)

Ronda de revisión navegando la app en vivo (no solo curl) sobre lo construido en los bloques 2-3,
que encuentra 3 bugs de producto reales — ninguno visible desde una prueba de API aislada.

### Ganancias como sello no se mostraban
Un usuario con cuenta de artista **y** cuenta de sello a la vez (nada en el modelo lo impide) solo
veía la vista de ganancias de artista: `MisGananciasPage.tsx` solo consultaba `/regalias/sello
/mis-ganancias` si la consulta de artista fallaba (`enabled: artista.isError`), así que la de
sello nunca llegaba a pedirse. Corregido para que ambas consultas corran siempre en paralelo, con
pestañas "Como artista"/"Como sello · {nombre}" cuando ambas existen. `GET
/regalias/sello/mi-cuenta` se enriqueció con el nombre del sello (antes solo el id). El backend de
`GET /regalias/sello/mis-ganancias` ya agregaba por `sello_id` (no por usuario individual), así
que ya sumaba las liquidaciones de todos los artistas firmados al sello sin necesitar cambios.

### Recomendaciones ("Para ti") genéricas y con tracks duplicados
Dos causas de raíz distintas para la duplicación, no una: el mismo `track_id` se repite una vez
por cada género al que pertenece (documentado en el proyecto), **y además** el mismo track puede
tener `track_id` distintos en el dataset (ej. una grabación catalogada en varias
ediciones/compilaciones). La deduplicación se movió de fila-de-`FACT_TRACKS` a `GROUP BY
track_name, artist_name` en las 3 queries del endpoint. La heurística pasó de "género de
favoritos + popularidad" a 3 niveles: (1) similitud de atributos de audio reales (danceability,
energy, tempo, valence promedio de lo que el usuario realmente reprodujo, no solo de favoritos)
dentro de sus géneros más escuchados — nuevo nivel primario, con distancia simple normalizada
(heurística, no ML); (2) mismo género que favoritos si no hay historial de reproducción; (3)
popularidad global como último fallback. La UI de tabla de texto plano se reemplazó por filas con
portada real (`AlbumArt`, mismo componente que el resto del catálogo) y un motivo corto por track
("Porque escuchas mucho dance").

### Cambio de contraseña no existía
El perfil mostraba explícitamente "el backend no expone ese endpoint". Implementado
`PATCH /seguridad/password`, que delega en el update nativo de PocketBase (`oldPassword` +
`password` + `passwordConfirm` sobre el propio registro) sin reinventar hashing en Python —
PocketBase valida la contraseña actual server-side antes de aceptar el cambio. Formulario real en
Mi Perfil (actual/nueva/confirmar, con validación de coincidencia antes de enviar). Bug propio
encontrado en la verificación: el formulario se colapsaba en el mismo instante del éxito, así que
el mensaje de confirmación nunca llegaba a mostrarse — corregido para que el formulario quede
abierto tras guardar, mostrando el mensaje hasta que el usuario lo cierre manualmente.

### Método de verificación
Los tres fixes se verificaron con Playwright real (Chromium headless, ya instalado localmente) en
vez de solo curl: login por UI, navegación a cada pantalla, captura de screenshots, y para el
cambio de contraseña un ciclo completo end-to-end (cambiar → logout → login con la contraseña
nueva funciona, con la vieja falla). El bug del mensaje de éxito colapsado solo se detectó así —
la API respondía 200 correctamente en cada caso, el bug era puramente de estado de React.

### Artefactos entregados (bloque 5)

| Artefacto | Estado |
|---|---|
| `frontend/src/packages/regalias/pages/MisGananciasPage.tsx` | Corregido — pestañas artista/sello en paralelo |
| `api/paquetes/regalias/queries.py` | Actualizado — `nombre_sello` en `CUENTA_SELLO_POR_USUARIO` |
| `api/paquetes/experiencia/queries.py` | Reescrito — 3 niveles de recomendación, dedup por nombre+artista |
| `frontend/src/packages/experiencia/pages/RecomendacionesPage.tsx` | Reescrito — filas con portada + motivo |
| `api/paquetes/seguridad/router.py` | Nuevo — `PATCH /seguridad/password` |
| `frontend/src/packages/seguridad/pages/ProfilePage.tsx` | Actualizado — formulario real de cambio de contraseña |

---

## Artefactos entregados — consolidado de la semana

| Artefacto | Estado |
|---|---|
| `app/` | Eliminado por completo |
| `api/paquetes/regalias/`, `api/paquetes/publicidad/` | Nuevos — 2 capabilities, 9 tablas |
| `etl/dags/finanzas_periodicas_dag.py` | Nuevo — cron semanal real |
| 6 dashboards administrativos (`GET /admin/dashboard` × 6) | Nuevos |
| Sesiones multi-dispositivo, búsqueda avanzada, feed social, playlists colaborativas | Nuevos |
| `README.md` | Reescrito como documento consolidado del estado operativo |
| `openspec/specs/{regalias,publicidad}/spec.md` | Nuevos — 13/13 capabilities archivadas |
| `docs/BITACORA_S10.md` | Este documento |

---

## Deuda técnica identificada

| Ítem | Impacto | Estimación |
|---|---|---|
| ~800K registros sintéticos duplicados por el bug de `fact_id` (bloque 1) | Ninguno funcional tras el fix, pero infla el conteo real de `FACT_TRACKS` | Limpieza destructiva sobre datos vivos — requiere decisión explícita del usuario |
| Contenedor `etl` de `docker-compose.yml` sale con error (`main.py` no encontrado) al hacer `docker compose up` | Ninguno funcional — es un job auxiliar, no bloquea el resto del stack | Revisar el `command`/entrypoint de ese servicio; los datos ya cargados no dependen de él |
| El patrón 404-oculto-como-500 solo se corrigió donde ya era alcanzable (playlists) | Ninguno hoy — auditado y confirmado sin otro caso explotable | Reauditar si otra colección de PocketBase gana una feature multi-usuario compartida |
| `openspec archive` pierde secciones narrativas al fusionar un change de capability nueva hacia el spec final | Se corrigió a mano una vez (regalías/publicidad); volvería a pasar con el próximo archivado | Reportar upstream o escribir un script de post-proceso que preserve Purpose/Objetivo/Contexto/Actores/Tabla de trazabilidad |
| Cobertura de portadas reales sigue baja (heredado de S9) | Estético — el fallback visual local cubre el resto | Rate limit real de iTunes/Deezer; se resuelve incrementalmente en corridas futuras del DAG |

---

## Verificación end-to-end de la semana

- **Backend:** curl real contra cada endpoint nuevo, incluyendo casos de error (403 por rol
  no-owner, 422 por validación, 400 por contraseña actual incorrecta, cascada de borrado
  verificada con datos reales creados vía API — nunca inserts directos a ClickHouse/PocketBase
  para simular estado).
- **Frontend:** `npm run build` limpio (typecheck + bundle) tras cada tanda de cambios.
- **Navegador real:** Playwright (Chromium headless) para los 3 fixes del bloque 5 — login por UI,
  navegación, screenshots, y el ciclo completo de cambio de contraseña verificado con dos logins
  reales (contraseña vieja falla, nueva funciona). En bloques anteriores de la semana esta
  verificación no fue posible por falta de la herramienta en el entorno de ejecución de ese
  momento; quedó documentado explícitamente en vez de asumir que "compila" era suficiente.
- **OpenSpec:** `openspec validate --all --strict` → 15/15 al cierre de la semana (13 specs
  archivadas + 2 changes activos pendientes de archivar en una futura sesión).

---

## Ronda 2 — Notificaciones, perfiles públicos, "Para ti" en secciones, toasts y `UserPicker` explorable (12 jul 2026)

Con la capa operativa ya cerrada (bloques 1-5), esta ronda cierra 5 gaps de producto encontrados
en la propia auditoría: la plataforma no avisaba a nadie de nada (seguir a un artista o comentar
no generaba ningún aviso), todo perfil era de facto invisible para otros usuarios, "Para ti" era
una única lista genérica sin distinguir descubrimiento de redescubrimiento, el sistema de toasts
nunca llegó a construirse en el frontend React (a diferencia del legacy `app/js/toast.js`, ya
retirado en el bloque 2), y `UserPicker` — ya compartido por 4 paneles admin — nunca explotó la
capacidad de listado completo paginado que el backend exponía desde el 09-07, solo permitía
buscar escribiendo. Trabajo documentado en
`openspec/changes/2026-07-12-notificaciones-perfiles-recos/`.

### Notificaciones (`social`)
Tabla nueva `FACT_NOTIFICACION` (destinatario, tipo, referencia, leído, timestamps — `fact_id`
`UInt64` aleatorio sin lock, mismo patrón que `FACT_COMENTARIO`/`FACT_COMPARTICION`). Tres
triggers reales, no simulados: (1) admin aprueba un track de una cuenta de artista → notifica a
todos los seguidores activos de ese artista (`creadores/router.py` → nuevo módulo
`paquetes/social/notificaciones.py`); (2) alguien comenta un track propio (resuelto por
nombre_artistico → `DIM_CUENTA_ARTISTA`, mismo join "suave" ya aceptado en
`creadores/promocion.py`) o responde a un comentario propio → notifica al autor, nunca a uno
mismo; (3) el dueño de una playlist agrega un colaborador → notifica al colaborador. Endpoints
`GET /social/notificaciones` (lista + conteo de no leídas), `PATCH
/social/notificaciones/{id}/leer` y `PATCH /social/notificaciones/leer-todas`. Campana en la
barra superior de React (`NotificationBell.tsx`, montada por ruta directa en `AppShell.tsx` —
mismo criterio anti-bundle-bloat que `UserMenu`, `@packages/social` re-exporta
`ModeracionSocialPage` con Recharts en su barrel) con badge de no leídas y dropdown que marca
como leída al abrir y navega al track/playlist referenciado.

**Bug propio encontrado en la verificación con curl, no en Playwright:** `comentar_track` lanzaba
`UnboundLocalError: cannot access local variable 'padre'` en cualquier comentario raíz (no
respuesta) — la variable solo se inicializaba dentro del `if comentario_padre_id is not None`,
y el nuevo trigger de notificación la leía siempre. Corregido inicializándola en `None` antes del
condicional. Sin este fix, todo comentario raíz habría devuelto 500.

### Perfiles públicos/privados (`social` + `seguridad` + `catalogo`)
`DIM_USUARIO.perfil_publico` (`ALTER TABLE ADD COLUMN`, `UInt8 DEFAULT 0` — privado por defecto,
decisión explícita de privacidad: una cuenta nueva no debería exponerse hasta que el usuario lo
decida). `GET`/`PATCH /seguridad/perfil` extendido (antes solo `PATCH` para nombre/país). Campo
`es_publica` en la colección `playlists` de PocketBase (privada por defecto), con su propio
endpoint `PATCH /biblioteca/playlists/{id}/visibilidad`, exclusivo del dueño — un colaborador que
lo intenta recibe el mismo 403 "Solo el propietario puede hacer esto" ya establecido para
renombrar/eliminar. Página pública `GET /social/usuarios/{id}/perfil`, alcanzable **sin sesión**
(dependencia `_usuario_opcional` nueva, que reintenta `get_current_user` y degrada a `None` en
vez de exigir 401): retorna nombre y playlists públicas con sus tracks si el perfil es público, o
404 uniforme ("Este perfil es privado") si es privado y el visitante no es el dueño — no
distingue "no existe" de "es privado" en la respuesta. UI: `PerfilPublicoPage.tsx` en
`/usuarios/:usuarioId` (ruta pública, sin `RequireAuth`), toggle de visibilidad en Mi Perfil y por
playlist en `PlaylistsTab`, enlaces al perfil público desde el autor de cada comentario
(`TrackSocialPage`) y desde cada colaborador de playlist.

**Bug preexistente encontrado y corregido al tocar `authApi.actualizarPerfil`:** guardaba en la
sesión local cacheada una clave `nombre` que `SessionUser` nunca tuvo (el campo real es `name`) —
TypeScript no lo marcaba porque `Partial<SessionUser>` no hace excess-property-check contra una
variable ya tipada, así que compilaba limpio pero el nombre cacheado en sesión nunca se
actualizaba de verdad tras editar el perfil (sí se persistía bien en PocketBase/ClickHouse, el
bug era solo de caché local). No introducido en esta ronda — expuesto al extender esa misma
función para `perfil_publico`.

### "Para ti" en secciones (`experiencia`)
`GET /experiencia/recomendaciones` pasa de `{data, algoritmo}` a `{secciones: [...]}`. "Hecho
para ti" reutiliza el algoritmo de 3 niveles existente sin tocar la heurística (similitud de
audio real → mismo género que favoritos → popularidad global), solo renombrado en la UI —
siempre presente, incluso sin historial. "Novedades de artistas que sigues" es nueva: mismos
`artist_id` que dispara la notificación `nuevo_track_artista_seguido`, ordenado por
`FACT_TRACKS.inserted_at` real (no `load_week`). "Redescubre" también es nueva: el propio
historial/favoritos del usuario ordenado por interacción menos reciente — no es una
recomendación de tracks nuevos, es resurgir lo ya conocido. Las dos últimas se omiten de la
respuesta (no una sección vacía) cuando no hay señal — verificado con curl: un usuario sin
favoritos ni historial no recibe "Redescubre" en absoluto.

### Toasts centralizados (frontend, transversal)
`shared/context/ToastContext.tsx` (`ToastProvider`/`useToast()`, portal a `document.body`,
auto-dismiss a 4.5s, cierre manual) montado una vez en `app/providers/index.tsx`. Enganchado a
las 22 páginas/hooks que ya tenían mutaciones sin ningún feedback visual — no solo las nuevas de
esta ronda: favoritos, playlists (crear/renombrar/eliminar/reorder/colaboradores/visibilidad),
seguir/dejar de seguir, comentar, compartir, tickets de soporte, cambio de contraseña, y los
paneles admin de permisos, auditoría de facturación, regalías, publicidad, creadores,
distribución, familia y suscripciones (42 mutaciones en total). Donde ya existía manejo de error
local (banners inline, estado de formulario) se dejó intacto y el toast se agregó encima, nunca
en reemplazo.

### `UserPicker` explorable (`seguridad`, componente compartido)
Botón de lista junto al campo de búsqueda que abre la tabla completa de usuarios paginada sin
escribir nada (el backend ya lo soportaba desde el 09-07, `usuarios_listado_sql`/
`usuarios_listado_total_sql` ahora parametrizadas), con selector de rol como filtro. Sin filtro
de plan ni de fecha de registro en la UI (aunque el backend sí acepta `fecha_desde`/
`fecha_hasta`, agregado por si una futura pantalla lo necesita): el plan vive en PocketBase, no
en `DIM_USUARIO`, y unirlo por fila implicaría N+1 llamadas a PocketBase por página en vez de un
`WHERE` en ClickHouse — decisión explícita, no un olvido. Los 4 paneles que ya usaban
`UserPicker` (Permisos, Auditoría de facturación, Regalías, Plan familiar) heredan el modo
explorar sin ningún cambio propio, por ser un componente compartido.

### Verificación
- **Backend:** curl real contra cada endpoint nuevo, incluyendo el ciclo completo de
  notificaciones (aprobar cuenta de artista → subir y aprobar 2 tracks → seguir el artista →
  aprobar un tercer track → verificar notificación del seguidor), comentario raíz y respuesta
  (encontró el bug de `padre` no inicializado), perfil público en los 3 estados (privado como
  visitante anónimo → 404, público como visitante anónimo → datos, propio dueño sin importar el
  flag), visibilidad de playlist, y filtros de `usuarios/buscar` por rol y fecha.
- **Frontend:** `tsc --noEmit` y `npm run build` limpios (único error preexistente, no tocado en
  esta ronda: `EngagementPage.tsx`, capability `analitica`).
- **Navegador real (Playwright, Chromium headless):** recorrido completo con 3 usuarios de
  prueba nuevos (`s10r2_a/b/admin@test.com`) contra el stack en Docker reconstruido — login por
  UI, campana de notificaciones (badge, dropdown, marcar todas leídas), "Para ti" con sus 2
  secciones visibles, toggle de visibilidad de playlist con toast de confirmación, perfil propio
  y ajeno (incluyendo un contexto de navegador sin sesión para el perfil público), enlace desde
  un comentario hacia el perfil de su autor, y `UserPicker` en modo explorar con paginación y
  filtro de rol. Cero errores de consola/página en las 5 sesiones de navegador. Encontrado en el
  camino: el email largo de un usuario desbordaba el borde del dropdown de `UserPicker`
  (`overflow-wrap: anywhere` agregado). Capturas en el historial de la sesión, no versionadas en
  el repo.
- **OpenSpec:** `openspec validate --strict --all` → 16/16 (13 specs archivadas + 3 changes
  activos: los 2 pendientes de archivar de la semana anterior, más
  `2026-07-12-notificaciones-perfiles-recos`).

### Artefactos entregados (ronda 2)

| Artefacto | Estado |
|---|---|
| `DIM_USUARIO.perfil_publico`, `FACT_NOTIFICACION` | Nuevos — ClickHouse, aplicados en vivo + `init_clickhouse.py` |
| `playlists.es_publica` (PocketBase) | Nuevo — aplicado en vivo vía `scripts/migrar_visibilidad_publica.py` + `pb_init.py` |
| `api/paquetes/social/notificaciones.py` | Nuevo |
| `api/paquetes/{social,seguridad,biblioteca,creadores,experiencia}/{router,queries}.py` | Actualizados |
| `frontend/src/shared/context/ToastContext.{tsx,module.css}` | Nuevo |
| `frontend/src/packages/social/components/NotificationBell.{tsx,module.css}` | Nuevo |
| `frontend/src/packages/social/pages/PerfilPublicoPage.tsx` | Nuevo |
| `frontend/src/packages/experiencia/pages/RecomendacionesPage.tsx` | Reescrito |
| `frontend/src/shared/components/UserPicker.{tsx,module.css}` | Actualizado — modo explorar |
| 19 páginas/hooks adicionales | Actualizados — toasts enganchados |
| `openspec/changes/2026-07-12-notificaciones-perfiles-recos/` | Nuevo — 4 specs delta (social, seguridad, catalogo, experiencia) |

### Deuda técnica / decisiones abiertas (ronda 2)

| Ítem | Impacto | Estimación |
|---|---|---|
| Filtro de plan no disponible en `UserPicker` (solo rol/fecha) | Bajo — el caso de uso más común (buscar por nombre/email) sigue cubierto | Requeriría desnormalizar el plan activo hacia `DIM_USUARIO` o aceptar N+1 a PocketBase |
| "Redescubre" es heurística simple (interacción menos reciente, sin ponderar género/artista) | Ninguno funcional — cumple el pedido "si alcanza el tiempo" | Podría cruzarse con el perfil de audio como las otras 2 secciones, en una ronda futura |
| Notificación de "comentario en tu contenido" solo cubre tracks (no hay comentarios en playlists en el modelo actual) | Ninguno — el modelo de `social` no tiene comentarios de playlist | Extender si `social` gana esa feature |
| 3 changes OpenSpec activos sin archivar (`2026-07-09`, `2026-07-11-dia3`, `2026-07-12`) | Ninguno funcional — `openspec validate --strict --all` sigue en verde | Archivar en una sesión futura dedicada, reconstruyendo a mano las secciones narrativas si `openspec archive` vuelve a perderlas (deuda ya documentada en el bloque 4) |

---

## Ronda 3 — QA autónomo con Claude in Chrome + fixes (12 jul 2026)

Verificación de todo el sistema delegada a un Claude en Chrome autónomo (prompt generado en la
ronda anterior, credenciales de prueba de la ronda 2 más cuentas auto-registradas por el propio
tester). Cubrió navegación, búsqueda, filtros, detalle y bloqueo de rutas por rol en la mayoría de
capabilities — sin acciones de escritura (no probó playlists/favoritos/moderación/pagos/
aprobaciones/CRUD de dimensiones ni la cuenta analyst, quedó documentado como pendiente). Reportó
7 bugs "reales", 7 inconsistencias "a confirmar", y una lista de prioridad. Cada hallazgo se
reverificó contra el código y datos reales antes de tocar nada — 2 de los 7 bugs resultaron ser
comportamiento correcto con una causa real distinta a la reportada (regalías en cero, cifras de
ETL idénticas), y las 7 "inconsistencias a confirmar" se investigaron todas, con 5 confirmadas
como bugs reales adicionales al terminar de investigar.

### Bugs corregidos

- **Filtro por rol en `/seguridad/permisos` devolvía "sin resultados" (bug propio, código de la
  ronda 2)**: el backend funcionaba perfecto (verificado con curl antes y después) — el bug era
  puramente de frontend, en `UserPicker.tsx`. El `<select>` de rol vive dentro del mismo dropdown
  que se cierra por `onBlur` del input de búsqueda a los 150ms; clickear el `<select>` le quita el
  foco al input, dispara ese `onBlur`, y el dropdown entero (incluido el `<select>`) se desmonta
  antes de que el navegador llegue a procesar la selección. Mi propia verificación con Playwright
  de la ronda anterior no lo detectó porque usé `.selectOption()` (asignación directa por API,
  sin blur real) en vez de un click real — el tester de esta ronda sí simuló la interacción real.
  Corregido ignorando el blur cuando el nuevo foco cae dentro del mismo contenedor
  (`e.relatedTarget`).
- **Nota de desarrollo interna filtrada al texto visible** en `/distribucion/disponibilidad` y
  `/social` ("La navegación... la construye la capability experiencia") — texto que dejó de ser
  cierto hace varias rondas (`TrackDetailPage` ya existe) y nunca se limpió. Reemplazado por
  copy normal orientado al usuario.
- **Etiqueta "pop" ambigua** en las tarjetas de Artistas y Géneros del catálogo — abreviaba
  "popularidad" pero, al ser también el nombre de un género musical real, se leía como género
  (confirmado con artistas no-pop). Reemplazado por el mismo ícono ★ que ya usa Analítica para lo
  mismo.
- **`AlbumDetailPage.tsx` copiado de una plantilla de playlist y nunca actualizado**: mostraba
  "PLAYLIST" como header, "Playlist no encontrada" como error, y título de pestaña "Playlist" —
  además de un bug de React real (`{año && <span>{año}</span>}` renderiza un "0" suelto sin
  etiqueta cuando `release_year` es `0`, el placeholder real para álbumes sin metadata — un
  número falsy en JSX SÍ se pinta, a diferencia de `false`/`null`). Corregidos ambos.
- **Tooltips de `MiniLineChart`/`MiniBarChart` mostraban floats crudos sin redondear**
  (`String(value)` directo, ej. "29.969999313354492" en series de dinero agregadas con SUM sobre
  columnas Float32 en ClickHouse — ruido de precisión real, no un bug de datos). Nuevo helper
  compartido `charts/format.ts` con `toLocaleString` a 2 decimales, usado por ambos charts — esto
  corrige el tooltip de "Ingreso real por día" en Auditoría de facturación y cualquier otro
  dashboard con series monetarias. De paso, `toFixed(4)` en la tabla de ingreso de Publicidad
  (único monto de la app a 4 decimales) bajado a 2 para consistencia.
- **Botón "Pagar — 0,00 US$/mes" activo para usuarios del plan free**: `GET
  /facturacion/metodos-pago` devuelve un objeto `suscripcion` no-nulo incluso para el plan free
  (`{tipo_plan:"free", monto:0}`), y el frontend nunca distinguía ese caso de una suscripción
  paga real esperando cobro. La sección de pago ahora solo se muestra cuando `suscripcion.monto >
  0`; para plan free se muestra una nota explicando que no hay cargo pendiente y un enlace a Mi
  Plan para subir a Premium.
- **Sesiones duplicadas nunca cerradas** en "Mis sesiones": `POST /auth/login` abría una fila
  nueva en `FACT_SESION` en cada login sin verificar si ya había una sesión abierta para el mismo
  dispositivo — un re-login (token expirado, doble submit, recarga) dejaba la sesión anterior
  huérfana para siempre, porque el cierre remoto/logout solo resuelve la más reciente por
  dispositivo. Corregido cerrando cualquier sesión previa del mismo dispositivo antes de abrir la
  nueva — verificado con curl (2 logins seguidos del mismo dispositivo → 1 sola sesión abierta,
  antes quedaban 2).

### Reportado como bug, confirmado que NO lo es (con evidencia real, no descartado a ojo)

- **Regalías de `s10r2_b` en $0,00 pese a tener 2 tracks aprobados**: sus 2 tracks tienen 0
  streams reales (nadie los reprodujo nunca) — verificado directo en `FACT_ENGAGEMENT_USUARIO`.
  Sin streams no hay pro-rata que repartir; `FACT_LIQUIDACION_REGALIA` sí tiene 15 filas de otros
  tracks, confirmando que el mecanismo de liquidación funciona.
- **Cifras idénticas de "Leídos" (113.550) en el historial de ETL entre semanas distintas**: es
  el diseño real del pipeline, no un dato cacheado — la capa bronze (`etl/bronze/extractor.py`)
  hace un extract completo de la colección base de PocketBase en CADA corrida sin importar la
  semana (`fetch_all_pages`, sin filtro), y es la capa gold la que sintetiza/pondera por semana
  aguas abajo. 113.550 es el tamaño real y fijo del dataset base.

### Encontrado pero no corregido — requiere decisión explícita del usuario

- **`admin@demo.tracklytics.com` tiene rol `admin` en PocketBase (fuente real de autorización) pero
  `rol: user` en el espejo `DIM_USUARIO`** (verificado con curl en ambos sistemas) — cuenta de
  prueba antigua, probablemente promovida a admin directamente en PocketBase en algún momento sin
  sincronizar el espejo analítico. El clasificador de permisos de Claude Code bloqueó
  correctamente mi intento de corregir el dato (`ALTER TABLE DIM_USUARIO UPDATE rol='admin'`) por
  tratarse de una escalada de permisos sobre datos de identidad sin autorización explícita
  nombrada — queda sin tocar. No hay ningún mecanismo hoy que mantenga `DIM_USUARIO.rol`
  sincronizado si el rol de un usuario cambia en PocketBase después del registro (solo se escribe
  una vez, al crear la cuenta) — vale la pena tenerlo en cuenta si se agrega una feature real de
  "cambiar rol" en el futuro.
- **`DIM_GENRES.mood` nace hardcodeado a `"Neutral"` para los 114 géneros** (`etl/gold/loader.py`,
  literal en el insert, nunca calculado) — confirmado con una consulta real (114/114 filas en
  "Neutral"). Escribí `scripts/backfill_mood_generos.py`, un backfill con heurística de cuadrante
  valence/energy (documentada como heurística, no ML — mismo criterio que el resto del proyecto)
  sobre el promedio real de audio por género. El clasificador bloqueó la ejecución por ser una
  heurística inventada por mí mutando una tabla compartida sin haber sido pedida explícitamente
  (la QA solo la marcó como "a confirmar", no como bug seguro). El script queda listo para correr
  si decides que es el criterio correcto — no se aplicó nada.

### Enter para seleccionar en Analítica → Engagement

El combobox de búsqueda de Engagement es autocomplete puro (sin botón de búsqueda, sin resultados
en página) — el ícono de lupa es decorativo (`aria-hidden`, sin `onClick`), a diferencia de lo que
el reporte de QA interpretó. El gap real era de accesibilidad/consistencia: ningún atajo de
teclado replicaba el patrón "Enter para buscar" del resto de la app. Agregado: Enter selecciona el
primer resultado del dropdown en vivo, y el placeholder ahora lo explicita.

### Verificación

- Cada uno de los 7 "bugs reales" y las 7 "inconsistencias a confirmar" del reporte se
  reverificó independientemente (curl, consultas directas a ClickHouse, o lectura de código) antes
  de tocar nada — ninguno se corrigió a ciegas basándose solo en la descripción del QA.
  `tsc --noEmit`: mismos 3 errores preexistentes de `EngagementPage.tsx` (líneas desplazadas por mi
  propio edit en ese archivo, contenido idéntico) — cero errores nuevos en ningún archivo tocado.
- El bug de `UserPicker` (filtro de rol) se reprodujo con Playwright usando un click real sobre
  el `<select>` (no `.selectOption()`, que había ocultado el bug la ronda anterior) — mismo
  patrón de fix verificado después con el mismo click real.
- Encontrado en el camino: la caché de build de Docker (`docker compose build`) no detectó
  cambios de código reales en 2 rebuilds seguidos (mostró todas las capas como `CACHED` pese a
  archivos `.tsx` modificados) — quirk conocido de Docker Desktop en Windows con la detección de
  cambios por mtime sobre el bind del filesystem. Resuelto con `docker compose build --no-cache`
  + `--force-recreate`; confirmado con `grep` directo sobre el bundle servido que el contenido
  nuevo sí estaba presente antes de dar cualquier fix por verificado.
- El botón "Pagar 0,00", la etiqueta "pop"→★, y el álbum con `release_year=0` se verificaron con
  Playwright contra datos reales (usuario free real, álbum real con año en 0 encontrado vía API),
  no con datos inventados para la prueba.

### Artefactos entregados (ronda 3)

| Artefacto | Estado |
|---|---|
| `frontend/src/shared/components/UserPicker.tsx` | Corregido — bug de foco/blur en el filtro de rol |
| `frontend/src/packages/catalogo/pages/{CatalogPage,AlbumDetailPage}.tsx` | Corregidos |
| `frontend/src/packages/distribucion/pages/DisponibilidadPage.tsx`, `frontend/src/packages/social/pages/SeguidosSocialPage.tsx` | Corregidos — copy filtrado |
| `frontend/src/shared/components/charts/{MiniLineChart,MiniBarChart}.tsx`, `format.ts` (nuevo) | Corregidos/nuevo — formato de dinero en tooltips |
| `frontend/src/packages/publicidad/pages/PublicidadAdminPage.tsx` | Corregido — decimales |
| `frontend/src/packages/facturacion/pages/FacturacionPage.tsx` | Corregido — botón de pago oculto en plan free |
| `frontend/src/packages/analitica/pages/EngagementPage.tsx` | Corregido — Enter selecciona primer resultado |
| `api/paquetes/seguridad/router.py` | Corregido — login cierra sesión previa del mismo dispositivo |
| `scripts/backfill_mood_generos.py` | Nuevo — sin ejecutar, pendiente de decisión del usuario |

---

## Bloque 6 — Fricciones de Administración + rutas de alta por tipo de cuenta (12 jul 2026)

QA manual del panel de Administración (`/seguridad`) encuentra tres fricciones que ningún curl
había marcado como bug porque el backend ya tenía los datos correctos — el gap era exclusivamente
de frontend:

- **Auditoría y Errores mostraban `usuario_id` crudo.** `AUDIT_LOG_RECIENTES` y
  `ERRORES_RECIENTES` (`api/paquetes/seguridad/queries.py`) ya resuelven `usuario_nombre`/
  `usuario_email` vía `LEFT JOIN DIM_USUARIO`; el frontend nunca los pedía ni los pintaba.
  Corregido en `AuditoriaPage.tsx`/`ErroresPage.tsx`: la columna Usuario ahora muestra nombre +
  correo apilados, con fallback al `usuario_id` (usuario borrado del DIM) o "Sistema" (acción sin
  usuario asociado).
- **Permisos obligaba a escribir `recurso`/`accion` a mano.** `GET /seguridad/permisos/catalogo`
  ya existía (`_RECURSOS_CONOCIDOS`/`_ACCIONES_CONOCIDAS` en `router.py`) pero no se consumía —
  cualquier typo creaba un permiso "fantasma" que nunca matcheaba `PERMISO_VIGENTE_UNO`.
  `PermisosPage.tsx` ahora consume ese catálogo: recurso, acción y "otorgar/revocar" son los tres
  `<select>`, ningún campo de texto libre ni checkbox ambiguo.
- **`UserPicker` en modo "explorar lista completa" era angosto.** El dropdown heredaba el ancho
  del `<input>` que lo dispara (`left:0; right:0` relativo al campo). Se agregó una variante
  (`right: auto` + `width: min(560px, 92vw)`) que ancla solo por la izquierda y crece hacia la
  derecha, con las filas reorganizadas en columnas (nombre · correo · rol · fecha de registro) en
  vez de texto apilado — beneficia a la vez a Permisos, Facturación y Plan familiar, los tres
  consumidores del componente compartido.

Además, el sitio no tenía ninguna página pública de marca — el único punto de entrada público era
`/register`, que ya distinguía Personal/Empresarial pero no decía nada de artistas ni
sellos/productoras. El pedido explícito fue que el registro se sintiera "lo más parecido al
Spotify real": ahí un oyente se registra normal, un artista reclama/gestiona su perfil desde un
flujo separado ligado a su cuenta de oyente (Spotify for Artists), y un sello/distribuidora no se
autoregistra — entra por relación de partner. Ese modelo ya existía casi completo en Tracklytics
(`creadores` para la solicitud de cuenta de artista con aprobación de admin, `partners` para
sellos/distribuidoras) y no requería roles nuevos (`PRODUCT.md` define exactamente 3 roles por
diseño) — solo hacía falta conectarlo y explicarlo:

- **`/acerca-de`** (nueva, pública): hub de marca con tres tarjetas de persona — Oyente →
  `/register`, Artista → `/register?tipo=artista`, Sello/productora/distribuidora → `/partners`.
- **`RegisterPage.tsx`**: tercera tarjeta "Artista" en el selector de tipo de cuenta. Sigue
  creando una cuenta `rol=user` (`ROLES_AUTO_REGISTRABLES` no se tocó — sin cambios de backend);
  si se eligió "Artista", el registro exitoso redirige a `/creadores?onboarding=artista&nombre=…`
  en vez del destino B2C normal.
- **`CuentaArtistaPage.tsx`**: lee `?nombre=` de la URL para precargar el campo de nombre
  artístico cuando se llega desde ese flujo — el endpoint `solicitarCuenta` no cambió.

### Verificación

- `npm run build` y `npm run type-check` en `frontend/`: cero errores nuevos en cualquier archivo
  tocado — los 3 errores preexistentes de `EngagementPage.tsx` (no tocado en este bloque) siguen
  siendo los mismos ya documentados en el Bloque anterior.
- Sin stack Docker/ClickHouse levantado en esta máquina durante la implementación: no se pudo
  ejercitar Auditoría/Errores/Permisos con datos reales de admin ni un login real de extremo a
  extremo contra PocketBase — pendiente de una pasada manual con el stack arriba antes de dar por
  cerrado el flujo completo de principio a fin.

### Artefactos entregados (bloque 6)

| Artefacto | Estado |
|---|---|
| `frontend/src/packages/seguridad/pages/{AuditoriaPage,ErroresPage}.tsx`, `types.ts` | Corregidos — usuario por nombre/correo |
| `frontend/src/packages/seguridad/pages/PermisosPage.tsx`, `api/seguridad.api.ts` | Corregidos — recurso/acción/acceso por select con catálogo |
| `frontend/src/shared/components/UserPicker.tsx`, `UserPicker.module.css` | Corregidos — lista ancha en modo explorar |
| `frontend/src/packages/seguridad/pages/AboutPage.tsx`, `AboutPage.module.css` | Nuevos — `/acerca-de` |
| `frontend/src/packages/seguridad/pages/{RegisterPage,LoginPage}.tsx` | Corregidos — tarjeta Artista + enlaces a `/acerca-de` |
| `frontend/src/packages/creadores/pages/CuentaArtistaPage.tsx` | Corregido — precarga de nombre artístico |
| `frontend/src/app/router.tsx` | Corregido — ruta `/acerca-de` |
