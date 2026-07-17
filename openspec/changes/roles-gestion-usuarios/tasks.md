## 1. Datos (ClickHouse `tracklytics`)

- [ ] 1.1 En `init_clickhouse.py`, crear `DIM_ROL_ADMINISTRATIVO` (ReplacingMergeTree ORDER BY rol_admin) con `CREATE TABLE IF NOT EXISTS`
- [ ] 1.2 Crear `BRIDGE_USUARIO_ROL_ADMIN` (ReplacingMergeTree ORDER BY (usuario_id, rol_admin)) con columnas usuario_id, rol_admin, asignado_por, fecha, y un flag para revocación lógica (`activo`/`revocado`)
- [ ] 1.3 Crear `FACT_TOKEN_RECUPERACION` (ReplacingMergeTree ORDER BY token) con token, usuario_id, expira_en, usado, created_at
- [ ] 1.4 `ALTER TABLE DIM_USUARIO ADD COLUMN IF NOT EXISTS estado_cuenta String DEFAULT 'activa'`
- [ ] 1.5 Sembrar los 6 roles en `DIM_ROL_ADMINISTRATIVO` (superadmin, admin_finanzas, admin_contenido, admin_comunidad, admin_datos, admin_comercial) con nombre_display, descripcion y capabilities
- [ ] 1.6 Verificar que `docker compose up` deja las tablas creadas y sembradas sin pasos manuales

## 2. Autorización por rol administrativo (capability `seguridad`)

- [ ] 2.1 En `paquetes/seguridad/queries.py`, añadir la query de roles admin vigentes por usuario (argMax sobre BRIDGE_USUARIO_ROL_ADMIN) y la de catálogo de roles
- [ ] 2.2 En `paquetes/seguridad/deps.py`, implementar `roles_admin_vigentes(usuario_id)` con caché TTL corto
- [ ] 2.3 Implementar `require_rol_admin(*roles_permitidos)`: superadmin siempre pasa; resto se verifica por intersección con los roles del usuario
- [ ] 2.4 Conservar `require_admin` como alias delgado de `require_rol_admin("superadmin")` (backward compatible con imports existentes)
- [ ] 2.5 Auto-backfill: al resolver un usuario con `role == "admin"` sin `superadmin` en BRIDGE, insertar la fila (patrón best-effort, sin bloquear el request)

## 3. Estado de cuenta en autenticación (`core/deps.py`)

- [ ] 3.1 Añadir resolución del `estado_cuenta` vigente del usuario (caché TTL corto)
- [ ] 3.2 En `get_current_user`, rechazar con 403 si `estado_cuenta` es `suspendido` o `eliminado`, con token de PocketBase aún válido

## 4. Migración de endpoints `/admin/*` a rol específico

