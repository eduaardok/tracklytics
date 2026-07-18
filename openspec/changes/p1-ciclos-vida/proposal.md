## Why

El sistema sabe **crear** casi todas sus entidades de negocio, pero no sabe **operarlas a lo largo de su ciclo de vida**. Una campaña publicitaria se puede lanzar pero no pausar ni cerrar; una licencia de distribución se aprueba pero nunca se puede revocar; un contrato de regalías se firma pero no se puede renegociar ni terminar; un track publicado no se puede retirar por DMCA ni por error editorial; un artista no puede corregir la metadata de su propio track ni retirarlo; los partners B2B solo existen manualmente en PocketBase, sin forma de crearlos, rotar su llave ni desactivarlos desde el sistema; las suscripciones de usuarios individuales son invisibles para el área comercial; y la moderación de contenido es 100% reactiva, sin un canal para que los propios usuarios denuncien. Este cambio cierra esos huecos de ciclo de vida sin introducir nuevas capabilities: cada pieza extiende un paquete existente.

## What Changes

- **Campañas publicitarias (`publicidad`)**: edición de campaña, pausa/reanudación **manual** (distinta de la pausa por agotamiento de presupuesto), finalización definitiva; edición y desactivación de anunciantes.
- **Licencias de distribución (`distribucion`)**: revocación de una licencia ya activa, con motivo y fecha.
- **Contratos de regalías (`regalias`)**: edición de porcentajes y fecha fin (validando que la suma de porcentajes ≤ 100), y terminación del contrato.
- **Catálogo (`catalogo`)**: takedown administrativo de un track (ocultar/restaurar), con filtrado de disponibilidad en todas las consultas públicas de catálogo.
- **Tracks de creadores (`creadores`)**: el artista edita la metadata de su propio track (vuelve a revisión editorial si estaba aprobado) y lo retira (takedown en catálogo).
- **Partners B2B (`partners`)**: CRUD administrativo de partners y gestión del ciclo de vida de la API key (creación, rotación, desactivación), con la llave almacenada como hash SHA-256.
- **Suscripciones (`suscripciones`)**: visibilidad y acciones administrativas sobre suscripciones individuales (listado con filtros, detalle, cancelación administrativa, extensión de cortesía).
- **Denuncias de contenido (`social`)**: canal de reporte de comentarios y tracks por parte de los usuarios, con bandeja de moderación administrativa.
- **Exportación agregada (`regalias`, `finanzas`)**: exportación estructurada de liquidaciones de un contrato y reporte financiero consolidado por período.

## Capabilities

### New Capabilities

(ninguna — todo extiende capabilities existentes)

### Modified Capabilities

- `publicidad`: ciclo de vida de campañas (editar, pausar, reanudar, finalizar) y de anunciantes (editar, desactivar).
- `distribucion`: revocación de licencias activas.
- `regalias`: edición y terminación de contratos; exportación de liquidaciones.
- `catalogo`: takedown de tracks (ocultar/restaurar) y filtrado de disponibilidad.
- `creadores`: edición y retiro de tracks por parte del artista propietario.
- `partners`: CRUD administrativo de partners y gestión de API keys (hash SHA-256).
- `suscripciones`: administración de suscripciones individuales (listado, detalle, cancelar, extender).
- `social`: denuncias de contenido por usuarios y bandeja de moderación.
- `finanzas`: reporte financiero consolidado por período.

## Impact

- **Código backend**: routers y queries de `publicidad`, `distribucion`, `regalias`, `catalogo`, `creadores`, `partners` (router + `deps.py` + `pb_client.py`), `suscripciones`, `social`, `finanzas`. Toda acción administrativa se audita vía el sistema de auditoría de `seguridad` (`FACT_AUDIT_LOG`) y se autoriza con el rol de área correspondiente (`require_rol_admin`, del change `roles-gestion-usuarios`).
- **Datos (ClickHouse `tracklytics`)**: 1 tabla nueva (`FACT_DENUNCIA`) y 4 columnas nuevas (`DIM_CAMPANA_PUBLICITARIA.formato`, `DIM_CAMPANA_PUBLICITARIA.estado_manual`, `FACT_TRACKS.disponible`, `FACT_SUBIDA_TRACK`/estado ampliado a `retirado`). Todo con `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` en `init_clickhouse.py` (idempotente, sin pasos manuales).
- **PocketBase**: la colección `partners` gana un campo `api_key_hash` y campos de gestión (`tier`, `email_contacto`, `estado`); la API key deja de guardarse en claro. `pb_client` (crear/listar/rotar/desactivar) escribe desde FastAPI con token de superusuario, nunca desde el frontend (RT-01).
- **Frontend**: acciones de ciclo de vida en las páginas admin existentes (`AdminCampanasPage`, `AdminAnunciantesPage`, licencias de `DistribucionShell`, detalle de contrato de `regalias`), nueva `AdminPartnersPage` y `AdminSuscripcionesPage`, panel admin de tracks del catálogo, edición/retiro de tracks en la vista del artista, y botón "Denunciar" + bandeja de denuncias en `social`. Sistema de diseño Impeccable.
- **Compatibilidad**: ningún endpoint existente cambia de contrato. El filtrado de `disponible = 1` en catálogo es transparente para tracks ya publicados (default 1). Las campañas ya existentes quedan `estado_manual = ''` (activas) y `formato` derivado de su `tipo_anuncio`.
