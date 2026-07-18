## 1. Datos (ClickHouse `tracklytics`, PocketBase)

- [ ] 1.1 `ALTER TABLE DIM_CAMPANA_PUBLICITARIA ADD COLUMN IF NOT EXISTS formato String DEFAULT 'display'` + backfill desde `tipo_anuncio`
- [ ] 1.2 `ALTER TABLE DIM_CAMPANA_PUBLICITARIA ADD COLUMN IF NOT EXISTS estado_manual String DEFAULT ''`
- [ ] 1.3 `ALTER TABLE FACT_TRACKS ADD COLUMN IF NOT EXISTS disponible UInt8 DEFAULT 1`
- [ ] 1.4 `CREATE TABLE IF NOT EXISTS FACT_DENUNCIA` (ReplacingMergeTree ORDER BY denuncia_id)
- [ ] 1.5 Colección PocketBase `partners`: campos `api_key_hash`, `tier`, `email_contacto`, `estado` (via `pb_init` o alta idempotente)
- [ ] 1.6 `docker compose up` deja todo creado sin pasos manuales

## 2. Publicidad — ciclo de vida de campañas y anunciantes

- [ ] 2.1 `PUT /admin/campanas/{campana_id}` — editar nombre, presupuesto, fechas, formato
- [ ] 2.2 `POST /admin/campanas/{campana_id}/pausar` — `estado_manual='pausada'`
- [ ] 2.3 `POST /admin/campanas/{campana_id}/reanudar` — `estado_manual=''` (rechaza si finalizada)
- [ ] 2.4 `POST /admin/campanas/{campana_id}/finalizar` — `estado_manual='finalizada'`
- [ ] 2.5 `PUT /admin/anunciantes/{anunciante_id}` — editar nombre/sector
- [ ] 2.6 `POST /admin/anunciantes/{anunciante_id}/desactivar`
- [ ] 2.7 Elegibilidad de servido filtra `estado_manual=''`; todo bajo `admin_finanzas`, auditado

## 3. Distribución — revocar licencia

- [ ] 3.1 `POST /licencias/{licencia_id}/revocar` — `estado='revocada'`, motivo + fecha; `admin_contenido`, auditado
- [ ] 3.2 El listado de licencias refleja el estado revocada; disponibilidad no cuenta licencias revocadas

## 4. Regalías — editar/terminar contrato + exportar

- [ ] 4.1 `PUT /admin/contratos/{contrato_id}` — `porcentaje_artista`, `porcentaje_sello`, `fecha_fin`; valida suma ≤ 100
- [ ] 4.2 `POST /admin/contratos/{contrato_id}/terminar` — `estado='terminado'`, `fecha_fin=now()` si vacía
- [ ] 4.3 `GET /admin/contratos/{contrato_id}/exportar` — JSON estructurado del resumen de liquidaciones
- [ ] 4.4 `admin_finanzas`, auditado

## 5. Catálogo — takedown

- [ ] 5.1 `POST /admin/tracks/{fact_id}/ocultar` — `disponible=0`; `admin_contenido`, auditado
- [ ] 5.2 `POST /admin/tracks/{fact_id}/restaurar` — `disponible=1`
- [ ] 5.3 Filtrar `disponible=1` en `/tracks`, `/tracks/search`, `/tracks/top`, detalle, by-artist/album/genre

## 6. Creadores — editar/retirar track del artista

- [ ] 6.1 `PUT /tracks/{subida_id}` — dueño edita nombre/album/genero/descripcion; aprobado → pendiente
- [ ] 6.2 `POST /tracks/{subida_id}/retirar` — `estado='retirado'` + `disponible=0` en FACT_TRACKS
- [ ] 6.3 `require_cuenta_artista_aprobada`, solo tracks propios

## 7. Partners — CRUD + API keys

- [ ] 7.1 `pb_client`: `crear_partner`, `listar_partners`, `rotar_api_key`, `desactivar_partner`
- [ ] 7.2 `deps.py`: hashear la llave recibida (SHA-256) y resolver por `api_key_hash`; `_is_vigente` ya cubre estado
- [ ] 7.3 `POST /admin/partners` — crea, devuelve api_key en claro una vez
- [ ] 7.4 `GET /admin/partners` — listado con tier/estado (sin hash ni llave)
- [ ] 7.5 `POST /admin/partners/{partner_id}/rotar-key` — nueva llave, devuelta una vez
- [ ] 7.6 `POST /admin/partners/{partner_id}/desactivar` — `estado='inactivo'`
- [ ] 7.7 `admin_comercial`, auditado; verificar que la llave vieja deja de funcionar

## 8. Suscripciones — administración individual

- [ ] 8.1 `GET /admin/suscripciones` — paginado, filtros estado/plan_id/fecha
- [ ] 8.2 `GET /admin/suscripciones/{suscripcion_id}` — detalle + historial de cobros
- [ ] 8.3 `POST /admin/suscripciones/{suscripcion_id}/cancelar` — con motivo (puebla FACT_CANCELACION_SUSCRIPCION)
- [ ] 8.4 `POST /admin/suscripciones/{suscripcion_id}/extender` — body `{dias, motivo}`
- [ ] 8.5 `admin_comercial`, auditado

## 9. Social — denuncias

- [ ] 9.1 `POST /denuncias` — usuario denuncia comentario/track; `require_b2c_user`
- [ ] 9.2 `GET /admin/denuncias` — bandeja paginada con filtros; `admin_comunidad`
- [ ] 9.3 `PUT /admin/denuncias/{denuncia_id}` — estado revisada/resuelta; `admin_comunidad`, auditado

## 10. Finanzas — reporte consolidado

- [ ] 10.1 `GET /admin/reporte` — ingresos, gastos, regalías, publicidad por período; `admin_finanzas`

## 11. Frontend (sistema de diseño Impeccable)

- [ ] 11.1 Publicidad: Pausar/Reanudar/Finalizar en `AdminCampanasPage`, modal editar, Desactivar en `AdminAnunciantesPage`
- [ ] 11.2 Distribución: botón Revocar en listado de licencias
- [ ] 11.3 Regalías: editar contrato + botón Terminar en el detalle
- [ ] 11.4 Catálogo: `AdminTracksPage` con búsqueda + Ocultar/Restaurar
- [ ] 11.5 Creadores: Editar (modal) + Retirar por track propio
- [ ] 11.6 Partners: `AdminPartnersPage` (CRUD + Rotar Key)
- [ ] 11.7 Suscripciones: `AdminSuscripcionesPage` (listado, filtros, Cancelar/Extender)
- [ ] 11.8 Social: botón Denunciar en comentario/track + pestaña de denuncias admin
- [ ] 11.9 `npm run build` verde

## 12. Verificación (curl real)

- [ ] 12.1 Campaña: crear → pausar → reanudar → finalizar (estado en cada paso)
- [ ] 12.2 Licencia: crear → revocar → no aparece activa
- [ ] 12.3 Contrato: crear → editar % → terminar
- [ ] 12.4 Track catálogo: ocultar → no aparece en búsqueda → restaurar
- [ ] 12.5 Artista: editar propio → vuelve a pendiente → retirar → `disponible=0`
- [ ] 12.6 Partner: crear → key → rotar → desactivar → key vieja no funciona
- [ ] 12.7 Suscripciones: listar → extender → cancelar
- [ ] 12.8 Usuario denuncia comentario → admin lista → marca revisada

## 13. Documentación

- [ ] 13.1 `docs/BITACORA_S11_P1.md`: tablas/columnas, endpoints por capability, decisiones, portadas, archivos frontend
