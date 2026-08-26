import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from core.database import execute, query_one, query_rows
from core.deps import get_current_user_optional
from core.featuring import enriquecer_featuring
from paquetes.biblioteca import pb_playlists
from paquetes.catalogo.queries import (
    ALBUM_DETAIL, ALBUMS_SEARCH,
    ARTIST_DETAIL, ARTISTS_SEARCH, ARTISTS_TOP,
    CATALOG_STATS,
    GENRE_DETAIL, GENRES_LIST,
    SEARCH_ALBUMES_GRUPO, SEARCH_ARTISTAS_GRUPO,
    TRACK_DETAIL, TRACK_DETAIL_BY_FACT_ID,
    TRACK_DISPONIBILIDAD_POR_FACT,
    TRACKS_OCULTOS,
    TRACKS_BY_ALBUM, TRACKS_BY_ARTIST, TRACKS_BY_GENRE, TRACKS_TOP,
    RELEVANCIA_TEXTO_EXPR,
    search_tracks_grupo_sql,
    tracks_search_count_sql, tracks_search_sql,
)
from paquetes.seguridad import audit
from paquetes.seguridad.deps import require_rol_admin
from paquetes.suscripciones.deps import require_active_subscription

router = APIRouter(prefix="/app/v1", tags=["App"])

# Takedown de catálogo (change p1-ciclos-vida): ocultar/restaurar un track es
# gestión de contenido → rol `admin_contenido`. `superadmin` siempre pasa.
require_contenido_admin = require_rol_admin("admin_contenido")

# Características de audio "estilo Spotify Premium" (RF paywall ya existía
# solo en la UI de TrackDetailPage — cualquiera podía leerlas igual desde la
# pestaña Network sin backend real detrás; auditoría 2026-07-10). No incluye
# loudness/tempo/duration/popularity, que siguen siendo públicos.
AUDIO_FEATURE_FIELDS = [
    "danceability", "energy", "valence",
    "acousticness", "speechiness", "instrumentalness", "liveness",
]


logger = logging.getLogger(__name__)


# ── Búsqueda unificada ────────────────────────────────────────────────────────

