"""etl/gold/backfill_portadas.py — corrida standalone y desatendida del
backfill completo de portadas por canción (ver
`portada.resolver_portadas_tracks_spotify_todas`). Pensado para lanzarse en
background (`docker exec -d ...`) y dejarlo corriendo varias horas sin
supervisión — fuera del ciclo normal del DAG, que solo procesa `_BATCH_LIMIT`
por corrida."""

from gold.portada import resolver_portadas_tracks_spotify_todas
from utils.clickhouse_client import get_client
from utils.config import get_config

if __name__ == "__main__":
    client = get_client(get_config())
    resultado = resolver_portadas_tracks_spotify_todas(client)
    print(f"[backfill] terminado: {resultado}")
