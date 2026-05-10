-- =============================================================================
-- TRACKLYTICS — Schema SQL
-- PostgreSQL 16+
-- Sprint 0 — Planificación y Diseño Inicial
-- Generado: Mayo 2026
-- =============================================================================
-- 10 tablas con origen directo o derivado del dataset de Spotify + etl_logs.
-- Orden de creación respeta dependencias de claves foráneas.
-- =============================================================================

-- =============================================================================
-- TABLA: genres
-- Origen: columna track_genre del CSV. 114 géneros únicos.
-- =============================================================================
CREATE TABLE IF NOT EXISTS genres (
    genre_id   SERIAL       NOT NULL,
    name       VARCHAR(100) NOT NULL,

    CONSTRAINT pk_genres      PRIMARY KEY (genre_id),
    CONSTRAINT uq_genres_name UNIQUE      (name)
);

COMMENT ON TABLE  genres          IS 'Catálogo de géneros musicales. 114 géneros únicos derivados del campo track_genre del CSV.';
COMMENT ON COLUMN genres.genre_id IS 'Identificador sintético generado por PostgreSQL.';
COMMENT ON COLUMN genres.name     IS 'Nombre del género musical. Único en el sistema.';

CREATE INDEX IF NOT EXISTS idx_genres_name ON genres (name);


-- =============================================================================
-- TABLA: artists
-- Origen: columna artists del CSV (split por ";").
-- Limitación conocida (DD-04): homónimos no soportados en MVP.
-- =============================================================================
CREATE TABLE IF NOT EXISTS artists (
    artist_id  SERIAL       NOT NULL,
    name       VARCHAR(255) NOT NULL,

    CONSTRAINT pk_artists      PRIMARY KEY (artist_id),
    CONSTRAINT uq_artists_name UNIQUE      (name)
);

COMMENT ON TABLE  artists           IS 'Artistas musicales. Extraídos del campo artists del CSV mediante split por ";". Homónimos no diferenciados en MVP (DD-04).';
COMMENT ON COLUMN artists.artist_id IS 'Identificador sintético generado por PostgreSQL.';
COMMENT ON COLUMN artists.name      IS 'Nombre del artista. Usado como clave única en MVP.';

CREATE INDEX IF NOT EXISTS idx_artists_name ON artists (name);


-- =============================================================================
-- TABLA: albums
-- Origen: columna album_name del CSV.
-- Limitación conocida (DD-03): album_name tratado como único globalmente.
-- =============================================================================
CREATE TABLE IF NOT EXISTS albums (
    album_id   SERIAL       NOT NULL,
    name       TEXT NOT NULL,

    CONSTRAINT pk_albums      PRIMARY KEY (album_id),
    CONSTRAINT uq_albums_name UNIQUE      (name)
);

COMMENT ON TABLE  albums          IS 'Álbumes musicales. Derivados del campo album_name del CSV. ID generado por PostgreSQL (DD-03, DD-08).';
COMMENT ON COLUMN albums.album_id IS 'Identificador sintético generado por PostgreSQL.';
COMMENT ON COLUMN albums.name     IS 'Nombre del álbum. Tratado como único globalmente en MVP.';

CREATE INDEX IF NOT EXISTS idx_albums_name ON albums (name);


