"""etl/gold/portada.py — RF-EXP-009: portada real de canciones, álbumes y
artistas del catálogo licenciado base (FACT_TRACKS.source_type = 'real').

Método principal: oEmbed público de Spotify (`open.spotify.com/oembed`)
resuelto por `track_id` real — el dataset base (`dataset/spotify.csv`, el
"Spotify Tracks Dataset" de Kaggle) trae el ID real de Spotify de cada track
en esa columna, preservado intacto por todo el pipeline hasta
`FACT_TRACKS.track_id`. Un lookup directo por ID no tiene ambigüedad (a
diferencia de buscar por nombre), así que lo resuelto es siempre lo
correcto. Se resuelve en dos niveles:
  - Por canción (`resolver_portadas_tracks_spotify`, `FACT_TRACKS.imagen_url`)
    — el nivel que de verdad importa para el catálogo: muchos `album_name`
    del dataset son en realidad compilaciones tipo playlist con decenas de
    artistas distintos (ej. "Daily Pop Mix", confirmado contra los datos
    reales), así que la portada del álbum no representa a la mayoría de esas
    canciones. Resolver por el `track_id` de cada canción evita eso.
  - Por álbum (`resolver_portadas_spotify`, `DIM_ALBUMS.imagen_url`) — para
    vistas de detalle de álbum, donde sí corresponde mostrar la portada de la
    entidad "álbum" en sí (aunque sea una compilación).
Se probó primero la Web API (Client Credentials Flow) para esto, pero
Spotify anunció en feb-2026 que Development Mode ahora exige que el dueño de
la app tenga Premium, y además está retirando Client Credentials para
endpoints de metadata (developer.spotify.com/blog/2026-02-06-update-on-
developer-access-and-platform-security) — no es una opción gratuita real. El
oEmbed público (sin API key, sin Developer Dashboard, el mismo endpoint que
usa cualquier sitio para incrustar un reproductor) no pasa por ese sistema y
sigue funcionando sin restricción; su única limitación es que no expone el
ID de artista, así que no sirve para fotos de artista (ver método de
respaldo).

Método de respaldo (siempre corre, cubre álbumes que el oEmbed no resolvió y
TODAS las fotos de artista): dos directorios musicales públicos sin
necesidad de credencial, iTunes Search API y Deezer Search API — evaluados y
elegidos sobre MusicBrainz/Cover Art Archive porque cada uno resuelve en una
sola llamada por término, sin necesitar un MBID intermedio. El orden de
intento es distinto por entidad (ver `resolver_portadas`): iTunes primero
para artistas (Deezer como respaldo), Deezer primero para álbumes (iTunes
como respaldo) — la tasa de éxito real de cada API no es simétrica entre
ambos tipos de búsqueda, confirmado en producción
(docs/decisiones-refactorizacion.md §25). Esta vía sí depende de buscar por
nombre, con el riesgo de ambigüedad que eso implica (nombres duplicados,
caracteres especiales). Un fallo de red no interrumpe el batch — se registra
y se continúa (tasks.md 3.4); sin resultado en ninguna de las dos, el campo
queda NULL y el fallback visual lo resuelve el frontend, no el ETL
(design.md de `experiencia`, "Portada real")."""

import asyncio
import json
import time
from pathlib import Path

import httpx

from utils.clickhouse_client import get_client
from utils.config import get_config

ITUNES_SEARCH_URL   = "https://itunes.apple.com/search"
DEEZER_SEARCH_URL   = "https://api.deezer.com/search"
SPOTIFY_OEMBED_URL  = "https://open.spotify.com/oembed"

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


# ── Spotify oEmbed público (sin API key, sin cuenta de developer) ───────────
def _spotify_oembed_cover(track_id: str) -> str | None:
    try:
        resp = httpx.get(
            SPOTIFY_OEMBED_URL,
            params={"url": f"https://open.spotify.com/track/{track_id}"},
            timeout=5,
        )
        resp.raise_for_status()
        return resp.json().get("thumbnail_url") or None
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError, KeyError) as exc:
        print(f"[portada] fallo (spotify oembed) resolviendo track '{track_id}': {exc}")
        return None


