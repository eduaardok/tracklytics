-- =============================================================================
-- TRACKLYTICS — Schema SQL
-- PostgreSQL 16+
-- Sprint 0 — Planificación y Diseño Inicial
-- Generado: Mayo 2026
-- =============================================================================
-- Orden de creación respeta dependencias de claves foráneas:
--   genres → artists → albums → tracks → track_artists → track_genres
--   → genre_trends → users → etl_logs → business_reports
-- =============================================================================

-- -----------------------------------------------------------------------------
-- EXTENSIONES
-- -----------------------------------------------------------------------------
-- No se requieren extensiones adicionales para este schema.

-- =============================================================================
-- TABLA: genres
-- Catálogo maestro de géneros musicales extraídos del dataset.
-- 114 géneros únicos identificados en el profiling.
-- =============================================================================
CREATE TABLE IF NOT EXISTS genres (
    genre_id   SERIAL       NOT NULL,
    name       VARCHAR(100) NOT NULL,

    CONSTRAINT pk_genres        PRIMARY KEY (genre_id),
    CONSTRAINT uq_genres_name   UNIQUE      (name)
);

COMMENT ON TABLE  genres      IS 'Catálogo maestro de géneros musicales. 114 géneros únicos derivados del campo track_genre del dataset de Spotify.';
COMMENT ON COLUMN genres.genre_id IS 'Identificador sintético generado por PostgreSQL.';
COMMENT ON COLUMN genres.name     IS 'Nombre del género musical. Único en el sistema.';

-- -----------------------------------------------------------------------------
-- Índices: genres
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_genres_name ON genres (name);


-- =============================================================================
-- TABLA: artists
-- Artistas extraídos del campo artists del CSV (split por ";").
-- Limitación conocida (DD-04): homónimos no soportados en MVP.
-- =============================================================================
CREATE TABLE IF NOT EXISTS artists (
    artist_id  SERIAL       NOT NULL,
    name       VARCHAR(255) NOT NULL,

    CONSTRAINT pk_artists       PRIMARY KEY (artist_id),
    CONSTRAINT uq_artists_name  UNIQUE      (name)
);

COMMENT ON TABLE  artists           IS 'Artistas musicales. Extraídos del campo artists del CSV mediante split por ";". Homónimos no diferenciados en MVP (DD-04).';
COMMENT ON COLUMN artists.artist_id IS 'Identificador sintético generado por PostgreSQL.';
COMMENT ON COLUMN artists.name      IS 'Nombre del artista. Usado como clave única en MVP.';

-- -----------------------------------------------------------------------------
-- Índices: artists
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists (name);


-- =============================================================================
-- TABLA: albums
-- Álbumes deduplicados por nombre. Sin album_id en el dataset original.
-- Limitación conocida (DD-03): album_name tratado como único globalmente.
-- =============================================================================
CREATE TABLE IF NOT EXISTS albums (
    album_id   SERIAL       NOT NULL,
    name       VARCHAR(500) NOT NULL,

    CONSTRAINT pk_albums      PRIMARY KEY (album_id),
    CONSTRAINT uq_albums_name UNIQUE      (name)
);

COMMENT ON TABLE  albums          IS 'Álbumes musicales. El dataset no provee album_id; el nombre se usa como identificador único en MVP (DD-03). IDs generados por PostgreSQL (DD-08).';
COMMENT ON COLUMN albums.album_id IS 'Identificador sintético generado por PostgreSQL.';
COMMENT ON COLUMN albums.name     IS 'Nombre del álbum. Tratado como único globalmente en MVP.';

-- -----------------------------------------------------------------------------
-- Índices: albums
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_albums_name ON albums (name);


