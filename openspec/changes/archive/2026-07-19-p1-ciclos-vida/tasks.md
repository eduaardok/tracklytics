## 1. Datos (ClickHouse `tracklytics`, PocketBase)

- [x] 1.1 `ALTER TABLE DIM_CAMPANA_PUBLICITARIA ADD COLUMN IF NOT EXISTS formato String DEFAULT 'display'` + backfill desde `tipo_anuncio`
- [x] 1.2 `ALTER TABLE DIM_CAMPANA_PUBLICITARIA ADD COLUMN IF NOT EXISTS estado_manual String DEFAULT ''`
- [x] 1.3 `ALTER TABLE FACT_TRACKS ADD COLUMN IF NOT EXISTS disponible UInt8 DEFAULT 1`
- [x] 1.4 `CREATE TABLE IF NOT EXISTS FACT_DENUNCIA` (ReplacingMergeTree ORDER BY denuncia_id)
- [x] 1.5 Colección PocketBase `partners`: campos `api_key_hash`, `tier`, `email_contacto`, `estado` (via `pb_init` o alta idempotente)
- [x] 1.6 `docker compose up` deja todo creado sin pasos manuales

## 2. Publicidad — ciclo de vida de campañas y anunciantes

- [x] 2.1 `PUT /admin/campanas/{campana_id}` — editar nombre, presupuesto, fechas, formato
- [x] 2.2 `POST /admin/campanas/{campana_id}/pausar` — `estado_manual='pausada'`
- [x] 2.3 `POST /admin/campanas/{campana_id}/reanudar` — `estado_manual=''` (rechaza si finalizada)
- [x] 2.4 `POST /admin/campanas/{campana_id}/finalizar` — `estado_manual='finalizada'`
- [x] 2.5 `PUT /admin/anunciantes/{anunciante_id}` — editar nombre/sector
- [x] 2.6 `POST /admin/anunciantes/{anunciante_id}/desactivar`
- [x] 2.7 Elegibilidad de servido filtra `estado_manual=''`; todo bajo `admin_finanzas`, auditado

## 3. Distribución — revocar licencia

- [x] 3.1 `POST /licencias/{licencia_id}/revocar` — `estado='revocada'`, motivo + fecha; `admin_contenido`, auditado
- [x] 3.2 El listado de licencias refleja el estado revocada; disponibilidad no cuenta licencias revocadas

## 4. Regalías — editar/terminar contrato + exportar

- [x] 4.1 `PUT /admin/contratos/{contrato_id}` — `porcentaje_artista`, `porcentaje_sello`, `fecha_fin`; valida suma ≤ 100
- [x] 4.2 `POST /admin/contratos/{contrato_id}/terminar` — `estado='terminado'`, `fecha_fin=now()` si vacía
- [x] 4.3 `GET /admin/contratos/{contrato_id}/exportar` — JSON estructurado del resumen de liquidaciones
- [x] 4.4 `admin_finanzas`, auditado

## 5. Catálogo — takedown

- [x] 5.1 `POST /admin/tracks/{fact_id}/ocultar` — `disponible=0`; `admin_contenido`, auditado
- [x] 5.2 `POST /admin/tracks/{fact_id}/restaurar` — `disponible=1`
- [x] 5.3 Filtrar `disponible=1` en `/tracks`, `/tracks/search`, `/tracks/top`, detalle, by-artist/album/genre

## 6. Creadores — editar/retirar track del artista

- [x] 6.1 `PUT /tracks/{subida_id}` — dueño edita nombre/album/genero/descripcion; aprobado → pendiente
- [x] 6.2 `POST /tracks/{subida_id}/retirar` — `estado='retirado'` + `disponible=0` en FACT_TRACKS
- [x] 6.3 `require_cuenta_artista_aprobada`, solo tracks propios

## 7. Partners — CRUD + API keys

- [x] 7.1 `pb_client`: `crear_partner`, `listar_partners`, `rotar_api_key`, `desactivar_partner`
- [x] 7.2 `deps.py`: hashear la llave recibida (SHA-256) y resolver por `api_key_hash`; `_is_vigente` ya cubre estado
- [x] 7.3 `POST /admin/partners` — crea, devuelve api_key en claro una vez
- [x] 7.4 `GET /admin/partners` — listado con tier/estado (sin hash ni llave)
- [x] 7.5 `POST /admin/partners/{partner_id}/rotar-key` — nueva llave, devuelta una vez
- [x] 7.6 `POST /admin/partners/{partner_id}/desactivar` — `estado='inactivo'`
- [x] 7.7 `admin_comercial`, auditado; verificar que la llave vieja deja de funcionar

## 8. Suscripciones — administración individual

- [x] 8.1 `GET /admin/suscripciones` — paginado, filtros estado/plan_id/fecha
- [x] 8.2 `GET /admin/suscripciones/{suscripcion_id}` — detalle + historial de cobros
- [x] 8.3 `POST /admin/suscripciones/{suscripcion_id}/cancelar` — con motivo (puebla FACT_CANCELACION_SUSCRIPCION)
- [x] 8.4 `POST /admin/suscripciones/{suscripcion_id}/extender` — body `{dias, motivo}`
- [x] 8.5 `admin_comercial`, auditado

## 9. Social — denuncias

- [x] 9.1 `POST /denuncias` — usuario denuncia comentario/track; `require_b2c_user`
- [x] 9.2 `GET /admin/denuncias` — bandeja paginada con filtros; `admin_comunidad`
- [x] 9.3 `PUT /admin/denuncias/{denuncia_id}` — estado revisada/resuelta; `admin_comunidad`, auditado

## 10. Finanzas — reporte consolidado

- [x] 10.1 `GET /admin/reporte` — ingresos, gastos, regalías, publicidad por período; `admin_finanzas`

## 11. Frontend (sistema de diseño Impeccable)

- [x] 11.1 Publicidad: Pausar/Reanudar/Finalizar en `AdminCampanasPage`, modal editar, Desactivar en `AdminAnunciantesPage`
- [x] 11.2 Distribución: botón Revocar en listado de licencias
- [x] 11.3 Regalías: editar contrato + botón Terminar en el detalle
- [x] 11.4 Catálogo: `AdminTracksPage` con búsqueda + Ocultar/Restaurar
- [x] 11.5 Creadores: Editar (modal) + Retirar por track propio
- [x] 11.6 Partners: `AdminPartnersPage` (CRUD + Rotar Key)
- [x] 11.7 Suscripciones: `AdminSuscripcionesPage` (listado, filtros, Cancelar/Extender)
- [x] 11.8 Social: botón Denunciar en comentario/track + pestaña de denuncias admin
- [x] 11.9 `npm run build` verde

## 12. Verificación (curl real)

- [x] 12.1 Campaña: crear → pausar → reanudar → finalizar (estado en cada paso)
- [x] 12.2 Licencia: crear → revocar → no aparece activa
- [x] 12.3 Contrato: crear → editar % → terminar
- [x] 12.4 Track catálogo: ocultar → no aparece en búsqueda → restaurar
- [x] 12.5 Artista: editar propio → vuelve a pendiente → retirar → `disponible=0`
- [x] 12.6 Partner: crear → key → rotar → desactivar → key vieja no funciona
- [x] 12.7 Suscripciones: listar → extender → cancelar
- [x] 12.8 Usuario denuncia comentario → admin lista → marca revisada

## 13. Documentación

- [x] 13.1 `docs/BITACORA_S11_P1.md`: tablas/columnas, endpoints por capability, decisiones, portadas, archivos frontend
