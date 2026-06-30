# TRACKLYTICS v2 — Modelo Dimensional
> Base de datos: ClickHouse | Motor: MergeTree

---

## Arquitectura del pipeline

```
PocketBase (fuente) → Python ETL → Parquet (staging) → ClickHouse (FACT + DIMs)
```

**Reglas críticas:**
- Todo movimiento de datos ocurre desde Python (RT-01)
- Nunca se inserta directo de PocketBase a ClickHouse
- El flujo siempre pasa por Parquet
- Carga masiva en batches de mínimo 50.000 filas
- Pipeline idempotente: ETL_BATCH_CONTROL verifica semanas ya cargadas

---

## Tablas de Dimensión

### DIM_ARTISTS
**Origen:** columna `artists` del dataset (split por ";", deduplicado)
**Filas aprox.:** ~29.793

```sql
CREATE TABLE IF NOT EXISTS DIM_ARTISTS (
    artist_id     UInt32,
    name          String,
    country       String,
    debut_year    UInt16,
    record_label  String,
    artist_type   String,  -- Solo / Band / Duo / Collective
    active        Bool
) ENGINE = MergeTree()
ORDER BY artist_id;
```

---

### DIM_ALBUMS
**Origen:** columna `album_name` del dataset (deduplicado por nombre)
**Filas aprox.:** ~46.529

```sql
CREATE TABLE IF NOT EXISTS DIM_ALBUMS (
    album_id            UInt32,
    name                String,
    release_year        UInt16,
    album_type          String,  -- Studio / Live / Compilation / EP / Single
    total_tracks_listed UInt16,
    language            String,
    label               String
) ENGINE = MergeTree()
ORDER BY album_id;
```

---

### DIM_GENRES
**Origen:** columna `track_genre` del dataset (valores únicos)
**Filas:** 114

```sql
CREATE TABLE IF NOT EXISTS DIM_GENRES (
    genre_id       UInt16,
    name           String,
    parent_genre   String,
    origin_decade  String,
    origin_region  String,
    mood           String,  -- Energetic / Calm / Dark / Happy
    description    String
) ENGINE = MergeTree()
ORDER BY genre_id;
```

---

### DIM_DATE
**Origen:** generada por el ETL (no existe en el dataset)
**Filas:** 16 (una por semana académica)

```sql
CREATE TABLE IF NOT EXISTS DIM_DATE (
    date_id        UInt8,
    week_number    UInt8,
    load_date      Date,
    semester       String,
    period_label   String,
    is_initial_load Bool,
    academic_month UInt8
) ENGINE = MergeTree()
ORDER BY date_id;
```

---

### DIM_MUSICAL_KEY
**Origen:** columna `key` del dataset (valores 0-11)
**Filas:** 12

```sql
CREATE TABLE IF NOT EXISTS DIM_MUSICAL_KEY (
    key_id           UInt8,
    key_number       UInt8,
    key_name         String,
    key_name_english String,
    associated_mood  String,
    common_genre     String
) ENGINE = MergeTree()
ORDER BY key_id;
```

**Valores:**
| key_number | key_name | key_name_english |
|---|---|---|
| 0 | Do | C |
| 1 | Do# | C# |
| 2 | Re | D |
| 3 | Re# | D# |
| 4 | Mi | E |
| 5 | Fa | F |
| 6 | Fa# | F# |
| 7 | Sol | G |
| 8 | Sol# | G# |
| 9 | La | A |
| 10 | La# | A# |
| 11 | Si | B |

---

### DIM_MODE
**Origen:** columna `mode` del dataset (0=Minor, 1=Major)
**Filas:** 2

```sql
CREATE TABLE IF NOT EXISTS DIM_MODE (
    mode_id           UInt8,
    mode_value        UInt8,
    mode_name         String,
    emotional_quality String,
    common_use        String,
    theory_description String
) ENGINE = MergeTree()
ORDER BY mode_id;
```

---

### DIM_TIME_SIGNATURE
**Origen:** columna `time_signature` del dataset (valores 1, 3, 4, 5)
**Filas:** 4

