"""
init_clickhouse.py — Crea la base de datos y todas las tablas de Tracklytics v2.
Idempotente: usa CREATE TABLE IF NOT EXISTS en todas las tablas.

Uso local (apuntando a Docker):
    python init_clickhouse.py

Uso con credenciales custom:
    CLICKHOUSE_HOST=localhost CLICKHOUSE_PORT=8123 \
    CLICKHOUSE_DB=tracklytics CLICKHOUSE_USER=default CLICKHOUSE_PASSWORD=secret \
    python init_clickhouse.py
"""

import os
import sys

import clickhouse_connect

# ── Conexión ──────────────────────────────────────────────────────────────────

HOST = os.getenv("CLICKHOUSE_HOST",     "localhost")
PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
DB   = os.getenv("CLICKHOUSE_DB",       "tracklytics")
USER = os.getenv("CLICKHOUSE_USER",     "default")
PASS = os.getenv("CLICKHOUSE_PASSWORD", "")

# ── DDL ───────────────────────────────────────────────────────────────────────

DDL_STATEMENTS = [

    # ── Base de datos ─────────────────────────────────────────────────────────
    f"CREATE DATABASE IF NOT EXISTS {DB}",

    # ── Staging ───────────────────────────────────────────────────────────────
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.STG_RAW_TRACKS (
        track_id         String,
        artists          String,
        album_name       String,
        track_name       String,
        popularity       UInt8,
        duration_ms      UInt32,
        explicit         UInt8,
        danceability     Float32,
        energy           Float32,
        key              UInt8,
        loudness         Float32,
        mode             UInt8,
        speechiness      Float32,
        acousticness     Float32,
        instrumentalness Float32,
        liveness         Float32,
        valence          Float32,
        tempo            Float32,
        time_signature   UInt8,
        track_genre      String
    ) ENGINE = MergeTree()
    ORDER BY track_id
    """,

    # ── Dimensiones ───────────────────────────────────────────────────────────
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_ARTISTS (
        artist_id    UInt32,
        name         String,
        country      String,
        debut_year   UInt16,
        record_label String,
        artist_type  String,
        active       Bool
    ) ENGINE = MergeTree()
    ORDER BY artist_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_ALBUMS (
        album_id            UInt32,
        name                String,
        release_year        UInt16,
        album_type          String,
        total_tracks_listed UInt16,
        language            String,
        label               String
    ) ENGINE = MergeTree()
    ORDER BY album_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_GENRES (
        genre_id      UInt16,
        name          String,
        parent_genre  String,
        origin_decade String,
        origin_region String,
        mood          String,
        description   String
    ) ENGINE = MergeTree()
    ORDER BY genre_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_DATE (
        date_id         UInt8,
        week_number     UInt8,
        load_date       Date,
        semester        String,
        period_label    String,
        is_initial_load Bool,
        academic_month  UInt8
    ) ENGINE = MergeTree()
    ORDER BY date_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_MUSICAL_KEY (
        key_id           UInt8,
        key_number       UInt8,
        key_name         String,
        key_name_english String,
        associated_mood  String,
        common_genre     String
    ) ENGINE = MergeTree()
    ORDER BY key_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_MODE (
        mode_id            UInt8,
        mode_value         UInt8,
        mode_name          String,
        emotional_quality  String,
        common_use         String,
        theory_description String
    ) ENGINE = MergeTree()
    ORDER BY mode_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_TIME_SIGNATURE (
        time_signature_id UInt8,
        value             UInt8,
        name              String,
        feel              String,
        common_genre      String,
        description       String
    ) ENGINE = MergeTree()
    ORDER BY time_signature_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_EXPLICIT_TYPE (
        explicit_id     UInt8,
        value           UInt8,
        label           String,
        content_rating  String,
        platform_policy String,
        market_impact   String
    ) ENGINE = MergeTree()
    ORDER BY explicit_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_POPULARITY_RANGE (
        range_id            UInt8,
        label               String,
        min_value           UInt8,
        max_value           UInt8,
        market_tier         String,
        streaming_potential String
    ) ENGINE = MergeTree()
    ORDER BY range_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_TEMPO_RANGE (
        range_id     UInt8,
        label        String,
        min_bpm      Float32,
        max_bpm      Float32,
        musical_feel String,
        typical_use  String
    ) ENGINE = MergeTree()
    ORDER BY range_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_ENERGY_LEVEL (
        level_id         UInt8,
        label            String,
        min_value        Float32,
        max_value        Float32,
        listener_context String,
        mood_association String
    ) ENGINE = MergeTree()
    ORDER BY level_id
    """,

    # ── Tabla de hechos ───────────────────────────────────────────────────────
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_TRACKS (
        fact_id             UInt64,
        track_id            String,
        track_name          String,
        artist_id           UInt32,
        album_id            UInt32,
        genre_id            UInt16,
        date_id             UInt8,
        key_id              UInt8,
        mode_id             UInt8,
        time_signature_id   UInt8,
        explicit_id         UInt8,
        popularity_range_id UInt8,
        tempo_range_id      UInt8,
        energy_level_id     UInt8,
        popularity          UInt8,
        duration_ms         UInt32,
        danceability        Float32,
        energy              Float32,
        loudness            Float32,
        speechiness         Float32,
        acousticness        Float32,
        instrumentalness    Float32,
        liveness            Float32,
        valence             Float32,
        tempo               Float32,
        load_week           UInt8,
        is_synthetic        Bool,
        inserted_at         DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (genre_id, artist_id, load_week)
    """,

    # ── Infraestructura ETL ───────────────────────────────────────────────────
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.ETL_LOGS (
        log_id           UInt32,
        run_timestamp    DateTime DEFAULT now(),
        week_number      UInt8,
        records_read     UInt32,
        records_inserted UInt32,
        records_rejected UInt32,
        duration_seconds Float32,
        status           String
    ) ENGINE = MergeTree()
    ORDER BY (week_number, run_timestamp)
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.ETL_BATCH_CONTROL (
        batch_id     UInt32,
        week_number  UInt8,
        loaded_at    DateTime DEFAULT now(),
        record_count UInt32,
        checksum     String
    ) ENGINE = MergeTree()
    ORDER BY week_number
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_ENGAGEMENT_USUARIO (
        engagement_id   UUID DEFAULT generateUUIDv4(),
        user_id         String,
        fact_id         UInt64,
        event_type      Enum8('favorito_add'=1, 'favorito_remove'=2, 'reproduccion'=3),
        event_timestamp DateTime DEFAULT now(),
        is_synthetic    Bool,
        source          Enum8('app'=1, 'referencia'=2)
    ) ENGINE = MergeTree()
    ORDER BY (user_id, event_timestamp)
    """,
]

# ── Runner ────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"Conectando a ClickHouse {HOST}:{PORT} ...")
    try:
        # Conexión sin DB para poder crear la base de datos primero
        client = clickhouse_connect.get_client(
            host=HOST, port=PORT, username=USER, password=PASS,
        )
    except Exception as exc:
        print(f"ERROR: no se pudo conectar — {exc}")
        sys.exit(1)

    total   = len(DDL_STATEMENTS)
    success = 0

    for i, stmt in enumerate(DDL_STATEMENTS, 1):
        # Extrae un nombre legible para el log
        first_line = stmt.strip().splitlines()[0].strip()
        label = first_line[:80]

        try:
            client.command(stmt.strip())
            print(f"  [{i:02d}/{total}] OK  {label}")
            success += 1
        except Exception as exc:
            print(f"  [{i:02d}/{total}] ERR {label}")
            print(f"        {exc}")

    print()
    if success == total:
        print(f"✓ {success}/{total} sentencias ejecutadas correctamente.")
    else:
        failed = total - success
        print(f"✗ {failed}/{total} sentencias fallaron. Revisa los errores anteriores.")
        sys.exit(1)


if __name__ == "__main__":
    main()
