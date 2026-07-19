## Why

El sistema tiene un catálogo grande y un modelo de comunidad, pero **no sabe descubrir ni sabe convivir**. Descubrir: la búsqueda obliga al usuario a saber de antemano si busca un track, un artista o un álbum (tres endpoints separados, tres cajas distintas); no existe ninguna forma de reproducción generativa (ni radio de una canción, ni mix diario), pese a que cada track ya tiene sus atributos de audio cargados; y `GET /recomendaciones` no recomienda por afinidad real sino que filtra por exclusión lo ya escuchado, sin poder explicar nunca por qué sugiere lo que sugiere. Convivir: un usuario que sufre acoso no tiene ninguna herramienta propia — no puede bloquear a nadie —; la moderación no tiene memoria, porque las denuncias (P1) y la suspensión (P0) son dos mecanismos sin nada en medio que acumule reincidencia; cualquiera puede registrarse con un correo inventado y comentar de inmediato; y el ciclo de derechos del usuario quedó a medias, con baja de cuenta pero sin poder llevarse sus datos.

Este cambio cierra esos siete huecos. Ninguno introduce una capability nueva ni depende de ML externo: la similitud se calcula en SQL de ClickHouse sobre los atributos de audio que ya están en `FACT_TRACKS`.

## What Changes

- **Búsqueda unificada (`catalogo`)**: un único `GET /search` que devuelve resultados agrupados en tracks, artistas, álbumes y playlists, respetando disponibilidad y visibilidad de playlists.
- **Radio y mix diario (`experiencia`)**: `GET /radio/track/{fact_id}` (cola de ~25 tracks similares a una semilla) y `GET /mix-diario` (~30 tracks personalizados, deterministas por usuario y día, con una porción de exploración). Ambos por distancia sobre atributos de audio, con el género como factor de peso.
- **Recomendaciones por similitud real (`experiencia`)**: se reemplaza la lógica interna de `GET /recomendaciones` por un motor de afinidad sobre el perfil de audio del usuario, y cada track recomendado gana un campo `motivo` que explica la sugerencia. El contrato de respuesta no cambia.
- **Bloqueo usuario-a-usuario (`social`)**: tabla `BRIDGE_BLOQUEO_USUARIO` y endpoints de bloquear/desbloquear/listar, con efecto real sobre la lectura de comentarios y sobre la capacidad de responder al usuario que bloqueó.
- **Historial de sanciones (`seguridad` + `social`)**: tabla `FACT_STRIKE_USUARIO`, emisión manual y emisión al resolver una denuncia, con suspensión automática de la cuenta al acumular 3 strikes activos.
- **Verificación de email simulada (`seguridad`)**: `email_verificado` en `DIM_USUARIO`, token reutilizando la tabla de tokens de P0, endpoints de verificar y reenviar, y una regla de negocio suave que impide comentar, subir tracks y suscribirse a un plan pago sin verificar.
- **Exportación de datos personales (`seguridad`)**: `GET /perfil/mis-datos`, que reúne en un JSON estructurado todos los datos del usuario a través de las capabilities.

## Capabilities

### New Capabilities

(ninguna — todo extiende capabilities existentes)

### Modified Capabilities

- `catalogo`: búsqueda unificada multi-entidad.
- `experiencia`: radio por track, mix diario determinista y motor de recomendación por similitud de audio con motivo explicable.
- `social`: bloqueo entre usuarios, con filtrado de comentarios y restricción de respuesta; emisión de strike al resolver una denuncia.
- `seguridad`: historial de strikes con suspensión automática por reincidencia, verificación de email simulada y exportación de datos personales.

## Impact

- **Código backend**: `catalogo` (router + queries + un dep de autenticación opcional en `core/deps.py`), `experiencia` (router + queries: radio, mix diario, motor de similitud), `social` (router + queries: bloqueos, filtrado de comentarios, `emitir_strike` en denuncias), `seguridad` (router + queries + `deps.py` + un módulo nuevo de exportación). Toda acción administrativa se audita con `audit.record` y se autoriza con `require_rol_admin`.
- **Datos (ClickHouse `tracklytics`)**: 2 tablas nuevas (`BRIDGE_BLOQUEO_USUARIO`, `FACT_STRIKE_USUARIO`) y 2 columnas nuevas (`DIM_USUARIO.email_verificado`, `FACT_TOKEN_RECUPERACION.proposito`), todo idempotente en `init_clickhouse.py`. Total de tablas: 71 → 73.
- **Frontend**: barra de búsqueda global en el header B2C con página de resultados por secciones; tarjeta "Tu mix diario" en el home y acción "Iniciar radio" en el menú contextual de track; motivo visible en recomendaciones; bloqueo desde comentarios y sección "Usuarios bloqueados" en el perfil; strikes en la vista 360° de `UsuariosAdminPage` y checkbox de strike en la bandeja de denuncias; banner de verificación de correo; botón "Descargar mis datos" en el perfil. Sistema de diseño Impeccable.
- **Compatibilidad**: ningún endpoint existente cambia de contrato. `GET /recomendaciones` conserva su estructura `{"secciones": [...]}` y solo añade un campo por track. Los endpoints de búsqueda por entidad siguen existiendo. Los usuarios ya registrados se marcan como verificados en el backfill para no bloquear cuentas existentes.