def resolver_portadas_tracks_spotify(client) -> dict:
    """Portada exacta por canción — necesaria porque muchos `album_name` del
    dataset base son en realidad compilaciones tipo playlist con decenas de
    artistas distintos (ej. "Daily Pop Mix", "Alternative Christmas 2022";
    confirmado contra los datos reales, ver init_clickhouse.py). Compartir la
    portada del álbum ahí muestra la misma carátula genérica en canciones que
    no tienen nada que ver entre sí — resolver por el `track_id` propio de
    cada canción evita eso. El dataset repite el mismo `track_id` bajo varios
    géneros (misma canción, distinta fila) — el `UPDATE ... WHERE track_id =`
    de abajo cubre todas esas filas de una sola vez."""
    tracks_pendientes = client.query(f"""
        SELECT DISTINCT track_id
        FROM FACT_TRACKS
        WHERE imagen_url IS NULL AND source_type = 'real'
        LIMIT {_BATCH_LIMIT}
    """).result_rows

    resueltos = 0
    for (track_id,) in tracks_pendientes:
        url = _spotify_oembed_cover(track_id)
        if url:
            client.command(
                "ALTER TABLE FACT_TRACKS UPDATE imagen_url = {url:String} WHERE track_id = {tid:String}",
                parameters={"url": url, "tid": track_id},
            )
            resueltos += 1

    print(f"[portada] (spotify oembed, por canción) resueltas: {resueltos}/{len(tracks_pendientes)}")

    return {"tracks_resueltos": resueltos}


# ── Backfill completo, desatendido (ej. "dejar corriendo toda la noche") ────
# `resolver_portadas_tracks_spotify` de arriba está pensada para una corrida
# del DAG (un batch chico, `_BATCH_LIMIT`). Para vaciar todo el backlog
# (~89.641 canciones distintas, medido en producción) secuencial tomaría
# ~23h — no cabe en una noche.
#
# Concurrencia=10 se probó primero y disparó 429 (Too Many Requests) del
# oEmbed — y no fue un límite "por ráfaga": una vez activado, siguió
# devolviendo 429 incluso volviendo a concurrencia=1 (confirmado en pruebas
# reales), es decir, un bloqueo temporal por IP, no un techo de conexiones
# simultáneas. Concurrencia=1 (secuencial) es lo único confirmado estable
# (100/100 en la prueba original antes del bloqueo). El retry con backoff de
# `_oembed_cover_async` existe para que, si el bloqueo se repite (por esta
# corrida u otra causa ajena), el proceso espere y se recupere solo — no hace
# falta que alguien lo reintente a mano durante la noche.
_BACKFILL_CONCURRENCY = 1
_BACKFILL_LOTE = 60
_OEMBED_MAX_REINTENTOS = 6
_OEMBED_BACKOFF_BASE_S = 10.0
_OEMBED_BACKOFF_TOPE_S = 120.0
# Pausa fija entre requests exitosos, además del backoff reactivo de arriba —
# en pruebas reales, incluso secuencial a ~1 req/seg sin pausa volvió a
# disparar 429 pasado un rato (no es solo un límite por ráfaga de
# concurrencia). Espaciar cada request evita entrar en la cadena larga de
# reintentos (hasta 6.5 min por canción) en primer lugar, en vez de solo
# reaccionar después de que ya se disparó.
_OEMBED_PAUSA_ENTRE_REQUESTS_S = 1.5


