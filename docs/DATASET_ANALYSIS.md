# Tracklytics — Análisis Técnico del Dataset
> **Fecha:** Mayo 2026 | **Sprint:** 1 — ETL Completado | **Estado:** ✅ Completado

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

| # | Columna CSV | Tipo | Nulos | Tabla destino |
|---|---|---|---|---|
| 0 | `Unnamed: 0` | int64 | 0 | — Eliminar |
| 1 | `track_id` | str | 0 | `tracks` |
| 2 | `artists` | str | 1 | `artists`, `track_artists`, `album_artists` |
| 3 | `album_name` | str | 1 | `albums`, `album_artists` |
| 4 | `track_name` | str | 1 | `tracks` |
| 5 | `popularity` | int64 | 0 | `tracks`, `genre_trends`, `artist_stats` |
| 6 | `duration_ms` | int64 | 0 | `tracks` |
| 7 | `explicit` | bool | 0 | `tracks`, `artist_stats` |
| 8 | `danceability` | float64 | 0 | `audio_features`, `genre_trends` |
| 9 | `energy` | float64 | 0 | `audio_features`, `genre_trends` |
| 10 | `key` | int64 | 0 | `audio_features` (como `musical_key`) |
| 11 | `loudness` | float64 | 0 | `audio_features` |
| 12 | `mode` | int64 | 0 | `audio_features` |
| 13 | `speechiness` | float64 | 0 | `audio_features` |
| 14 | `acousticness` | float64 | 0 | `audio_features` |
| 15 | `instrumentalness` | float64 | 0 | `audio_features` |
| 16 | `liveness` | float64 | 0 | `audio_features` |
| 17 | `valence` | float64 | 0 | `audio_features`, `genre_trends` |
| 18 | `tempo` | float64 | 0 | `audio_features` |
| 19 | `time_signature` | int64 | 0 | `audio_features` |
| 20 | `track_genre` | str | 0 | `genres`, `track_genres`, `genre_trends` |

---

## 2. Problemas de Calidad Identificados

### 2.1 Columna `Unnamed: 0`
- **Problema:** Índice residual generado al exportar el CSV. Sin valor semántico.
- **Decisión:** Eliminar en la primera línea del ETL al momento de la lectura.

### 2.2 Nulos (3 registros)
- **Afectados:** `artists` (1), `album_name` (1), `track_name` (1).
- **Resultado real ETL:** Solo 1 registro descartado por nulo crítico.
- **Decisión:** Descartar. Con 114.000 registros el impacto es irrelevante.

### 2.3 `artists` — Artistas múltiples concatenados
- **Problema:** El campo puede contener varios artistas separados por `;`. Viola 1NF.
- **Decisión:** Separar por `;` con strip. Cada artista genera un registro en `artists`. Relaciones en `track_artists` y `album_artists`.

### 2.4 `track_id` no es único en el dataset
- **Confirmado:** 89.741 únicos en 114.000 filas. Diferencia: ~24.259 filas — mismo track en múltiples géneros.
- **Implicación:** Relación track–género es N:M. Tabla puente `track_genres` obligatoria (DD-01, DD-02).
- **ETL:** Deduplicar por `track_id` antes de insertar en `tracks`.

### 2.5 `album_name` sin identificador único
- **Problema:** El dataset no provee `album_id`.
- **Decisión MVP:** Tratar `album_name` como único globalmente (DD-03). IDs sintéticos generados por el ETL.

### 2.6 Columna `key` — Nombre ambiguo
- **Decisión:** Renombrar a `musical_key` en el schema SQL (DD-06). El ETL aplica `df.rename(columns={"key": "musical_key"})` antes de la carga.

### 2.7 Columna `mode`
- **Problema:** Semánticamente booleano (0/1) pero llega como `int64`.
- **Decisión:** Validar valores 0 y 1. Modelar como `SMALLINT` con CHECK constraint.

### 2.8 `track_name` y `album_name` — Longitud excesiva *(detectado en ETL)*
- **Problema:** Algunos nombres superan los 500 caracteres (colaboraciones con muchos artistas en el título).
- **Decisión:** Cambiar `track_name` en `tracks` y `name` en `albums` de `VARCHAR(500)` a `TEXT` (DD-12).

### 2.9 `numpy.int64` incompatible con psycopg2 *(detectado en ETL)*
- **Problema:** Contadores generados por pandas son `numpy.int64`, que psycopg2 no acepta.
- **Decisión:** Castear a `int` nativo de Python antes de insertar en `etl_logs` (DD-13).

### 2.10 `genre_trends` y `artist_stats` — Re-ejecución del ETL *(detectado en ETL)*
- **Problema:** A diferencia de las entidades maestras, estas tablas deben actualizarse en re-ejecuciones (no simplemente ignorar el conflicto).
- **Decisión:** Usar `ON CONFLICT DO UPDATE SET` en lugar de `DO NOTHING` para `genre_trends` y `artist_stats` (DD-14). Permite recalcular métricas sin limpiar la tabla.

---

## 3. Transformaciones ETL Implementadas

### Fase 1 — Extracción y limpieza estructural
- Eliminar `Unnamed: 0` al leer el CSV.
- Descartar registros con nulos en `artists`, `album_name` o `track_name` → **1 registro descartado**.

### Fase 2 — Validaciones de rango
- `popularity`: 0–100
- Columnas flotantes de audio: 0.0–1.0
- `mode`: 0 o 1
- `duration_ms`: > 0
- `musical_key`: 0–11
- `time_signature`: 1, 3, 4 o 5
- **Resultado real:** 163 registros rechazados.

### Fase 3 — Separación de entidades

