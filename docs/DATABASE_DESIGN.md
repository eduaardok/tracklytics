# DATABASE DESIGN — TRACKLYTICS
> **Versión:** 4.0.0 | **Sprint:** 0 — Planificación y Diseño Inicial | **Estado:** ✅ Completado | **Fecha:** Mayo 2026

---

## Objetivo del Modelo

Diseñar un modelo relacional normalizado en PostgreSQL donde las 10 tablas principales derivan directa o indirectamente del dataset de Spotify (114.000 registros, 20 columnas), cumpliendo el requisito técnico RT-06. Se incluye una tabla adicional de infraestructura ETL.

El modelo debe:
- Eliminar la redundancia del formato plano del CSV mediante normalización.
- Respetar la integridad referencial del motor relacional.
- Soportar consultas analíticas de dashboards e inteligencia de negocio.
- Tener trazabilidad clara entre cada tabla y su columna de origen en el CSV.

---

## Entidades Principales

| # | Tabla | Campo de origen en el CSV |
|---|---|---|
| 1 | `tracks` | `track_id`, `track_name`, `popularity`, `duration_ms`, `explicit` |
| 2 | `albums` | `album_name` |
| 3 | `artists` | `artists` (split por `;`) |
| 4 | `genres` | `track_genre` |
| 5 | `audio_features` | `danceability`, `energy`, `key`, `loudness`, `mode`, `speechiness`, `acousticness`, `instrumentalness`, `liveness`, `valence`, `tempo`, `time_signature` |
| 6 | `track_artists` | `track_id` + `artists` |
| 7 | `track_genres` | `track_id` + `track_genre` |
| 8 | `album_artists` | `album_name` + `artists` |
| 9 | `genre_trends` | Agregado de `popularity`, `danceability`, `energy`, `valence` por `track_genre` |
| 10 | `artist_stats` | Agregado de `popularity`, `explicit` por `artists` |
| +1 | `etl_logs` | Infraestructura — registro del proceso de carga del CSV |

---

## Relaciones

| Relación | Tipo | Tablas involucradas |
|---|---|---|
| Un álbum contiene múltiples canciones | 1:N | `albums` → `tracks` |
| Cada canción tiene exactamente un perfil de audio | 1:1 | `tracks` → `audio_features` |
| Una canción puede tener múltiples artistas | N:M | `tracks` ↔ `artists` vía `track_artists` |
| Una canción puede pertenecer a múltiples géneros | N:M | `tracks` ↔ `genres` vía `track_genres` |
| Un álbum puede estar asociado a múltiples artistas | N:M | `albums` ↔ `artists` vía `album_artists` |
| Cada género tiene una fila de tendencias precalculadas | 1:1 | `genres` → `genre_trends` |
| Cada artista tiene una fila de estadísticas precalculadas | 1:1 | `artists` → `artist_stats` |
| `etl_logs` es independiente | — | Sin FK saliente |

---

## Cardinalidades

```
albums         ||──o{ tracks          : "contiene"
tracks         ||──||  audio_features  : "tiene"
tracks         }o──o{  artists         : "interpretada por"   [vía track_artists]
tracks         }o──o{  genres          : "clasificada en"     [vía track_genres]
albums         }o──o{  artists         : "asociado a"         [vía album_artists]
genres         ||──o|  genre_trends    : "resume"
artists        ||──o|  artist_stats    : "resume"
```

| Par de entidades | Cardinalidad | Tabla puente |
|---|---|---|
| `albums` — `tracks` | 1 a N | — |
| `tracks` — `audio_features` | 1 a 1 | — |
| `tracks` — `artists` | N a M | `track_artists` |
| `tracks` — `genres` | N a M | `track_genres` |
| `albums` — `artists` | N a M | `album_artists` |
| `genres` — `genre_trends` | 1 a 1 | — |
| `artists` — `artist_stats` | 1 a 1 | — |

---

## Llaves Primarias

| Tabla | PK | Tipo | Justificación |
|---|---|---|---|
| `genres` | `genre_id` | SERIAL | ID sintético. VARCHAR ineficiente como FK. |
| `artists` | `artist_id` | SERIAL | El CSV no provee ID. Generado por PostgreSQL (DD-08). |
| `albums` | `album_id` | SERIAL | El CSV no provee ID. Generado por PostgreSQL (DD-08). |
| `tracks` | `track_id` | VARCHAR(50) | Identificador nativo de Spotify. Se usa directamente. |
| `audio_features` | `track_id` | VARCHAR(50) | PK = FK a `tracks`. Garantiza relación 1:1. |
| `track_artists` | (`track_id`, `artist_id`) | PK compuesta | Identifica de forma única cada par canción-artista. |
| `track_genres` | (`track_id`, `genre_id`) | PK compuesta | Identifica de forma única cada par canción-género. |
| `album_artists` | (`album_id`, `artist_id`) | PK compuesta | Identifica de forma única cada par álbum-artista. |
| `genre_trends` | `trend_id` | SERIAL | PK técnica. Unicidad real por `UNIQUE (genre_id)`. |
| `artist_stats` | `stat_id` | SERIAL | PK técnica. Unicidad real por `UNIQUE (artist_id)`. |
| `etl_logs` | `log_id` | SERIAL | Cada ejecución ETL genera una fila incremental. |

