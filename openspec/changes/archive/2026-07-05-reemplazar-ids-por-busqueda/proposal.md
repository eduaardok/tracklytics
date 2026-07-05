## Why

Cinco formularios administrativos/operativos del frontend (distribución, social, administración, facturación y plan familiar) piden hoy un identificador interno crudo (`fact_id` de track o `usuario_id`) escrito a mano por quien opera la pantalla. Ese identificador no es visible en ningún otro lugar de la interfaz — para completarlo, el operador tiene que ir a buscarlo por fuera del sistema (otra pestaña, una consulta directa a la base). Es el mismo defecto de UX repetido cinco veces con la misma causa: la pantalla nunca ofreció una forma de buscar la entidad por lo que el operador sí conoce (nombre de track/artista, nombre/correo de usuario), solo de referenciarla por su ID.

## What Changes

- Reemplazo del input de ID crudo por un selector con búsqueda en 5 campos, dentro de 4 áreas: Distribución (`DisponibilidadPage`), Social (`SeguidosSocialPage`), Administración (`PermisosPage`) y Facturación/plan familiar (`AuditoriaFacturacionPage`, `FamiliaAdminPage`).
- Búsqueda de tracks (Distribución, Social): reutiliza el endpoint de búsqueda de catálogo ya existente (`GET /app/v1/tracks/search`) — no se agrega backend nuevo, solo se consume desde un componente de selección compartido.
- Búsqueda de usuarios (Administración, Facturación, plan familiar): no existe hoy ningún endpoint para resolver un usuario por nombre o correo. Se agrega uno nuevo, de solo lectura y exclusivo de `admin`, en la capability `seguridad` (dueña de la identidad de usuario y del guard de administración reutilizado por el resto de capabilities).
- Dos componentes de selección compartidos en el frontend: selector de tracks (con carátula) y selector de usuarios (con nombre/correo), ambos con resultados paginados/limitados.
- En los 5 puntos, el cambio es de comportamiento visible para el actor que opera la pantalla (busca por nombre/artista o nombre/correo en vez de teclear un ID interno), no solo un cambio estético — se documenta como tal en cada spec afectada.

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `distribucion`: la consulta de disponibilidad de un track deja de pedir su `fact_id` como texto libre; el operador lo busca y selecciona por nombre de track/artista.
- `social`: la consulta del detalle social de un track deja de pedir su `fact_id` como texto libre; el usuario lo busca y selecciona por nombre de track/artista.
- `seguridad`: se agrega un requisito nuevo de búsqueda de usuarios por nombre/correo (exclusivo de `admin`), y la consulta de permisos de un usuario deja de requerir su `usuario_id` como texto libre.
- `facturacion`: la auditoría de facturación de un usuario deja de requerir su `usuario_id` como texto libre; el admin lo busca y selecciona por nombre/correo.
- `experiencia`: el alta de titular y la incorporación de miembro en un plan familiar dejan de requerir el `usuario_id` como texto libre; el admin lo busca y selecciona por nombre/correo.

## Impact

- **Backend — `seguridad`**: nuevo endpoint de solo lectura `GET /app/v1/seguridad/usuarios/buscar` en `api/paquetes/seguridad/router.py`, gateado por `require_admin` (`api/paquetes/seguridad/deps.py`), consultando `DIM_USUARIO` en ClickHouse por coincidencia parcial de nombre o correo.
- **Backend — resto**: sin cambios. La búsqueda de tracks ya existe y no se modifica.
- **Frontend**: dos componentes de selección compartidos (tracks, usuarios) en una ubicación común reutilizable entre paquetes; se modifican `DisponibilidadPage` (distribucion), `SeguidosSocialPage` (social), `PermisosPage` (seguridad), `AuditoriaFacturacionPage` (facturacion) y `FamiliaAdminPage` (experiencia) para usarlos en vez del input de ID crudo.
- **ClickHouse**: ninguno — se consulta `DIM_USUARIO`, ya existente y ya poblada, sin `ALTER` ni tabla nueva.
- **Fuera de alcance**: el fix visual del header (logo + `ZoneSwitcher`) en `AnalyticaShell`/`SeguridadShell`, ya corregido por separado al ser un defecto puramente visual sin cambio de comportamiento ni de spec.
