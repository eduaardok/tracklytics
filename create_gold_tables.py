"""
create_gold_tables.py — Crea las tablas GOLD_* (capa de agregaciones) en la
instancia ClickHouse Gold (8124, DB tracklytics_gold). Idempotente:
CREATE TABLE IF NOT EXISTS en todas.

S13-P3a, extendido en S14-P2 (grano temporal configurable). Se ejecuta como
parte de init_clickhouse_gold.py (después de crear la base de datos) —
también se puede correr suelto:
    python create_gold_tables.py

Convenciones compartidas por las 12 tablas GOLD_*_PERIODO:
- `granularidad` LowCardinality(String): 'dia'|'semana'|'mes'|'trimestre'|
  'anio' — S14-P2. Una misma tabla guarda las 5 granularidades a la vez,
  distinguidas por esta columna (no una tabla por granularidad).
- `fecha_inicio` Date: primer día del período (S14-P2) — permite filtrar por
  rango de fechas reales y ordenar cronológicamente sin depender del orden
  alfabético de `periodo` (que no coincide con el cronológico para 'mes' ni
  'trimestre').
- `periodo` String, etiqueta legible calculada en origen con
  `gold_ch.base.periodo_sql()` sobre el ClickHouse de catálogo — nunca se
  recalcula acá. Formato por granularidad: 'dia'='YYYY-MM-DD',
  'semana'='YYYY-WNN' (ISO), 'mes'='YYYY-MM', 'trimestre'='YYYY-QN',
  'anio'='YYYY'.
- `es_estimado` UInt8: 0 = agregado real desde el catálogo (8123), 1 = fila
  de demostración generada con seed fijo por el DAG porque el catálogo no
  tenía datos reales para ese período/dimensión (ver docs/BITACORA_S13.md,
  "Datos generados" — autorizado explícitamente para la capa Gold, distinto
  de fabricar datos en el catálogo, que sigue prohibido). Desde S14-P2 el
  relleno demo solo cubre los 12 períodos más recientes de cada granularidad
  (ver `gold_ch.base.PERIODOS_RELLENO_DEMO`) — los períodos más antiguos sin
  dato real simplemente no tienen fila.
- `updated_at` DateTime DEFAULT now(): cuándo se calculó/reemplazó la fila.
- Motor MergeTree, ORDER BY (granularidad, fecha_inicio, <dimensión...>) —
  permite DELETE+INSERT idempotente por granularidad+período (los DAGs nunca
  hacen INSERT puro).

Además, `GOLD_ETL_LOG`: tabla de control de las corridas del DAG de
agregaciones (no tiene `periodo` como grano principal, es un log por corrida).

Migración S14-P2: la capa Gold es 100% derivada del catálogo, no es fuente
de verdad, así que un cambio de esquema no necesita backfill — se recrean
las tablas desde cero y se vuelven a poblar corriendo el DAG
`dag_gold_aggregations`. Con `GOLD_RECREATE=1` en el ambiente, este script
hace `DROP TABLE IF EXISTS` antes de cada `CREATE TABLE IF NOT EXISTS` de las
13 tablas. Sin esa variable, el comportamiento es el idempotente de siempre.
"""

import os
import sys

import clickhouse_connect

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

HOST = os.getenv("CLICKHOUSE_GOLD_HOST", "localhost")
PORT = int(os.getenv("CLICKHOUSE_GOLD_PORT", "8124"))
DB   = os.getenv("CLICKHOUSE_GOLD_DB",   "tracklytics_gold")
USER = os.getenv("CLICKHOUSE_USER",      "default")
PASS = os.getenv("CLICKHOUSE_PASSWORD",  "")
RECREATE = os.getenv("GOLD_RECREATE") == "1"

TABLAS_PERIODO = [
    "GOLD_ADQUISICION_PERIODO", "GOLD_API_CONSUMO_PERIODO", "GOLD_INFRAESTRUCTURA_PERIODO",
    "GOLD_FINANCIERO_PERIODO", "GOLD_REGALIAS_PERIODO", "GOLD_PIPELINE_PERIODO",
    "GOLD_ENGAGEMENT_PERIODO", "GOLD_CONSUMO_GENERO_PERIODO", "GOLD_CONTENIDO_PERIODO",
    "GOLD_COMUNIDAD_PERIODO", "GOLD_SEGURIDAD_PERIODO", "GOLD_PRODUCTO_PERIODO", "GOLD_ETL_LOG",
]

