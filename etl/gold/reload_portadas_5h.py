"""etl/gold/reload_portadas_5h.py — recarga extendida de covers acotada a 5h,
vía `gold.portada.resolver_portadas_reload_1h` (el nombre de la función
conserva su origen "1h" pero `max_horas` es un parámetro): canciones +
álbumes/playlists por Spotify oEmbed (con reemplazo autorizado de lo ya
resuelto por iTunes/Deezer) más fotos de artista por iTunes/Deezer (única vía
posible). Pensado para lanzarse en background (`docker exec -d ...`), fuera
del ciclo normal del DAG (`portada.run_portada`) — mismo patrón que
`reload_portadas_1h.py`, solo con más presupuesto de horas."""

from gold.portada import resolver_portadas_reload_1h
from utils.clickhouse_client import get_client
from utils.config import get_config

if __name__ == "__main__":
    client = get_client(get_config())
    resultado = resolver_portadas_reload_1h(client, max_horas=5.0)
    print(f"[reload_5h] terminado: {resultado}")
