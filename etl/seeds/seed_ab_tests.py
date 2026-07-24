"""Datos semilla para FACT_AB_TEST_EXPOSICION (S12).

`FACT_AB_TEST_EXPOSICION` no tiene ningún productor real en el código (ver
BITACORA_S12, Bloque 2): ninguna parte de `api/`/`etl/` escribe en ella desde
que se creó (change `experiencia`, S9) — no existe todavía un flujo real de
asignación de variantes A/B, solo la tabla y el panel de lectura
(`GET /experiencia/admin/ab-tests`), que hasta ahora siempre devolvía una
lista vacía. Este script siembra datos de ejemplo para poder ver ese panel
con contenido real mientras no exista el flujo de asignación.

`fact_id` es secuencial desde `max(fact_id)+1` (no el `UInt64` aleatorio de
50 bits que usa el resto del proyecto, design.md "Generación de
identificadores") — a propósito: esto es un seed de datos de un solo uso, no
una ruta de escritura de producción, y un id secuencial hace trivial verificar
a simple vista cuántas filas insertó una corrida.

Uso (desde el contenedor `etl`, mismo ClickHouse que usa `api`):
    docker compose run --rm etl python -m seeds.seed_ab_tests
"""
import random
from datetime import datetime, timedelta, timezone

from utils.clickhouse_client import get_client, scalar

EXPERIMENTOS = {
    "recomendacion_layout": ["control", "grid_2x2"],
    "boton_premium":        ["verde", "morado"],
}

N_REGISTROS  = 50
DIAS_VENTANA = 14  # últimas 2 semanas


def main() -> None:
    client = get_client()

    usuarios = [r[0] for r in client.query("SELECT usuario_id FROM DIM_USUARIO").result_rows]
    if not usuarios:
        raise SystemExit("DIM_USUARIO está vacío — no hay usuario_id para asignar exposiciones.")

    max_fact_id = scalar(client, "SELECT max(fact_id) FROM FACT_AB_TEST_EXPOSICION") or 0
    ahora = datetime.now(timezone.utc)

    filas = []
    for i in range(N_REGISTROS):
        experimento = random.choice(list(EXPERIMENTOS))
        variante    = random.choice(EXPERIMENTOS[experimento])
        usuario_id  = random.choice(usuarios)
        fecha       = ahora - timedelta(seconds=random.randint(0, DIAS_VENTANA * 86400))
        filas.append((max_fact_id + i + 1, usuario_id, experimento, variante, fecha))

    client.insert(
        "FACT_AB_TEST_EXPOSICION",
        filas,
        column_names=["fact_id", "usuario_id", "experimento", "variante", "fecha"],
    )
    print(f"✓ {len(filas)} exposiciones A/B insertadas (fact_id {max_fact_id + 1}..{max_fact_id + len(filas)}).")


if __name__ == "__main__":
    main()
