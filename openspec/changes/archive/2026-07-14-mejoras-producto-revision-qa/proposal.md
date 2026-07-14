## Why

Una revisión manual de producto detectó tres comportamientos que le restan credibilidad a la
experiencia freemium y B2B: una cuenta de artista aprobada no recibe ningún trato distinto de un
oyente free en materia de publicidad, el usuario confirma un trial de 7 días sin que el formulario
le diga antes cuándo empezará el cobro real, y consultar disponibilidad de un track por país obliga
a conocer de antemano el nombre exacto de la canción en vez de poder explorar el catálogo bloqueado
o disponible en un país.

## What Changes

- **Exención de anuncios para artistas aprobados**: un usuario con cuenta de artista en estado
  `aprobada` (capability `creadores`) deja de ver anuncios de audio y de display, sin necesidad de
  una suscripción paga — se suma como una segunda condición de exención junto a tener un plan
  distinto de `free`.
- **Disclosure de cobro del trial antes de confirmar**: el formulario de confirmación de suscripción
  premium/estudiante SHALL mostrar, antes de que el usuario confirme, la fecha en que terminará el
  período de prueba de 7 días y a partir de la cual se aplicará el cobro real, para que la decisión
  de confirmar sea informada.
- **Disponibilidad por país como lista navegable**: se agrega una consulta que devuelve el catálogo
  (paginado, filtrable por disponible/bloqueado, con búsqueda opcional por nombre) con su estado de
  disponibilidad para el país del usuario o un país seleccionado, en vez de exigir buscar un track
  puntual para conocer su estado.

## Capabilities

### New Capabilities
(ninguna)

### Modified Capabilities
- `publicidad`: la resolución del plan efectivo para decidir si se muestra un anuncio (audio y
  display) se amplía para tratar a un usuario con cuenta de artista aprobada como exento, igual que
  un plan pago.
- `suscripciones`: el requirement de confirmación de suscripción se amplía para exigir que el
  sistema comunique, antes de confirmar, la fecha en que terminará el trial y comenzará el cobro.
- `distribucion`: se agrega un nuevo requirement de consulta de disponibilidad del catálogo por país
  en forma de lista filtrable, complementario a la consulta puntual de un track ya existente (que se
  mantiene sin cambios).

## Impact

- **API** (`api/paquetes/publicidad/router.py`): `_plan_de_usuario` (o el punto de decisión de
  mostrar el anuncio) consulta también el estado de cuenta de artista del usuario, reutilizando la
  query ya existente en `creadores/queries.py` en vez de duplicar lógica.
- **Frontend** (`frontend/src/packages/suscripciones/pages/PlanesPage.tsx`): agrega el texto de
  disclosure de fecha de cobro antes del botón de confirmar, calculado con la misma constante de
  días de trial que ya usa el backend.
- **API** (`api/paquetes/distribucion/router.py`, `queries.py`): nuevo endpoint de listado de
  disponibilidad por país (paginado, filtrable), reutilizando `BRIDGE_RESTRICCION_TRACK` y la
  resolución de país ya existentes.
- **Frontend** (`frontend/src/packages/distribucion/pages/DisponibilidadPage.tsx`): pasa de exigir
  la búsqueda de un track puntual a mostrar una lista/tabla con filtro de estado y búsqueda opcional.
