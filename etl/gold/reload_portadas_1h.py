"""etl/gold/reload_portadas_1h.py — recarga puntual de covers acotada a 1h,
vía `gold.portada.resolver_portadas_reload_1h`: canciones + álbumes/playlists
por Spotify oEmbed (con reemplazo autorizado de lo ya resuelto por
iTunes/Deezer) más fotos de artista por iTunes/Deezer (única vía posible).
Pensado para lanzarse en background (`docker exec -d ...`), fuera del ciclo
normal del DAG (`portada.run_portada`)."""

from gold.portada import resolver_portadas_reload_1h
from utils.clickhouse_client import get_client
from utils.config import get_config

if __name__ == "__main__":
    client = get_client(get_config())
    resultado = resolver_portadas_reload_1h(client, max_horas=1.0)
    print(f"[reload_1h] terminado: {resultado}")
