## Why

Hoy Tracklytics es una plataforma de consumo pasivo: un Usuario B2C puede explorar el catálogo, guardar favoritos y armar playlists, pero no tiene ninguna forma de interactuar con otros usuarios ni de expresar afinidad por un artista más allá de su propia biblioteca privada. No existe seguimiento de artistas, comentarios sobre tracks ni una acción de compartir contenido — las tres piezas mínimas que hacen sentir "social" a una plataforma de streaming real y que además generan señal de comportamiento adicional para el motor analítico B2B (modelo data flywheel). `social` cierra ese vacío reutilizando por completo la identidad de usuario de `seguridad` y el catálogo ya existente, sin duplicar ninguna de las dos entidades.

## What Changes

- Nueva capability `social`: seguir/dejar de seguir artistas, comentar tracks (incluyendo respuestas en hilo), y generar la intención de compartir un track, playlist o perfil de artista.
- 4 tablas nuevas en ClickHouse: `BRIDGE_SEGUIMIENTO_ARTISTA`, `FACT_COMENTARIO`, `FACT_COMPARTICION`, `DIM_TIPO_INTERACCION_SOCIAL`.
- Moderación de comentarios por `admin` (ocultar/eliminar), auditada en `FACT_AUDIT_LOG` reutilizando `paquetes.seguridad.audit.record`.
- Autorización reutilizada íntegramente de capabilities existentes: `require_admin` (moderación, `paquetes.seguridad.deps`) y `require_b2c_user` (bloqueo de Cliente B2B en las tres acciones sociales, `core.deps`, mismo mecanismo ya usado por `biblioteca` para RN-CAT-004).
- Paquete backend `api/paquetes/social/` (mismo patrón que `creadores`/`facturacion`) y frontend `frontend/src/packages/social/` (hoy stub) completado en esta misma ronda.
- Sin integración real con redes sociales externas (X/WhatsApp) — se simula igual que los pagos en `facturacion`.

## Capabilities

### New Capabilities
- `social`: seguimiento de artistas, comentarios (con respuestas y moderación admin) sobre tracks, e intención de compartir contenido.

### Modified Capabilities
Ninguna. `social` no cambia el comportamiento observable de ningún requirement ya especificado en otra capability; solo lee `DIM_USUARIO` (`seguridad`), `DIM_ARTISTS`/`FACT_TRACKS` (`catalogo`) y reutiliza dependencias ya existentes sin alterarlas.

## Impact

- **ClickHouse**: 4 tablas nuevas (`init_clickhouse.py`), sin tocar el esquema de ninguna tabla existente.
- **Backend — paquete nuevo**: `api/paquetes/social/` (deps, queries, router), montado en `api/main.py`.
- **Dependencias cruzadas**: reutiliza `core.deps.get_current_user`, `core.deps.require_b2c_user`, `paquetes.seguridad.deps.require_admin` y `paquetes.seguridad.audit.record` — no se duplica infraestructura de auth ni auditoría.
- **Frontend**: `frontend/src/packages/social/` (hoy stub) pasa a implementación completa — seguir/dejar de seguir desde el perfil de artista, sección de comentarios en la vista de track, botón de compartir, y una cola de moderación admin-only.