@router.get("/search")
async def search_all(
    q: str = Query("", description="Término de búsqueda"),
    limit: int = Query(5, ge=1, le=20, description="Máximo de resultados por grupo"),
    # Filtros de búsqueda (S17, paridad con apps de música) — solo afectan al
    # grupo "canciones": género/año/duración no tienen el mismo significado
    # para artistas, álbumes o playlists (un álbum sí tiene release_year,
    # pero mezclar criterios de filtro distintos por grupo en una sola
    # llamada agregaría complejidad sin un caso de uso real todavía).
    genero: str = Query("", description="Filtra canciones por género (nombre exacto)"),
    anio_desde: int | None = Query(None, ge=1900, le=2100, description="release_year del álbum, mínimo"),
    anio_hasta: int | None = Query(None, ge=1900, le=2100, description="release_year del álbum, máximo"),
    duracion_min: int | None = Query(None, ge=0, description="Milisegundos"),
    duracion_max: int | None = Query(None, ge=0, description="Milisegundos"),
    user: dict | None = Depends(get_current_user_optional),
):
    """Búsqueda unificada multi-entidad (change p2-descubrimiento-comunidad).

    Una sola llamada devuelve los cuatro grupos que el usuario espera de un
    buscador de catálogo, en vez de obligarle a saber de antemano si busca un
    track, un artista o un álbum. Los endpoints por entidad siguen existiendo.

    Sesión opcional: las playlists incluyen las públicas de todos y, si hay
    usuario autenticado, además las suyas privadas.
    """
    termino = q.strip()
    if not termino:
        return {"tracks": [], "artistas": [], "albumes": [], "playlists": []}

    pattern = f"%{termino}%"
    params = {"pattern": pattern, "limit": limit}
    usuario_id = (user or {}).get("record", {}).get("id")

    condiciones_extra: list[str] = []
    params_tracks = dict(params)
    if genero.strip():
        params_tracks["genero"] = genero.strip()
        condiciones_extra.append("g2.name = {genero:String}")
    if anio_desde is not None:
        params_tracks["anio_desde"] = anio_desde
        condiciones_extra.append("al2.release_year >= {anio_desde:UInt16}")
    if anio_hasta is not None:
        params_tracks["anio_hasta"] = anio_hasta
        condiciones_extra.append("al2.release_year <= {anio_hasta:UInt16}")
    if duracion_min is not None:
        params_tracks["duracion_min"] = duracion_min
        condiciones_extra.append("ft.duration_ms >= {duracion_min:UInt32}")
    if duracion_max is not None:
        params_tracks["duracion_max"] = duracion_max
        condiciones_extra.append("ft.duration_ms <= {duracion_max:UInt32}")

    # Las playlists viven en PocketBase, no en ClickHouse (design.md, Decisión
    # 9). Un fallo de PocketBase degrada ese grupo a vacío en vez de tumbar toda
    # la búsqueda: los tres grupos de catálogo ya son un resultado útil.
    async def _playlists():
        try:
            crudas = await pb_playlists.buscar(termino, usuario_id, limit)
            return [
                {
                    "playlist_id": p.get("id"),
                    "name": p.get("name"),
                    "es_publica": bool(p.get("es_publica")),
                    "es_propia": bool(usuario_id) and p.get("user") == usuario_id,
                }
                for p in crudas
            ]
        except Exception as exc:
            logger.warning("Búsqueda de playlists no disponible: %s", exc)
            return []

    # PERF (revisión de rendimiento): las 3 queries a ClickHouse + la llamada
    # a PocketBase son independientes entre sí, pero se ejecutaban en
    # secuencia (~0.4s cada una, ~1.3s en total). `query_rows` es síncrono
    # (cliente ClickHouse bloqueante) así que se manda a un hilo por query
    # (`asyncio.to_thread`) para no bloquear el loop de eventos, y las 4 se
    # esperan en paralelo con `gather` -- el tiempo total pasa a ser el de la
    # más lenta, no la suma de las 4.
    #
    # S13-P6: la búsqueda unificada no marcaba featuring/sintético — era la
    # única vista de tracks que se saltaba `enriquecer_featuring` (brecha
    # verificada en AUDITORIA_S13.md, no una precaución preventiva).
    tracks_rows, artistas, albumes, playlists = await asyncio.gather(
        asyncio.to_thread(query_rows, search_tracks_grupo_sql(condiciones_extra), params_tracks),
        asyncio.to_thread(query_rows, SEARCH_ARTISTAS_GRUPO, params),
        asyncio.to_thread(query_rows, SEARCH_ALBUMES_GRUPO, params),
        _playlists(),
    )
    tracks = enriquecer_featuring(tracks_rows)

    return {
        "tracks": tracks,
        "artistas": artistas,
        "albumes": albumes,
        "playlists": playlists,
    }


# Contadores reales del catálogo (S16 Fase 3, hero de CatalogPage) — público,
# sin auth: son cifras de marketing del propio catálogo, no datos operativos.
@router.get("/catalog/stats")
def catalog_stats():
    return query_one(CATALOG_STATS)


# ── Tracks ────────────────────────────────────────────────────────────────────

@router.get("/tracks/top")
def tracks_top(limit: int = Query(20, ge=1, le=200)):
    rows = enriquecer_featuring(query_rows(TRACKS_TOP, {"limit": limit}))
    return {"data": rows, "total": len(rows)}


