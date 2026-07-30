## 1. Componentes compartidos de frontend

- [x] 1.1 `CrudModal` — modal reutilizable con foco atrapado, cierre con Escape, `fieldset` de solo lectura en modo "ver"
- [x] 1.2 `CrudActionButtons` — botonera Editar/Ver/Eliminar-Desactivar consistente

## 2. Sesiones activas globales (`seguridad`, Obj 30)

- [x] 2.1 `GET /admin/sesiones-activas` — `require_admin`, `limit` opcional, todas las sesiones abiertas (`FACT_SESION` sin `fecha_fin`) de todos los usuarios
- [x] 2.2 Página `SesionesActivasPage.tsx` en `/seguridad/sesiones-activas`

## 3. Partners — edición y detalle

- [x] 3.1 `PATCH /app/v1/partners/admin/{partner_id}` — `require_partner_admin`, campos editables reales (nombre, tier, email_contacto, estado); sin campos inventados que no existen en PocketBase
- [x] 3.2 `AdminPartnersPage.tsx` — modal de edición + modal de detalle (modo "ver") + filtros por tier/estado

## 4. Publicidad — vista de detalle

- [x] 4.1 `PublicidadAdminPage.tsx` — modal de detalle de campaña (modo "ver", sin endpoint nuevo, reutiliza el listado)
- [x] 4.2 Migración del modal de edición existente a `CrudModal` compartido

## 5. Tickets de soporte — detalle + patrón modal

- [x] 5.1 `GET /tickets/{fact_id}` — solo admin, detalle completo de un ticket
- [x] 5.2 `TicketsAdminPage.tsx` migrada a `CrudModal`/`CrudActionButtons` (antes: edición inline sin modal)

## 6. Verificación

- [x] 6.1 `GET /admin/sesiones-activas` probado con curl real — devuelve sesiones de múltiples usuarios
- [x] 6.2 `PATCH /admin/{partner_id}` probado — edita y refleja el cambio en el listado
- [x] 6.3 Detalle de campaña y de ticket verificados visualmente (modal "ver" con campos de solo lectura)
- [x] 6.4 `npm run build` verde

## 7. Documentación

- [x] 7.1 `docs/BITACORA_S13.md` — brechas encontradas en la auditoría S13-P1 y cómo se cerraron en P2