async def _oembed_cover_async(http: httpx.AsyncClient, track_id: str, sem: asyncio.Semaphore) -> tuple[str, str | None]:
    async with sem:
        espera = _OEMBED_BACKOFF_BASE_S
        for intento in range(_OEMBED_MAX_REINTENTOS):
            try:
                resp = await http.get(
                    SPOTIFY_OEMBED_URL,
                    params={"url": f"https://open.spotify.com/track/{track_id}"},
                    timeout=5,
                )
                if resp.status_code == 429:
                    espera_real = float(resp.headers.get("Retry-After", espera))
                    print(f"[portada] oembed: 429 en '{track_id}' — esperando {espera_real:.0f}s "
                          f"(intento {intento + 1}/{_OEMBED_MAX_REINTENTOS})")
                    await asyncio.sleep(espera_real)
                    espera = min(espera * 2, _OEMBED_BACKOFF_TOPE_S)
                    continue
                resp.raise_for_status()
                await asyncio.sleep(_OEMBED_PAUSA_ENTRE_REQUESTS_S)
                return track_id, resp.json().get("thumbnail_url") or None
            except (httpx.RequestError, httpx.HTTPStatusError, ValueError, KeyError) as exc:
                print(f"[portada] fallo (spotify oembed) resolviendo track '{track_id}': {exc}")
                return track_id, None
        print(f"[portada] oembed: '{track_id}' agotó reintentos (429 persistente) — "
              f"queda pendiente para la próxima corrida.")
        return track_id, None


async def _resolver_lote_async(track_ids: list[str], concurrency: int) -> dict[str, str]:
    sem = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient() as http:
        resultados = await asyncio.gather(*[_oembed_cover_async(http, tid, sem) for tid in track_ids])
    return {tid: url for tid, url in resultados if url}


def resolver_portadas_tracks_spotify_todas(
    client,
    lote: int = _BACKFILL_LOTE,
    concurrency: int = _BACKFILL_CONCURRENCY,
    max_horas: float = 9.0,
) -> dict:
    """Backfill completo del catálogo (no un solo batch de `_BATCH_LIMIT`) —
    pensado para correr desatendido durante horas (ej. toda la noche),
    resolviendo TODAS las canciones pendientes en lotes concurrentes hasta
    agotarlas o hasta `max_horas` (válvula de seguridad para no seguir
    corriendo indefinidamente si algo se cuelga, ej. hasta bien entrado el
    día siguiente). Cada lote se escribe en ClickHouse antes de pedir el
    siguiente, así que una interrupción a mitad de camino no pierde el
    progreso ya resuelto — la siguiente corrida retoma donde quedó
    (`WHERE imagen_url IS NULL`)."""
    inicio = time.monotonic()
    total_resueltos = 0
    total_intentados = 0

    while True:
        transcurrido_h = (time.monotonic() - inicio) / 3600
        if transcurrido_h > max_horas:
            print(f"[portada] backfill: límite de {max_horas}h alcanzado, deteniendo "
                  f"({total_resueltos}/{total_intentados} resueltas).")
            break

        pendientes = client.query(f"""
            SELECT DISTINCT track_id
            FROM FACT_TRACKS
            WHERE imagen_url IS NULL AND source_type = 'real'
            LIMIT {lote}
        """).result_rows
        if not pendientes:
            print(f"[portada] backfill: no quedan canciones pendientes — "
                  f"{total_resueltos}/{total_intentados} resueltas en {transcurrido_h:.1f}h.")
            break

        track_ids = [row[0] for row in pendientes]
        resultados = asyncio.run(_resolver_lote_async(track_ids, concurrency))

        for track_id, url in resultados.items():
            client.command(
                "ALTER TABLE FACT_TRACKS UPDATE imagen_url = {url:String} WHERE track_id = {tid:String}",
                parameters={"url": url, "tid": track_id},
            )

        total_intentados += len(track_ids)
        total_resueltos += len(resultados)
        print(f"[portada] backfill: {total_resueltos}/{total_intentados} resueltas hasta ahora "
              f"({transcurrido_h * 60:.0f} min transcurridos)")

    return {"tracks_resueltos": total_resueltos, "tracks_intentados": total_intentados}


# ── Recarga puntual de 1h: canciones + álbumes/playlists (con reemplazo) ────
# A diferencia del ciclo normal del DAG (`resolver_portadas_spotify`, que solo
# llena `imagen_url IS NULL`), esta corrida está autorizada a REEMPLAZAR
# portadas de álbum/playlist ya resueltas por la vía de respaldo
# (iTunes/Deezer) por la versión de Spotify — pedido explícito del usuario:
# "si hay imágenes que se obtuvieron por otra vía la podemos reemplazar".
# Fotos de artista quedan fuera de este reemplazo porque no hay vía Spotify
# posible para ellas: el oEmbed de un track no expone el ID de artista, y no
# se guarda ningún ID de artista de Spotify en el dataset base — su única
# fuente real sigue siendo iTunes/Deezer, así que aquí se las sigue tratando
# igual que en `resolver_portadas` (solo llenar `NULL`, nada que reemplazar).
_BACKFILL_LOTE_ALBUMS = 30