@router.get("/tracks/search")
def tracks_search(
    q:      str = Query(""),
    genre:  str = Query(""),
    limit:  int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    # Filtros avanzados (S10 Día 3) — antes la búsqueda solo soportaba texto
    # y género; danceability/energy/valence ya viajaban en la respuesta pero
    # nada permitía filtrar por ellos.
    popularity_min: int | None = Query(None, ge=0, le=100),
    tempo_min:      float | None = Query(None, ge=0),
    tempo_max:      float | None = Query(None, ge=0),
    energy_min:     float | None = Query(None, ge=0, le=1),
):
    conditions: list[str] = []
    params: dict = {"limit": limit, "offset": offset}

    # Relevancia textual (S16 — auditoría de revisores): antes el único
    # criterio de orden era `popularity DESC`, así que una coincidencia
    # exacta poco popular podía aparecer después de una coincidencia parcial
    # muy popular. `order_clause` complementa la popularidad, no la
    # reemplaza — sigue siendo el desempate dentro de cada nivel de
    # relevancia. Sin `q`, no hay texto contra el que medir relevancia:
    # el orden sigue siendo solo por popularidad, como antes.
    order_clause = "max(ft.popularity) DESC"
    if q.strip():
        texto = q.strip()
        params["q"] = f"%{texto}%"
        params["q_exacto"] = texto
        params["q_prefijo"] = f"{texto}%"
        conditions.append(
            "(lower(ft.track_name) LIKE lower({q:String})"
            " OR lower(a.name) LIKE lower({q:String}))"
        )
        order_clause = f"max({RELEVANCIA_TEXTO_EXPR}) DESC, max(ft.popularity) DESC"

    if genre.strip():
        params["genre"] = genre.strip()
        conditions.append("g.name = {genre:String}")

    if popularity_min is not None:
        params["popularity_min"] = popularity_min
        conditions.append("ft.popularity >= {popularity_min:UInt8}")

    if tempo_min is not None:
        params["tempo_min"] = tempo_min
        conditions.append("ft.tempo >= {tempo_min:Float32}")

    if tempo_max is not None:
        params["tempo_max"] = tempo_max
        conditions.append("ft.tempo <= {tempo_max:Float32}")

    if energy_min is not None:
        params["energy_min"] = energy_min
        conditions.append("ft.energy >= {energy_min:Float32}")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = enriquecer_featuring(query_rows(tracks_search_sql(where, order_clause), params))
    total = query_one(tracks_search_count_sql(where), params)["total"]
    return {"data": rows, "total": total, "limit": limit, "offset": offset}


@router.get("/tracks/by-artist/{artist_id}")
def tracks_by_artist(artist_id: int, limit: int = Query(20, ge=1, le=100)):
    rows = enriquecer_featuring(query_rows(TRACKS_BY_ARTIST, {"artist_id": artist_id, "limit": limit}))
    return {"data": rows}


@router.get("/tracks/by-album/{album_id}")
def tracks_by_album(album_id: int, limit: int = Query(50, ge=1, le=200)):
    rows = enriquecer_featuring(query_rows(TRACKS_BY_ALBUM, {"album_id": album_id, "limit": limit}))
    return {"data": rows}


@router.get("/tracks/by-genre/{genre_id}")
def tracks_by_genre(genre_id: int, limit: int = Query(50, ge=1, le=200)):
    rows = enriquecer_featuring(query_rows(TRACKS_BY_GENRE, {"genre_id": genre_id, "limit": limit}))
    return {"data": rows}


@router.get("/tracks/fact/{fact_id}")
def track_detail_by_fact(fact_id: int):
    row = query_one(TRACK_DETAIL_BY_FACT_ID, {"fact_id": fact_id})
    if not row:
        raise HTTPException(status_code=404, detail="Track not found")
    # Características de audio: solo por GET /tracks/fact/{fact_id}/audio-features
    # (premium) — antes viajaban aquí igual para cualquiera, el paywall
    # existía solo del lado del cliente (auditoría 2026-07-10).
    for field in AUDIO_FEATURE_FIELDS:
        row.pop(field, None)
    # S13-P6: el detalle de track era la única vista de un track individual
    # que no marcaba featuring — TrackCard/TrackGridCard/LibraryTrackRow ya
    # lo hacían, TrackDetailPage no tenía el dato porque este endpoint nunca
    # llamaba a `enriquecer_featuring` (brecha verificada, AUDITORIA_S13.md).
    return enriquecer_featuring([row])[0]


@router.get("/tracks/fact/{fact_id}/audio-features")
def track_audio_features(fact_id: int, user: dict = Depends(require_active_subscription("premium"))):
    row = query_one(TRACK_DETAIL_BY_FACT_ID, {"fact_id": fact_id})
    if not row:
        raise HTTPException(status_code=404, detail="Track not found")
    return {field: row.get(field) for field in AUDIO_FEATURE_FIELDS}


