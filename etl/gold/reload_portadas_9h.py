"""etl/gold/reload_portadas_9h.py — corrida standalone y desatendida de 9h
que cubre canciones + álbumes/playlists + ARTISTAS (ver
`portada.resolver_portadas_reload_1h`), a diferencia de
`backfill_portadas.py` (que solo cubre canciones). S14-P1 necesita que la
corrida larga de background también resuelva `DIM_ARTISTS.imagen_url`
(perfil de artista, Fase 2) — `resolver_portadas_reload_1h` ya hacía
exactamente eso, solo con un presupuesto de 1h por defecto; este script es
el mismo patrón de `backfill_portadas.py` pero llamando a esa función con
`max_horas=9.0` en vez de escribir lógica de resolución nueva. Pensado para
lanzarse en background (`docker compose run -d ...`) y dejarlo corriendo
varias horas sin supervisión."""

from gold.portada import resolver_portadas_reload_1h
from utils.clickhouse_client import get_client
from utils.config import get_config

if __name__ == "__main__":
    client = get_client(get_config())
    resultado = resolver_portadas_reload_1h(client, max_horas=9.0)
    print(f"[reload_9h] terminado: {resultado}")