```sql
CREATE TABLE IF NOT EXISTS DIM_TIME_SIGNATURE (
    time_signature_id UInt8,
    value             UInt8,
    name              String,
    feel              String,
    common_genre      String,
    description       String
) ENGINE = MergeTree()
ORDER BY time_signature_id;
```

---

### DIM_EXPLICIT_TYPE
**Origen:** columna `explicit` del dataset (0=Clean, 1=Explicit)
**Filas:** 2

```sql
CREATE TABLE IF NOT EXISTS DIM_EXPLICIT_TYPE (
    explicit_id     UInt8,
    value           UInt8,
    label           String,
    content_rating  String,
    platform_policy String,
    market_impact   String
) ENGINE = MergeTree()
ORDER BY explicit_id;
```

---

### DIM_POPULARITY_RANGE
**Origen:** columna `popularity` del dataset (0-100), discretizada
**Filas:** 3

```sql
CREATE TABLE IF NOT EXISTS DIM_POPULARITY_RANGE (
    range_id           UInt8,
    label              String,
    min_value          UInt8,
    max_value          UInt8,
    market_tier        String,
    streaming_potential String
) ENGINE = MergeTree()
ORDER BY range_id;
```

**Valores:**
| range_id | label | min_value | max_value | market_tier |
|---|---|---|---|---|
| 1 | Low | 0 | 33 | Niche |
| 2 | Medium | 34 | 66 | Mainstream |
| 3 | High | 67 | 100 | Viral |

---

### DIM_TEMPO_RANGE
**Origen:** columna `tempo` del dataset (BPM), discretizada
**Filas:** 4

```sql
CREATE TABLE IF NOT EXISTS DIM_TEMPO_RANGE (
    range_id     UInt8,
    label        String,
    min_bpm      Float32,
    max_bpm      Float32,
    musical_feel String,
    typical_use  String
) ENGINE = MergeTree()
ORDER BY range_id;
```

**Valores:**
| range_id | label | min_bpm | max_bpm |
|---|---|---|---|
| 1 | Slow | 0 | 89.9 |
| 2 | Moderate | 90 | 119.9 |
| 3 | Fast | 120 | 149.9 |
| 4 | Very Fast | 150 | 999 |

---

### DIM_ENERGY_LEVEL
**Origen:** columna `energy` del dataset (0.0-1.0), discretizada
**Filas:** 3

```sql
CREATE TABLE IF NOT EXISTS DIM_ENERGY_LEVEL (
    level_id         UInt8,
    label            String,
    min_value        Float32,
    max_value        Float32,
    listener_context String,
    mood_association String
) ENGINE = MergeTree()
ORDER BY level_id;
```

**Valores:**
| level_id | label | min_value | max_value | listener_context |
|---|---|---|---|---|
| 1 | Low | 0.0 | 0.33 | Relax |
| 2 | Medium | 0.34 | 0.66 | Focus |
| 3 | High | 0.67 | 1.0 | Workout |

---

## Tabla de Hechos

### FACT_TRACKS
**Filas iniciales:** ~114k reales
**Filas al final del semestre:** ~1.6M (+100k sintéticos/semana)

```sql
CREATE TABLE IF NOT EXISTS FACT_TRACKS (
    fact_id              UInt64,
    track_id             String,
    track_name           String,
    artist_id            UInt32,
    album_id             UInt32,
    genre_id             UInt16,
    date_id              UInt8,
    key_id               UInt8,
    mode_id              UInt8,
    time_signature_id    UInt8,
    explicit_id          UInt8,
    popularity_range_id  UInt8,
    tempo_range_id       UInt8,
    energy_level_id      UInt8,
    popularity           UInt8,
    duration_ms          UInt32,
    danceability         Float32,
    energy               Float32,
    loudness             Float32,
    speechiness          Float32,
    acousticness         Float32,
    instrumentalness     Float32,
    liveness             Float32,
    valence              Float32,
    tempo                Float32,
    load_week            UInt8,
    is_synthetic         Bool,
    inserted_at          DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (genre_id, artist_id, load_week);
```

---

## Tablas de Infraestructura