-- =============================================================================
-- TABLA: tracks
-- Entidad central del sistema. Deduplicada por track_id (89.741 únicos).
-- Incluye todas las columnas de audio como atributos intrínsecos (DD-05).
-- La columna key del CSV se renombra a musical_key (DD-06).
-- =============================================================================
CREATE TABLE IF NOT EXISTS tracks (
    track_id          VARCHAR(50)    NOT NULL,
    track_name        VARCHAR(500)   NOT NULL,
    album_id          INTEGER        NOT NULL,
    popularity        SMALLINT       NOT NULL    DEFAULT 0,
    duration_ms       INTEGER        NOT NULL,
    explicit          BOOLEAN        NOT NULL    DEFAULT FALSE,

    -- Columnas de audio (atributos intrínsecos — DD-05)
    danceability      NUMERIC(5, 4)  NOT NULL,
    energy            NUMERIC(5, 4)  NOT NULL,
    musical_key       SMALLINT       NOT NULL,   -- Pitch Class 0–11 (DD-06)
    loudness          NUMERIC(6, 3)  NOT NULL,   -- dB, puede ser negativo
    mode              SMALLINT       NOT NULL    DEFAULT 1,
    speechiness       NUMERIC(5, 4)  NOT NULL,
    acousticness      NUMERIC(5, 4)  NOT NULL,
    instrumentalness  NUMERIC(5, 4)  NOT NULL,
    liveness          NUMERIC(5, 4)  NOT NULL,
    valence           NUMERIC(5, 4)  NOT NULL,
    tempo             NUMERIC(6, 3)  NOT NULL,
    time_signature    SMALLINT       NOT NULL,

    CONSTRAINT pk_tracks
        PRIMARY KEY (track_id),

    CONSTRAINT fk_tracks_album
        FOREIGN KEY (album_id) REFERENCES albums (album_id)
        ON DELETE RESTRICT,

    -- CHECK constraints de dominio
    CONSTRAINT chk_tracks_popularity
        CHECK (popularity BETWEEN 0 AND 100),

    CONSTRAINT chk_tracks_duration_ms
        CHECK (duration_ms > 0),

    CONSTRAINT chk_tracks_danceability
        CHECK (danceability BETWEEN 0.0 AND 1.0),

    CONSTRAINT chk_tracks_energy
        CHECK (energy BETWEEN 0.0 AND 1.0),

    CONSTRAINT chk_tracks_musical_key
        CHECK (musical_key BETWEEN 0 AND 11),

    CONSTRAINT chk_tracks_mode
        CHECK (mode IN (0, 1)),

    CONSTRAINT chk_tracks_speechiness
        CHECK (speechiness BETWEEN 0.0 AND 1.0),

    CONSTRAINT chk_tracks_acousticness
        CHECK (acousticness BETWEEN 0.0 AND 1.0),

    CONSTRAINT chk_tracks_instrumentalness
        CHECK (instrumentalness BETWEEN 0.0 AND 1.0),

    CONSTRAINT chk_tracks_liveness
        CHECK (liveness BETWEEN 0.0 AND 1.0),

    CONSTRAINT chk_tracks_valence
        CHECK (valence BETWEEN 0.0 AND 1.0),

    CONSTRAINT chk_tracks_time_signature
        CHECK (time_signature IN (1, 3, 4, 5))
);

COMMENT ON TABLE  tracks                 IS 'Canciones únicas del dataset de Spotify. Deduplicadas por track_id (89.741 únicos de 114.000 filas). Incluye atributos de audio directamente (DD-05). La relación con géneros es N:M vía track_genres (DD-01, DD-02).';
COMMENT ON COLUMN tracks.track_id        IS 'Identificador de Spotify. PK del sistema. String original del dataset.';
COMMENT ON COLUMN tracks.musical_key     IS 'Tonalidad musical (Pitch Class 0–11). Renombrado desde "key" del CSV para evitar confusión con conceptos de BD (DD-06).';
COMMENT ON COLUMN tracks.mode           IS '0 = escala menor, 1 = escala mayor. Semánticamente booleano, modelado como SMALLINT con CHECK.';
COMMENT ON COLUMN tracks.loudness       IS 'Intensidad sonora en decibelios. Rango típico: -60 a 0 dB. Valores negativos son válidos.';
COMMENT ON COLUMN tracks.tempo          IS 'Tempo estimado en BPM (Beats Per Minute). Sin rango fijo acotado.';
COMMENT ON COLUMN tracks.time_signature IS 'Compás musical. Valores válidos: 1, 3, 4, 5.';

