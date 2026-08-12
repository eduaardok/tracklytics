# Auditoría de validación — `creadores`

5 `BaseModel`, 6 endpoints de escritura (censo confirmado). Paquete no tocado por ningún intento
previo de esta auditoría — auditado de cero.

## Endpoints y modelos

| Endpoint | Modelo | Hallazgo | Corrección |
|---|---|---|---|
| `POST /cuenta` | `SolicitudCuentaBody` | `nombre_artistico: str` sin cota ni trim | `min_length=1, max_length=150` + validator que recorta y rechaza vacío |
| `POST /admin/cuentas/{id}/resolver` | `ResolverCuentaBody` | `decision` ya era `Literal["aprobar","rechazar"]` (correcto); `cuenta_artista_id` (UUID) sin cota | `Path(min_length=1, max_length=64)` |
| `POST /tracks` | `SubidaTrackBody` | `track_name`/`album_name` sin cota; **`duration_ms` sin ninguna validación** (ver hallazgo abajo); `genre_id` sin cota inferior (ya verificado contra `GENERO_EXISTE` en el handler) | corregido íntegro |
| `POST /admin/tracks/{id}/resolver` | `ResolverTrackBody` | `decision` ya era `Literal` (correcto); `subida_id` (UUID) sin cota | `Path(min_length=1, max_length=64)` |
| `PUT /tracks/{id}` | `EditarTrackBody` | `track_name`/`album_name`/`descripcion` sin cota; `genre_id` sin cota inferior; `subida_id` sin cota | corregido |
| `POST /tracks/{id}/retirar` | — (sin body) | `subida_id` sin cota | `Path(min_length=1, max_length=64)` |

## Hallazgo: `duration_ms` sin ninguna validación (el campo que motivó el criterio del prompt)

`SubidaTrackBody.duration_ms: int` no tenía **ninguna** restricción — ni de signo, ni de rango.
Se consultó el rango real en ClickHouse (stack levantado, solo lectura):

```
docker exec tracklytics_api python -c "from core.database import query_one; print(query_one('SELECT min(duration_ms) mn, max(duration_ms) mx, avg(duration_ms) av FROM FACT_TRACKS'))"
→ {'mn': 0, 'mx': 5237295, 'av': 226142.0}
```

El mínimo real (`0`) es un artefacto de datos heredado de la ingesta original (un track de
duración 0 no es un caso de negocio real para una subida **nueva**), no algo que deba
perpetuarse en este endpoint. Se usó `Field(ge=1000, le=10_800_000)` — mínimo 1 segundo (0 no es
un track real), máximo 3 horas (generoso sobre el máximo observado de ~87 min, para no bloquear
DJ sets/podcasts largos que un artista real podría subir).

## Otros hallazgos

- `SolicitudCuentaBody.nombre_artistico`, `SubidaTrackBody.track_name`/`album_name`,
  `EditarTrackBody.track_name`/`album_name`/`descripcion`: sin `max_length` — corregidos (150 el
  nombre artístico, 200 nombre de track/álbum, 2000 la descripción de edición).
- `genre_id` (creación y edición): sin `ge=1` — agregado, aunque ya estaba protegido por la
  verificación real contra `GENERO_EXISTE` en ambos handlers (404 si no existe), que es más
  fuerte que un simple rango.
- Los 4 path params UUID (`cuenta_artista_id`, `subida_id` × 3) sin cota — `Path(min_length=1,
  max_length=64)`.

## `source_type` — ya correcto, verificado

`promocion.py::promover_a_fact_tracks` fija `source_type='user_uploaded'` server-side al
insertar en `FACT_TRACKS` — el cliente nunca puede elegir el `source_type` de un track propio
(no existe ese campo en `SubidaTrackBody`). Ya cumplía la regla RT-07 del criterio de esta
auditoría antes de esta pasada; se confirma, sin cambios necesarios.

## Transiciones de estado — ya correctas, verificadas

`resolver_cuenta`/`resolver_track` ya rechazaban (409) resolver una cuenta/subida que no
estuviera en `pendiente`; `editar_track`/`retirar_track` ya rechazaban (409) editar o retirar un
track ya `retirado`. Comportamiento preexistente correcto, sin cambios.

## PK inmutable

`cuenta_artista_id`/`subida_id` viajan solo por el path en todos los endpoints de
actualización — ninguno es campo editable de un body.

## Inyección SQL

Sin hallazgos — todas las escrituras usan `parameters` o `get_client().insert()`.

## Frontend — `CuentaArtistaPage.tsx`

`maxLength` en nombre artístico (150), nombre de track (200), álbum (200, alta y edición),
descripción de edición (2000); `max={10800}` en el input de duración en segundos (backend acepta
hasta 10.800.000 ms = 3h).