### STG_RAW_TRACKS
Zona de aterrizaje temporal. Espejo del Parquet en ClickHouse.
Se trunca después de cada carga exitosa.

```sql
CREATE TABLE IF NOT EXISTS STG_RAW_TRACKS (
    track_id        String,
    artists         String,
    album_name      String,
    track_name      String,
    popularity      UInt8,
    duration_ms     UInt32,
    explicit        UInt8,
    danceability    Float32,
    energy          Float32,
    key             UInt8,
    loudness        Float32,
    mode            UInt8,
    speechiness     Float32,
    acousticness    Float32,
    instrumentalness Float32,
    liveness        Float32,
    valence         Float32,
    tempo           Float32,
    time_signature  UInt8,
    track_genre     String
) ENGINE = MergeTree()
ORDER BY track_id;
```

---

### ETL_LOGS

```sql
CREATE TABLE IF NOT EXISTS ETL_LOGS (
    log_id           UInt32,
    run_timestamp    DateTime DEFAULT now(),
    week_number      UInt8,
    records_read     UInt32,
    records_inserted UInt32,
    records_rejected UInt32,
    duration_seconds Float32,
    status           String   -- success / failed / partial / skipped / manual_edit
) ENGINE = MergeTree()
ORDER BY (week_number, run_timestamp);
```

---

### ETL_BATCH_CONTROL

```sql
CREATE TABLE IF NOT EXISTS ETL_BATCH_CONTROL (
    batch_id     UInt32,
    week_number  UInt8,
    loaded_at    DateTime DEFAULT now(),
    record_count UInt32,
    checksum     String
) ENGINE = MergeTree()
ORDER BY week_number;
```

---

## Generación de datos sintéticos

A partir de la semana 2, el ETL genera +100k registros sintéticos por semana:

- `artist_id`, `album_id`, `genre_id` → tomados aleatoriamente de las DIMs reales
- Audio features (`danceability`, `energy`, `valence`, etc.) → distribuciones estadísticas basadas en rangos del dataset real
- `track_name` → generado con Faker
- `popularity` → generado dentro de rangos realistas por género
- `is_synthetic = true`
- `date_id` → semana correspondiente
- Seed fijo por semana: `seed = week_number * 42` (reproducible)

---

## Resumen

| # | Tabla | Tipo | Filas aprox. |
|---|---|---|---|
| 1 | DIM_ARTISTS | Dimensión | ~29.793 |
| 2 | DIM_ALBUMS | Dimensión | ~46.529 |
| 3 | DIM_GENRES | Dimensión | 114 |
| 4 | DIM_DATE | Dimensión | 16 |
| 5 | DIM_MUSICAL_KEY | Dimensión | 12 |
| 6 | DIM_MODE | Dimensión | 2 |
| 7 | DIM_TIME_SIGNATURE | Dimensión | 4 |
| 8 | DIM_EXPLICIT_TYPE | Dimensión | 2 |
| 9 | DIM_POPULARITY_RANGE | Dimensión | 3 |
| 10 | DIM_TEMPO_RANGE | Dimensión | 4 |
| 11 | DIM_ENERGY_LEVEL | Dimensión | 3 |
| 12 | FACT_TRACKS | Hechos | ~1.6M final |
| +1 | STG_RAW_TRACKS | Infraestructura | Temporal |
| +2 | ETL_LOGS | Infraestructura | ~16 |
| +3 | ETL_BATCH_CONTROL | Infraestructura | ~16 |

> **Nota de alcance (S6/S8):** este documento cubre exclusivamente el modelo dimensional
> técnico del catálogo (las 15 tablas listadas arriba). Desde S6 existe además
> `FACT_ENGAGEMENT_USUARIO` (favoritos/historial/reproducción) y desde S8
> `LOG_LLAMADAS_PARTNER` (log operativo de la API de partners) — ambas en la misma
> instancia de ClickHouse, pero clasificadas como modelo de datos *de negocio*, no
> técnico, según `openspec/config.yaml`. Ver `README.md` § Modelo de datos y
> `docs/BITACORA_S6.md`/`BITACORA_S8.md` para su esquema completo.