-- -----------------------------------------------------------------------------
-- Índices: tracks
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tracks_album_id   ON tracks (album_id);
CREATE INDEX IF NOT EXISTS idx_tracks_popularity ON tracks (popularity);
CREATE INDEX IF NOT EXISTS idx_tracks_track_name ON tracks (track_name);
CREATE INDEX IF NOT EXISTS idx_tracks_explicit   ON tracks (explicit);


-- =============================================================================
-- TABLA: track_artists  (tabla puente N:M)
-- Relación entre canciones y artistas.
-- Una canción puede tener múltiples artistas y un artista puede tener
-- múltiples canciones.
-- =============================================================================
CREATE TABLE IF NOT EXISTS track_artists (
    track_id   VARCHAR(50) NOT NULL,
    artist_id  INTEGER     NOT NULL,

    CONSTRAINT pk_track_artists
        PRIMARY KEY (track_id, artist_id),

    CONSTRAINT fk_track_artists_track
        FOREIGN KEY (track_id) REFERENCES tracks (track_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_track_artists_artist
        FOREIGN KEY (artist_id) REFERENCES artists (artist_id)
        ON DELETE CASCADE
);

COMMENT ON TABLE  track_artists           IS 'Tabla puente N:M entre tracks y artists. Generada durante ETL a partir del split por ";" del campo artists del CSV.';
COMMENT ON COLUMN track_artists.track_id  IS 'FK → tracks.track_id';
COMMENT ON COLUMN track_artists.artist_id IS 'FK → artists.artist_id';

-- -----------------------------------------------------------------------------
-- Índices: track_artists
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_track_artists_track_id  ON track_artists (track_id);
CREATE INDEX IF NOT EXISTS idx_track_artists_artist_id ON track_artists (artist_id);


-- =============================================================================
-- TABLA: track_genres  (tabla puente N:M)
-- Relación entre canciones y géneros.
-- CRÍTICA: confirmada por el profiling (DD-01, DD-02).
-- Un track_id aparece en múltiples filas del CSV con distintos géneros.
-- =============================================================================
CREATE TABLE IF NOT EXISTS track_genres (
    track_id  VARCHAR(50) NOT NULL,
    genre_id  INTEGER     NOT NULL,

    CONSTRAINT pk_track_genres
        PRIMARY KEY (track_id, genre_id),

    CONSTRAINT fk_track_genres_track
        FOREIGN KEY (track_id) REFERENCES tracks (track_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_track_genres_genre
        FOREIGN KEY (genre_id) REFERENCES genres (genre_id)
        ON DELETE CASCADE
);

COMMENT ON TABLE  track_genres          IS 'Tabla puente N:M entre tracks y genres. Obligatoria por DD-02: el mismo track_id puede clasificarse en múltiples géneros (89.741 tracks únicos vs 114.000 filas).';
COMMENT ON COLUMN track_genres.track_id IS 'FK → tracks.track_id';
COMMENT ON COLUMN track_genres.genre_id IS 'FK → genres.genre_id';

-- -----------------------------------------------------------------------------
-- Índices: track_genres
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_track_genres_track_id ON track_genres (track_id);
CREATE INDEX IF NOT EXISTS idx_track_genres_genre_id ON track_genres (genre_id);


-- =============================================================================
-- TABLA: genre_trends
-- Métricas agregadas por género. Precalculadas por el ETL (DD-09).
-- Evita recalcular en cada request de dashboards.
-- =============================================================================
CREATE TABLE IF NOT EXISTS genre_trends (
    trend_id          SERIAL         NOT NULL,
    genre_id          INTEGER        NOT NULL,
    avg_popularity    NUMERIC(5, 2)  NOT NULL,
    avg_danceability  NUMERIC(5, 4)  NOT NULL,
    avg_energy        NUMERIC(5, 4)  NOT NULL,
    avg_valence       NUMERIC(5, 4)  NOT NULL,
    track_count       INTEGER        NOT NULL    DEFAULT 0,
    calculated_at     TIMESTAMP      NOT NULL    DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_genre_trends
        PRIMARY KEY (trend_id),

    CONSTRAINT fk_genre_trends_genre
        FOREIGN KEY (genre_id) REFERENCES genres (genre_id)
        ON DELETE CASCADE,

    CONSTRAINT uq_genre_trends_genre_id
        UNIQUE (genre_id),

    CONSTRAINT chk_genre_trends_avg_popularity
        CHECK (avg_popularity BETWEEN 0.0 AND 100.0),

    CONSTRAINT chk_genre_trends_avg_danceability
        CHECK (avg_danceability BETWEEN 0.0 AND 1.0),

    CONSTRAINT chk_genre_trends_avg_energy
        CHECK (avg_energy BETWEEN 0.0 AND 1.0),

    CONSTRAINT chk_genre_trends_avg_valence
        CHECK (avg_valence BETWEEN 0.0 AND 1.0),

    CONSTRAINT chk_genre_trends_track_count
        CHECK (track_count >= 0)
);

COMMENT ON TABLE  genre_trends               IS 'Métricas agregadas por género. Precalculadas por el pipeline ETL tras cargar tracks y track_genres (DD-09). Responde preguntas de negocio sobre popularidad, energía y danceability por género sin recalcular en cada request.';
COMMENT ON COLUMN genre_trends.avg_popularity   IS 'Popularidad promedio (0–100) de todas las canciones del género.';
COMMENT ON COLUMN genre_trends.avg_danceability IS 'Danceability promedio (0.0–1.0) del género.';
COMMENT ON COLUMN genre_trends.avg_energy       IS 'Energía promedio (0.0–1.0) del género.';
COMMENT ON COLUMN genre_trends.avg_valence      IS 'Valencia (positividad musical) promedio (0.0–1.0) del género.';
COMMENT ON COLUMN genre_trends.track_count      IS 'Número de canciones asociadas al género en track_genres.';
COMMENT ON COLUMN genre_trends.calculated_at    IS 'Timestamp de la última ejecución del ETL que calculó estas métricas.';

-- -----------------------------------------------------------------------------
-- Índices: genre_trends
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_genre_trends_genre_id      ON genre_trends (genre_id);
CREATE INDEX IF NOT EXISTS idx_genre_trends_avg_popularity ON genre_trends (avg_popularity DESC);


-- =============================================================================
-- TABLA: users
-- Usuarios del sistema con roles diferenciados.
-- Seed manual — no cargado desde ETL.
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    user_id     SERIAL       NOT NULL,
    username    VARCHAR(100) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    role        VARCHAR(50)  NOT NULL    DEFAULT 'analyst',
    created_at  TIMESTAMP    NOT NULL    DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_users           PRIMARY KEY (user_id),
    CONSTRAINT uq_users_username  UNIQUE      (username),
    CONSTRAINT uq_users_email     UNIQUE      (email),
    CONSTRAINT chk_users_role     CHECK       (role IN ('admin', 'analyst', 'executive', 'curator'))
);

COMMENT ON TABLE  users            IS 'Usuarios del sistema Tracklytics. Roles: admin, analyst, executive, curator. Seed manual, no generado por ETL.';
COMMENT ON COLUMN users.role       IS 'Rol del usuario. Valores válidos: admin, analyst, executive, curator.';
COMMENT ON COLUMN users.created_at IS 'Timestamp de creación del usuario. Se asigna automáticamente.';

-- -----------------------------------------------------------------------------
-- Índices: users
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);


