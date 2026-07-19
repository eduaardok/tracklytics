## Context

La autorización administrativa de Tracklytics vive en un único dependency `require_admin` (`api/paquetes/seguridad/deps.py`) que solo comprueba `role == "admin"`. La mayoría de capabilities (`regalias`, `creadores`, `facturacion`, `finanzas`, `experiencia`, …) **importan y reexportan** ese mismo `require_admin` en su `deps.py` en vez de duplicarlo, y sus routers lo aplican con `Depends(require_admin)`. Casos especiales: `analitica` define `require_staff` (funcionalmente idéntico: `role in {admin}` para lo administrativo), `gestion_datos` define `require_lead_data_engineer`, y `partners` define `require_partner_admin`.

Esta centralización es la palanca de este cambio: al introducir `require_rol_admin(*roles)` en el mismo módulo `seguridad`, la migración de cada capability se reduce a cambiar la dependencia que aplica su router, sin reescribir lógica de negocio.

La identidad ya se refleja en `DIM_USUARIO` (backfill best-effort en login, patrón existente), y toda acción sensible se audita vía `paquetes.seguridad.audit.record`. El proyecto usa ClickHouse (`tracklytics`) como único almacén analítico y PocketBase como único almacén de credenciales.

## Goals / Non-Goals

**Goals:**
- Segmentar la autorización administrativa por área de negocio sin romper el acceso de las cuentas `admin` actuales.
- Concentrar la nueva lógica de roles en la capability `seguridad`; el resto de capabilities solo cambian qué dependency aplican.
- Añadir gestión de usuarios (vista 360°, roles admin, suspender/reactivar), lockout, recuperación de contraseña y baja de cuenta como extensiones de `seguridad`.
- Mantener el sistema arrancando limpio con `docker compose up`.

**Non-Goals:**
- No se toca PocketBase: sigue con `user`/`analyst`/`admin`; los roles administrativos viven en ClickHouse.
- No se reemplaza el sistema de permisos granular `require_permiso` (recurso/acción): convive con `require_rol_admin`.
- No se tocan las dependencias de autorización de producto (`require_b2c_user`, `require_b2b_panel_access`, `require_partner`, `require_cuenta_artista_aprobada`, `require_cuenta_sello`, `require_suscripcion_activa`).
- No se crea ninguna capability nueva; no se implementa export GDPR ni verificación de email (P2).

## Decisions

### 1. `require_rol_admin(*roles)` reemplaza a `require_admin` en los routers de área
Nuevo dependency en `paquetes/seguridad/deps.py`:
```python
def require_rol_admin(*roles_permitidos: str):
    def _dep(user = Depends(get_current_user)) -> dict:
        roles_usuario = roles_admin_vigentes(user["record"]["id"])  # de BRIDGE_USUARIO_ROL_ADMIN
        if "superadmin" in roles_usuario:                            # superadmin siempre pasa
            return user
        if not (set(roles_permitidos) & roles_usuario):
            raise HTTPException(403, "Requiere un rol administrativo distinto")
        return user
    return _dep
```
**Backward compatibility:** `require_admin` **se conserva** como alias delgado (`require_rol_admin("superadmin")`) para no romper imports existentes; los routers se migran progresivamente a la variante específica. Alternativa descartada: borrar `require_admin` y forzar la migración de golpe — más frágil y con mayor superficie de regresión.

### 2. `admin` de PocketBase → `superadmin` por auto-backfill en login
En `get_current_user` (o en el flujo de login), cuando `role == "admin"` y el usuario no tiene `superadmin` en `BRIDGE_USUARIO_ROL_ADMIN`, se inserta la fila. Mismo patrón best-effort que el backfill de `DIM_USUARIO`. Así ningún administrador existente pierde acceso y no hace falta migración manual. Alternativa descartada: script de migración único — no cubre cuentas admin creadas después.

### 3. `roles_admin_vigentes` con `argMax` sobre `ReplacingMergeTree`
`BRIDGE_USUARIO_ROL_ADMIN` es `ReplacingMergeTree ORDER BY (usuario_id, rol_admin)`. La revocación se modela como borrado lógico: se resuelve el estado vigente igual que `FACT_PERMISO_USUARIO` (patrón `argMax` ya usado en `queries.py`), evitando depender de `OPTIMIZE FINAL`. La lectura del dependency se cachea con TTL corto (igual que el resto de lecturas de `seguridad`) para no pegar a ClickHouse en cada request.

