"""etl/gold/portada.py — RF-EXP-009: portada real de artistas y álbumes del
catálogo licenciado base (FACT_TRACKS.source_type = 'real'), resuelta vía dos
directorios musicales públicos sin necesidad de credencial: iTunes Search API
y Deezer Search API — evaluados y elegidos sobre MusicBrainz/Cover Art Archive
porque cada uno resuelve en una sola llamada por término, sin necesitar un
MBID intermedio. El orden de intento es distinto por entidad (ver
`resolver_portadas`): iTunes primero para artistas (Deezer como respaldo),
Deezer primero para álbumes (iTunes como respaldo) — la tasa de éxito real de
cada API no es simétrica entre ambos tipos de búsqueda, confirmado en
producción (docs/decisiones-refactorizacion.md §25). Un fallo de red no
interrumpe el batch — se registra y se continúa (tasks.md 3.4); sin resultado
en ninguna de las dos, el campo queda NULL y el fallback visual lo resuelve
el frontend, no el ETL (design.md de `experiencia`, "Portada real")."""

import json
from pathlib import Path

import httpx

from utils.clickhouse_client import get_client
from utils.config import get_config

ITUNES_SEARCH_URL = "https://itunes.apple.com/search"
DEEZER_SEARCH_URL = "https://api.deezer.com/search"

# Cache local de portadas ya resueltas — vive en `./etl` (bind mount real al
# filesystem del host, `docker-compose.yml`: `./etl:/opt/airflow/etl_src`),
# NO en un volumen de Docker. Sobrevive a `docker compose down -v` (que borra
# `ch_data` y recrea ClickHouse desde cero) y a cualquier recarga que reduzca
# `FACT_TRACKS` a las ~113.550 filas reales originales — ninguna de las dos
# operaciones toca este archivo. `DIM_ARTISTS`/`DIM_ALBUMS` ya estaban
# protegidas de recargas normales por el guard de idempotencia de
# `loader.py` (`if _count(tabla) == 0`), pero ese guard no ayuda si el
# volumen de ClickHouse se destruye por completo — este cache sí.
_CACHE_PATH = Path(__file__).parent / "portadas_cache.json"


def cargar_cache_portadas() -> dict:
    """Usado por `loader.py` al crear DIM_ARTISTS/DIM_ALBUMS desde cero
    (`_count(tabla) == 0`) para poblar `imagen_url` directamente en el mismo
    INSERT masivo — sin esto, tras un reset completo del volumen de
    ClickHouse, todo lo ya resuelto en sesiones anteriores se perdería y
    tendría que volver a gastarse cuota de iTunes/Deezer para recuperarlo."""
    if not _CACHE_PATH.exists():
        return {"artistas": {}, "albumes": {}}
    try:
        data = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"artistas": {}, "albumes": {}}
    return {"artistas": data.get("artistas", {}), "albumes": data.get("albumes", {})}


def guardar_cache_portadas(client) -> None:
    """Vuelca a disco todo lo que hoy tiene `imagen_url` resuelto en
    ClickHouse — llamado al final de cada `resolver_portadas()` para que el
    cache quede al día incrementalmente, sin un paso manual aparte."""
    cache: dict = {"artistas": {}, "albumes": {}}
    for name, url in client.query(
        "SELECT name, imagen_url FROM DIM_ARTISTS WHERE imagen_url IS NOT NULL"
    ).result_rows:
        cache["artistas"][name] = url
    for name, url in client.query(
        "SELECT name, imagen_url FROM DIM_ALBUMS WHERE imagen_url IS NOT NULL"
    ).result_rows:
        cache["albumes"][name] = url
    _CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8"
    )
# Límite conservador por corrida: evita saturar las APIs públicas gratuitas
# (sin autenticación) en un dataset de miles de artistas/álbumes — resolución
# incremental en corridas sucesivas (cada corrida solo toma los que aún
# tienen `imagen_url IS NULL`). iTunes es notablemente más estricta (403/429
# ya a los pocos requests, confirmado contra la API real); Deezer no mostró
# ese problema en las mismas pruebas.
_BATCH_LIMIT = 50


def _buscar_portada(termino: str, entidad: str) -> str | None:
    try:
        resp = httpx.get(
            ITUNES_SEARCH_URL,
            params={"term": termino, "entity": entidad, "limit": 1},
            timeout=5,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        if not results:
            return None
        artwork = results[0].get("artworkUrl100", "")
        # 100x100 -> 600x600, mismo host — mejor resolución para portada real.
        return artwork.replace("100x100bb", "600x600bb") if artwork else None
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError, KeyError) as exc:
        print(f"[portada] fallo (itunes) resolviendo '{termino}' ({entidad}): {exc}")
        return None