-- =============================================================================
-- TABLA: etl_logs
-- Registro de ejecuciones del pipeline ETL.
-- Se inserta al finalizar cada ejecución completa del pipeline.
-- =============================================================================
CREATE TABLE IF NOT EXISTS etl_logs (
    log_id             SERIAL       NOT NULL,
    run_timestamp      TIMESTAMP    NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    records_read       INTEGER      NOT NULL    DEFAULT 0,
    records_inserted   INTEGER      NOT NULL    DEFAULT 0,
    records_rejected   INTEGER      NOT NULL    DEFAULT 0,
    status             VARCHAR(20)  NOT NULL    DEFAULT 'running',
    notes              TEXT,

    CONSTRAINT pk_etl_logs        PRIMARY KEY (log_id),
    CONSTRAINT chk_etl_logs_status
        CHECK (status IN ('running', 'success', 'failed', 'partial')),
    CONSTRAINT chk_etl_logs_records_read
        CHECK (records_read >= 0),
    CONSTRAINT chk_etl_logs_records_inserted
        CHECK (records_inserted >= 0),
    CONSTRAINT chk_etl_logs_records_rejected
        CHECK (records_rejected >= 0)
);

COMMENT ON TABLE  etl_logs                  IS 'Registro histórico de ejecuciones del pipeline ETL. Cada ejecución completa genera una fila. Permite auditoría y diagnóstico del proceso de carga.';
COMMENT ON COLUMN etl_logs.run_timestamp    IS 'Momento de inicio de la ejecución ETL.';
COMMENT ON COLUMN etl_logs.records_read     IS 'Total de filas leídas del CSV fuente.';
COMMENT ON COLUMN etl_logs.records_inserted IS 'Total de registros insertados exitosamente en PostgreSQL.';
COMMENT ON COLUMN etl_logs.records_rejected IS 'Total de registros descartados por validaciones de rango o nulos.';
COMMENT ON COLUMN etl_logs.status          IS 'Estado de la ejecución: running, success, failed, partial.';
COMMENT ON COLUMN etl_logs.notes           IS 'Observaciones adicionales, mensajes de error o detalles de la ejecución.';

