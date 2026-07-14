## Why

Una auditoría exhaustiva de los 55 casos de uso operativos (CU-O01–58) contra el stack vivo encontró 6 defectos concretos (rutas de frontend rotas en analítica, un bug de integridad de datos donde `fact_id` se reasignaba a tracks distintos en cada corrida sintética del ETL, un bug de creación en el CRUD de dimensiones que asignaba `id=0` a todo registro nuevo, y CU-O58 sin implementar). Por separado, el usuario pidió una tanda de mejoras para que el producto se sienta como un entorno real: la suscripción a un plan de pago y el registro de un método de pago eran dos flujos completamente desconectados (se podía "activar" un plan de pago escribiendo cualquier texto, sin verificar contra un método de pago real); acciones cotidianas (favoritos, playlists) no daban ningún feedback visual; "Gestionar permisos por rol" no tenía ninguna UI (100% API); la auditoría solo mostraba IDs crudos sin nombre de usuario; las facturas eran JSON crudo sin ningún formato profesional; el país del usuario era texto libre sin validar, por lo que la disponibilidad geográfica por país (CU-O41) nunca aplicaba en la práctica; y el plan familiar solo existía como operación de soporte para un administrador, no como algo que el propio titular premium pudiera autogestionar.

## What Changes

- **Fix de integridad de datos (crítico)**: `etl/gold/loader.py` calculaba `next_id` para los tracks sintéticos como `n_real + 1` fijo en cada corrida, en vez de `MAX(fact_id)` real — cada semana adicional (o cualquier recarga forzada) reescribía el mismo rango de `fact_id`, hacía que un mismo id apuntara a tracks distintos según el orden de merge de ClickHouse, y corrompía silenciosamente favoritos/playlists/historial/comentarios/restricciones ya guardados por cualquier usuario.
- **Fix de 5 pantallas de analítica rotas**: `genres.html`, `trends.html`, `dashboard.html` (parcial) y `compare-artists.html` llamaban a endpoints que nunca se habían montado en el backend (`/genres/trends`, `/genres/{id}/audio-profile`, `/trends/weekly`, `/artists/search`, `/artists/{id}/stats`) pese a que las queries SQL ya existían, huérfanas, en `analitica/queries.py`. Se montaron los 5 endpoints reusando esas queries — sin tocar el frontend.
- **Fix del bug `id=0` en CRUD de dimensiones**: `dim_create` no calculaba un PK real, dejando todo registro nuevo con `id=0` y corriendo el riesgo de que un DELETE/UPDATE afectara a todos los registros con ese mismo defecto.
- **CU-O58 (audio real)**: se implementó reproducción real vía YouTube IFrame Player API (búsqueda `listType=search` por "artista + track"), con manejo explícito de error ("vista previa no disponible") en vez de simulación silenciosa.
- **Suscripción con pago integrado**: activar un plan de pago ahora exige un `metodo_pago_id` real (`DIM_METODO_PAGO`, ya no un string libre) y dispara el cobro (transacción + invoice) en la misma operación — como cualquier checkout real. El frontend permite agregar un método de pago inline, sin salir del modal de confirmación.
- **Feedback visual (toasts)**: favoritos, playlists (crear/agregar/quitar/eliminar/renombrar) y confirmar/cancelar suscripción ahora muestran toast de éxito/error — antes eran silenciosos.
- **Panel de administración "Permisos"**: nueva pantalla con tabla completa de usuarios (antes `usuarios/buscar` solo servía para autocompletar) y gestión de permisos por recurso/acción, más una pantalla de auditoría con nombre/email de usuario (antes solo `usuario_id` crudo).
- **Facturas profesionales**: nueva vista imprimible con branding, desglose de IVA y datos del método de pago, más una sección "Mis facturas" en el perfil.
- **País real**: nuevo endpoint público de catálogo de países; el registro y el perfil usan un `<select>` (antes texto libre que casi nunca resolvía contra `DIM_PAIS`), y se agregó autoservicio para que un usuario ya registrado corrija su país.
- **Plan familiar en autoservicio**: nuevos endpoints para que el propio titular premium cree su plan, agregue miembros por correo y los quite — sin depender de un administrador. El flujo admin existente se conserva para soporte/override.

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `ingesta`: fix de integridad de `fact_id` en la carga sintética del ETL; fix del bug `id=0` en la creación de dimensiones (CU-O15).
- `analitica`: se exponen 5 endpoints que ya tenían query SQL pero nunca se habían montado (CU-O07/08/09/10).
- `suscripciones`: activar un plan de pago ahora requiere un método de pago real y cobra en la misma operación.
- `facturacion`: se agrega el detalle enriquecido de una invoice (para la vista imprimible) y se expone `procesar_pago` como función reusable desde `suscripciones`.
- `seguridad`: `usuarios/buscar` lista todos los usuarios cuando no hay término de búsqueda; se agrega un catálogo de recursos/acciones y un endpoint self-service de perfil (`PATCH /perfil`).
- `distribucion`: nuevo endpoint público de catálogo de países (antes exclusivo de admin), necesario para que el registro/perfil puedan poblar un selector sin sesión de administrador.
- `experiencia`: plan familiar en autoservicio para el titular premium (CU-O51/52/53), además del flujo admin existente; CU-O58 pasa de simulado a audio real vía YouTube.

## Impact

- **Backend**: `api/paquetes/{ingesta→etl,analitica,suscripciones,facturacion,seguridad,distribucion,experiencia}/`.
- **ETL**: `etl/gold/loader.py`.
- **Frontend (`app/`, vanilla)**: `js/api.js`, `js/components.js`, `js/favorites.js`, `js/playlists.js`, `js/ytplayer.js` (nuevo), `autenticacion/planes.html`, `autenticacion/register.html`, `autenticacion/profile.html`, `analytics/permisos.html` (nuevo), `analytics/auditoria.html` (nuevo), `facturacion/invoice.html` (nuevo).
- **Datos**: los ~800K registros sintéticos duplicados generados por el bug de `fact_id` durante las pruebas de esta auditoría no se limpian como parte de este cambio — es una operación destructiva sobre datos vivos que requiere decisión explícita del usuario en otra conversación.
- **Fuera de alcance**: UI para social (seguir/comentar/compartir) — la capability ya funciona a nivel API pero no tiene ninguna pantalla en `app/`, y construirla no fue parte de lo solicitado en este cambio.