-- =============================================================================
-- TABLA: tracks
-- Origen: columnas track_id, track_name, popularity, duration_ms, explicit.
-- Entidad central. Deduplicada por track_id (89.741 únicos de 114.000 filas).
-- Columnas de audio separadas en audio_features (DD-10).
-- =============================================================================
CREATE TABLE IF NOT EXISTS tracks (
    track_id    VARCHAR(50)  NOT NULL,
    track_name  TEXT NOT NULL,
    album_id    INTEGER      NOT NULL,
    popularity  SMALLINT     NOT NULL DEFAULT 0,
    duration_ms INTEGER      NOT NULL,
    explicit    BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_tracks PRIMARY KEY (track_id),

    CONSTRAINT fk_tracks_album
        FOREIGN KEY (album_id) REFERENCES albums (album_id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_tracks_popularity
        CHECK (popularity BETWEEN 0 AND 100),
    CONSTRAINT chk_tracks_duration_ms
        CHECK (duration_ms > 0)
);

COMMENT ON TABLE  tracks            IS 'Canciones únicas del dataset. Deduplicadas por track_id (89.741 únicos de 114.000 filas). Columnas de audio en audio_features (DD-10).';
COMMENT ON COLUMN tracks.track_id   IS 'Identificador nativo de Spotify. PK del sistema.';
COMMENT ON COLUMN tracks.popularity IS 'Popularidad de la canción. Rango 0–100.';
COMMENT ON COLUMN tracks.explicit   IS 'Indica si la canción tiene contenido explícito.';

CREATE INDEX IF NOT EXISTS idx_tracks_album_id   ON tracks (album_id);
CREATE INDEX IF NOT EXISTS idx_tracks_popularity ON tracks (popularity);
CREATE INDEX IF NOT EXISTS idx_tracks_track_name ON tracks (track_name);
CREATE INDEX IF NOT EXISTS idx_tracks_explicit   ON tracks (explicit);


-- =============================================================================
-- TABLA: audio_features
-- Origen: columnas danceability, energy, key, loudness, mode, speechiness,
--         acousticness, instrumentalness, liveness, valence, tempo,
--         time_signature del CSV.
-- Relación 1:1 con tracks (DD-10).
-- =============================================================================
CREATE TABLE IF NOT EXISTS audio_features (
    track_id         VARCHAR(50)   NOT NULL,
    danceability     NUMERIC(5, 4) NOT NULL,
    energy           NUMERIC(5, 4) NOT NULL,
    musical_key      SMALLINT      NOT NULL,
    loudness         NUMERIC(6, 3) NOT NULL,
    mode             SMALLINT      NOT NULL DEFAULT 1,
    speechiness      NUMERIC(5, 4) NOT NULL,
    acousticness     NUMERIC(5, 4) NOT NULL,
    instrumentalness NUMERIC(5, 4) NOT NULL,
    liveness         NUMERIC(5, 4) NOT NULL,
    valence          NUMERIC(5, 4) NOT NULL,
    tempo            NUMERIC(6, 3) NOT NULL,
    time_signature   SMALLINT      NOT NULL,

    CONSTRAINT pk_audio_features PRIMARY KEY (track_id),

    CONSTRAINT fk_audio_features_track
        FOREIGN KEY (track_id) REFERENCES tracks (track_id)
        ON DELETE CASCADE,

    CONSTRAINT chk_af_danceability     CHECK (danceability     BETWEEN 0.0 AND 1.0),
    CONSTRAINT chk_af_energy           CHECK (energy           BETWEEN 0.0 AND 1.0),
    CONSTRAINT chk_af_musical_key      CHECK (musical_key      BETWEEN 0 AND 11),
    CONSTRAINT chk_af_mode             CHECK (mode             IN (0, 1)),
    CONSTRAINT chk_af_speechiness      CHECK (speechiness      BETWEEN 0.0 AND 1.0),
    CONSTRAINT chk_af_acousticness     CHECK (acousticness     BETWEEN 0.0 AND 1.0),
    CONSTRAINT chk_af_instrumentalness CHECK (instrumentalness BETWEEN 0.0 AND 1.0),
    CONSTRAINT chk_af_liveness         CHECK (liveness         BETWEEN 0.0 AND 1.0),
    CONSTRAINT chk_af_valence          CHECK (valence          BETWEEN 0.0 AND 1.0),
    CONSTRAINT chk_af_time_signature   CHECK (time_signature   IN (1, 3, 4, 5))
);

COMMENT ON TABLE  audio_features             IS 'Atributos de audio de cada canción. Relación 1:1 con tracks. Origen: 12 columnas de audio del CSV (DD-10).';
COMMENT ON COLUMN audio_features.musical_key IS 'Tonalidad musical (Pitch Class 0–11). Renombrado desde "key" del CSV (DD-06).';
COMMENT ON COLUMN audio_features.mode        IS '0 = escala menor, 1 = escala mayor.';
COMMENT ON COLUMN audio_features.loudness    IS 'Intensidad sonora en dB. Valores negativos son válidos (~-60 a 0).';
COMMENT ON COLUMN audio_features.tempo       IS 'Tempo estimado en BPM.';

CREATE INDEX IF NOT EXISTS idx_af_energy       ON audio_features (energy);
CREATE INDEX IF NOT EXISTS idx_af_danceability ON audio_features (danceability);
CREATE INDEX IF NOT EXISTS idx_af_valence      ON audio_features (valence);
CREATE INDEX IF NOT EXISTS idx_af_tempo        ON audio_features (tempo);


-- =============================================================================
-- TABLA: track_artists  (tabla puente N:M)
-- Origen: columnas track_id + artists del CSV.
-- Una canción puede tener múltiples artistas y viceversa.
-- =============================================================================
CREATE TABLE IF NOT EXISTS track_artists (
    track_id  VARCHAR(50) NOT NULL,
    artist_id INTEGER     NOT NULL,

    CONSTRAINT pk_track_artists PRIMARY KEY (track_id, artist_id),

    CONSTRAINT fk_track_artists_track
        FOREIGN KEY (track_id) REFERENCES tracks (track_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_track_artists_artist
        FOREIGN KEY (artist_id) REFERENCES artists (artist_id)
        ON DELETE CASCADE
);

COMMENT ON TABLE track_artists IS 'Tabla puente N:M entre tracks y artists. Generada desde el split por ";" del campo artists del CSV.';

CREATE INDEX IF NOT EXISTS idx_track_artists_track_id  ON track_artists (track_id);
CREATE INDEX IF NOT EXISTS idx_track_artists_artist_id ON track_artists (artist_id);


-- =============================================================================
-- TABLA: track_genres  (tabla puente N:M)
-- Origen: columnas track_id + track_genre del CSV.
-- Obligatoria: 89.741 tracks únicos en 114.000 filas (DD-01, DD-02).
-- =============================================================================
CREATE TABLE IF NOT EXISTS track_genres (
    track_id VARCHAR(50) NOT NULL,
    genre_id INTEGER     NOT NULL,

    CONSTRAINT pk_track_genres PRIMARY KEY (track_id, genre_id),

    CONSTRAINT fk_track_genres_track
        FOREIGN KEY (track_id) REFERENCES tracks (track_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_track_genres_genre
        FOREIGN KEY (genre_id) REFERENCES genres (genre_id)
        ON DELETE CASCADE
);

COMMENT ON TABLE track_genres IS 'Tabla puente N:M entre tracks y genres. Obligatoria: el mismo track_id aparece bajo múltiples géneros en el CSV (DD-01, DD-02).';

CREATE INDEX IF NOT EXISTS idx_track_genres_track_id ON track_genres (track_id);
CREATE INDEX IF NOT EXISTS idx_track_genres_genre_id ON track_genres (genre_id);


-- =============================================================================
-- TABLA: album_artists  (tabla puente N:M)
-- Origen: columnas album_name + artists del CSV.
-- Un álbum puede estar asociado a múltiples artistas y viceversa.
-- =============================================================================
CREATE TABLE IF NOT EXISTS album_artists (
    album_id  INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,

    CONSTRAINT pk_album_artists PRIMARY KEY (album_id, artist_id),

    CONSTRAINT fk_album_artists_album
        FOREIGN KEY (album_id) REFERENCES albums (album_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_album_artists_artist
        FOREIGN KEY (artist_id) REFERENCES artists (artist_id)
        ON DELETE CASCADE
);

COMMENT ON TABLE album_artists IS 'Tabla puente N:M entre albums y artists. Derivada de las columnas album_name y artists del CSV. Un álbum puede pertenecer a múltiples artistas.';

CREATE INDEX IF NOT EXISTS idx_album_artists_album_id  ON album_artists (album_id);
CREATE INDEX IF NOT EXISTS idx_album_artists_artist_id ON album_artists (artist_id);


-- =============================================================================
-- TABLA: genre_trends
-- Origen: agregado de popularity, danceability, energy, valence por track_genre.
-- Precalculada por el ETL (DD-09).
-- =============================================================================
CREATE TABLE IF NOT EXISTS genre_trends (
    trend_id         SERIAL        NOT NULL,
    genre_id         INTEGER       NOT NULL,
    avg_popularity   NUMERIC(5, 2) NOT NULL,
    avg_danceability NUMERIC(5, 4) NOT NULL,
    avg_energy       NUMERIC(5, 4) NOT NULL,
    avg_valence      NUMERIC(5, 4) NOT NULL,
    track_count      INTEGER       NOT NULL DEFAULT 0,
    calculated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_genre_trends       PRIMARY KEY (trend_id),
    CONSTRAINT uq_genre_trends_genre UNIQUE      (genre_id),

    CONSTRAINT fk_genre_trends_genre
        FOREIGN KEY (genre_id) REFERENCES genres (genre_id)
        ON DELETE CASCADE,

    CONSTRAINT chk_gt_avg_popularity   CHECK (avg_popularity   BETWEEN 0.0 AND 100.0),
    CONSTRAINT chk_gt_avg_danceability CHECK (avg_danceability BETWEEN 0.0 AND 1.0),
    CONSTRAINT chk_gt_avg_energy       CHECK (avg_energy       BETWEEN 0.0 AND 1.0),
    CONSTRAINT chk_gt_avg_valence      CHECK (avg_valence      BETWEEN 0.0 AND 1.0),
    CONSTRAINT chk_gt_track_count      CHECK (track_count      >= 0)
);

COMMENT ON TABLE  genre_trends             IS 'Métricas agregadas por género. Calculadas desde tracks + track_genres. Origen: campos popularity, danceability, energy, valence del CSV (DD-09).';
COMMENT ON COLUMN genre_trends.track_count IS 'Número de canciones asociadas al género.';
COMMENT ON COLUMN genre_trends.calculated_at IS 'Timestamp de la última ejecución ETL que calculó estas métricas.';

CREATE INDEX IF NOT EXISTS idx_genre_trends_genre_id        ON genre_trends (genre_id);
CREATE INDEX IF NOT EXISTS idx_genre_trends_avg_popularity  ON genre_trends (avg_popularity DESC);


-- =============================================================================
-- TABLA: artist_stats
-- Origen: agregado de popularity, explicit por artists del CSV.
-- Precalculada por el ETL (DD-09). Análoga a genre_trends.
-- =============================================================================
CREATE TABLE IF NOT EXISTS artist_stats (
    stat_id        SERIAL        NOT NULL,
    artist_id      INTEGER       NOT NULL,
    avg_popularity NUMERIC(5, 2) NOT NULL,
    track_count    INTEGER       NOT NULL DEFAULT 0,
    explicit_count INTEGER       NOT NULL DEFAULT 0,
    calculated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_artist_stats  PRIMARY KEY (stat_id),
    CONSTRAINT uq_artist_stats  UNIQUE      (artist_id),

    CONSTRAINT fk_artist_stats_artist
        FOREIGN KEY (artist_id) REFERENCES artists (artist_id)
        ON DELETE CASCADE,

    CONSTRAINT chk_as_avg_popularity CHECK (avg_popularity BETWEEN 0.0 AND 100.0),
    CONSTRAINT chk_as_track_count    CHECK (track_count    >= 0),
    CONSTRAINT chk_as_explicit_count CHECK (explicit_count >= 0)
);

COMMENT ON TABLE  artist_stats                IS 'Métricas agregadas por artista. Calculadas desde tracks + track_artists. Origen: campos popularity y explicit del CSV (DD-09).';
COMMENT ON COLUMN artist_stats.avg_popularity IS 'Popularidad promedio (0–100) de todas las canciones del artista.';
COMMENT ON COLUMN artist_stats.track_count    IS 'Número total de canciones del artista en el dataset.';
COMMENT ON COLUMN artist_stats.explicit_count IS 'Número de canciones con contenido explícito del artista.';

CREATE INDEX IF NOT EXISTS idx_artist_stats_artist_id      ON artist_stats (artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_stats_avg_popularity ON artist_stats (avg_popularity DESC);


-- =============================================================================
-- TABLA: etl_logs
-- Registro de ejecuciones del pipeline ETL sobre el dataset de Spotify.
-- Tabla de infraestructura — no contiene datos del CSV.
-- =============================================================================
CREATE TABLE IF NOT EXISTS etl_logs (
    log_id           SERIAL      NOT NULL,
    run_timestamp    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    records_read     INTEGER     NOT NULL DEFAULT 0,
    records_inserted INTEGER     NOT NULL DEFAULT 0,
    records_rejected INTEGER     NOT NULL DEFAULT 0,
    status           VARCHAR(20) NOT NULL DEFAULT 'running',
    notes            TEXT,

    CONSTRAINT pk_etl_logs      PRIMARY KEY (log_id),
    CONSTRAINT chk_etl_status   CHECK (status           IN ('running', 'success', 'failed', 'partial')),
    CONSTRAINT chk_etl_read     CHECK (records_read     >= 0),
    CONSTRAINT chk_etl_inserted CHECK (records_inserted >= 0),
    CONSTRAINT chk_etl_rejected CHECK (records_rejected >= 0)
);

COMMENT ON TABLE  etl_logs                  IS 'Registro histórico de ejecuciones del pipeline ETL. Tabla de infraestructura — no contiene datos del CSV.';
COMMENT ON COLUMN etl_logs.records_read     IS 'Total de filas leídas del CSV fuente.';
COMMENT ON COLUMN etl_logs.records_inserted IS 'Total de registros insertados exitosamente.';
COMMENT ON COLUMN etl_logs.records_rejected IS 'Total de registros descartados por validaciones.';
COMMENT ON COLUMN etl_logs.status          IS 'Estado: running, success, failed, partial.';

CREATE INDEX IF NOT EXISTS idx_etl_logs_run_timestamp ON etl_logs (run_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_etl_logs_status        ON etl_logs (status);


-- =============================================================================
-- FIN DEL SCHEMA — TRACKLYTICS v4.0.0
--
-- 10 tablas con origen en el dataset + 1 de infraestructura ETL
--
-- Tablas del dataset:
--   1. genres         — campo track_genre
--   2. artists        — campo artists (split ";")
--   3. albums         — campo album_name
--   4. tracks         — track_id, track_name, popularity, duration_ms, explicit
--   5. audio_features — 12 columnas de audio (1:1 con tracks)
--   6. track_artists  — track_id + artists (N:M)
--   7. track_genres   — track_id + track_genre (N:M)
--   8. album_artists  — album_name + artists (N:M)
--   9. genre_trends   — agregado por track_genre
--  10. artist_stats   — agregado por artists
--
-- Infraestructura:
--  11. etl_logs       — registro del proceso de carga
-- =============================================================================