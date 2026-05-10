# Tracklytics — Análisis Técnico del Dataset
> **Fecha:** Mayo 2026 | **Sprint:** 0 — Planificación y Diseño Inicial | **Estado:** ✅ Completado

---

## 1. Resultados del Profiling Real

| Métrica | Valor |
|---|---|
| Total de filas | 114.000 |
| Total de columnas | 21 |
| Memoria en uso | 17.5 MB |
| Registros con nulos | 3 |
| Duplicados exactos | 0 |
| Géneros únicos | 114 |
| **Tracks únicos (`track_id`)** | **89.741** |

### Columnas detectadas

| # | Columna | Tipo | Nulos | Observación |
|---|---|---|---|---|
| 0 | `Unnamed: 0` | int64 | 0 | Índice residual del CSV. **Eliminar.** |
| 1 | `track_id` | str | 0 | Identificador Spotify. No único en el dataset. |
| 2 | `artists` | str | 1 | Puede contener múltiples artistas separados por `;` |
| 3 | `album_name` | str | 1 | Sin identificador único propio. |
| 4 | `track_name` | str | 1 | — |
| 5 | `popularity` | int64 | 0 | Rango esperado: 0–100 |
| 6 | `duration_ms` | int64 | 0 | Duración en milisegundos |
| 7 | `explicit` | bool | 0 | Ya llega como booleano. ✅ |
| 8 | `danceability` | float64 | 0 | Rango: 0.0–1.0 |
| 9 | `energy` | float64 | 0 | Rango: 0.0–1.0 |
| 10 | `key` | int64 | 0 | Tonalidad musical (Pitch Class 0–11). No es PK. |
| 11 | `loudness` | float64 | 0 | En dB. Valores negativos (~-60 a 0). |
| 12 | `mode` | int64 | 0 | 0 = menor, 1 = mayor. Semánticamente booleano. |
| 13 | `speechiness` | float64 | 0 | Rango: 0.0–1.0 |
| 14 | `acousticness` | float64 | 0 | Rango: 0.0–1.0 |
| 15 | `instrumentalness` | float64 | 0 | Rango: 0.0–1.0 |
| 16 | `liveness` | float64 | 0 | Rango: 0.0–1.0 |
| 17 | `valence` | float64 | 0 | Rango: 0.0–1.0 |
| 18 | `tempo` | float64 | 0 | En BPM. Sin rango fijo acotado. |
| 19 | `time_signature` | int64 | 0 | Valores típicos: 1, 3, 4, 5 |
| 20 | `track_genre` | str | 0 | 114 géneros únicos. Limpio. |

---

## 2. Problemas de Calidad Identificados

### 2.1 Columna `Unnamed: 0`
- **Problema:** Índice residual generado al exportar el CSV. No tiene valor semántico.
- **Decisión:** Eliminar en la primera línea del ETL al momento de la lectura.

### 2.2 Nulos (3 registros)
- **Afectados:** `artists` (1), `album_name` (1), `track_name` (1).
- **Decisión:** Descartar. Con 114.000 registros el impacto es irrelevante. No se imputan: una canción sin nombre o sin artista es inútil para el negocio.

### 2.3 `artists` — Artistas múltiples concatenados
- **Problema:** El campo puede contener varios artistas separados por `;` (ej: `Ingrid Michaelson;ZAYN`). Viola la Primera Forma Normal (1NF).
- **Decisión:** Separar por `;` con strip de espacios durante el ETL. Cada artista genera un registro individual en la tabla `artists`.

### 2.4 `track_id` no es único en el dataset
- **Confirmado con profiling:**
  - Filas totales: **114.000**
  - `track_id` únicos: **89.741**
  - Diferencia: ~24.259 filas son el mismo track clasificado en múltiples géneros.