@router.get("/tracks/{track_id}")
def track_detail(track_id: str):
    row = query_one(TRACK_DETAIL, {"track_id": track_id})
    if not row:
        raise HTTPException(status_code=404, detail="Track not found")
    return enriquecer_featuring([row])[0]


# ── Takedown administrativo de tracks (change p1-ciclos-vida) ─────────────────

def _takedown(fact_id: int, disponible: int, admin: dict, accion: str) -> dict:
    fila = query_one(TRACK_DISPONIBILIDAD_POR_FACT, {"fact_id": fact_id})
    if not fila:
        raise HTTPException(status_code=404, detail="Track no encontrado")
    # Se aplica a todas las filas del track_id (el track existe como N filas,
    # una por género) para que desaparezca/reaparezca de verdad del catálogo.
    execute(
        "ALTER TABLE FACT_TRACKS UPDATE disponible = {d:UInt8} WHERE track_id = {tid:String}",
        {"d": disponible, "tid": fila["track_id"]},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion=accion, tabla_afectada="FACT_TRACKS",
        antes={"fact_id": fact_id, "track_id": fila["track_id"], "disponible": int(fila["disponible"])},
        despues={"track_id": fila["track_id"], "disponible": disponible},
    )
    return {"status": "ok", "fact_id": fact_id, "track_id": fila["track_id"], "disponible": disponible}


@router.get("/admin/tracks/ocultos")
def listar_tracks_ocultos(limit: int = Query(100, ge=1, le=500), admin: dict = Depends(require_contenido_admin)):
    """Tracks con `disponible = 0` — no aparecen en el catálogo público, así
    que el panel de takedown los lista aquí para poder restaurarlos."""
    return {"data": query_rows(TRACKS_OCULTOS, {"limit": limit})}


@router.post("/admin/tracks/{fact_id}/ocultar")
def ocultar_track(fact_id: int = Path(..., ge=1), admin: dict = Depends(require_contenido_admin)):
    return _takedown(fact_id, 0, admin, "ocultar_track")


@router.post("/admin/tracks/{fact_id}/restaurar")
def restaurar_track(fact_id: int = Path(..., ge=1), admin: dict = Depends(require_contenido_admin)):
    return _takedown(fact_id, 1, admin, "restaurar_track")


# ── Artists ───────────────────────────────────────────────────────────────────

@router.get("/artists/top")
def artists_top(limit: int = Query(20, ge=1, le=100)):
    rows = query_rows(ARTISTS_TOP, {"limit": limit})
    return {"data": rows}


@router.get("/artists/search")
def artists_search(q: str = Query(""), limit: int = Query(20, ge=1, le=100)):
    pattern = f"%{q.strip()}%" if q.strip() else "%"
    rows = query_rows(ARTISTS_SEARCH, {"pattern": pattern, "limit": limit})
    return {"data": rows, "total": len(rows)}


@router.get("/artists/{artist_id}")
def artist_detail(artist_id: int):
    row = query_one(ARTIST_DETAIL, {"artist_id": artist_id})
    if not row:
        raise HTTPException(status_code=404, detail="Artist not found")
    return row


# ── Albums ────────────────────────────────────────────────────────────────────

@router.get("/albums/search")
def albums_search(q: str = Query(""), limit: int = Query(20, ge=1, le=100)):
    pattern = f"%{q.strip()}%" if q.strip() else "%"
    rows = query_rows(ALBUMS_SEARCH, {"pattern": pattern, "limit": limit})
    return {"data": rows}


@router.get("/albums/{album_id}")
def album_detail(album_id: int):
    row = query_one(ALBUM_DETAIL, {"album_id": album_id})
    if not row:
        raise HTTPException(status_code=404, detail="Album not found")
    return row


# ── Genres ────────────────────────────────────────────────────────────────────

@router.get("/genres")
def genres_list():
    rows = query_rows(GENRES_LIST)
    return {"data": rows}


@router.get("/genres/{genre_id}")
def genre_detail(genre_id: int):
    row = query_one(GENRE_DETAIL, {"genre_id": genre_id})
    if not row:
        raise HTTPException(status_code=404, detail="Genre not found")
    return row
