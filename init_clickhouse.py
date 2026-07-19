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

# Consola Windows por defecto usa cp1252, que no puede imprimir ✓/✗ — fuerza
# UTF-8 en stdout para que el script no truene al final de una corrida exitosa.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

# ── Conexión ──────────────────────────────────────────────────────────────────

HOST = os.getenv("CLICKHOUSE_HOST",     "localhost")
PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
DB   = os.getenv("CLICKHOUSE_DB",       "tracklytics")
USER = os.getenv("CLICKHOUSE_USER",     "default")
PASS = os.getenv("CLICKHOUSE_PASSWORD", "")

# Fecha en que se añadió DIM_USUARIO.email_verificado (change
# p2-descubrimiento-comunidad). Las cuentas anteriores a este corte se dan por
# verificadas; las posteriores pasan por el flujo de verificación. Es una
# constante fija a propósito: mueve el corte solo si se rehace la migración.
FECHA_CORTE_VERIFICACION = "2026-07-19 00:00:00"

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
    # NOTA (capability `distribucion`): `record_label`/`label` (texto libre) fueron
    # reemplazados por `sello_id` (FK a DIM_SELLO_DISCOGRAFICO, ver más abajo). En una
    # instalación existente esta migración se aplica con `scripts/migrar_sellos.py`
    # (CREATE TABLE IF NOT EXISTS no altera una tabla ya creada con el esquema viejo).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_ARTISTS (
        artist_id    UInt32,
        name         String,
        country      String,
        debut_year   UInt16,
        sello_id     UInt32 DEFAULT 0,
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
        sello_id            UInt32 DEFAULT 0
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
        source_type         Enum8('real'=1, 'synthetic'=2, 'user_uploaded'=3),
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

    # ── Log operativo de llamadas de la API de partners (capability `partners`) ─
    # No es FACT_INTEGRACION_PARTNER (esa la alimentaría un pipeline ETL futuro,
    # fuera de alcance de esta capability): este es el registro crudo por
    # llamada, escrito directamente por FastAPI igual que FACT_ENGAGEMENT_USUARIO.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.LOG_LLAMADAS_PARTNER (
        log_id       UUID DEFAULT generateUUIDv4(),
        partner_id   String,
        api_key_used String,
        endpoint     String,
        tier_usado   String,
        resultado    Enum8('success'=1, 'auth_rejected'=2, 'tier_rejected'=3, 'error'=4),
        registros    UInt32,
        duracion_ms  Float32,
        timestamp    DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (partner_id, timestamp)
    """,

    # ── Capability `seguridad`: identidad, sesiones, permisos, auditoría ────────
    # Excepción deliberada a RT-05 (documentada en design.md de la capability
    # `seguridad`): dominio operativo/transaccional modelado en ClickHouse.
    # PocketBase sigue siendo el único almacén de credenciales; estas tablas son
    # un espejo/log analítico y de auditoría, nunca la fuente de verdad para
    # autorización en caliente.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_USUARIO (
        usuario_id     String,
        email          String,
        nombre         String,
        pais           String,
        fecha_registro DateTime,
        rol            String,
        -- Perfiles públicos/privados (S10 ronda 2): privado por defecto —
        -- un usuario recién registrado no debería exponer su perfil hasta
        -- que lo decida explícitamente en Mi Perfil.
        perfil_publico UInt8 DEFAULT 0,
        actualizado_en DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(actualizado_en)
    ORDER BY usuario_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_DISPOSITIVO (
        dispositivo_id     String,
        usuario_id         String,
        tipo               String,
        os                 String,
        app_version        String,
        primera_vez_visto  DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, dispositivo_id)
    """,

    # FACT_SESION: apertura (login) e cierre (logout) son dos INSERT distintos
    # sobre el mismo sesion_id; ReplacingMergeTree resuelve a la fila de cierre
    # cuando existe (fecha_fin_version pasa de 0 a 1). Una sesión sin logout
    # explícito queda con fecha_fin/duracion en NULL indefinidamente — ver
    # design.md, decisión "FACT_SESION con apertura/cierre".
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_SESION (
        sesion_id          String,
        usuario_id         String,
        dispositivo_id     String,
        fecha_inicio       DateTime,
        fecha_fin          Nullable(DateTime),
        duracion           Nullable(Float32),
        fecha_fin_version  UInt8 DEFAULT 0
    ) ENGINE = ReplacingMergeTree(fecha_fin_version)
    ORDER BY sesion_id
    """,

    # FACT_PERMISO_USUARIO: append-only. El estado vigente de un permiso se
    # resuelve con argMax(permitido, fecha_asignacion) por
    # (usuario_id, recurso, accion) — nunca se borra una fila (ver design.md).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_PERMISO_USUARIO (
        usuario_id       String,
        recurso          String,
        accion           String,
        permitido        Bool,
        fecha_asignacion DateTime DEFAULT now(),
        asignado_por     String
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, recurso, accion, fecha_asignacion)
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_AUDIT_LOG (
        audit_id       UUID DEFAULT generateUUIDv4(),
        usuario_id     String,
        accion         String,
        tabla_afectada String,
        antes          String,
        despues        String,
        timestamp      DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, timestamp)
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_ERROR_SISTEMA (
        error_id   UUID DEFAULT generateUUIDv4(),
        codigo     String,
        mensaje    String,
        servicio   String,
        usuario_id Nullable(String),
        timestamp  DateTime DEFAULT now(),
        resolved   Bool DEFAULT false
    ) ENGINE = MergeTree()
    ORDER BY timestamp
    """,

    # ── Capability `facturacion`: métodos de pago, transacciones e invoices ─────
    # Sin fricción con RT-05 (a diferencia de `seguridad`): estas tres tablas son
    # append-only por naturaleza — un método de pago no se edita una vez creado,
    # y una transacción/invoice ya ocurrieron y no se modifican retroactivamente
    # (design.md de la capability `facturacion`). No hay pasarela de pago real;
    # el resultado de cada transacción se simula dentro de la propia API.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_METODO_PAGO (
        metodo_pago_id     UUID DEFAULT generateUUIDv4(),
        usuario_id         String,
        tipo               String,
        ultimos_4_digitos  String,
        pais               String,
        nombre_titular     String DEFAULT '',
        direccion          String DEFAULT '',
        ciudad             String DEFAULT '',
        codigo_postal      String DEFAULT '',
        creado_en          DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, metodo_pago_id)
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_TRANSACCION_PAGO (
        transaccion_id  UUID DEFAULT generateUUIDv4(),
        usuario_id      String,
        metodo_pago_id  UUID,
        suscripcion_id  String,
        monto           Float32,
        moneda          String,
        estado          Enum8('pendiente'=1, 'exitosa'=2, 'fallida'=3),
        fecha           DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, fecha)
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_INVOICE (
        invoice_id     UUID DEFAULT generateUUIDv4(),
        usuario_id     String,
        transaccion_id UUID,
        monto          Float32,
        iva            Float32,
        fecha_emision  DateTime DEFAULT now(),
        estado         String
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, fecha_emision)
    """,

    # ── Capability `creadores`: cuentas de artista y subida/aprobación de tracks ─
    # DIM_CUENTA_ARTISTA y FACT_SUBIDA_TRACK usan ReplacingMergeTree (mismo
    # patrón que DIM_USUARIO/FACT_SESION en `seguridad`): ambas nacen en un
    # estado y se resuelven una sola vez (pendiente -> aprobada/rechazada).
    # STG_ARTIST_UPLOADS es append-only y permanente (a diferencia de
    # STG_RAW_TRACKS, nunca se trunca — ver design.md de la capability).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_CUENTA_ARTISTA (
        cuenta_artista_id String,
        usuario_id        String,
        nombre_artistico  String,
        estado_cuenta     Enum8('pendiente'=1, 'aprobada'=2, 'rechazada'=3),
        fecha_solicitud   DateTime,
        fecha_resolucion  Nullable(DateTime),
        admin_resolutor_id Nullable(String),
        actualizado_en    DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(actualizado_en)
    ORDER BY cuenta_artista_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_ESTADO_REVISION (
        estado_revision_id UInt8,
        nombre             String
    ) ENGINE = MergeTree()
    ORDER BY estado_revision_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.STG_ARTIST_UPLOADS (
        staging_id        String,
        cuenta_artista_id String,
        track_name        String,
        album_name        String,
        genre_id          UInt16,
        duration_ms       UInt32,
        explicit          UInt8,
        danceability      Float32,
        energy            Float32,
        key                UInt8,
        loudness          Float32,
        mode              UInt8,
        speechiness       Float32,
        acousticness      Float32,
        instrumentalness  Float32,
        liveness          Float32,
        valence           Float32,
        tempo             Float32,
        time_signature    UInt8,
        subido_en         DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY staging_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_SUBIDA_TRACK (
        subida_id          String,
        cuenta_artista_id  String,
        staging_id         String,
        estado_revision_id UInt8,
        fecha_subida       DateTime,
        fecha_resolucion   Nullable(DateTime),
        admin_resolutor_id Nullable(String),
        fact_id_promovido  Nullable(UInt64),
        version            UInt8 DEFAULT 0
    ) ENGINE = ReplacingMergeTree(version)
    ORDER BY subida_id
    """,

    # ── Capability `social`: seguimiento de artistas, comentarios y comparticiones ─
    # Igual que `seguridad`/`creadores`: excepción deliberada a RT-05, dominio
    # operativo/transaccional modelado en ClickHouse (design.md de la capability).
    # BRIDGE_SEGUIMIENTO_ARTISTA nunca borra filas (dejar de seguir = activo=0,
    # vía ALTER UPDATE). FACT_COMENTARIO/FACT_COMPARTICION generan su fact_id
    # como UInt64 aleatorio en Python (sin lock, ver design.md "Riesgo aceptado:
    # fact_id generado sin lock") — no reutilizan el patrón secuencial de
    # FACT_TRACKS/FACT_SUBIDA_TRACK.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.BRIDGE_SEGUIMIENTO_ARTISTA (
        usuario_id   String,
        artista_id   UInt32,
        fecha_inicio DateTime,
        activo       UInt8 DEFAULT 1
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, artista_id)
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_TIPO_INTERACCION_SOCIAL (
        tipo_interaccion_id UInt16,
        nombre               String,
        descripcion          String
    ) ENGINE = MergeTree()
    ORDER BY tipo_interaccion_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_COMENTARIO (
        fact_id              UInt64,
        usuario_id           String,
        fact_id_track        UInt64,
        tipo_interaccion_id  UInt16,
        comentario_padre_id  Nullable(UInt64),
        contenido            String,
        fecha_creacion       DateTime,
        estado_moderacion    Enum8('visible'=1, 'oculto'=2, 'eliminado'=3) DEFAULT 'visible',
        moderado_por         Nullable(String),
        fecha_moderacion     Nullable(DateTime)
    ) ENGINE = MergeTree()
    ORDER BY (fact_id_track, fecha_creacion)
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_COMPARTICION (
        fact_id              UInt64,
        usuario_id           String,
        fact_id_track        Nullable(UInt64),
        artista_id           Nullable(UInt32),
        playlist_id          Nullable(String),
        tipo_interaccion_id  UInt16,
        canal                Enum8('x'=1, 'whatsapp'=2, 'copiar_enlace'=3),
        fecha                DateTime
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, fecha)
    """,

    # Notificaciones (S10 ronda 2): `fact_id` UInt64 aleatorio en Python, mismo
    # patrón sin lock que FACT_COMENTARIO/FACT_COMPARTICION. `referencia_id`
    # es String genérico (no UInt64) porque referencia tanto fact_id de track
    # (numérico) como playlist_id de PocketBase (string) según `referencia_tipo`.
    # `leido` se actualiza in-place vía ALTER UPDATE, mismo patrón que
    # `estado_moderacion` en FACT_COMENTARIO — no ReplacingMergeTree porque no
    # hay necesidad de deduplicar filas, solo de mutar un campo.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_NOTIFICACION (
        fact_id            UInt64,
        usuario_destino_id String,
        tipo               Enum8(
            'nuevo_track_artista_seguido'=1,
            'comentario_en_tu_contenido'=2,
            'nuevo_colaborador_playlist'=3
        ),
        referencia_tipo    Enum8('track'=1, 'playlist'=2, 'comentario'=3),
        referencia_id      String,
        mensaje            String,
        leido              UInt8 DEFAULT 0,
        fecha_creacion     DateTime,
        fecha_lectura      Nullable(DateTime)
    ) ENGINE = MergeTree()
    ORDER BY (usuario_destino_id, fecha_creacion)
    """,

    # ── capability `distribucion`: mercado, sellos, licencias, restricciones ───
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_PAIS (
        pais_id    UInt16,
        nombre     String,
        codigo_iso String
    ) ENGINE = MergeTree()
    ORDER BY pais_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_SELLO_DISCOGRAFICO (
        sello_id UInt32,
        nombre   String
    ) ENGINE = MergeTree()
    ORDER BY sello_id
    """,

    # Fila única (empresa_id = 1) — identidad de la empresa emisora que
    # aparece en el encabezado de cada factura (`facturacion`, CU-O81), no un
    # catálogo de N filas como el resto de las dimensiones de este archivo.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_EMPRESA (
        empresa_id   UInt8,
        razon_social String,
        ruc          String,
        direccion    String
    ) ENGINE = MergeTree()
    ORDER BY empresa_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_LICENCIA (
        licencia_id  UInt32,
        sello_id     UInt32,
        pais_id      UInt16,
        fecha_inicio Date,
        fecha_fin    Nullable(Date),
        estado       Enum8('activa'=1, 'vencida'=2, 'suspendida'=3) DEFAULT 'activa'
    ) ENGINE = MergeTree()
    ORDER BY (sello_id, pais_id)
    """,

    # Contrapartida "de solicitud" de DIM_LICENCIA: hoy el admin crea licencias
    # de forma unilateral, sin dejar rastro de que un sello las pidió. Este
    # cambio introduce el flujo pendiente -> aprobada/rechazada, mismo patrón
    # ReplacingMergeTree(actualizado_en) que DIM_CUENTA_ARTISTA (aprobación de
    # cuenta de artista, `creadores`). `canales_solicitados` se guarda solo
    # para contexto/auditoría — DIM_LICENCIA no tiene columna de canal (el
    # canal vive un nivel más abajo, en DIM_CANAL_DISTRIBUCION /
    # FACT_RESTRICCION_REPRODUCCION), así que no se propaga al aprobar. No
    # existe todavía un login de "usuario sello" (solo admin/user/analyst vía
    # PocketBase): por ahora el admin crea la solicitud en nombre del sello,
    # pero `sello_id` queda en la fila para que un futuro login de sello
    # pueda filtrar "mis solicitudes" sin cambiar el modelo.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.SOLICITUD_LICENCIA (
        solicitud_id            String,
        sello_id                UInt32,
        paises_solicitados      Array(UInt16),
        canales_solicitados     Array(UInt16),
        fecha_inicio_propuesta  Date,
        fecha_fin_propuesta     Nullable(Date),
        estado                  Enum8('pendiente'=1, 'aprobada'=2, 'rechazada'=3) DEFAULT 'pendiente',
        motivo_rechazo          Nullable(String),
        fecha_solicitud         DateTime,
        fecha_resolucion        Nullable(DateTime),
        admin_resolutor_id      Nullable(String),
        actualizado_en          DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(actualizado_en)
    ORDER BY solicitud_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_TIPO_RESTRICCION (
        tipo_restriccion_id UInt16,
        nombre              String,
        descripcion         String
    ) ENGINE = MergeTree()
    ORDER BY tipo_restriccion_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_CANAL_DISTRIBUCION (
        canal_id UInt16,
        nombre   String
    ) ENGINE = MergeTree()
    ORDER BY canal_id
    """,

    # Soft-delete vía `activo`, mismo patrón que BRIDGE_SEGUIMIENTO_ARTISTA.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.BRIDGE_RESTRICCION_TRACK (
        fact_id_track       UInt64,
        pais_id              UInt16,
        canal_id             UInt16,
        tipo_restriccion_id  UInt16,
        fecha_inicio         DateTime,
        activo               UInt8 DEFAULT 1
    ) ENGINE = MergeTree()
    ORDER BY (fact_id_track, pais_id, canal_id)
    """,

    # `fact_id` UInt64 aleatorio (random.getrandbits(50) en Python, sin lock),
    # mismo patrón corregido en `social` — no usar 63 bits.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_RESTRICCION_REPRODUCCION (
        fact_id              UInt64,
        usuario_id           String,
        fact_id_track        UInt64,
        pais_id              UInt16,
        tipo_restriccion_id  UInt16,
        fecha                DateTime
    ) ENGINE = MergeTree()
    ORDER BY (fact_id_track, fecha)
    """,

    # ── capability `experiencia`: telemetría enriquecida, soporte, A/B, ────────
    # reflejo de playlists y plan familiar. Las 4 tablas FACT usan `fact_id`
    # UInt64 aleatorio (random.getrandbits(50) en Python, sin lock), mismo
    # patrón ya corregido en `social`/`distribucion` — no se reintroduce un
    # generador de IDs distinto (design.md, "Generación de identificadores").
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_REPRODUCCION_EVENTO (
        fact_id                UInt64,
        usuario_id              String,
        fact_id_track           UInt64,
        dispositivo_id          String,
        sesion_id               String,
        porcentaje_completado   Float32,
        fecha                   DateTime
    ) ENGINE = MergeTree()
    ORDER BY (fact_id_track, fecha)
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_IMPRESION_RECOMENDACION (
        fact_id          UInt64,
        usuario_id       String,
        fact_id_track    UInt64,
        algoritmo        String,
        fue_reproducido  UInt8 DEFAULT 0,
        fecha            DateTime
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, fecha)
    """,

    # FACT_TICKET_SOPORTE: dato de forma transaccional forzado en ClickHouse a
    # propósito, mismo precedente pedagógico ya documentado para
    # `seguridad`/`facturacion` (design.md, tabla "Ubicación de cada entidad").
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_TICKET_SOPORTE (
        fact_id           UInt64,
        usuario_id        String,
        asunto            String,
        descripcion       String,
        estado            Enum8('abierto'=1, 'en_proceso'=2, 'resuelto'=3, 'cerrado'=4) DEFAULT 'abierto',
        fecha_creacion    DateTime,
        fecha_resolucion  Nullable(DateTime)
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, fecha_creacion)
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_AB_TEST_EXPOSICION (
        fact_id      UInt64,
        usuario_id   String,
        experimento  String,
        variante     String,
        fecha        DateTime
    ) ENGINE = MergeTree()
    ORDER BY (experimento, usuario_id)
    """,

    # Reflejo de solo lectura de playlists/playlist_tracks (PocketBase sigue
    # siendo la fuente de verdad); poblado por un job batch, nunca escrito
    # directamente por el usuario (design.md, tabla "Ubicación de cada entidad").
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.BRIDGE_TRACK_PLAYLIST_USUARIO (
        fact_id_track    UInt64,
        usuario_id       String,
        playlist_id      String,
        fecha_agregado   DateTime
    ) ENGINE = MergeTree()
    ORDER BY (fact_id_track, usuario_id)
    """,

    # BRIDGE_SUSCRIPTOR_FAMILIA: relación transaccional forzada en ClickHouse a
    # propósito, mismo precedente que FACT_TICKET_SOPORTE. Elegibilidad de plan
    # (solo `premium` B2C) se valida en Python contra `planes.py`/PocketBase —
    # no hay columna de tipo de plan aquí (design.md, "elegibilidad de plan").
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.BRIDGE_SUSCRIPTOR_FAMILIA (
        suscripcion_id  String,
        usuario_id      String,
        es_titular      UInt8 DEFAULT 0,
        fecha_union     DateTime
    ) ENGINE = MergeTree()
    ORDER BY suscripcion_id
    """,

    # Portada real (RF-EXP-009): columnas aditivas, sin ALTER ... DROP — a
    # diferencia de sello_id (`scripts/migrar_sellos.py`), no requiere backfill
    # ni script de migración aparte porque no reemplaza ninguna columna
    # existente. `ADD COLUMN IF NOT EXISTS` es idempotente igual que el resto
    # de este script.
    f"ALTER TABLE {DB}.DIM_ARTISTS ADD COLUMN IF NOT EXISTS imagen_url Nullable(String)",
    f"ALTER TABLE {DB}.DIM_ALBUMS ADD COLUMN IF NOT EXISTS imagen_url Nullable(String)",

    # Portada por canción (no por álbum): muchos `album_name` del dataset base
    # son en realidad compilaciones tipo playlist (ej. "Daily Pop Mix",
    # "Alternative Christmas 2022") con decenas de artistas distintos bajo el
    # mismo álbum — heredar la portada del álbum ahí muestra la misma carátula
    # genérica en canciones de artistas que no tienen nada que ver entre sí.
    # Esta columna guarda la portada exacta de esa canción puntual (resuelta
    # por su propio `track_id`), y se prioriza sobre `DIM_ALBUMS.imagen_url`
    # en las queries de catálogo — ver `resolver_portadas_tracks_spotify`.
    f"ALTER TABLE {DB}.FACT_TRACKS ADD COLUMN IF NOT EXISTS imagen_url Nullable(String)",

    # ── completar-modelo-base: cierre de gap del modelo de negocio original ────
    # (DIM_CANAL_MARKETING, DIM_REGION, DIM_COMPONENTE_INFRAESTRUCTURA,
    # FACT_ADQUISICION, FACT_DISPONIBILIDAD). DIM_REGION es agrupación de
    # negocio (ej. "Latinoamérica"), sin FK hacia DIM_PAIS (`distribucion`,
    # país de licencia) — conceptos y dueños distintos, ver design.md.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_CANAL_MARKETING (
        canal_id UInt16,
        nombre   String
    ) ENGINE = MergeTree()
    ORDER BY canal_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_REGION (
        region_id UInt16,
        nombre    String
    ) ENGINE = MergeTree()
    ORDER BY region_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_COMPONENTE_INFRAESTRUCTURA (
        componente_id UInt16,
        nombre        String
    ) ENGINE = MergeTree()
    ORDER BY componente_id
    """,

    # `fact_id` UInt64 aleatorio (random.getrandbits(50) en Python, sin lock),
    # mismo patrón ya establecido en `social`/`distribucion`/`experiencia`.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_ADQUISICION (
        fact_id     UInt64,
        usuario_id  String,
        canal_id    UInt16,
        region_id   UInt16,
        fecha       DateTime
    ) ENGINE = MergeTree()
    ORDER BY (canal_id, fecha)
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_DISPONIBILIDAD (
        fact_id          UInt64,
        componente_id    UInt16,
        hubo_incidente   UInt8 DEFAULT 0,
        fecha            DateTime
    ) ENGINE = MergeTree()
    ORDER BY (componente_id, fecha)
    """,

    # ── Capability `regalias` (S10, auditoría 2026-07-10): dos tipos de derecho
    # (master/grabación y publishing/composición, sin DIM_EDITORIAL — decisión
    # del usuario) repartidos pro-rata sobre el mismo pool de ingresos que
    # alimenta `publicidad` (suscripciones + ads). Ver design.md para el
    # cálculo completo (streams reales × pool real, nada hardcodeado).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_PRODUCTOR (
        productor_id    UInt32,
        nombre          String,
        fecha_registro  DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY productor_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.BRIDGE_PRODUCTOR_TRACK (
        fact_id_track     UInt64,
        productor_id      UInt32,
        rol               String DEFAULT 'productor',
        fecha_asignacion  DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (fact_id_track, productor_id)
    """,

    # Login propio del sello (análogo a DIM_CUENTA_ARTISTA), pero de alta
    # exclusiva de admin — a diferencia de un artista (cualquiera puede
    # solicitar una cuenta), un sello ya es una entidad de catálogo
    # administrada por admin (`distribucion.DIM_SELLO_DISCOGRAFICO`), así que
    # vincularlo a un usuario real es una operación de onboarding B2B, no de
    # autoservicio. El usuario vinculado inicia sesión igual que cualquier
    # Cliente B2B (`role=analyst`, capability `seguridad`); esta tabla solo
    # resuelve a qué `sello_id` corresponde ese usuario para sus reportes.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_CUENTA_SELLO (
        cuenta_sello_id  String,
        usuario_id       String,
        sello_id         UInt32,
        activo           UInt8 DEFAULT 1,
        fecha_creacion   DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY cuenta_sello_id
    """,

    # Split por track (no por álbum): mismo criterio que el resto del modelo
    # de negocio, que usa `fact_id_track`/`fact_id` como grano atómico en
    # todas partes (FACT_RESTRICCION_REPRODUCCION, FACT_SUBIDA_TRACK, etc.),
    # nunca álbum. `pct_master_*` deben sumar 100 entre sí (mismo criterio
    # para `pct_publishing_*`); no se aplica en DDL, sí en el endpoint de
    # creación del contrato (ver router.py).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_CONTRATO_REGALIA (
        contrato_id             String,
        fact_id_track           UInt64,
        sello_id                Nullable(UInt32),
        cuenta_artista_id       Nullable(String),
        productor_id            Nullable(UInt32),
        pct_master_sello        Float32 DEFAULT 0,
        pct_master_artista      Float32 DEFAULT 0,
        pct_master_productor    Float32 DEFAULT 0,
        pct_publishing_sello    Float32 DEFAULT 0,
        pct_publishing_artista  Float32 DEFAULT 0,
        vigente_desde           Date,
        vigente_hasta           Nullable(Date),
        activo                  UInt8 DEFAULT 1,
        creado_en               DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (fact_id_track, vigente_desde)
    """,

    # Una fila por rightsholder por track por período (no una fila agregada
    # por período) — permite auditar exactamente cuánto le tocó a cada sello/
    # artista/productor de cada track, no solo el total. `streams_periodo` es
    # el conteo real de reproducciones de ese track en el período (fuente:
    # FACT_ENGAGEMENT_USUARIO, event_type='reproduccion'), no un valor fijo.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_LIQUIDACION_REGALIA (
        liquidacion_id     String,
        contrato_id        String,
        fact_id_track      UInt64,
        tipo_rightsholder  Enum8('sello'=1, 'artista'=2, 'productor'=3),
        rightsholder_id    String,
        periodo_inicio     Date,
        periodo_fin        Date,
        streams_periodo    UInt32,
        monto              Float32,
        moneda             String DEFAULT 'USD',
        fecha_calculo      DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (rightsholder_id, periodo_inicio)
    """,

    # ── Capability `publicidad` (S10, auditoría 2026-07-10): el tier free se
    # financia con ads — FACT_INGRESO_PUBLICITARIO alimenta el mismo pool que
    # reparte `FACT_LIQUIDACION_REGALIA` junto con FACT_TRANSACCION_PAGO
    # (suscripciones), igual que el modelo real de Spotify (pool "market-
    # centric": ingreso total del período repartido pro-rata por streams).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_ANUNCIANTE (
        anunciante_id   UInt32,
        nombre          String,
        sector          String DEFAULT '',
        fecha_registro  DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY anunciante_id
    """,

    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_CAMPANA_PUBLICITARIA (
        campana_id         UInt32,
        anunciante_id      UInt32,
        nombre             String,
        cpm                Float32,
        presupuesto_total  Float32,
        fecha_inicio       Date,
        fecha_fin          Nullable(Date),
        activa             UInt8 DEFAULT 1
    ) ENGINE = MergeTree()
    ORDER BY campana_id
    """,

    # Un anuncio mostrado entre canciones a un usuario free — separado de
    # FACT_INGRESO_PUBLICITARIO (que solo registra impresiones COMPLETADAS,
    # con el monto real ya calculado) para poder medir tasa de completitud
    # sin mezclar el evento de exposición con el de ingreso reconocido.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_IMPRESION_ANUNCIO (
        impresion_id  String,
        campana_id    UInt32,
        usuario_id    String,
        completado    UInt8 DEFAULT 0,
        fecha         DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, fecha)
    """,

    # Ingreso reconocido en tiempo real por cada impresión completada
    # (`monto = campana.cpm / 1000`), no un agregado periódico — así una
    # impresión real genera una fila real de ingreso de inmediato (RT-01:
    # ese cálculo ocurre en Python, en el mismo request que registra la
    # impresión), y `regalias` solo necesita sumar esta tabla por rango de
    # fecha para conocer el ingreso publicitario real de cualquier período.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_INGRESO_PUBLICITARIO (
        ingreso_id    String,
        impresion_id  String,
        campana_id    UInt32,
        monto         Float32,
        fecha         DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (campana_id, fecha)
    """,

    # ── monetizacion-retencion-mejoras: publicidad display + churn con motivo ──
    # `tipo_anuncio` distingue el trigger de audio (entre canciones) del de
    # display (banner al cargar catálogo/home) — una campaña es de un solo
    # tipo, así se contrata en la industria real (ver design.md, decisión 1).
    # `DEFAULT 'audio'` deja las campañas ya existentes como audio, sin romper
    # el trigger actual.
    f"ALTER TABLE {DB}.DIM_CAMPANA_PUBLICITARIA ADD COLUMN IF NOT EXISTS tipo_anuncio Enum8('audio'=1, 'display'=2) DEFAULT 'audio'",
    f"ALTER TABLE {DB}.DIM_CAMPANA_PUBLICITARIA ADD COLUMN IF NOT EXISTS url_destino String DEFAULT ''",
    f"ALTER TABLE {DB}.FACT_IMPRESION_ANUNCIO ADD COLUMN IF NOT EXISTS click UInt8 DEFAULT 0",

    # Hecho de negocio de la cancelación de una suscripción (motivo, si fue
    # voluntaria) — escrito síncronamente desde FastAPI en el mismo request
    # que cancela la suscripción en PocketBase, mismo patrón que
    # FACT_IMPRESION_ANUNCIO/FACT_INGRESO_PUBLICITARIO (ver design.md,
    # decisión 4). `suscripcion_id`/`usuario_id` son String: IDs de
    # PocketBase, no hay JOIN SQL posible con ClickHouse.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_CANCELACION_SUSCRIPCION (
        cancelacion_id  String,
        suscripcion_id  String,
        usuario_id      String,
        motivo          Enum8('precio'=1, 'no_uso'=2, 'competencia'=3, 'otro'=4),
        voluntaria      UInt8 DEFAULT 1,
        fecha           DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, fecha)
    """,

    # ── modelo-financiero-simulacion: retiro de ganancias, saldo calculado en
    # vivo (no persistido) restando 'pendiente'+'procesado' de lo liquidado —
    # ver design.md, Decisión 5.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_RETIRO_REGALIA (
        retiro_id        String,
        tipo_rightsholder Enum8('artista'=1, 'sello'=2),
        rightsholder_id  String,
        monto            Float32,
        estado           Enum8('pendiente'=1, 'procesado'=2, 'rechazado'=3) DEFAULT 'pendiente',
        fecha_solicitud  DateTime DEFAULT now(),
        fecha_procesado  Nullable(DateTime)
    ) ENGINE = MergeTree()
    ORDER BY (rightsholder_id, fecha_solicitud)
    """,

    # ── Capability `finanzas` (mejoras-financieras-empresariales): gasto
    # operativo y reembolso son los dos hechos que faltaban para calcular
    # utilidad real (ver design.md, Decisión 2) — igual que gastos/reembolsos
    # de cualquier plataforma real, se agregan junto al resto de tablas FACT
    # de negocio. Soft-delete/estado únicamente, nunca DELETE físico (mismo
    # patrón que DIM_CUENTA_ARTISTA/FACT_RETIRO_REGALIA vía ALTER UPDATE).
    #
    # Desviación de tasks.md 1.1 (que pedía `ORDER BY (fecha)`): ClickHouse
    # rechaza `ALTER TABLE ... UPDATE` sobre una columna que forma parte de
    # la clave de ordenamiento (`CANNOT_UPDATE_COLUMN`), y `fecha` es
    # editable (spec.md, "Registro y anulación de gastos operativos" permite
    # editar concepto/categoria/monto/fecha/descripcion). Se usa `gasto_id`
    # como clave en su lugar — estable durante todo el ciclo de vida del
    # gasto, a diferencia de `fecha` — descubierto al ejecutar las pruebas
    # de `editar_gasto` (ver resumen final).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_GASTO_OPERATIVO (
        gasto_id        String,
        concepto        String,
        categoria       Enum8(
            'infraestructura'=1, 'marketing'=2, 'nomina'=3, 'licencias'=4,
            'servicios'=5, 'soporte'=6, 'legal'=7, 'otros'=8
        ),
        monto           Float32,
        fecha           Date,
        descripcion     String DEFAULT '',
        estado          Enum8('activo'=1, 'anulado'=2) DEFAULT 'activo',
        responsable_id  String,
        fecha_registro  DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (gasto_id)
    """,

    # Un reembolso referencia una transacción de `facturacion`
    # (FACT_TRANSACCION_PAGO) — el monto disponible a reembolsar se calcula
    # on-read (pagado - reembolsado ya 'procesado'), mismo patrón que
    # SALDO_DISPONIBLE_RIGHTSHOLDER de `regalias`. Historial inmutable: un
    # reembolso rechazado/cancelado nunca se borra, solo cambia `estado`.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_REEMBOLSO (
        reembolso_id    String,
        transaccion_id  UUID,
        monto           Float32,
        tipo            Enum8('total'=1, 'parcial'=2),
        motivo          String,
        fecha           DateTime DEFAULT now(),
        responsable_id  String,
        estado          Enum8('procesado'=1, 'rechazado'=2, 'cancelado'=3) DEFAULT 'procesado'
    ) ENGINE = MergeTree()
    ORDER BY (transaccion_id, fecha)
    """,

    # ── modelo-financiero-completar-huecos: país como configuración real ───────
    # (moneda/tasa de cambio/IVA/retención fiscal, antes solo pais_id/nombre/
    # codigo_iso de solo lectura) — columnas aditivas, ver design.md decisión 4.
    # `tasa_cambio_a_usd` es un valor de referencia simulado (congelado), no
    # una cotización de forex real.
    f"ALTER TABLE {DB}.DIM_PAIS ADD COLUMN IF NOT EXISTS moneda_codigo String DEFAULT 'USD'",
    f"ALTER TABLE {DB}.DIM_PAIS ADD COLUMN IF NOT EXISTS tasa_cambio_a_usd Float32 DEFAULT 1.0",
    f"ALTER TABLE {DB}.DIM_PAIS ADD COLUMN IF NOT EXISTS iva_tasa Nullable(Float32)",
    f"ALTER TABLE {DB}.DIM_PAIS ADD COLUMN IF NOT EXISTS retencion_fiscal_pct Nullable(Float32)",
    f"ALTER TABLE {DB}.DIM_PAIS ADD COLUMN IF NOT EXISTS activo UInt8 DEFAULT 1",

    # Backfill de moneda/tasa para los 15 países ya sembrados en una instalación
    # existente (el seed condicional de más abajo solo corre si la tabla está
    # vacía) — tasas de referencia simuladas y congeladas, no forex real
    # (decisión 4). Idempotente: mismo resultado en cada arranque.
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'USD', tasa_cambio_a_usd = 1.0    WHERE pais_id IN (1, 2)",   # Ecuador, EE.UU.
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'MXN', tasa_cambio_a_usd = 18.0   WHERE pais_id = 3",         # México
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'COP', tasa_cambio_a_usd = 4100.0 WHERE pais_id = 4",         # Colombia
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'EUR', tasa_cambio_a_usd = 0.92   WHERE pais_id IN (5, 12, 13)",  # España, Francia, Alemania
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'ARS', tasa_cambio_a_usd = 1000.0 WHERE pais_id = 6",         # Argentina
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'CLP', tasa_cambio_a_usd = 950.0  WHERE pais_id = 7",         # Chile
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'PEN', tasa_cambio_a_usd = 3.75   WHERE pais_id = 8",         # Perú
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'BRL', tasa_cambio_a_usd = 5.4    WHERE pais_id = 9",         # Brasil
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'GBP', tasa_cambio_a_usd = 0.79   WHERE pais_id = 10",        # Reino Unido
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'CAD', tasa_cambio_a_usd = 1.36   WHERE pais_id = 11",        # Canadá
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'JPY', tasa_cambio_a_usd = 150.0  WHERE pais_id = 14",        # Japón
    f"ALTER TABLE {DB}.DIM_PAIS UPDATE moneda_codigo = 'KRW', tasa_cambio_a_usd = 1350.0 WHERE pais_id = 15",        # Corea del Sur

    # IVA global + retención fiscal global (decisiones 3/6) — reemplazan las
    # constantes fijas `IVA_RATE`/retención inexistente; el default de IVA
    # conserva el mismo 15% que ya regía como constante, sin cambiar el
    # comportamiento existente al desplegar.
    f"ALTER TABLE {DB}.DIM_EMPRESA ADD COLUMN IF NOT EXISTS iva_tasa_global Float32 DEFAULT 15.0",
    f"ALTER TABLE {DB}.DIM_EMPRESA ADD COLUMN IF NOT EXISTS retencion_fiscal_pct_global Float32 DEFAULT 10.0",

    # País del sello (decisión 3) — el admin lo setea al crear/editar el sello;
    # DIM_ARTISTS ya tiene `country`, así que el rightsholder "artista" resuelve
    # su país vía DIM_CUENTA_ARTISTA -> DIM_USUARIO.pais, no necesita columna nueva.
    f"ALTER TABLE {DB}.DIM_SELLO_DISCOGRAFICO ADD COLUMN IF NOT EXISTS pais String DEFAULT ''",

    # `concepto` distingue el cobro normal de un ajuste de prorrateo por
    # cambio de plan (decisión 1) — mismo `FACT_TRANSACCION_PAGO`, sin tabla nueva.
    f"ALTER TABLE {DB}.FACT_TRANSACCION_PAGO ADD COLUMN IF NOT EXISTS concepto Enum8('suscripcion'=1, 'ajuste_prorrateo'=2) DEFAULT 'suscripcion'",

    # Retención fiscal en la liquidación de regalías (decisión 3): `monto`
    # existente pasa a significar el neto (bruto - retenido) — es lo que ya
    # consumen saldo/retiro, así que esas queries no cambian, solo el valor.
    f"ALTER TABLE {DB}.FACT_LIQUIDACION_REGALIA ADD COLUMN IF NOT EXISTS monto_bruto Float32 DEFAULT 0",
    f"ALTER TABLE {DB}.FACT_LIQUIDACION_REGALIA ADD COLUMN IF NOT EXISTS retencion_pct Float32 DEFAULT 0",
    f"ALTER TABLE {DB}.FACT_LIQUIDACION_REGALIA ADD COLUMN IF NOT EXISTS monto_retenido Float32 DEFAULT 0",

    # Precios de plan configurables (decisión 5) — desacoplado a propósito de
    # `_TIER_RANK` (analitica/deps.py): esta tabla solo tiene precio, nunca
    # nivel de acceso. ReplacingMergeTree(actualizado_en): un PUT de precio
    # es una fila nueva con timestamp mayor, no un UPDATE in-place.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_PLAN (
        plan_id        String,
        precio_usd     Float32,
        activo         UInt8 DEFAULT 1,
        actualizado_en DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(actualizado_en)
    ORDER BY plan_id
    """,

    # Notificación simulada de factura enviada por correo (decisión 8) — tabla
    # propia en vez de forzar el concepto dentro de FACT_NOTIFICACION (social),
    # cuyo `tipo` es un Enum8 cerrado de conceptos in-app no relacionados y sin
    # campos de asunto/cuerpo/destinatario.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_EMAIL_ENVIADO (
        notificacion_id String,
        usuario_id      String,
        tipo            Enum8('factura'=1),
        referencia_id   String,
        destinatario    String,
        asunto          String,
        cuerpo          String,
        estado          Enum8('enviado'=1) DEFAULT 'enviado',
        fecha_envio     DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, fecha_envio)
    """,

    # ── Capability `seguridad`: roles administrativos por área de negocio ───────
    # (change roles-gestion-usuarios). Catálogo cerrado de roles admin: sustituye
    # el gating monolítico `role == admin` por seis roles con alcance acotado.
    # `superadmin` es equivalente al admin general previo; el resto son
    # subconjuntos. Sembrado en main() (patrón DIM_ESTADO_REVISION).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.DIM_ROL_ADMINISTRATIVO (
        rol_admin      String,
        nombre         String,
        capabilities   Array(String),
        descripcion    String,
        activo         UInt8 DEFAULT 1
    ) ENGINE = ReplacingMergeTree()
    ORDER BY rol_admin
    """,

    # BRIDGE_USUARIO_ROL_ADMIN: asignaciones de rol admin a usuarios. La
    # revocación es un borrado lógico (fila nueva con revocado=1 y `fecha`
    # mayor); el estado vigente por (usuario_id, rol_admin) se resuelve con
    # argMax(revocado, fecha) — mismo criterio que FACT_PERMISO_USUARIO, sin
    # depender de OPTIMIZE FINAL del ReplacingMergeTree.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.BRIDGE_USUARIO_ROL_ADMIN (
        usuario_id    String,
        rol_admin     String,
        asignado_por  String,
        revocado      UInt8 DEFAULT 0,
        fecha         DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (usuario_id, rol_admin, fecha)
    """,

    # FACT_TOKEN_RECUPERACION: tokens de recuperación de contraseña de un solo
    # uso (simulación, sin envío de correo real). El estado vigente (usado/no)
    # se resuelve con argMax(usado, created_at) por token.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_TOKEN_RECUPERACION (
        token       String,
        usuario_id  String,
        expira_en   DateTime,
        usado       UInt8 DEFAULT 0,
        created_at  DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (token, created_at)
    """,

    # estado_cuenta en DIM_USUARIO (activa|suspendido|eliminado): verificado por
    # get_current_user en cada request; una cuenta suspendida/eliminada se
    # rechaza con 403 aunque su token de PocketBase siga siendo válido.
    f"ALTER TABLE {DB}.DIM_USUARIO ADD COLUMN IF NOT EXISTS estado_cuenta String DEFAULT 'activa'",

    # ── Change p1-ciclos-vida: ciclo de vida de entidades de negocio ────────────
    # `formato` (audio|display|banner) es el atributo comercial editable de una
    # campaña; `tipo_anuncio` sigue gobernando el canal técnico de servido
    # (design.md, Decisión 2). Retro-relleno de `formato` desde `tipo_anuncio`
    # para campañas ya creadas. `estado_manual` ('' | 'pausada' | 'finalizada')
    # es el eje de pausa/cierre MANUAL, independiente de `activa` (presupuesto):
    # una campaña se sirve solo si activa=1 Y estado_manual='' (Decisión 1).
    # Descripción editable de un track subido por un artista (change
    # p1-ciclos-vida): STG_ARTIST_UPLOADS es la fuente de metadata editable
    # (track_name/album_name/genre_id/descripcion); no estaba modelada porque
    # la subida original no la pedía. `genre_id`/nombres no están en la ORDER
    # KEY (staging_id), así que el ALTER UPDATE de edición es válido.
    f"ALTER TABLE {DB}.STG_ARTIST_UPLOADS ADD COLUMN IF NOT EXISTS descripcion String DEFAULT ''",

    # Desactivación de anunciantes (soft-delete): un anunciante inactivo se
    # conserva (histórico de campañas) pero no debe ofrecerse para campañas nuevas.
    f"ALTER TABLE {DB}.DIM_ANUNCIANTE ADD COLUMN IF NOT EXISTS activo UInt8 DEFAULT 1",
    f"ALTER TABLE {DB}.DIM_CAMPANA_PUBLICITARIA ADD COLUMN IF NOT EXISTS formato String DEFAULT 'display'",
    f"ALTER TABLE {DB}.DIM_CAMPANA_PUBLICITARIA ADD COLUMN IF NOT EXISTS estado_manual String DEFAULT ''",
    f"ALTER TABLE {DB}.DIM_CAMPANA_PUBLICITARIA UPDATE formato = toString(tipo_anuncio) WHERE formato = 'display' AND tipo_anuncio = 'audio'",

    # Takedown de catálogo (Decisión 3): un track oculto tiene disponible=0 pero
    # sigue en FACT_TRACKS (soft-delete vía ALTER UPDATE, nunca DELETE físico).
    # `disponible` no está en la ORDER KEY de FACT_TRACKS, así que el UPDATE es
    # válido (no cae en CANNOT_UPDATE_COLUMN). Reutilizado por el retiro de
    # tracks de artista (`creadores`).
    f"ALTER TABLE {DB}.FACT_TRACKS ADD COLUMN IF NOT EXISTS disponible UInt8 DEFAULT 1",

    # Revocación de licencias activas (`distribucion`): se amplía el enum de
    # estado con 'revocada' (superset del enum previo, seguro) y se añaden el
    # motivo y la fecha de revocación. `estado` no está en la ORDER KEY
    # (sello_id, pais_id), así que el ALTER UPDATE de revocación es válido.
    f"ALTER TABLE {DB}.DIM_LICENCIA MODIFY COLUMN estado Enum8('activa'=1, 'vencida'=2, 'suspendida'=3, 'revocada'=4) DEFAULT 'activa'",
    f"ALTER TABLE {DB}.DIM_LICENCIA ADD COLUMN IF NOT EXISTS motivo_revocacion String DEFAULT ''",
    f"ALTER TABLE {DB}.DIM_LICENCIA ADD COLUMN IF NOT EXISTS fecha_revocacion Nullable(DateTime)",

    # Denuncias de contenido por usuarios (`social`, Decisión 5). El estado
    # vigente por denuncia se resuelve con ReplacingMergeTree ORDER BY
    # denuncia_id (una actualización de estado es una fila nueva con el mismo id).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_DENUNCIA (
        denuncia_id    UInt64,
        denunciante_id String,
        tipo_objeto    String,
        objeto_id      String,
        motivo         String,
        descripcion    String DEFAULT '',
        estado         String DEFAULT 'pendiente',
        created_at     DateTime DEFAULT now(),
        actualizado_en DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(actualizado_en) ORDER BY denuncia_id
    """,

    # ── Change p2-descubrimiento-comunidad: descubrimiento y comunidad ──────────
    # BRIDGE_BLOQUEO_USUARIO: bloqueo dirigido de un usuario a otro. El desbloqueo
    # es lógico (fila nueva con activo=0), nunca DELETE físico: el par
    # (bloqueador_id, bloqueado_id) es la ORDER KEY y ReplacingMergeTree se queda
    # con la versión de mayor `actualizado_en` (design.md, Decisión 5).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.BRIDGE_BLOQUEO_USUARIO (
        bloqueador_id  String,
        bloqueado_id   String,
        activo         UInt8 DEFAULT 1,
        created_at     DateTime DEFAULT now(),
        actualizado_en DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(actualizado_en)
    ORDER BY (bloqueador_id, bloqueado_id)
    """,

    # FACT_STRIKE_USUARIO: historial de sanciones. `origen_tipo` distingue el
    # strike emitido al resolver una denuncia ('denuncia', con origen_id =
    # denuncia_id) del emitido a mano por un admin ('manual'). `activo` permite
    # revocar un strike sin borrarlo: la regla de negocio cuenta 3 strikes
    # ACTIVOS para suspender la cuenta (design.md, Decisión 5).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.FACT_STRIKE_USUARIO (
        strike_id      UInt64,
        usuario_id     String,
        motivo         String,
        origen_tipo    String DEFAULT 'manual',
        origen_id      String DEFAULT '',
        emitido_por    String,
        activo         UInt8 DEFAULT 1,
        created_at     DateTime DEFAULT now(),
        actualizado_en DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(actualizado_en) ORDER BY strike_id
    """,

    # Verificación de email (simulada, sin correo real). Nace en 0 para los
    # registros nuevos; los usuarios que ya existían se marcan como verificados
    # en el backfill de abajo para no bloquear cuentas en uso (Decisión 7).
    f"ALTER TABLE {DB}.DIM_USUARIO ADD COLUMN IF NOT EXISTS email_verificado UInt8 DEFAULT 0",

    # `proposito` ('recuperacion' | 'verificacion') discrimina los dos tipos de
    # token que conviven en la misma tabla: el ciclo de vida es idéntico (UUID,
    # expiración, un solo uso) y duplicar la tabla sería copiar el DDL entero
    # (Decisión 6). El DEFAULT deja las filas de P0 bien clasificadas sin
    # backfill. `proposito` no está en la ORDER KEY (token, created_at).
    f"ALTER TABLE {DB}.FACT_TOKEN_RECUPERACION ADD COLUMN IF NOT EXISTS proposito String DEFAULT 'recuperacion'",
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

    # DIM_ESTADO_REVISION (capability `creadores`): sembrada aquí (no en
    # etl/gold/loader.py) porque no debe depender de que ya haya corrido una
    # ingesta por Airflow — la solicitud/aprobación de cuentas y tracks de
    # artista es independiente del pipeline batch.
    try:
        count = client.query(f"SELECT count() FROM {DB}.DIM_ESTADO_REVISION").result_rows[0][0]
        if count == 0:
            client.insert(
                f"{DB}.DIM_ESTADO_REVISION",
                [(1, "pendiente"), (2, "aprobado"), (3, "rechazado"), (4, "retirado")],
                column_names=["estado_revision_id", "nombre"],
            )
            print("✓ DIM_ESTADO_REVISION sembrada (4 filas).")
        else:
            # Change p1-ciclos-vida: estado 'retirado' (4) para el retiro de un
            # track propio por el artista. Idempotente sobre instalaciones que ya
            # tenían las 3 filas originales (MergeTree admite duplicados: se
            # inserta solo si falta).
            existe_4 = client.query(
                f"SELECT count() FROM {DB}.DIM_ESTADO_REVISION WHERE estado_revision_id = 4"
            ).result_rows[0][0]
            if existe_4 == 0:
                client.insert(
                    f"{DB}.DIM_ESTADO_REVISION",
                    [(4, "retirado")],
                    column_names=["estado_revision_id", "nombre"],
                )
                print("✓ DIM_ESTADO_REVISION: estado 'retirado' (4) añadido.")
    except Exception as exc:
        print(f"ERROR sembrando DIM_ESTADO_REVISION: {exc}")

    # DIM_TIPO_INTERACCION_SOCIAL (capability `social`): dimensión compartida
    # entre FACT_COMENTARIO y FACT_COMPARTICION, sembrada aquí mismo patrón que
    # DIM_ESTADO_REVISION — no depende de que haya corrido una ingesta.
    try:
        count = client.query(f"SELECT count() FROM {DB}.DIM_TIPO_INTERACCION_SOCIAL").result_rows[0][0]
        if count == 0:
            client.insert(
                f"{DB}.DIM_TIPO_INTERACCION_SOCIAL",
                [
                    (1, "comentario_raiz", "Comentario publicado directamente sobre un track"),
                    (2, "comentario_respuesta", "Comentario publicado en respuesta a otro comentario"),
                    (3, "compartir_track", "Intención de compartir un track"),
                    (4, "compartir_playlist", "Intención de compartir una playlist"),
                    (5, "compartir_perfil_artista", "Intención de compartir el perfil de un artista"),
                ],
                column_names=["tipo_interaccion_id", "nombre", "descripcion"],
            )
            print("✓ DIM_TIPO_INTERACCION_SOCIAL sembrada (5 filas).")
    except Exception as exc:
        print(f"ERROR sembrando DIM_TIPO_INTERACCION_SOCIAL: {exc}")

    # DIM_PAIS (capability `distribucion`): catálogo fijo de mercados, mismo patrón
    # de seed condicional que las dimensiones anteriores. Incluye Ecuador (nombre y
    # código ISO) porque ya es el valor real que aparece en DIM_USUARIO.pais de las
    # cuentas de prueba existentes.
    try:
        count = client.query(f"SELECT count() FROM {DB}.DIM_PAIS").result_rows[0][0]
        if count == 0:
            client.insert(
                f"{DB}.DIM_PAIS",
                [
                    (1,  "Ecuador",         "EC"),
                    (2,  "Estados Unidos",  "US"),
                    (3,  "México",          "MX"),
                    (4,  "Colombia",        "CO"),
                    (5,  "España",          "ES"),
                    (6,  "Argentina",       "AR"),
                    (7,  "Chile",           "CL"),
                    (8,  "Perú",            "PE"),
                    (9,  "Brasil",          "BR"),
                    (10, "Reino Unido",     "GB"),
                    (11, "Canadá",          "CA"),
                    (12, "Francia",         "FR"),
                    (13, "Alemania",        "DE"),
                    (14, "Japón",           "JP"),
                    (15, "Corea del Sur",   "KR"),
                ],
                column_names=["pais_id", "nombre", "codigo_iso"],
            )
            print("✓ DIM_PAIS sembrada (15 filas).")
    except Exception as exc:
        print(f"ERROR sembrando DIM_PAIS: {exc}")

    # DIM_TIPO_RESTRICCION (capability `distribucion`)
    try:
        count = client.query(f"SELECT count() FROM {DB}.DIM_TIPO_RESTRICCION").result_rows[0][0]
        if count == 0:
            client.insert(
                f"{DB}.DIM_TIPO_RESTRICCION",
                [
                    (1, "no_disponible", "El track no puede reproducirse en este país/canal"),
                    (2, "solo_preview",  "El track solo puede reproducirse como fragmento de vista previa"),
                    (3, "geo_bloqueado", "El track está bloqueado por restricción geográfica de derechos"),
                ],
                column_names=["tipo_restriccion_id", "nombre", "descripcion"],
            )
            print("✓ DIM_TIPO_RESTRICCION sembrada (3 filas).")
    except Exception as exc:
        print(f"ERROR sembrando DIM_TIPO_RESTRICCION: {exc}")

    # DIM_CANAL_DISTRIBUCION (capability `distribucion`)
    try:
        count = client.query(f"SELECT count() FROM {DB}.DIM_CANAL_DISTRIBUCION").result_rows[0][0]
        if count == 0:
            client.insert(
                f"{DB}.DIM_CANAL_DISTRIBUCION",
                [
                    (1, "streaming"),
                    (2, "descarga"),
                    (3, "sync_licensing"),
                ],
                column_names=["canal_id", "nombre"],
            )
            print("✓ DIM_CANAL_DISTRIBUCION sembrada (3 filas).")
    except Exception as exc:
        print(f"ERROR sembrando DIM_CANAL_DISTRIBUCION: {exc}")

    # DIM_CANAL_MARKETING (completar-modelo-base)
    try:
        count = client.query(f"SELECT count() FROM {DB}.DIM_CANAL_MARKETING").result_rows[0][0]
        if count == 0:
            client.insert(
                f"{DB}.DIM_CANAL_MARKETING",
                [
                    (1, "organico"),
                    (2, "redes_sociales"),
                    (3, "ads_paid"),
                    (4, "referido"),
                ],
                column_names=["canal_id", "nombre"],
            )
            print("✓ DIM_CANAL_MARKETING sembrada (4 filas).")
    except Exception as exc:
        print(f"ERROR sembrando DIM_CANAL_MARKETING: {exc}")

    # DIM_REGION (completar-modelo-base) — agrupación de negocio, no confundir
    # con DIM_PAIS (país de licencia, `distribucion`).
    try:
        count = client.query(f"SELECT count() FROM {DB}.DIM_REGION").result_rows[0][0]
        if count == 0:
            client.insert(
                f"{DB}.DIM_REGION",
                [
                    (1, "Latinoamérica"),
                    (2, "Norteamérica"),
                    (3, "Europa"),
                    (4, "Asia"),
                ],
                column_names=["region_id", "nombre"],
            )
            print("✓ DIM_REGION sembrada (4 filas).")
    except Exception as exc:
        print(f"ERROR sembrando DIM_REGION: {exc}")

    # DIM_COMPONENTE_INFRAESTRUCTURA (completar-modelo-base)
    try:
        count = client.query(f"SELECT count() FROM {DB}.DIM_COMPONENTE_INFRAESTRUCTURA").result_rows[0][0]
        if count == 0:
            client.insert(
                f"{DB}.DIM_COMPONENTE_INFRAESTRUCTURA",
                [
                    (1, "api"),
                    (2, "clickhouse"),
                    (3, "pocketbase"),
                    (4, "airflow"),
                ],
                column_names=["componente_id", "nombre"],
            )
            print("✓ DIM_COMPONENTE_INFRAESTRUCTURA sembrada (4 filas).")
    except Exception as exc:
        print(f"ERROR sembrando DIM_COMPONENTE_INFRAESTRUCTURA: {exc}")

    # DIM_EMPRESA (capability `facturacion`, CU-O81): fila única con los
    # valores que hoy estaban fijos en el encabezado de cada factura — sembrada
    # como default inicial para que una instalación nueva no quede vacía.
    try:
        count = client.query(f"SELECT count() FROM {DB}.DIM_EMPRESA").result_rows[0][0]
        if count == 0:
            client.insert(
                f"{DB}.DIM_EMPRESA",
                [(1, "Tracklytics S.A.", "0000000000001", "Quito, Ecuador")],
                column_names=["empresa_id", "razon_social", "ruc", "direccion"],
            )
            print("✓ DIM_EMPRESA sembrada (1 fila).")
    except Exception as exc:
        print(f"ERROR sembrando DIM_EMPRESA: {exc}")

    # DIM_PLAN (modelo-financiero-completar-huecos, CU-O98): precio efectivo
    # editable por admin — sembrado con los mismos precios que hoy están
    # hardcodeados en `api/paquetes/suscripciones/planes.py` (fuente de verdad
    # para id/tipo_actor/nombre/descripcion/features, que no cambian). Si esta
    # tabla queda vacía por cualquier motivo, `precio_efectivo()` cae de vuelta
    # a ese valor hardcodeado (design.md, decisión 5) — este seed es solo el
    # punto de partida editable, no la única fuente de precio.
    try:
        count = client.query(f"SELECT count() FROM {DB}.DIM_PLAN").result_rows[0][0]
        if count == 0:
            client.insert(
                f"{DB}.DIM_PLAN",
                [
                    ("free",       0.0),
                    ("premium",    9.99),
                    ("estudiante", 4.99),
                    ("basico",     199.0),
                    ("pro",        499.0),
                    ("enterprise", 1499.0),
                ],
                column_names=["plan_id", "precio_usd"],
            )
            print("✓ DIM_PLAN sembrada (6 filas).")
    except Exception as exc:
        print(f"ERROR sembrando DIM_PLAN: {exc}")

    # DIM_ROL_ADMINISTRATIVO (change roles-gestion-usuarios): catálogo cerrado de
    # roles admin por área de negocio. `superadmin` abarca todas las capabilities
    # (equivalente al admin general previo); el resto son subconjuntos. El mapeo
    # de cada endpoint /admin/* a su rol vive en los routers (require_rol_admin).
    try:
        count = client.query(f"SELECT count() FROM {DB}.DIM_ROL_ADMINISTRATIVO").result_rows[0][0]
        if count == 0:
            client.insert(
                f"{DB}.DIM_ROL_ADMINISTRATIVO",
                [
                    ("superadmin",     "Superadministrador",
                     ["*"], "Acceso total a todas las áreas administrativas"),
                    ("admin_finanzas", "Gerente Financiero / CFO",
                     ["facturacion", "finanzas", "regalias", "publicidad"],
                     "Facturación, finanzas, liquidación de regalías e ingresos por publicidad"),
                    ("admin_contenido", "Gerente de Contenido / A&R",
                     ["creadores", "distribucion", "catalogo"],
                     "Aprobación de artistas y tracks, distribución, licencias y takedown de catálogo"),
                    ("admin_comunidad", "Community Manager",
                     ["social", "experiencia"],
                     "Moderación de comentarios, tickets de soporte y planes familiares"),
                    ("admin_datos", "Lead Data Engineer",
                     ["gestion_datos", "analitica"],
                     "Gestión de datos e ingestas, configuración de analítica"),
                    ("admin_comercial", "Director Comercial",
                     ["suscripciones", "partners"],
                     "Planes y precios de suscripción, integraciones de partners"),
                ],
                column_names=["rol_admin", "nombre", "capabilities", "descripcion"],
            )
            print("✓ DIM_ROL_ADMINISTRATIVO sembrada (6 filas).")
    except Exception as exc:
        print(f"ERROR sembrando DIM_ROL_ADMINISTRATIVO: {exc}")

    # Backfill de email_verificado (change p2-descubrimiento-comunidad): la
    # columna nace en 0, así que sin este paso TODAS las cuentas ya registradas
    # (incluidas las de demo y las de prueba por tier) quedarían sin verificar y
    # no podrían comentar ni suscribirse. La regla solo debe aplicar a registros
    # nuevos, de modo que se marcan como verificadas las cuentas anteriores a la
    # migración (design.md, Decisión 7).
    #
    # El corte es una FECHA FIJA, no `email_verificado = 0` a secas: este bloque
    # corre en cada `docker compose up`, y un filtro por el flag volvería a
    # verificar a cualquiera que se hubiera registrado desde el arranque
    # anterior y aún no hubiera verificado su correo. Acotado por
    # fecha_registro el backfill es idempotente y solo alcanza a las cuentas que
    # existían cuando se añadió la columna.
    try:
        pendientes = client.query(
            f"SELECT count() FROM {DB}.DIM_USUARIO "
            f"WHERE email_verificado = 0 AND fecha_registro < '{FECHA_CORTE_VERIFICACION}'"
        ).result_rows[0][0]
        if pendientes:
            client.command(
                f"ALTER TABLE {DB}.DIM_USUARIO UPDATE email_verificado = 1 "
                f"WHERE email_verificado = 0 AND fecha_registro < '{FECHA_CORTE_VERIFICACION}'"
            )
            print(f"✓ email_verificado backfilleado ({pendientes} usuarios previos).")
    except Exception as exc:
        print(f"ERROR backfilleando email_verificado: {exc}")


if __name__ == "__main__":
    main()