- **Implicación crítica:** La relación track–género es **N:M**. Se requiere tabla puente `track_genres`. No se puede usar FK directa en `tracks`.
- **ETL:** Al cargar `tracks`, deduplicar por `track_id` antes de insertar.

### 2.5 `album_name` sin identificador único
- **Problema:** El dataset no provee `album_id`. El nombre es el único identificador disponible.
- **Riesgo:** Dos artistas distintos pueden tener un álbum con el mismo nombre.
- **Decisión MVP:** Tratar `album_name` como único globalmente. Documentado como limitación conocida. El ETL genera IDs sintéticos (seriales de PostgreSQL).

### 2.6 Columna `key` — Nombre ambiguo
- **Problema:** El nombre `key` puede confundirse con una clave de base de datos.
- **Decisión:** Documentar claramente que es un atributo musical (Pitch Class, entero 0–11). En el esquema SQL puede renombrarse a `musical_key` para evitar conflictos.

### 2.7 Columna `mode`
- **Problema:** Es semánticamente booleano (0/1) pero llega como `int64`.
- **Decisión:** Validar que solo existan valores 0 y 1. En PostgreSQL modelar como `SMALLINT` con CHECK constraint.

---

## 3. Transformaciones ETL Necesarias

### Fase 1 — Extracción y limpieza estructural
- Eliminar `Unnamed: 0` al momento de lectura del CSV.
- Eliminar los 3 registros con nulos en `artists`, `album_name` o `track_name`.
- Identificar y separar los ~24.259 registros duplicados de `track_id` (distintos géneros).

### Fase 2 — Validaciones de rango
- `popularity`: CHECK entre 0 y 100.
- Columnas flotantes de audio (`danceability`, `energy`, `speechiness`, `acousticness`, `instrumentalness`, `liveness`, `valence`): CHECK en [0.0, 1.0].
- `mode`: CHECK valores 0 o 1.
- `duration_ms`: CHECK mayor que 0.
- Registrar en `etl_logs` todos los registros que fallen estas validaciones.

### Fase 3 — Separación de entidades
A partir del dataset plano construir las entidades relacionales:

| Entidad | Origen en CSV | Transformación |
|---|---|---|
| `genres` | `track_genre` | Extraer valores únicos |
| `artists` | `artists` | Split por `;`, strip, deduplicar |
| `albums` | `album_name` | Deduplicar por nombre |
| `tracks` | Todas las columnas restantes | Deduplicar por `track_id`. Incluye metadatos y columnas de audio. |
| `track_artists` | `track_id` + `artists` | Tabla puente N:M |
| `track_genres` | `track_id` + `track_genre` | Tabla puente N:M |
| `genre_trends` | Agregado por `track_genre` | Calculado desde `tracks` + `track_genres` |

Las columnas de audio (`danceability`, `energy`, `musical_key`, `loudness`, `mode`, `speechiness`, `acousticness`, `instrumentalness`, `liveness`, `valence`, `tempo`, `time_signature`) se cargan directamente en `tracks`. No existe tabla separada para ellas.

### Fase 4 — Registro ETL
Cada ejecución registra en `etl_logs`: timestamp, registros procesados, insertados, rechazados y estado.

---

## 4. Modelo Relacional Propuesto

### Tablas MVP (11 tablas — cumple requisito mínimo de 10)

```
genres ──────────────────────────────────────────────┐
  │                                                   │
  └──── genre_trends (agregado analítico)             │
                                                      │
artists ───────────────────────────────────────┐      │
                                               │      │
albums ──────┐                                 │      │
             │                                 │      │
         tracks (incluye columnas de audio)    │      │
             │                                 │      │
             └──── track_artists (N:M) ────────┘      │
             │                                         │
             └──── track_genres  (N:M) ────────────────┘

users ──── business_reports

etl_logs (independiente)
```

### Descripción de tablas

#### `genres`
- PK: `genre_id` SERIAL
- `name` VARCHAR — UNIQUE, NOT NULL
- Origen: 114 géneros únicos del dataset