DDL_STATEMENTS = [

    # C01/C02/C03 (OT-01/02/03, Comercial) — registros y estado de
    # suscripciones por país y plan. `plan` puede ser '' cuando la fila es
    # un agregado sin desglose de plan (ej. registros_nuevos totales).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_ADQUISICION_PERIODO (
        granularidad                LowCardinality(String),
        fecha_inicio                Date,
        periodo                     String,
        pais                        String DEFAULT '',
        plan                        String DEFAULT '',
        registros_nuevos            UInt32 DEFAULT 0,
        conversiones_free_to_paid   UInt32 DEFAULT 0,
        deserciones                 UInt32 DEFAULT 0,
        suscripciones_activas       UInt32 DEFAULT 0,
        cac_estimado                Float32 DEFAULT 0,
        es_estimado                 UInt8 DEFAULT 0,
        updated_at                  DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio, pais, plan)
    """,

    # C04 (OT-04, Tecnología) — consumo de la API por partner y tier.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_API_CONSUMO_PERIODO (
        granularidad          LowCardinality(String),
        fecha_inicio          Date,
        periodo               String,
        partner_id            String,
        tier                  String DEFAULT '',
        total_llamadas        UInt32 DEFAULT 0,
        llamadas_exitosas     UInt32 DEFAULT 0,
        llamadas_fallidas     UInt32 DEFAULT 0,
        tasa_exito            Float32 DEFAULT 0,
        latencia_promedio_ms  Float32 DEFAULT 0,
        es_estimado           UInt8 DEFAULT 0,
        updated_at            DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio, partner_id, tier)
    """,

    # C05/C06 (OT-05/06, Tecnología) — disponibilidad y errores por componente.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_INFRAESTRUCTURA_PERIODO (
        granularidad                   LowCardinality(String),
        fecha_inicio                   Date,
        periodo                        String,
        componente                     String,
        uptime_porcentaje              Float32 DEFAULT 100,
        incidentes_total               UInt32 DEFAULT 0,
        tiempo_resolucion_promedio_h   Float32 DEFAULT 0,
        errores_total                  UInt32 DEFAULT 0,
        errores_criticos               UInt32 DEFAULT 0,
        es_estimado                    UInt8 DEFAULT 0,
        updated_at                     DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio, componente)
    """,

    # C07/C08/C10/C11 (OT-07/08/10/11, Financiero) — salud financiera
    # consolidada. Sin dimensión adicional: un OT-08 pide "gastos vs
    # ingresos", que ya está cubierto por columnas separadas acá.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_FINANCIERO_PERIODO (
        granularidad            LowCardinality(String),
        fecha_inicio            Date,
        periodo                 String,
        mrr                     Float32 DEFAULT 0,
        arr                     Float32 DEFAULT 0,
        ingresos_suscripciones  Float32 DEFAULT 0,
        ingresos_publicidad     Float32 DEFAULT 0,
        gastos_total            Float32 DEFAULT 0,
        reembolsos_total        Float32 DEFAULT 0,
        margen_neto             Float32 DEFAULT 0,
        facturas_emitidas       UInt32 DEFAULT 0,
        facturas_cobradas       UInt32 DEFAULT 0,
        tasa_cobro              Float32 DEFAULT 0,
        es_estimado             UInt8 DEFAULT 0,
        updated_at              DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio)
    """,

    # C09 (OT-09, Financiero) — liquidaciones de regalías por contrato/sello.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_REGALIAS_PERIODO (
        granularidad             LowCardinality(String),
        fecha_inicio             Date,
        periodo                  String,
        contrato_id              String,
        sello                    String DEFAULT '',
        tipo_split               String DEFAULT '',
        monto_liquidado          Float32 DEFAULT 0,
        reproducciones_periodo   UInt32 DEFAULT 0,
        porcentaje_aplicado      Float32 DEFAULT 0,
        es_estimado              UInt8 DEFAULT 0,
        updated_at               DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio, contrato_id)
    """,

    # C12/C13 (OT-12/13, Ingeniería de Datos) — pipeline de ingesta.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_PIPELINE_PERIODO (
        granularidad           LowCardinality(String),
        fecha_inicio           Date,
        periodo                String,
        duracion_promedio_s    Float32 DEFAULT 0,
        registros_insertados   UInt32 DEFAULT 0,
        registros_rechazados   UInt32 DEFAULT 0,
        tasa_rechazo           Float32 DEFAULT 0,
        registros_real         UInt32 DEFAULT 0,
        registros_synthetic    UInt32 DEFAULT 0,
        registros_uploaded     UInt32 DEFAULT 0,
        es_estimado            UInt8 DEFAULT 0,
        updated_at             DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio)
    """,

    # C14/C16 (OT-15/17, Analítica y BI) — panel ejecutivo de engagement.
    # `genero=''` es la fila de rollup del período completo (todos los géneros).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_ENGAGEMENT_PERIODO (
        granularidad                LowCardinality(String),
        fecha_inicio                Date,
        periodo                     String,
        genero                      String DEFAULT '',
        reproducciones_total        UInt32 DEFAULT 0,
        favoritos_total             UInt32 DEFAULT 0,
        playlist_adds_total         UInt32 DEFAULT 0,
        engagement_score_promedio   Float32 DEFAULT 0,
        popularidad_promedio        Float32 DEFAULT 0,
        usuarios_activos            UInt32 DEFAULT 0,
        nuevos_usuarios             UInt32 DEFAULT 0,
        usuarios_retenidos          UInt32 DEFAULT 0,
        es_estimado                 UInt8 DEFAULT 0,
        updated_at                  DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio, genero)
    """,

    # C15/C17/C18 (OT-16/18/19, Analítica y BI) — ranking, proyección y
    # benchmark por género/artista. `prediccion_4sem` guarda 4 valores
    # proyectados (períodos periodo+1..periodo+4); solo se calcula en la fila
    # del período más reciente de cada género (el resto queda vacío `[]`).
    # S14-P2: la proyección (regresión lineal) SOLO se calcula para
    # granularidad='semana' — para 'dia'/'mes'/'trimestre'/'anio',
    # pendiente_regresion/intercepto_regresion quedan en 0 y prediccion_4sem
    # vacío (ver `gold_ch.consumo_genero`, no se generalizó la proyección a
    # las demás granularidades en este bloque).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_CONSUMO_GENERO_PERIODO (
        granularidad                     LowCardinality(String),
        fecha_inicio                     Date,
        periodo                          String,
        genre_id                         UInt16,
        genero                           String,
        artist_id                        UInt32 DEFAULT 0,
        artista                          String DEFAULT '',
        reproducciones                   UInt32 DEFAULT 0,
        popularidad_promedio             Float32 DEFAULT 0,
        energia_promedio                 Float32 DEFAULT 0,
        variacion_pct_vs_anterior        Float32 DEFAULT 0,
        pendiente_regresion              Float32 DEFAULT 0,
        intercepto_regresion             Float32 DEFAULT 0,
        prediccion_4sem                  Array(Float32),
        popularidad_interna_promedio     Float32 DEFAULT 0,
        popularidad_catalogo_base        Float32 DEFAULT 0,
        diferencia_pct_benchmark         Float32 DEFAULT 0,
        es_estimado                      UInt8 DEFAULT 0,
        updated_at                       DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio, genre_id, artist_id)
    """,

    # C19/C20/C21 (OT-20/21/23, Contenido y A&R) — revisión editorial,
    # licencias y cobertura por territorio.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_CONTENIDO_PERIODO (
        granularidad                  LowCardinality(String),
        fecha_inicio                  Date,
        periodo                       String,
        territorio                    String DEFAULT '',
        solicitudes_recibidas         UInt32 DEFAULT 0,
        aprobadas                     UInt32 DEFAULT 0,
        rechazadas                    UInt32 DEFAULT 0,
        tasa_aprobacion                Float32 DEFAULT 0,
        tiempo_promedio_resolucion_h  Float32 DEFAULT 0,
        licencias_activas             UInt32 DEFAULT 0,
        tracks_cubiertos              UInt32 DEFAULT 0,
        cobertura_pct                 Float32 DEFAULT 0,
        es_estimado                   UInt8 DEFAULT 0,
        updated_at                    DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio, territorio)
    """,

    # C22/C23/C24/C25 (OT-24/25/26/27, Comunidad y Soporte) — moderación,
    # denuncias, tickets e interacciones. `categoria` es el tipo de acción/
    # denuncia/ticket según la fila (ver DAG, columna discriminadora simple).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_COMUNIDAD_PERIODO (
        granularidad                   LowCardinality(String),
        fecha_inicio                   Date,
        periodo                        String,
        categoria                      String DEFAULT '',
        acciones_moderacion            UInt32 DEFAULT 0,
        comentarios_moderados          UInt32 DEFAULT 0,
        denuncias_recibidas            UInt32 DEFAULT 0,
        denuncias_resueltas            UInt32 DEFAULT 0,
        sanciones_derivadas            UInt32 DEFAULT 0,
        tickets_abiertos               UInt32 DEFAULT 0,
        tickets_resueltos              UInt32 DEFAULT 0,
        tiempo_resolucion_promedio_h   Float32 DEFAULT 0,
        interacciones_sociales_total   UInt32 DEFAULT 0,
        crecimiento_pct_vs_anterior    Float32 DEFAULT 0,
        es_estimado                    UInt8 DEFAULT 0,
        updated_at                     DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio, categoria)
    """,

    # C26/C27 (OT-29/31, Seguridad) — auditoría y sanciones.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_SEGURIDAD_PERIODO (
        granularidad                LowCardinality(String),
        fecha_inicio                Date,
        periodo                     String,
        tipo_evento                 String DEFAULT '',
        eventos_auditoria_total     UInt32 DEFAULT 0,
        sanciones_emitidas          UInt32 DEFAULT 0,
        suspensiones_automaticas    UInt32 DEFAULT 0,
        tasa_suspension             Float32 DEFAULT 0,
        es_estimado                 UInt8 DEFAULT 0,
        updated_at                  DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio, tipo_evento)
    """,

    # C28/C29/C30 (OT-32/33/34, Producto) — recomendaciones, A/B y
    # notificaciones. `dimension` guarda el experimento_id (filas de A/B) o el
    # tipo de notificación, según corresponda — discriminado por `categoria`.
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_PRODUCTO_PERIODO (
        granularidad                     LowCardinality(String),
        fecha_inicio                     Date,
        periodo                          String,
        categoria                        String,
        dimension                        String DEFAULT '',
        recomendaciones_generadas        UInt32 DEFAULT 0,
        recomendaciones_reproducidas     UInt32 DEFAULT 0,
        tasa_conversion_recomendacion    Float32 DEFAULT 0,
        experimentos_activos             UInt32 DEFAULT 0,
        exposiciones_variante            UInt32 DEFAULT 0,
        metrica_impacto                  Float32 DEFAULT 0,
        notificaciones_enviadas          UInt32 DEFAULT 0,
        notificaciones_leidas            UInt32 DEFAULT 0,
        tasa_lectura                     Float32 DEFAULT 0,
        es_estimado                      UInt8 DEFAULT 0,
        updated_at                       DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (granularidad, fecha_inicio, categoria, dimension)
    """,

    # Control de corridas del DAG de agregaciones — no tiene `periodo` como
    # grano principal (una corrida puede tocar varios períodos).
    f"""
    CREATE TABLE IF NOT EXISTS {DB}.GOLD_ETL_LOG (
        run_id              UUID DEFAULT generateUUIDv4(),
        tabla               String,
        granularidad        LowCardinality(String) DEFAULT 'semana',
        periodos_procesados String,
        registros_escritos  UInt32 DEFAULT 0,
        duracion_s          Float32 DEFAULT 0,
        estado              String DEFAULT 'ok',
        detalle             String DEFAULT '',
        ejecutado_en        DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (tabla, ejecutado_en)
    """,
]


def main() -> None:
    print(f"Conectando a ClickHouse Gold {HOST}:{PORT}/{DB} para crear tablas ...")
    client = clickhouse_connect.get_client(host=HOST, port=PORT, database=DB, username=USER, password=PASS)

    if RECREATE:
        print(f"GOLD_RECREATE=1 — recreando {len(TABLAS_PERIODO)} tablas desde cero (capa 100% derivada, sin backfill) ...")
        for tabla in TABLAS_PERIODO:
            client.command(f"DROP TABLE IF EXISTS {DB}.{tabla}")
            print(f"  DROP {tabla}")

    total, success = len(DDL_STATEMENTS), 0
    for i, stmt in enumerate(DDL_STATEMENTS, 1):
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
        print(f"✓ {success}/{total} tablas GOLD_* listas.")
    else:
        print(f"⚠ {success}/{total} tablas creadas — revisar errores arriba.")
        sys.exit(1)


if __name__ == "__main__":
    main()