- [ ] 4.1 `creadores` (admin/cuentas, admin/tracks, admin/dashboard) → `require_rol_admin("admin_contenido")`
- [ ] 4.2 `distribucion` (admin/paises, admin/dashboard, sellos, licencias, restricciones, solicitudes-licencia) → `require_rol_admin("admin_contenido")`
- [ ] 4.3 `social` (admin/comentarios, admin/dashboard) → `require_rol_admin("admin_comunidad")`
- [ ] 4.4 `experiencia` (familia titular/{id}, admin/dashboard, tickets PUT) → `require_rol_admin("admin_comunidad")`
- [ ] 4.5 `facturacion` (admin/dashboard, empresa PUT) → `require_rol_admin("admin_finanzas")`
- [ ] 4.6 `finanzas` (todos, hoy require_staff) → `require_rol_admin("admin_finanzas")`
- [ ] 4.7 `regalias` (admin/productores, contratos, liquidar, cuentas-sello, retiros) → `require_rol_admin("admin_finanzas")`
- [ ] 4.8 `publicidad` (admin/anunciantes, campanas, ingresos) → `require_rol_admin("admin_finanzas")`
- [ ] 4.9 `suscripciones` (admin/planes, admin/planes/{id}/precio) → `require_rol_admin("admin_comercial")`
- [ ] 4.10 `gestion_datos` (router completo) → reemplazar `require_lead_data_engineer` por `require_rol_admin("admin_datos")`
- [ ] 4.11 `partners` (v1_router admin: metricas) → `require_rol_admin("admin_comercial")`
- [ ] 4.12 `simulacion` (generar-actividad) → `require_rol_admin("superadmin")`
- [ ] 4.13 `seguridad` (admin/dashboard, permisos/*, auditoria, errores) → `require_rol_admin("superadmin")`
- [ ] 4.14 No tocar `analitica` (require_staff son dashboards para analyst+admin, no `/admin/*`) ni las dependencias de producto (require_b2c_user, require_b2b_panel_access, require_partner, require_cuenta_artista_aprobada, require_cuenta_sello, require_suscripcion_activa)

## 5. Panel de gestión de usuarios (`seguridad`)

- [ ] 5.1 `GET /admin/usuarios` — listado paginado con filtros (rol, estado_cuenta, rango fecha_registro), ordenado por fecha desc; evoluciona el buscador existente
- [ ] 5.2 `GET /admin/usuarios/{usuario_id}` — vista 360°: perfil + rol PocketBase + roles admin + suscripción activa + transacciones recientes + sesiones activas + permisos vigentes + último login
- [ ] 5.3 `POST /admin/usuarios/{usuario_id}/rol-admin` — asignar rol admin (valida contra DIM_ROL_ADMINISTRATIVO, inserta en BRIDGE, audita)
- [ ] 5.4 `DELETE /admin/usuarios/{usuario_id}/rol-admin/{rol_admin}` — revocar rol admin (borrado lógico, audita)
- [ ] 5.5 `POST /admin/usuarios/{usuario_id}/suspender` — estado_cuenta='suspendido' en DIM_USUARIO, audita
- [ ] 5.6 `POST /admin/usuarios/{usuario_id}/reactivar` — estado_cuenta='activa', audita
- [ ] 5.7 Todos bajo `require_rol_admin("superadmin")`

## 6. Lockout, recuperación de contraseña y baja de cuenta

- [ ] 6.1 En `POST /auth/login`: registrar intentos fallidos en FACT_AUDIT_LOG (accion='login_fallido')
- [ ] 6.2 Antes de autenticar: contar login_fallido del email en últimos 15 min; ≥5 → 429 con mensaje de bloqueo temporal
- [ ] 6.3 `POST /auth/recuperar` — valida existencia del email (sin revelarla), genera token UUID en FACT_TOKEN_RECUPERACION, responde genérico
- [ ] 6.4 `POST /auth/restablecer` — valida token no vencido/no usado, cambia contraseña vía PocketBase admin, marca token usado
- [ ] 6.5 `POST /perfil/baja` — estado_cuenta='eliminado', cierra FACT_SESION abiertas, cancela suscripción activa; no borra datos históricos

## 7. Frontend (sistema de diseño Impeccable)

- [ ] 7.1 `UsuariosAdminPage.tsx` en `frontend/src/packages/seguridad/pages/` con `.module.css`: listado con filtros, vista 360° (drawer/detalle), asignar/revocar rol admin, suspender/reactivar
- [ ] 7.2 Ruta `/seguridad/usuarios` y entrada en la navegación de `SeguridadShell`
- [ ] 7.3 Enlace "¿Olvidaste tu contraseña?" en `LoginPage.tsx` + formulario de recuperar/restablecer
- [ ] 7.4 Botón de baja de cuenta en `ProfilePage.tsx` con confirmación doble ("acción irreversible")
- [ ] 7.5 `npm run build` verde

## 8. Verificación (curl real, ClickHouse `tracklytics`)

- [ ] 8.1 Login `admin` → superadmin auto-asignado → accede a todas las áreas
- [ ] 8.2 Usuario `admin_finanzas` → accede a `/finanzas/*` y `/regalias/admin/*`; rechazado 403 en `/seguridad/admin/*` y `/creadores/admin/*`
- [ ] 8.3 Suspender un usuario → su siguiente request/login falla con 403
- [ ] 8.4 5 logins fallidos → 6º rechazado con 429
- [ ] 8.5 Recuperar → token generado → restablecer → login con nueva contraseña
- [ ] 8.6 Baja → login posterior falla con 403
- [ ] 8.7 Verificar `docker compose up` limpio

## 9. Documentación

- [ ] 9.1 Crear `docs/BITACORA_S11_P0.md` (o anexar a BITACORA_S11.md): decisiones de arquitectura, tablas, endpoints, docs eliminados, cambios README
- [ ] 9.2 `git rm` de docs obsoletos (decisiones-refactorizacion, ARQUITECTURA_S2, TRACKLYTICS_PLAN_S2, PLAN_MEJORAS_FRONTEND_P2, EMPRESA_TRACKLYTICS)
- [ ] 9.3 Reescribir `docs/PENDIENTES.md` reflejando estado post-S11
- [ ] 9.4 README: eliminar 7 refs a decisiones-refactorizacion, actualizar conteo de tablas (+3), sección Auth (roles admin), tree de docs y nueva página
- [ ] 9.5 Eliminar referencia a decisiones-refactorizacion en encabezados de `docs/negocio/social.md` y `distribucion.md`