### 4. `estado_cuenta` verificado en `get_current_user`
`ALTER TABLE DIM_USUARIO ADD COLUMN IF NOT EXISTS estado_cuenta String DEFAULT 'activa'`. El middleware resuelve el estado vigente del usuario y rechaza con 403 si es `suspendido` o `eliminado`, incluso con token de PocketBase válido — porque PocketBase no conoce este estado. Se cachea con TTL corto para no penalizar cada request.

### 5. Lockout leído de `FACT_AUDIT_LOG`, sin tabla nueva
Los intentos fallidos se registran como acción de auditoría (`accion = 'login_fallido'`, `usuario_id` = el email cuando no hay identidad resuelta). Antes de autenticar, se cuentan los `login_fallido` de ese email en los últimos 15 min; ≥5 → 429. Reusar `FACT_AUDIT_LOG` evita otra tabla y deja rastro consultable. Alternativa descartada: tabla dedicada `FACT_LOGIN_INTENTO` — innecesaria para el volumen y el propósito.

### 6. Recuperación de contraseña simulada con token de un solo uso
`FACT_TOKEN_RECUPERACION (token, usuario_id, expira_en, usado, created_at)`. `POST /auth/recuperar` responde siempre genérico (no revela existencia del correo); solo genera token si el correo existe. `POST /auth/restablecer` valida token no vencido/no usado, cambia la contraseña vía la API admin de PocketBase, y marca el token usado (nueva fila con `usado = 1`, resuelto por `argMax`). No se envía correo real (patrón de simulación del proyecto).

### 7. Baja de cuenta propia = `estado_cuenta='eliminado'` + limpieza de sesiones/suscripción
`POST /perfil/baja` fija `estado_cuenta='eliminado'`, cierra las `FACT_SESION` abiertas del usuario y cancela su suscripción activa. **No borra** datos históricos de ClickHouse (retención analítica). El rechazo de login posterior lo cubre la Decisión 4.

### 8. Vista 360° como consolidación de solo lectura
`GET /admin/usuarios/{id}` compone en el backend datos de `DIM_USUARIO`, `BRIDGE_USUARIO_ROL_ADMIN`, `FACT_SESION`, `FACT_TRANSACCION_PAGO` y `FACT_PERMISO_USUARIO`. El listado `GET /admin/usuarios` evoluciona el buscador existente (`/usuarios/buscar`) a un listado paginado con filtros (rol, estado, fecha).

## Risks / Trade-offs

- **[Un router queda con `require_admin` sin migrar]** → No es una regresión de seguridad (sigue exigiendo superadmin), pero pierde la segmentación por área. Mitigación: la tabla de mapeo endpoint→rol de la propuesta es la checklist; se verifica con curl por rol.
- **[Lectura de roles/estado en cada request añade latencia]** → Mitigación: caché TTL corto por `usuario_id`, consistente con el resto de `seguridad`.
- **[`ReplacingMergeTree` puede devolver filas duplicadas sin merge]** → Mitigación: resolución con `argMax` por `(usuario_id, rol_admin)`, sin depender de `OPTIMIZE FINAL`.
- **[Cambio de contraseña requiere credenciales admin de PocketBase]** → Mitigación: usar el cliente PocketBase server-side ya existente (`pb_client`) con el token admin de entorno; nunca exponerlo al frontend.

## Migration Plan

1. Crear las 3 tablas nuevas y la columna `estado_cuenta` en `init_clickhouse.py` (con `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`), y sembrar `DIM_ROL_ADMINISTRATIVO`.
2. Implementar `require_rol_admin` + `roles_admin_vigentes` + auto-backfill de `superadmin`; conservar `require_admin` como alias.
3. Migrar router por router `/admin/*` a la variante específica según la tabla de mapeo, verificando por curl tras cada área.
4. Añadir endpoints de gestión de usuarios, lockout, recuperación y baja.
5. Frontend: `UsuariosAdminPage`, recuperación en login, baja en perfil.
6. Rollback: `require_admin` sigue existiendo; revertir un router a `Depends(require_admin)` restaura el comportamiento previo de ese router sin tocar datos.

## Open Questions

- Ninguna bloqueante. El alcance de `analitica` para `admin_datos` se limita a configuración; los paneles analíticos siguen bajo su propio gating de producto (`require_b2b_panel_access`/tier), que no se toca.