---

## Llaves Foráneas

| Tabla | Columna FK | Referencia | ON DELETE |
|---|---|---|---|
| `tracks` | `album_id` | `albums.album_id` | RESTRICT |
| `audio_features` | `track_id` | `tracks.track_id` | CASCADE |
| `track_artists` | `track_id` | `tracks.track_id` | CASCADE |
| `track_artists` | `artist_id` | `artists.artist_id` | CASCADE |
| `track_genres` | `track_id` | `tracks.track_id` | CASCADE |
| `track_genres` | `genre_id` | `genres.genre_id` | CASCADE |
| `album_artists` | `album_id` | `albums.album_id` | CASCADE |
| `album_artists` | `artist_id` | `artists.artist_id` | CASCADE |
| `genre_trends` | `genre_id` | `genres.genre_id` | CASCADE |
| `artist_stats` | `artist_id` | `artists.artist_id` | CASCADE |

**Política ON DELETE:**
- `CASCADE`: tablas puente y tablas derivadas. Eliminar un track elimina su perfil de audio y sus relaciones.
- `RESTRICT`: `tracks` respecto a `albums`. No se puede eliminar un álbum con canciones activas.

---

## Reglas de Negocio

### Integridad referencial
- No se puede insertar en `tracks` sin que el `album_id` exista en `albums`.
- No se puede insertar en `audio_features` sin que el `track_id` exista en `tracks`.
- No se puede insertar en ninguna tabla puente sin que sus FK existan.
- No se puede eliminar un álbum que tenga canciones asociadas.

### Restricciones de dominio (CHECK constraints)

| Columna | Restricción |
|---|---|
| `tracks.popularity` | BETWEEN 0 AND 100 |
| `tracks.duration_ms` | > 0 |
| `audio_features.danceability` | BETWEEN 0.0 AND 1.0 |
| `audio_features.energy` | BETWEEN 0.0 AND 1.0 |
| `audio_features.musical_key` | BETWEEN 0 AND 11 |
| `audio_features.mode` | IN (0, 1) |
| `audio_features.speechiness` | BETWEEN 0.0 AND 1.0 |
| `audio_features.acousticness` | BETWEEN 0.0 AND 1.0 |
| `audio_features.instrumentalness` | BETWEEN 0.0 AND 1.0 |
| `audio_features.liveness` | BETWEEN 0.0 AND 1.0 |
| `audio_features.valence` | BETWEEN 0.0 AND 1.0 |
| `audio_features.time_signature` | IN (1, 3, 4, 5) |
| `etl_logs.status` | IN ('running', 'success', 'failed', 'partial') |
| `etl_logs.records_*` | >= 0 |
| `genre_trends.avg_popularity` | BETWEEN 0.0 AND 100.0 |
| `genre_trends.avg_danceability` | BETWEEN 0.0 AND 1.0 |
| `genre_trends.avg_energy` | BETWEEN 0.0 AND 1.0 |
| `genre_trends.avg_valence` | BETWEEN 0.0 AND 1.0 |
| `artist_stats.avg_popularity` | BETWEEN 0.0 AND 100.0 |
| `artist_stats.track_count` | >= 0 |
| `artist_stats.explicit_count` | >= 0 |

### Reglas ETL
- Pipeline **idempotente**: `INSERT ... ON CONFLICT DO NOTHING` para entidades maestras.
- Registros con nulo en `artists`, `album_name` o `track_name` se descartan y cuentan en `records_rejected`.
- Registros que fallen validaciones de rango se descartan y registran en `etl_logs`.
- Al finalizar cada ejecución se inserta obligatoriamente una fila en `etl_logs`.

### Limitaciones conocidas del MVP

| ID | Limitación | Impacto |
|---|---|---|
| DD-03 | `album_name` tratado como único globalmente | Álbumes homónimos de artistas distintos se fusionan |
| DD-04 | `artist.name` como clave única | Artistas homónimos no se diferencian |

---

## Normalización

**1FN:** El campo `artists` del CSV contenía múltiples valores por celda (separados por `;`). Se normaliza en la tabla `artists` con relaciones N:M vía `track_artists` y `album_artists`.

