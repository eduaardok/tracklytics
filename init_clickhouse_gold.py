"""
init_clickhouse_gold.py — Crea la base de datos de la capa Gold (agregaciones)
en su propia instancia de ClickHouse, separada del ClickHouse de catálogo
(puerto 8123). Idempotente: usa CREATE DATABASE IF NOT EXISTS.

S13-P2 preparó solo la infraestructura (contenedor + base de datos vacía).
S13-P3a agrega la creación de las tablas GOLD_* (ver `create_gold_tables.py`,
importado y ejecutado al final de `main()` — mismo proceso, un solo paso de
init) y retry con backoff: el healthcheck de `clickhouse-gold` en
docker-compose.yml usa `clickhouse-client` (protocolo nativo, puerto 9000
interno) para decidir "healthy", pero la interfaz HTTP (8123 interno, el
puerto que este script y clickhouse_connect usan) puede tardar unos segundos
más en aceptar conexiones — carrera real observada en P2 (ver
docs/BITACORA_S13.md, "Quirk de infra"). 3 intentos con 5s de espera entre
cada uno cubre ese margen sin sumar un healthcheck HTTP nuevo al compose.

Uso local (apuntando a Docker):
    python init_clickhouse_gold.py

Uso con credenciales custom:
    CLICKHOUSE_GOLD_HOST=localhost CLICKHOUSE_GOLD_PORT=8124 \
    CLICKHOUSE_GOLD_DB=tracklytics_gold CLICKHOUSE_USER=default CLICKHOUSE_PASSWORD=secret \
    python init_clickhouse_gold.py
"""

import os
import sys
import time

import clickhouse_connect

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

# Mismo usuario/password que el ClickHouse de catálogo (CLICKHOUSE_USER/
# CLICKHOUSE_PASSWORD) — es una instancia separada, no una cuenta separada;
# no se introduce una segunda credencial solo para esto.
HOST = os.getenv("CLICKHOUSE_GOLD_HOST", "localhost")
PORT = int(os.getenv("CLICKHOUSE_GOLD_PORT", "8124"))
DB   = os.getenv("CLICKHOUSE_GOLD_DB",   "tracklytics_gold")
USER = os.getenv("CLICKHOUSE_USER",      "default")
PASS = os.getenv("CLICKHOUSE_PASSWORD",  "")

MAX_INTENTOS   = 3
ESPERA_SEGUNDOS = 5


def _conectar_con_retry() -> clickhouse_connect.driver.Client:
    ultimo_error: Exception | None = None
    for intento in range(1, MAX_INTENTOS + 1):
        try:
            client = clickhouse_connect.get_client(host=HOST, port=PORT, username=USER, password=PASS)
            client.command("SELECT 1")
            if intento > 1:
                print(f"✓ Conectado en el intento {intento}/{MAX_INTENTOS}.")
            return client
        except Exception as exc:
            ultimo_error = exc
            print(f"  intento {intento}/{MAX_INTENTOS} falló: {exc}")
            if intento < MAX_INTENTOS:
                time.sleep(ESPERA_SEGUNDOS)
    print(f"ERROR: no se pudo conectar tras {MAX_INTENTOS} intentos — {ultimo_error}")
    sys.exit(1)


def main() -> None:
    print(f"Conectando a ClickHouse Gold {HOST}:{PORT} ...")
    client = _conectar_con_retry()

    try:
        client.command(f"CREATE DATABASE IF NOT EXISTS {DB}")
        print(f"✓ Base de datos '{DB}' lista en ClickHouse Gold ({HOST}:{PORT}).")
    except Exception as exc:
        print(f"ERROR creando la base de datos '{DB}': {exc}")
        sys.exit(1)

    # S13-P3a: tablas GOLD_* — mismo proceso de init, ver create_gold_tables.py.
    import create_gold_tables
    create_gold_tables.main()


if __name__ == "__main__":
    main()
