## Why

La auditoría completa de S13-P1 (`docs/BITACORA_S13.md`) encontró dos tipos de brecha que
este cambio cierra: (1) un informe simple totalmente ausente — Obj 30 (sesiones activas
global, para el Lead Data Engineer/CTO) solo existía como vista 360° por usuario individual,
sin un panel agregado de todas las sesiones abiertas de la plataforma; y (2) un patrón CRUD
inconsistente entre entidades administrativas — Partners tenía alta y desactivación pero no
edición ni vista de detalle; Publicidad tenía alta, edición y transiciones de estado pero no
vista de detalle; Tickets de soporte solo tenía edición inline del estado, sin vista de
detalle ni el mismo patrón de modal que ya usaban otras pantallas. Se corrigen las tres a la
vez porque comparten la misma solución: un modal compartido (`CrudModal`) que ya existía
para otras entidades del sistema.

## What Changes

- **`seguridad`**: nuevo panel administrativo `GET /admin/sesiones-activas` — todas las
  sesiones actualmente abiertas de la plataforma (no solo las propias de un usuario),
  cerrando Obj 30.
- **`partners`**: nuevo endpoint `PATCH /app/v1/partners/admin/{partner_id}` (editar
  nombre/tier/email/estado) y vista de detalle en el modal administrativo existente.
- **`publicidad`**: vista de detalle de una campaña publicitaria en modal (sin nuevo
  endpoint — reutiliza los datos ya devueltos por el listado administrativo existente).
- **`experiencia`**: nuevo endpoint `GET /tickets/{fact_id}` (ver detalle de un ticket,
  solo admin) y migración de la página administrativa al patrón `CrudModal` compartido.
- **Frontend transversal**: componentes compartidos `CrudModal`/`CrudActionButtons`
  (modal reutilizable con foco atrapado, cierre con Escape, campos de solo lectura en modo
  "ver") aplicados de forma consistente en las tres entidades.

## Capabilities

### New Capabilities

(ninguna — todo extiende capabilities existentes)

### Modified Capabilities

- `seguridad`: panel administrativo de sesiones activas de toda la plataforma.
- `partners`: edición y vista de detalle de un partner B2B.
- `publicidad`: vista de detalle de una campaña publicitaria.
- `experiencia`: vista de detalle de un ticket de soporte.

## Impact

- **Código backend**: `api/paquetes/seguridad/router.py` (+`GET /admin/sesiones-activas`),
  `api/paquetes/partners/router.py` (+`PATCH /admin/{partner_id}` en `v1_router`),
  `api/paquetes/experiencia/router.py` (+`GET /tickets/{fact_id}`). `publicidad` no requirió
  cambios de backend (la vista de detalle reutiliza el listado existente).
- **Frontend**: componentes compartidos nuevos `frontend/src/shared/components/CrudModal.tsx`
  y `CrudActionButtons.tsx`; página nueva `SesionesActivasPage.tsx`
  (`/seguridad/sesiones-activas`); `AdminPartnersPage.tsx`, `PublicidadAdminPage.tsx` y
  `TicketsAdminPage.tsx` migradas al patrón modal compartido con filtros de tabla añadidos.
- **Datos**: ninguna tabla nueva ni columna nueva — todo se resuelve sobre `FACT_SESION`,
  la colección `partners` de PocketBase y `FACT_TICKET_SOPORTE`, ya existentes.
- **Compatibilidad**: ningún endpoint existente cambia de contrato; todo es aditivo.