**2FN:** Todas las tablas puente tienen PK compuesta sin dependencias parciales. `audio_features` depende completamente de su PK `track_id`.

**3FN:** No existen dependencias transitivas. Las columnas de audio se separaron a `audio_features` para hacer explícita su independencia de los metadatos de la canción (DD-10).

**Excepciones justificadas:** `genre_trends` y `artist_stats` son tablas desnormalizadas intencionalmente (DD-09). Almacenan métricas precalculadas para responder consultas analíticas sin recalcular en cada request.

---

## Diagrama Conceptual

```
┌─────────┐                  ┌──────────────┐   1:1   ┌─────────────────┐
│ ARTISTS │◄────────────────►│    TRACKS    │────────►│  AUDIO_FEATURES │
│         │  N:M             │              │         │                 │
│artist_id│ [track_artists]  │  track_id    │         │  danceability   │
│  name   │                  │  track_name  │         │  energy         │
└────┬────┘                  │  popularity  │         │  musical_key    │
     │                       │  duration_ms │         │  loudness       │
     │ N:M                   │  explicit    │         │  mode           │
     │ [album_artists]       │  album_id ──►├──┐      │  speechiness    │
     │                       │              │  │      │  acousticness   │
┌────▼────┐                  └──────┬───────┘  │      │  instrumentaln. │
│ ALBUMS  │                         │          │      │  liveness       │
│         │              [track_genres]        │      │  valence        │
│album_id │                         │          │      │  tempo          │
│  name   │                  ┌──────▼───────┐  │      │  time_signature │
└─────────┘                  │   GENRES     │  │      └─────────────────┘
                             │  genre_id    │  │
                             │  name        │  └──────► ALBUMS
                             └──────┬───────┘
                                    │ 1:1
                             ┌──────▼────────┐   ┌──────────────┐
                             │ GENRE_TRENDS  │   │ ARTIST_STATS │
                             │avg_popularity │   │avg_popularity│
                             │avg_danceab.   │   │track_count   │
                             │avg_energy     │   │explicit_count│
                             │avg_valence    │   └──────────────┘
                             │track_count    │
                             └───────────────┘

┌──────────┐
│ ETL_LOGS │  (infraestructura — sin FK saliente)
└──────────┘
```

---

## Diagrama Lógico

```
genres      (genre_id PK, name UNIQUE)
    ├──► track_genres   (track_id FK, genre_id FK)         ◄── tracks
    └──► genre_trends   (trend_id PK, genre_id FK UNIQUE)

artists     (artist_id PK, name UNIQUE)
    ├──► track_artists  (track_id FK, artist_id FK)        ◄── tracks
    ├──► album_artists  (album_id FK, artist_id FK)        ◄── albums
    └──► artist_stats   (stat_id PK, artist_id FK UNIQUE)

albums      (album_id PK, name UNIQUE)
    └──► tracks         (track_id PK, album_id FK,
                         track_name, popularity, duration_ms, explicit)
              └──► audio_features  (track_id PK/FK,
                                    danceability, energy, musical_key,
                                    loudness, mode, speechiness,
                                    acousticness, instrumentalness,
                                    liveness, valence, tempo, time_signature)

etl_logs    (log_id PK, run_timestamp, records_read,
             records_inserted, records_rejected, status, notes)
```

---

## Orden de Inserción ETL

| Paso | Tabla | Campo de origen en CSV | Dependencias |
|---|---|---|---|
| 1 | `genres` | `track_genre` | Ninguna |
| 2 | `artists` | `artists` (split `;`) | Ninguna |
| 3 | `albums` | `album_name` | Ninguna |
| 4 | `tracks` | `track_id`, `track_name`, `popularity`, `duration_ms`, `explicit` | `albums` |
| 5 | `audio_features` | `danceability`, `energy`, `key`, `loudness`, `mode`, `speechiness`, `acousticness`, `instrumentalness`, `liveness`, `valence`, `tempo`, `time_signature` | `tracks` |
| 6 | `track_artists` | `track_id` + `artists` | `tracks`, `artists` |
| 7 | `track_genres` | `track_id` + `track_genre` | `tracks`, `genres` |
| 8 | `album_artists` | `album_name` + `artists` | `albums`, `artists` |
| 9 | `genre_trends` | Agregado de `popularity`, `danceability`, `energy`, `valence` | `tracks`, `track_genres`, `genres` |
| 10 | `artist_stats` | Agregado de `popularity`, `explicit` | `tracks`, `track_artists`, `artists` |
| 11 | `etl_logs` | Resultado del proceso de carga | Al finalizar el pipeline |

> **Estrategia:** `INSERT ... ON CONFLICT DO NOTHING` para pasos 1–8. Garantiza idempotencia del pipeline (DD-07).