def _buscar_portada_deezer(termino: str, tipo: str) -> str | None:
    """Segundo intento cuando iTunes no tiene resultado. `tipo`: 'artist' o
    'album' — a diferencia de iTunes, el endpoint de artista de Deezer sí
    devuelve una foto real del artista (`picture_big`), no solo portadas de
    álbum."""
    endpoint = "artist" if tipo == "artist" else "album"
    campo    = "picture_big" if tipo == "artist" else "cover_big"
    try:
        resp = httpx.get(
            f"{DEEZER_SEARCH_URL}/{endpoint}",
            params={"q": termino, "limit": 1},
            timeout=5,
        )
        resp.raise_for_status()
        results = resp.json().get("data", [])
        if not results:
            return None
        return results[0].get(campo) or None
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError, KeyError) as exc:
        print(f"[portada] fallo (deezer) resolviendo '{termino}' ({tipo}): {exc}")
        return None


def resolver_portadas(client) -> dict:
    artistas = client.query(f"""
        SELECT DISTINCT a.artist_id, a.name
        FROM DIM_ARTISTS a
        JOIN FACT_TRACKS ft ON ft.artist_id = a.artist_id
        WHERE a.imagen_url IS NULL AND ft.source_type = 'real'
        LIMIT {_BATCH_LIMIT}
    """).result_rows

    resueltos_artistas = 0
    for artist_id, name in artistas:
        # Bug real (no solo falta de corridas): iTunes Search API con
        # entity=musicArtist nunca devuelve `artworkUrl100` — los resultados
        # de tipo "artist" no traen artwork (confirmado contra la API real:
        # el objeto de resultado ni siquiera tiene esa key). Toda búsqueda de
        # artista con `entity=musicArtist` resolvía a None por diseño de la
        # API, no por rate limit ni por cobertura pendiente. Fix: buscar por
        # entity=album (el álbum más relevante del artista sí trae artwork) y
        # usar esa portada como imagen representativa del artista — mismo
        # patrón que usan otros clientes de iTunes/Apple Music cuando no hay
        # foto de artista disponible.
        url = _buscar_portada(name, "album") or _buscar_portada_deezer(name, "artist")
        if url:
            client.command(
                "ALTER TABLE DIM_ARTISTS UPDATE imagen_url = {url:String} WHERE artist_id = {id:UInt32}",
                parameters={"url": url, "id": artist_id},
            )
            resueltos_artistas += 1

    albumes = client.query(f"""
        SELECT DISTINCT al.album_id, al.name
        FROM DIM_ALBUMS al
        JOIN FACT_TRACKS ft ON ft.album_id = al.album_id
        WHERE al.imagen_url IS NULL AND ft.source_type = 'real'
        LIMIT {_BATCH_LIMIT}
    """).result_rows

    resueltos_albumes = 0
    for album_id, name in albumes:
        # Orden invertido respecto a artistas (Deezer primero, iTunes como
        # respaldo) — confirmado en producción (docs/decisiones-refactorizacion.md
        # §25): la tasa de éxito de iTunes para álbumes se degrada con cada
        # corrida sostenida dentro de la misma sesión (39→27→…→4/50), mientras
        # que Deezer se mantiene estable (~49/50). Para artistas el orden
        # actual (iTunes primero) ya funciona bien y no se toca.
        url = _buscar_portada_deezer(name, "album") or _buscar_portada(name, "album")
        if url:
            client.command(
                "ALTER TABLE DIM_ALBUMS UPDATE imagen_url = {url:String} WHERE album_id = {id:UInt32}",
                parameters={"url": url, "id": album_id},
            )
            resueltos_albumes += 1

    print(f"[portada] artistas resueltos: {resueltos_artistas}/{len(artistas)}, "
          f"álbumes resueltos: {resueltos_albumes}/{len(albumes)}")

    # `ALTER TABLE ... UPDATE` es una mutación asíncrona — es posible que la
    # resuelta en esta misma corrida todavía no se refleje en el SELECT de
    # abajo. No es un problema real: la siguiente corrida (unos segundos
    # después) vuelve a guardar el cache completo, así que cualquier entrada
    # "perdida" por la carrera se recupera sola en el próximo ciclo.
    guardar_cache_portadas(client)

    return {"artistas_resueltos": resueltos_artistas, "albumes_resueltos": resueltos_albumes}


def run_portada(**context):
    client = get_client(get_config())
    resolver_portadas(client)