def resolver_portadas_reload_1h(client, max_horas: float = 1.0) -> dict:
    """Corrida acotada en tiempo (1h por defecto) para una recarga puntual,
    pensada para lanzarse en background y no para el ciclo normal del DAG.
    Cada ciclo intercala un lote de canciones y un lote de álbumes/playlists
    contra el mismo endpoint de Spotify oEmbed (comparten pacing/backoff para
    no disparar el bloqueo por IP ya confirmado en producción), más un lote
    de artistas vía iTunes/Deezer (API distinta, no compite por ese límite).
    Cada lote se escribe en ClickHouse antes de seguir, así que cortar la
    corrida a mitad de camino no pierde lo ya resuelto."""
    inicio = time.monotonic()

    # Lista completa de álbumes/playlists elegibles, calculada una sola vez:
    # a diferencia de las canciones (que se "vacían" al dejar de ser NULL),
    # acá no hay un WHERE que reduzca el pendiente porque estamos autorizados
    # a reemplazar lo ya resuelto, así que se recorre por índice en vez de
    # re-consultar "pendientes" en cada vuelta (evitaría avanzar).
    albumes_todos = client.query("""
        SELECT al.album_id, any(ft.track_id) AS track_id
        FROM FACT_TRACKS ft
        JOIN DIM_ALBUMS al ON ft.album_id = al.album_id
        WHERE ft.source_type = 'real'
        GROUP BY al.album_id
    """).result_rows
    album_idx = 0

    total = {
        "tracks_resueltos": 0, "tracks_intentados": 0,
        "albumes_resueltos": 0, "albumes_intentados": 0,
        "artistas_resueltos": 0, "artistas_intentados": 0,
    }

    while True:
        transcurrido_h = (time.monotonic() - inicio) / 3600
        if transcurrido_h > max_horas:
            print(f"[portada] reload_1h: límite de {max_horas}h alcanzado, deteniendo.")
            break

        # Un fallo inesperado en cualquiera de los tres pasos (red, mutación
        # de ClickHouse, lo que sea) no debe tirar abajo el resto del
        # presupuesto de horas — se registra y la siguiente vuelta reintenta
        # solo por su cuenta (mismo espíritu que el backoff de
        # `_oembed_cover_async`: nadie tiene que reiniciar esto a mano).
        try:
            # 1) canciones — igual que el backfill normal, solo llena NULL.
            tracks_pendientes = client.query(f"""
                SELECT DISTINCT track_id FROM FACT_TRACKS
                WHERE imagen_url IS NULL AND source_type = 'real'
                LIMIT {_BACKFILL_LOTE}
            """).result_rows
            track_ids = [row[0] for row in tracks_pendientes]
            if track_ids:
                resultados = asyncio.run(_resolver_lote_async(track_ids, _BACKFILL_CONCURRENCY))
                for track_id, url in resultados.items():
                    client.command(
                        "ALTER TABLE FACT_TRACKS UPDATE imagen_url = {url:String} WHERE track_id = {tid:String}",
                        parameters={"url": url, "tid": track_id},
                    )
                total["tracks_resueltos"]  += len(resultados)
                total["tracks_intentados"] += len(track_ids)

            # 2) álbumes/playlists — con reemplazo autorizado de lo ya resuelto.
            lote_albums = albumes_todos[album_idx: album_idx + _BACKFILL_LOTE_ALBUMS]
            album_idx += _BACKFILL_LOTE_ALBUMS
            vuelta_completa_albums = album_idx >= len(albumes_todos)
            if vuelta_completa_albums:
                album_idx = 0
            if lote_albums:
                track_por_album = {album_id: tid for album_id, tid in lote_albums}
                resultados_album = asyncio.run(
                    _resolver_lote_async(list(track_por_album.values()), _BACKFILL_CONCURRENCY)
                )
                resueltos_album = 0
                for album_id, track_id in lote_albums:
                    url = resultados_album.get(track_id)
                    if url:
                        client.command(
                            "ALTER TABLE DIM_ALBUMS UPDATE imagen_url = {url:String} WHERE album_id = {id:UInt32}",
                            parameters={"url": url, "id": album_id},
                        )
                        resueltos_album += 1
                total["albumes_resueltos"]  += resueltos_album
                total["albumes_intentados"] += len(lote_albums)

            # 3) artistas — única vía posible es iTunes/Deezer, solo llena NULL.
            artistas_pendientes = client.query(f"""
                SELECT DISTINCT a.artist_id, a.name
                FROM DIM_ARTISTS a
                JOIN FACT_TRACKS ft ON ft.artist_id = a.artist_id
                WHERE a.imagen_url IS NULL AND ft.source_type = 'real'
                LIMIT {_BATCH_LIMIT}
            """).result_rows
            resueltos_artistas = 0
            for artist_id, name in artistas_pendientes:
                url = _buscar_portada(name, "album") or _buscar_portada_deezer(name, "artist")
                if url:
                    client.command(
                        "ALTER TABLE DIM_ARTISTS UPDATE imagen_url = {url:String} WHERE artist_id = {id:UInt32}",
                        parameters={"url": url, "id": artist_id},
                    )
                    resueltos_artistas += 1
            total["artistas_resueltos"]  += resueltos_artistas
            total["artistas_intentados"] += len(artistas_pendientes)

            print(f"[portada] reload_1h: {transcurrido_h * 60:.1f}min — "
                  f"tracks {total['tracks_resueltos']}/{total['tracks_intentados']}, "
                  f"albumes {total['albumes_resueltos']}/{total['albumes_intentados']}, "
                  f"artistas {total['artistas_resueltos']}/{total['artistas_intentados']}")

            guardar_cache_portadas(client)

            if not track_ids and not artistas_pendientes and vuelta_completa_albums and not lote_albums:
                print("[portada] reload_1h: no queda nada pendiente, terminando antes de la hora.")
                break
        except Exception as exc:
            print(f"[portada] reload_1h: fallo inesperado en este ciclo, se continúa en la "
                  f"siguiente vuelta: {exc!r}")

    return total