#### `artists`
- PK: `artist_id` SERIAL
- `name` VARCHAR — UNIQUE, NOT NULL
- **Limitación conocida:** El nombre se usa como identificador único. Homónimos no están soportados en el MVP.

#### `albums`
- PK: `album_id` SERIAL
- `name` VARCHAR — NOT NULL
- **Limitación conocida:** No existe `album_id` en el dataset. ID generado por PostgreSQL.

#### `tracks`
- PK: `track_id` VARCHAR — el string de Spotify
- `track_name` VARCHAR — NOT NULL
- `album_id` INTEGER — FK → `albums`
- `popularity` SMALLINT — CHECK (0–100)
- `duration_ms` INTEGER — CHECK (> 0)
- `explicit` BOOLEAN
- `danceability` NUMERIC(5,4) — CHECK [0.0–1.0]
- `energy` NUMERIC(5,4) — CHECK [0.0–1.0]
- `musical_key` SMALLINT
- `loudness` NUMERIC(6,3) — (puede ser negativo)
- `mode` SMALLINT — CHECK (0 o 1)
- `speechiness` NUMERIC(5,4) — CHECK [0.0–1.0]
- `acousticness` NUMERIC(5,4) — CHECK [0.0–1.0]
- `instrumentalness` NUMERIC(5,4) — CHECK [0.0–1.0]
- `liveness` NUMERIC(5,4) — CHECK [0.0–1.0]
- `valence` NUMERIC(5,4) — CHECK [0.0–1.0]
- `tempo` NUMERIC(6,3)
- `time_signature` SMALLINT

> **Decisión de diseño:** Las columnas de audio se integran directamente en `tracks`. Son atributos intrínsecos e inmutables de cada canción en el dataset. Una tabla separada `audio_features` añadiría un JOIN innecesario sin ningún beneficio para el MVP.

#### `track_artists` (tabla puente N:M)
- PK compuesta: (`track_id`, `artist_id`)
- FK: `track_id` → `tracks`
- FK: `artist_id` → `artists`

#### `track_genres` (tabla puente N:M) ⚠️ Confirmada necesaria
- PK compuesta: (`track_id`, `genre_id`)
- FK: `track_id` → `tracks`
- FK: `genre_id` → `genres`

#### `genre_trends`
- PK: `trend_id` SERIAL
- `genre_id` INTEGER — FK → `genres`
- `avg_popularity` NUMERIC(5,2)
- `avg_danceability` NUMERIC(5,4)
- `avg_energy` NUMERIC(5,4)
- `avg_valence` NUMERIC(5,4)
- `track_count` INTEGER
- `calculated_at` TIMESTAMP
- **Propósito:** Almacena métricas agregadas por género calculadas desde `tracks` + `track_genres`. Responde directamente las preguntas de negocio del sistema (popularidad por género, energía promedio, etc.) sin recalcular en cada request.

#### `etl_logs`
- PK: `log_id` SERIAL
- `run_timestamp` TIMESTAMP
- `records_read` INTEGER
- `records_inserted` INTEGER
- `records_rejected` INTEGER
- `status` VARCHAR
- `notes` TEXT

#### `users`
- PK: `user_id` SERIAL
- `username` VARCHAR — UNIQUE
- `email` VARCHAR — UNIQUE
- `role` VARCHAR
- `created_at` TIMESTAMP

#### `business_reports`
- PK: `report_id` SERIAL
- `title` VARCHAR
- `created_by` INTEGER — FK → `users`
- `created_at` TIMESTAMP
- `report_type` VARCHAR
- `parameters_json` JSONB

### Tablas futuras opcionales (no implementar en MVP)

| Tabla | Justificación para posponer |
|---|---|
| `popularity_snapshots` | Irrelevante con dataset estático |
| `artist_segments` | Mejor como vista materializada |
| `api_logs` | Útil solo en producción real |
| `dashboard_configs` | No requerido para analítica básica |

