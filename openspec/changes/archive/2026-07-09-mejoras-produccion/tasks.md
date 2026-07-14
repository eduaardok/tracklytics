## 1. Fix crítico — integridad de `fact_id` en el ETL

- [x] 1.1 `etl/gold/loader.py`: calcular `next_id` como `MAX(fact_id) FROM FACT_TRACKS` (o `n_real` si la tabla está vacía) en vez de `n_real + 1` fijo, antes de `xcom_push(key="next_id", ...)`.
- [x] 1.2 Verificar con dos corridas forzadas consecutivas de la misma semana contra Airflow real: confirmar `SELECT fact_id, count() FROM FACT_TRACKS GROUP BY fact_id HAVING count() > 1` devuelve 0 filas después de ambas.

## 2. Fix de 5 pantallas de analítica rotas (CU-O07/08/09/10)

- [x] 2.1 Montar `GET /genres/trends`, `GET /genres/{genre_id}/audio-profile`, `GET /trends/weekly`, `GET /artists/search`, `GET /artists/{artist_id}/stats` en `api/paquetes/analitica/router.py`, reusando las queries ya existentes (`GENRES_TRENDS`, `GENRE_AUDIO_PROFILE`, `TRENDS_WEEKLY`, `ARTISTS_SEARCH`, `ARTIST_STATS`) en `queries.py`.
- [x] 2.2 Verificar con curl los 5 endpoints contra la API viva.

## 3. Fix bug `id=0` en CRUD de dimensiones (CU-O15, `ingesta`)

- [x] 3.1 `api/paquetes/gestion_datos/router.py` — `dim_create` calcula `MAX(pk) + 1` antes del insert si el caller no especifica el PK.
- [x] 3.2 Verificar: crear dos registros nuevos, confirmar ids distintos y secuenciales; eliminar cada uno por su id real sin afectar al otro.

## 4. CU-O58 — audio real

- [x] 4.1 Nuevo `app/js/ytplayer.js`: wrapper de la YouTube IFrame Player API, búsqueda por `listType: 'search'` con "{artista} {track} audio", manejo de `onError`.
- [x] 4.2 `app/js/components.js`: conectar `playTrack`/`togglePlay`/volumen al nuevo módulo; en error, toast "vista previa no disponible" y la barra de progreso queda solo como indicador visual.

## 5. Suscripción con pago integrado

- [x] 5.1 `api/paquetes/facturacion/router.py`: extraer `procesar_pago(usuario_id, metodo_pago_id, suscripcion, forzar_resultado)` reusable; agregar `metodo_pago_existe()` con validación de formato UUID (evita 500 en vez de 404 ante un id inválido).
- [x] 5.2 `api/paquetes/suscripciones/router.py`: `confirmar_suscripcion` exige `metodo_pago_id` real (`DIM_METODO_PAGO`) para planes de pago y encadena `procesar_pago` en la misma request.
- [x] 5.3 `app/js/api.js`: agregar export `Facturacion` (faltaba por completo).
- [x] 5.4 `app/autenticacion/planes.html`: reemplazar el input de texto libre por selección de método existente o alta inline dentro del mismo modal.
- [x] 5.5 Verificar con curl: sin método (422), método inválido (404 limpio), método real (201 + cobro automático + invoice).

## 6. Feedback visual (toasts)

- [x] 6.1 `app/js/favorites.js`, `app/js/playlists.js`: toast de éxito/error en cada mutación (antes silenciosas).
- [x] 6.2 `app/autenticacion/planes.html`: toast al confirmar/cancelar suscripción (antes solo texto inline o `alert()`).

## 7. Panel de administración "Permisos" + Auditoría (CU-O17/18/19)

- [x] 7.1 `api/paquetes/seguridad/queries.py` / `router.py`: `usuarios/buscar` sin `q` lista todos los usuarios paginados (antes devolvía `[]`); `GET /permisos/catalogo` (recursos/acciones conocidos); `AUDIT_LOG_RECIENTES`/`ERRORES_RECIENTES`/`PERMISOS_VIGENTES` unen nombre/email de `DIM_USUARIO`.
- [x] 7.2 Nueva `app/analytics/permisos.html`: tabla de usuarios + panel de permisos por usuario seleccionado, reusando el esqueleto de `crud.html`.
- [x] 7.3 Nueva `app/analytics/auditoria.html`: tabs de auditoría/errores con nombre de usuario.
- [x] 7.4 Agregar ambas al nav de `ANALYTICS_SUBS` en `app/js/components.js`.

## 8. Facturas profesionales

- [x] 8.1 `api/paquetes/facturacion/queries.py`/`router.py`: `GET /invoices/{invoice_id}` con JOIN a usuario y método de pago, resolución de nombre de plan por monto.
- [x] 8.2 Nueva `app/facturacion/invoice.html`: vista imprimible con logo, desglose de IVA, `window.print()`.
- [x] 8.3 `app/autenticacion/profile.html`: sección "Mis facturas" enlazando a la vista imprimible.

## 9. País real + perfil self-service

- [x] 9.1 `api/paquetes/distribucion/router.py`: `GET /paises/publico` (sin auth).
- [x] 9.2 `api/paquetes/seguridad/pb_client.py`/`router.py`: `PATCH /perfil` self-service (nombre + país), persistido en PocketBase y ClickHouse.
- [x] 9.3 `app/autenticacion/register.html`: `<select>` de país poblado desde el endpoint público, value = `codigo_iso`.
- [x] 9.4 `app/autenticacion/profile.html`: edición de perfil ahora persiste de verdad (antes solo `localStorage`) e incluye país.
- [x] 9.5 Verificar con curl: país inválido → fail-open documentado; país válido asignado vía perfil → `disponibilidad` respeta la restricción geográfica real.

## 10. Plan familiar en autoservicio (CU-O51/52/53)

- [x] 10.1 `api/paquetes/experiencia/queries.py`/`router.py`: `POST /familia`, `GET /familia`, `POST /familia/miembros`, `DELETE /familia/miembros/{usuario_id}` (self-service, junto a los endpoints admin existentes que se conservan).
- [x] 10.2 `app/autenticacion/profile.html`: sección "Plan familiar" visible solo con plan Premium activo.
- [x] 10.3 Verificar con curl: crear plan, agregar miembro por correo, titular no puede quitarse a sí mismo, quitar miembro.

## 11. Validación final

- [x] 11.1 Regresión con curl sobre endpoints no tocados (favoritos, planes, dashboard, países admin, creadores, tickets) — 0 roturas.
- [ ] 11.2 Recorrido manual en navegador de las pantallas nuevas/tocadas (no se pudo automatizar en este entorno: extensión de Chrome no disponible) — pendiente de que el usuario lo confirme visualmente.
