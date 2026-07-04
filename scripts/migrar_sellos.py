"""
migrar_sellos.py — Migración BREAKING de la capability `distribucion`:
reemplaza DIM_ARTISTS.record_label / DIM_ALBUMS.label (texto libre) por
DIM_ARTISTS.sello_id / DIM_ALBUMS.sello_id (FK a DIM_SELLO_DISCOGRAFICO).

Script de una sola ejecución (RT-01: todo movimiento de datos ocurre desde
Python). Idempotente en sus pasos de creación/población; el DROP COLUMN final
solo se ejecuta si la verificación de cobertura pasa.

Uso (dentro del contenedor `api`, mismas variables de entorno que init_clickhouse.py):
    docker compose exec -T api python - < scripts/migrar_sellos.py
"""

import os
import sys

import clickhouse_connect

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

HOST = os.getenv("CLICKHOUSE_HOST",     "localhost")
PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
DB   = os.getenv("CLICKHOUSE_DB",       "tracklytics")
USER = os.getenv("CLICKHOUSE_USER",     "default")
PASS = os.getenv("CLICKHOUSE_PASSWORD", "")

# Catálogo de referencia de sellos discográficos reales, disponible para que un
# admin asigne sellos a artistas/álbumes vía RF-DIS-002. El dataset base (Kaggle
# Spotify) no incluye información real de sello discográfico — record_label/label
# están vacíos en el 100% de las filas existentes (verificado antes de escribir
# este script) — así que no hay valores históricos que extraer. Este catálogo no
# se auto-asigna a ningún artista/álbum existente (quedan con sello_id=0, "sin
# sello asignado", el mismo default de la columna nueva).
SELLOS_REFERENCIA = [
    "Universal Music Group",
    "Sony Music Entertainment",
    "Warner Music Group",
    "Independiente",
]


def main() -> None:
    print(f"Conectando a ClickHouse {HOST}:{PORT} ...")
    client = clickhouse_connect.get_client(
        host=HOST, port=PORT, username=USER, password=PASS, database=DB,
    )

    # 1. Extraer valores distintos no vacíos de record_label/label (histórico real).
    record_labels = [
        r[0] for r in client.query(
            "SELECT DISTINCT record_label FROM DIM_ARTISTS WHERE record_label != ''"
        ).result_rows
    ]
    album_labels = [
        r[0] for r in client.query(
            "SELECT DISTINCT label FROM DIM_ALBUMS WHERE label != ''"
        ).result_rows
    ]
    nombres_historicos = sorted(set(record_labels) | set(album_labels))
    print(f"Sellos distintos encontrados en datos existentes: {len(nombres_historicos)}")

    # 2. Poblar DIM_SELLO_DISCOGRAFICO (histórico real, si lo hay, + catálogo de
    #    referencia), evitando duplicar si el script se corre más de una vez.
    existentes = {
        r[0] for r in client.query("SELECT nombre FROM DIM_SELLO_DISCOGRAFICO").result_rows
    }
    nombres_a_insertar = [
        n for n in (nombres_historicos + SELLOS_REFERENCIA) if n not in existentes
    ]
    if nombres_a_insertar:
        max_id = client.query(
            "SELECT max(sello_id) FROM DIM_SELLO_DISCOGRAFICO"
        ).result_rows[0][0] or 0
        filas = [(max_id + i, nombre) for i, nombre in enumerate(nombres_a_insertar, 1)]
        client.insert(
            "DIM_SELLO_DISCOGRAFICO", filas, column_names=["sello_id", "nombre"],
        )
        print(f"✓ DIM_SELLO_DISCOGRAFICO: {len(filas)} sellos insertados.")
    else:
        print("DIM_SELLO_DISCOGRAFICO ya tiene todos los nombres — nada que insertar.")

    sello_id_por_nombre = {
        r[0]: r[1] for r in client.query(
            "SELECT nombre, sello_id FROM DIM_SELLO_DISCOGRAFICO"
        ).result_rows
    }

    # 3. Agregar sello_id (columna nueva, default 0 = sin sello) — no-op si ya existe.
    client.command("ALTER TABLE DIM_ARTISTS ADD COLUMN IF NOT EXISTS sello_id UInt32 DEFAULT 0")
    client.command("ALTER TABLE DIM_ALBUMS ADD COLUMN IF NOT EXISTS sello_id UInt32 DEFAULT 0")
    print("✓ Columna sello_id asegurada en DIM_ARTISTS y DIM_ALBUMS.")

    # 4. Backfill: mapear cada record_label/label histórico a su sello_id.
    for nombre in record_labels:
        sello_id = sello_id_por_nombre[nombre]
        client.command(
            "ALTER TABLE DIM_ARTISTS UPDATE sello_id = {sello_id:UInt32} "
            "WHERE record_label = {nombre:String}",
            parameters={"sello_id": sello_id, "nombre": nombre},
        )
    for nombre in album_labels:
        sello_id = sello_id_por_nombre[nombre]
        client.command(
            "ALTER TABLE DIM_ALBUMS UPDATE sello_id = {sello_id:UInt32} "
            "WHERE label = {nombre:String}",
            parameters={"sello_id": sello_id, "nombre": nombre},
        )
    if record_labels or album_labels:
        print("✓ Backfill de sello_id aplicado (mutación asíncrona en ClickHouse).")
    else:
        print("Sin valores históricos que hacer backfill (record_label/label ya estaban vacíos).")

    # 5. Verificación de cobertura: ninguna fila con texto de sello no vacío debe
    #    quedar con sello_id=0 (ver design.md, Migration Plan). Las mutaciones de
    #    ClickHouse son asíncronas — reintenta unas veces antes de fallar.
    import time
    for intento in range(10):
        pendientes_artistas = client.query(
            "SELECT count() FROM DIM_ARTISTS WHERE sello_id = 0 AND record_label != ''"
        ).result_rows[0][0]
        pendientes_albumes = client.query(
            "SELECT count() FROM DIM_ALBUMS WHERE sello_id = 0 AND label != ''"
        ).result_rows[0][0]
        if pendientes_artistas == 0 and pendientes_albumes == 0:
            break
        print(f"  esperando mutaciones... artistas={pendientes_artistas} albumes={pendientes_albumes}")
        time.sleep(2)
    else:
        print("ERROR: quedaron filas con sello_id=0 y texto de sello no vacío. Abortando antes del DROP COLUMN.")
        sys.exit(1)
    print("✓ Cobertura verificada: 0 filas pendientes.")

    # 6. Solo ahora, irreversible: eliminar las columnas de texto libre.
    client.command("ALTER TABLE DIM_ARTISTS DROP COLUMN IF EXISTS record_label")
    client.command("ALTER TABLE DIM_ALBUMS DROP COLUMN IF EXISTS label")
    print("✓ record_label/label eliminados de DIM_ARTISTS/DIM_ALBUMS.")

    print("\nMigración completa.")


if __name__ == "__main__":
    main()
