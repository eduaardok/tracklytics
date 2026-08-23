## Tasks

- [x] `social`: tabla `DIM_PREFERENCIA_NOTIFICACION` (opt-out, ausencia de fila = activo);
      `GET/PUT /social/notificaciones/preferencias[/{tipo}]`; `notificaciones.crear()` y
      `crear_para_seguidores_de_artista()` filtran antes de insertar (batch).
- [x] `social` (frontend): toggle de preferencias en `NotificationBell`.
- [x] `seguridad`: `api/core/email.py` (SMTP real, nunca lanza), `/auth/registro` y
      `/auth/reenviar-verificacion` envían el correo real además de devolver el token.
- [x] Infraestructura: servicio `mailpit` en `docker-compose.yml`, env SMTP en `api`.
- [x] `suscripciones`: tabla `SOLICITUD_VERIFICACION_ESTUDIANTE`; `POST
      /suscripciones/estudiante/comprobante` (multipart, valida dominio/extensión/tamaño);
      `GET .../mi-solicitud`; `GET/PATCH /suscripciones/admin/estudiante/solicitudes[...]`
      (`admin_comercial`).
- [x] `suscripciones` (frontend): `apiClient.postForm()`; `PlanesPage` sube el archivo real
      antes de confirmar; sección de revisión en `AdminSuscripcionesPage`.
- [x] `experiencia`: `shuffleQueue()` en `PlayerContext` (Fisher-Yates + declumping de artista
      adyacente); botón "Mezclar" en `QueuePanel`.
- [x] Verificación real (curl, sin Playwright por indicación explícita): registro → email real
      en Mailpit; preferencias por defecto activas → opt-out → reflejado; subida de
      comprobante → archivo real en disco → admin lista/aprueba.
- [x] `python -m py_compile` limpio en los archivos backend tocados.
- [x] `npx tsc --noEmit` y `npm run build` limpios.
- [x] DDL aplicado en vivo contra ClickHouse (`init_clickhouse.py`, `DESCRIBE TABLE` confirma
      las 2 tablas nuevas).