| Entidad destino | Columnas de origen en CSV | Transformación | Filas resultantes |
|---|---|---|---|
| `genres` | `track_genre` | Extraer valores únicos | 114 |
| `artists` | `artists` | Split por `;`, strip, deduplicar | 29.793 |
| `albums` | `album_name` | Deduplicar por nombre | 46.529 |
| `tracks` | `track_id`, `track_name`, `popularity`, `duration_ms`, `explicit` | Deduplicar por `track_id` | 89.578 |
| `audio_features` | 12 columnas de audio | Separar de tracks. Relación 1:1. | 89.578 |
| `track_artists` | `track_id` + `artists` | Tabla puente N:M | 123.066 |
| `track_genres` | `track_id` + `track_genre` | Tabla puente N:M | 113.386 |
| `album_artists` | `album_name` + `artists` | Tabla puente N:M | 85.258 |
| `genre_trends` | `track_genre` + métricas | Agregado calculado | 114 |
| `artist_stats` | `artists` + métricas | Agregado calculado | 29.793 |

### Fase 4 — Registro ETL
Cada ejecución registra en `etl_logs`: timestamp, registros procesados, insertados, rechazados y estado.

---

## 4. Resultados Reales de la Ejecución ETL

| Métrica | Valor |
|---|---|
| Filas leídas del CSV | 114.000 |
| Descartados por nulos críticos | 1 |
| Rechazados por validaciones de rango | 163 |
| Filas válidas procesadas | 113.836 |
| Registros insertados en total | 607.209 |
| Status | ✅ success |

---

## 5. Modelo Relacional

### 10 tablas del dataset + 1 de infraestructura (cumple RT-06)

```
genres ──────────────────────────────────────────────┐
  └──── genre_trends (agregado por track_genre)       │
                                                      │
artists ──────────────────────────────────────┐       │
  └──── artist_stats (agregado por artists)   │       │
        │                                     │       │
        │ N:M [album_artists]                 │       │
        ▼                                     │       │
albums ──────┐                                │       │
             │                                │       │
         tracks ──── audio_features (1:1)     │       │
             │                                │       │
             └──── track_artists (N:M) ───────┘       │
             └──── track_genres  (N:M) ───────────────┘

etl_logs (infraestructura — sin FK saliente)
```

---

## 6. Orden Correcto de Carga ETL

| Paso | Tabla | Campo de origen en CSV | Dependencias |
|---|---|---|---|
| 1 | `genres` | `track_genre` | Ninguna |
| 2 | `artists` | `artists` (split `;`) | Ninguna |
| 3 | `albums` | `album_name` | Ninguna |
| 4 | `tracks` | `track_id`, `track_name`, `popularity`, `duration_ms`, `explicit` | `albums` |
| 5 | `audio_features` | 12 columnas de audio | `tracks` |
| 6 | `track_artists` | `track_id` + `artists` | `tracks`, `artists` |
| 7 | `track_genres` | `track_id` + `track_genre` | `tracks`, `genres` |
| 8 | `album_artists` | `album_name` + `artists` | `albums`, `artists` |
| 9 | `genre_trends` | Agregado por `track_genre` | `tracks`, `track_genres`, `genres` |
| 10 | `artist_stats` | Agregado por `artists` | `tracks`, `track_artists`, `artists` |
| 11 | `etl_logs` | Resultado del proceso | Al finalizar el pipeline |

---

## 7. Decisiones de Diseño Documentadas

| ID | Decisión | Justificación |
|---|---|---|
| DD-01 | `track_id` no es PK única en el dataset plano | 89.741 únicos vs 114.000 filas. Relación N:M con géneros. |
| DD-02 | Tabla puente `track_genres` obligatoria | Consecuencia de DD-01. No se puede usar FK directa en `tracks`. |
| DD-03 | `album_name` como identificador único en MVP | El dataset no provee `album_id`. Limitación conocida. |
| DD-04 | `artists` usa nombre como clave única | Homónimos no soportados en MVP. Limitación conocida. |
| DD-06 | `musical_key` en lugar de `key` | Evita confusión con conceptos de bases de datos. |
| DD-07 | ETL idempotente con `ON CONFLICT DO NOTHING` | Permite re-ejecuciones seguras sin duplicación (entidades maestras). |
| DD-08 | IDs sintéticos (SERIAL) para artistas y álbumes | El dataset no provee identificadores para estas entidades. |
| DD-09 | `genre_trends` y `artist_stats` como agregados precalculados | Responden preguntas de negocio sin recalcular en cada request. |
| DD-10 | `audio_features` separada de `tracks` | Normalización explícita de las 12 columnas de audio del CSV. |
| DD-11 | `album_artists` como tabla puente N:M | La relación álbum–artista existe en el CSV y no estaba modelada explícitamente. |
| DD-12 | `track_name` y `albums.name` como `TEXT` | Nombres en el dataset superan los 500 caracteres. `TEXT` elimina el límite artificial. |
| DD-13 | Contadores ETL casteados a `int` nativo | `numpy.int64` no es compatible con psycopg2. Cast explícito requerido. |
| DD-14 | `genre_trends` y `artist_stats` usan `ON CONFLICT DO UPDATE` | A diferencia de las entidades maestras, los agregados deben actualizarse en cada re-ejecución del ETL. |

---

## 8. Estado

Pipeline ETL ejecutado exitosamente en Mayo 2026. Dataset completo cargado en PostgreSQL.
API REST operativa en `http://localhost:8000`. Documentación Swagger en `http://localhost:8000/docs`.
Frontend web disponible en `http://localhost:8000/static/index.html` (4 páginas: Dashboard, Géneros, Artistas, Tracks).
**Próximo paso:** Sprint 4 — Integración general, optimización, testing y presentación final.