---

## 5. Reglas de Negocio y Validaciones

### Integridad referencial
- No se puede insertar en `tracks` sin que el `album_id` exista en `albums`.
- No se puede insertar en `track_artists` sin que `track_id` y `artist_id` existan.
- No se puede insertar en `track_genres` sin que `track_id` y `genre_id` existan.

### Restricciones de dominio (CHECK constraints en PostgreSQL)
- `popularity BETWEEN 0 AND 100`
- `duration_ms > 0`
- `mode IN (0, 1)`
- Columnas flotantes de audio `BETWEEN 0.0 AND 1.0` donde aplica
- `loudness` sin restricción de rango positivo (valores negativos son válidos)

### Reglas de inserción ETL
- El ETL no debe interrumpirse por un registro inválido. Registrar en `etl_logs` y continuar.
- El pipeline debe ser **idempotente**: dos ejecuciones no generan duplicados. Usar `INSERT ... ON CONFLICT DO NOTHING` para entidades maestras.
- La unicidad de `(track_id, genre_id)` en `track_genres` y `(track_id, artist_id)` en `track_artists` debe estar garantizada por constraint.

---

## 6. Orden Correcto de Carga ETL

El orden respeta estrictamente las dependencias de claves foráneas:

| Paso | Tabla | Dependencias |
|---|---|---|
| 1 | `genres` | Ninguna |
| 2 | `artists` | Ninguna |
| 3 | `albums` | Ninguna |
| 4 | `tracks` | `albums` — incluye todas las columnas de audio |
| 5 | `track_artists` | `tracks`, `artists` |
| 6 | `track_genres` | `tracks`, `genres` |
| 7 | `genre_trends` | `tracks`, `track_genres`, `genres` — calculado por agregación |
| 8 | `users` | Ninguna (seed manual) |
| 9 | `etl_logs` | Al finalizar el pipeline completo |
| 10 | `business_reports` | Generado desde la interfaz, no desde ETL |

---

## 7. Decisiones de Diseño Documentadas

| ID | Decisión | Justificación |
|---|---|---|
| DD-01 | `track_id` no es PK única en el dataset plano | Confirmado: 89.741 únicos vs 114.000 filas. Relación N:M con géneros. |
| DD-02 | Tabla puente `track_genres` es obligatoria | Consecuencia de DD-01. No se puede usar FK directa en `tracks`. |
| DD-03 | `album_name` como identificador único en MVP | El dataset no provee `album_id`. Limitación conocida y documentada. |
| DD-04 | `artists` usa nombre como clave única | Homónimos no soportados en MVP. Limitación conocida y documentada. |
| DD-05 | Columnas de audio integradas en `tracks` | Son atributos intrínsecos e inmutables de cada canción. Tabla separada añadiría JOIN innecesario sin beneficio analítico en el MVP. |
| DD-06 | `musical_key` en lugar de `key` | Evita confusión con conceptos de bases de datos. |
| DD-07 | ETL idempotente con `ON CONFLICT DO NOTHING` | Permite re-ejecuciones seguras sin duplicación de datos. |
| DD-08 | IDs sintéticos (SERIAL) para artistas y álbumes | El dataset no provee identificadores para estas entidades. IDs son propios de Tracklytics. |
| DD-09 | `genre_trends` como tabla de agregados precalculados | Responde preguntas de negocio sobre géneros sin recalcular en cada request. Más eficiente que vistas para dashboards. |

---

## 8. Próximo Paso

Con el análisis completado, el siguiente paso es:

1. **Diseñar el schema SQL completo** — DDL con todas las tablas, constraints y relaciones.
2. **Implementar el pipeline ETL en Python** — Respetando el orden de carga definido en la sección 6.

> El análisis de este documento constituye la base técnica para el Sprint 1 de Tracklytics.