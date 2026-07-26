"""Datos semilla para FACT_DISPONIBILIDAD — incidentes realistas (S12).

`modelo_negocio_sync` (change `completar-modelo-base`) ya genera 1 fila/día/
componente con 3% de probabilidad de incidente, pero esa probabilidad es baja
y aleatoria: al ejecutar las semanas 5-11 (hasta la fecha actual) el generador
no tocó `api` en absoluto y sí afectó a `pocketbase` en 3 semanas distintas —
ambos resultados contradicen la historia de negocio que se quiere mostrar en
el panel de reportes admin (`/seguridad/disponibilidad`): Airflow y
PocketBase sin incidentes, un incidente de ClickHouse hace ~2 semanas y uno
de Api hace ~1 semana. Este script corrige eso sobre los datos ya generados,
en vez de regenerar las semanas con una semilla distinta (que también podría
no dar la combinación deseada).

Uso (desde el contenedor `etl`, mismo ClickHouse que usa `api`):
    docker compose run --rm etl python -m seeds.seed_disponibilidad_incidentes
"""
from datetime import datetime

from utils.clickhouse_client import get_client, scalar

# Día real dentro de cada semana objetivo elegido para el incidente de `api`
# (el de `clickhouse` ya cayó ahí por azar en la corrida de `modelo_negocio_sync`
# semana 9 — se deja intacto, ver docstring).
API_INCIDENTE_FECHA = datetime(2026, 7, 18)  # semana 2026-07-16..2026-07-22 ("hace 1 semana")


def main() -> None:
    client = get_client()

    # PocketBase (componente_id resuelto por nombre, no hardcodeado): sin
    # incidentes — 3 días quedaron en 1 por el 3% aleatorio de
    # `modelo_negocio_sync`, se limpian aquí.
    pocketbase_id = scalar(client, "SELECT componente_id FROM DIM_COMPONENTE_INFRAESTRUCTURA WHERE nombre = 'pocketbase'")
    client.command(
        "ALTER TABLE FACT_DISPONIBILIDAD UPDATE hubo_incidente = 0 WHERE componente_id = {cid:UInt16} AND hubo_incidente = 1",
        parameters={"cid": pocketbase_id},
        settings={"mutations_sync": 1},
    )

    # Api: 1 incidente hace ~1 semana. Se marca el día existente y se agrega
    # una fila extra del mismo día (mismo patrón "1 evento por día" de
    # `modelo_negocio_sync`, pero duplicado ese día puntual) para que el
    # promedio semanal baje a 75% (6 disponibles / 8 filas) en vez del 85.7%
    # que daría un solo día marcado sobre 7 filas — más parecido a una caída
    # de mayor severidad que la de ClickHouse (85%), como pide la historia.
    api_id = scalar(client, "SELECT componente_id FROM DIM_COMPONENTE_INFRAESTRUCTURA WHERE nombre = 'api'")
    client.command(
        "ALTER TABLE FACT_DISPONIBILIDAD UPDATE hubo_incidente = 1 "
        "WHERE componente_id = {cid:UInt16} AND fecha = {fecha:DateTime}",
        parameters={"cid": api_id, "fecha": API_INCIDENTE_FECHA},
        settings={"mutations_sync": 1},
    )
    max_fact_id = scalar(client, "SELECT max(fact_id) FROM FACT_DISPONIBILIDAD") or 0
    client.insert(
        "FACT_DISPONIBILIDAD",
        [(max_fact_id + 1, api_id, 1, API_INCIDENTE_FECHA)],
        column_names=["fact_id", "componente_id", "hubo_incidente", "fecha"],
    )

    print(f"✓ PocketBase (componente_id={pocketbase_id}): incidentes limpiados (0).")
    print(f"✓ Api (componente_id={api_id}): incidente reforzado en {API_INCIDENTE_FECHA} (fila duplicada, ~75% esa semana).")
    print("  ClickHouse: incidente ya existente de la corrida de modelo_negocio_sync (semana 9, 2026-07-08) sin tocar.")


if __name__ == "__main__":
    main()