-- -----------------------------------------------------------------------------
-- Índices: etl_logs
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_etl_logs_run_timestamp ON etl_logs (run_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_etl_logs_status        ON etl_logs (status);


-- =============================================================================
-- TABLA: business_reports
-- Reportes analíticos generados desde la interfaz web por usuarios.
-- No generado por ETL; creado desde el frontend.
-- =============================================================================
CREATE TABLE IF NOT EXISTS business_reports (
    report_id        SERIAL       NOT NULL,
    title            VARCHAR(255) NOT NULL,
    created_by       INTEGER      NOT NULL,
    created_at       TIMESTAMP    NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    report_type      VARCHAR(100) NOT NULL,
    parameters_json  JSONB,

    CONSTRAINT pk_business_reports
        PRIMARY KEY (report_id),

    CONSTRAINT fk_business_reports_user
        FOREIGN KEY (created_by) REFERENCES users (user_id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_business_reports_title
        CHECK (LENGTH(TRIM(title)) > 0)
);

COMMENT ON TABLE  business_reports                 IS 'Reportes de inteligencia de negocio generados por usuarios desde la interfaz web. No forman parte del pipeline ETL.';
COMMENT ON COLUMN business_reports.report_type     IS 'Tipo de reporte (ej: genre_analysis, artist_ranking, audio_comparison).';
COMMENT ON COLUMN business_reports.parameters_json IS 'Parámetros de configuración del reporte en formato JSONB (filtros, rangos de fechas, géneros seleccionados, etc.).';
COMMENT ON COLUMN business_reports.created_by      IS 'FK → users.user_id. Usuario que generó el reporte.';

-- -----------------------------------------------------------------------------
-- Índices: business_reports
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_business_reports_created_by   ON business_reports (created_by);
CREATE INDEX IF NOT EXISTS idx_business_reports_report_type  ON business_reports (report_type);
CREATE INDEX IF NOT EXISTS idx_business_reports_created_at   ON business_reports (created_at DESC);

-- =============================================================================
-- FIN DEL SCHEMA — TRACKLYTICS v2.0.0
-- Total de tablas: 11 (cumple RT-06: mínimo 10)
--
-- Orden de carga ETL:
--   1. genres         — sin dependencias
--   2. artists        — sin dependencias
--   3. albums         — sin dependencias
--   4. tracks         — depende de albums
--   5. track_artists  — depende de tracks, artists
--   6. track_genres   — depende de tracks, genres
--   7. genre_trends   — calculado desde tracks + track_genres + genres
--   8. users          — seed manual
--   9. etl_logs       — al finalizar el pipeline
--  10. business_reports — desde la interfaz (no ETL)
-- =============================================================================