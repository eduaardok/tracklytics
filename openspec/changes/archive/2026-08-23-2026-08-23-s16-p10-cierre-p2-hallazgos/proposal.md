## Why

El stakeholder pidió cerrar dos frentes: las brechas de producto P2 (`docs/PENDIENTES.md`) y
los hallazgos S16 marcados como abiertos. Una auditoría de código previa (no de la
documentación) encontró que la mayor parte ya estaba implementada — búsqueda unificada,
radio/mix diario con similitud real de audio, recomendaciones por afinidad, export GDPR, y los
tres hallazgos A9/A10/A11 de la auditoría visual de Analítica — solo `PENDIENTES.md` no se
había actualizado tras los lotes que los cerraron. Ese trabajo no requiere spec nueva: ya está
cubierto por specs existentes o no altera comportamiento (correcciones de documentación).

Lo que sí faltaba de verdad, y sí es comportamiento nuevo que esta propuesta documenta:

1. Un usuario no tenía forma de dejar de recibir un tipo de notificación puntual sin
   silenciarlas todas.
2. La verificación de correo era simulada de punta a punta: el token solo viajaba en la
   respuesta HTTP, nunca había un correo real.
3. El plan estudiante validaba solo el formato del email institucional en el checkout; no
   existía ningún canal para que el usuario aportara evidencia real y un admin la revisara —
   el spec de `suscripciones` declaraba esto explícitamente "fuera de alcance".
4. El shuffle de la cola de reproducción no existía en absoluto (solo radio y mix diario).

## What Changes

- **`social`**: preferencias de notificación por tipo (opt-out) — un usuario puede desactivar
  un tipo de notificación puntual sin afectar los demás; el sistema deja de generarlas para
  ese tipo mientras la preferencia esté desactivada.
- **`seguridad`**: el token de verificación de correo, además de viajar en la respuesta HTTP
  (se mantiene por conveniencia de entorno de demostración), ahora se envía por un canal de
  correo real (SMTP).
- **`suscripciones`**: canal de comprobante de estudiante — un usuario puede subir evidencia
  real (archivo) junto a su email institucional; un admin comercial la revisa y la
  aprueba/rechaza. No cambia la elegibilidad de checkout del plan `estudiante` (sigue
  autoservida por formato de dominio) — es un canal auditable aparte.
- **`experiencia`**: mezclar (shuffle) la cola de reproducción, evitando que dos tracks
  consecutivos queden del mismo artista.

## Capabilities

### Modified Capabilities

- `social`: la generación de notificaciones de actividad social SHALL respetar la preferencia
  de opt-out del destinatario para el tipo correspondiente.
- `seguridad`: la verificación de correo electrónico SHALL enviarse también por un canal de
  correo real, no solo devolverse en la respuesta.
- `suscripciones`: se agrega un requirement nuevo de comprobante de estudiante; se retira la
  exclusión "verificación real de la titularidad del email institucional" de Fuera de alcance
  (queda cubierta, en su forma de evidencia + revisión manual, no de confirmación automática
  por correo).

### Added Capabilities

- `experiencia`: mezclar la cola de reproducción (shuffle inteligente).

## Impact

- **Backend**: `api/paquetes/social/{notificaciones,queries,router}.py` (preferencias),
  `api/core/email.py` (nuevo), `api/core/config.py`, `api/paquetes/seguridad/router.py` (envío
  real), `api/paquetes/suscripciones/router.py` (comprobante), `init_clickhouse.py`
  (`DIM_PREFERENCIA_NOTIFICACION`, `SOLICITUD_VERIFICACION_ESTUDIANTE`).
- **Frontend**: `shared/context/PlayerContext.tsx` (`shuffleQueue`),
  `shared/components/QueuePanel.tsx`, `packages/social/components/NotificationBell.tsx`,
  `packages/suscripciones/pages/{PlanesPage,AdminSuscripcionesPage}.tsx`,
  `shared/lib/api-client.ts` (`postForm`).
- **Infraestructura**: `docker-compose.yml` gana el servicio `mailpit` (SMTP local sin auth,
  bandeja web en `:8025`) — no requiere credenciales de un proveedor externo.
- **Compatibilidad**: todos los campos/endpoints son nuevos y aditivos; ningún consumidor
  existente cambia de comportamiento salvo el ya declarado (opt-out reduce notificaciones para
  quien lo activa explícitamente).