def resolver_portadas_spotify(client) -> dict:
    """Portada de álbum — usada para vistas de detalle de álbum (donde tiene
    sentido mostrar la portada de la entidad "álbum" en sí, no la de una
    canción puntual). Resuelve por `track_id` real (no por nombre) vía
    oEmbed, así que el álbum encontrado es siempre el correcto — sin la
    ambigüedad de `resolver_portadas` (búsqueda por texto). No cubre
    artistas: el oEmbed de un track no expone el ID de artista de Spotify,
    así que esas fotos siguen resolviéndose en `resolver_portadas` (Deezer)."""
    albumes_pendientes = client.query(f"""
        SELECT al.album_id, any(ft.track_id) AS track_id
        FROM FACT_TRACKS ft
        JOIN DIM_ALBUMS al ON ft.album_id = al.album_id
        WHERE al.imagen_url IS NULL AND ft.source_type = 'real'
        GROUP BY al.album_id
        LIMIT {_BATCH_LIMIT}
    """).result_rows

    resueltos_albumes = 0
    for album_id, track_id in albumes_pendientes:
        url = _spotify_oembed_cover(track_id)
        if url:
            client.command(
                "ALTER TABLE DIM_ALBUMS UPDATE imagen_url = {url:String} WHERE album_id = {id:UInt32}",
                parameters={"url": url, "id": album_id},
            )
            resueltos_albumes += 1

    print(f"[portada] (spotify oembed) álbumes resueltos: {resueltos_albumes}/{len(albumes_pendientes)}")

    return {"albumes_resueltos": resueltos_albumes}


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
    resolver_portadas_tracks_spotify(client)  # portada exacta por canción, vía oEmbed
    resolver_portadas_spotify(client)         # portada de álbum (vistas de detalle de álbum)
    resolver_portadas(client)                 # respaldo iTunes/Deezer: fotos de artista + lo que quede
