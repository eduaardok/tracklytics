from fastapi import APIRouter, HTTPException, Query

from main import query_one, query_rows

router = APIRouter(prefix="/app/v1", tags=["App"])


# ── Tracks ────────────────────────────────────────────────────────────────────

@router.get("/tracks/top")
def tracks_top(limit: int = Query(20, ge=1, le=50)):
    rows = query_rows(
        """
        SELECT
            ft.track_id,
            ft.track_name,
            a.name  AS artist_name,
            g.name  AS genre_name,
            ft.popularity,
            ft.duration_ms,
            ft.danceability,
            ft.energy,
            ft.valence
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
        JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
        ORDER BY ft.popularity DESC
        LIMIT {limit:UInt32}
        """,
        {"limit": limit},
    )
    return {"data": rows, "total": len(rows)}


@router.get("/tracks/search")
def tracks_search(
    q:     str = Query(""),
    genre: str = Query(""),
    limit: int = Query(50, ge=1, le=100),
):
    conditions: list[str] = []
    params: dict = {"limit": limit}

    if q.strip():
        params["q"] = f"%{q.strip()}%"
        conditions.append(
            "(lower(ft.track_name) LIKE lower({q:String})"
            " OR lower(a.name) LIKE lower({q:String}))"
        )

    if genre.strip():
        params["genre"] = genre.strip()
        conditions.append("g.name = {genre:String}")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    rows = query_rows(
        f"""
        SELECT
            ft.track_id,
            ft.track_name,
            a.name  AS artist_name,
            g.name  AS genre_name,
            ft.popularity,
            ft.duration_ms,
            ft.danceability,
            ft.energy,
            ft.valence
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
        JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
        {where}
        ORDER BY ft.popularity DESC
        LIMIT {{limit:UInt32}}
        """,
        params,
    )
    return {"data": rows, "total": len(rows)}


@router.get("/tracks/by-artist/{artist_id}")
def tracks_by_artist(artist_id: int, limit: int = Query(20, ge=1, le=100)):
    rows = query_rows(
        """
        SELECT
            ft.track_id, ft.track_name, ft.popularity, ft.duration_ms,
            ft.danceability, ft.energy, ft.valence,
            a.name AS artist_name,
            g.name AS genre_name
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
        JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
        WHERE ft.artist_id = {artist_id:Int32}
        ORDER BY ft.popularity DESC
        LIMIT {limit:UInt32}
        """,
        {"artist_id": artist_id, "limit": limit},
    )
    return {"data": rows}


@router.get("/tracks/by-album/{album_id}")
def tracks_by_album(album_id: int, limit: int = Query(50, ge=1, le=200)):
    rows = query_rows(
        """
        SELECT
            ft.track_id, ft.track_name, ft.popularity, ft.duration_ms,
            ft.danceability, ft.energy, ft.valence,
            a.name AS artist_name,
            g.name AS genre_name
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
        JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
        WHERE ft.album_id = {album_id:Int32}
        ORDER BY ft.track_name
        LIMIT {limit:UInt32}
        """,
        {"album_id": album_id, "limit": limit},
    )
    return {"data": rows}


@router.get("/tracks/by-genre/{genre_id}")
def tracks_by_genre(genre_id: int, limit: int = Query(50, ge=1, le=200)):
    rows = query_rows(
        """
        SELECT
            ft.track_id, ft.track_name, ft.popularity, ft.duration_ms,
            ft.danceability, ft.energy, ft.valence,
            a.name AS artist_name
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
        WHERE ft.genre_id = {genre_id:Int32}
        ORDER BY ft.popularity DESC
        LIMIT {limit:UInt32}
        """,
        {"genre_id": genre_id, "limit": limit},
    )
    return {"data": rows}


@router.get("/tracks/{track_id}")
def track_detail(track_id: str):
    row = query_one(
        """
        SELECT
            ft.track_id, ft.track_name, ft.popularity, ft.duration_ms,
            ft.danceability, ft.energy, ft.loudness, ft.speechiness,
            ft.acousticness, ft.instrumentalness, ft.liveness, ft.valence, ft.tempo,
            a.name  AS artist_name, a.artist_id,
            al.name AS album_name,  al.album_id,
            g.name  AS genre_name
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
        JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
        JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
        WHERE ft.track_id = {track_id:String}
        LIMIT 1
        """,
        {"track_id": track_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Track not found")
    return row


# ── Artists ───────────────────────────────────────────────────────────────────

@router.get("/artists/top")
def artists_top(limit: int = Query(20, ge=1, le=100)):
    rows = query_rows(
        """
        SELECT
            a.artist_id,
            a.name,
            count()                      AS track_count,
            round(avg(ft.popularity), 2) AS avg_popularity
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
        GROUP BY a.artist_id, a.name
        ORDER BY track_count DESC
        LIMIT {limit:UInt32}
        """,
        {"limit": limit},
    )
    return {"data": rows}


@router.get("/artists/search")
def artists_search(q: str = Query(""), limit: int = Query(20, ge=1, le=100)):
    pattern = f"%{q.strip()}%" if q.strip() else "%"
    rows = query_rows(
        """
        SELECT
            a.artist_id,
            a.name,
            count() AS track_count
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
        WHERE lower(a.name) LIKE lower({pattern:String})
        GROUP BY a.artist_id, a.name
        ORDER BY track_count DESC
        LIMIT {limit:UInt32}
        """,
        {"pattern": pattern, "limit": limit},
    )
    return {"data": rows, "total": len(rows)}


@router.get("/artists/{artist_id}")
def artist_detail(artist_id: int):
    row = query_one(
        """
        SELECT
            a.artist_id, a.name, a.country, a.record_label,
            count()                          AS track_count,
            round(avg(ft.popularity),    2)  AS avg_popularity,
            round(avg(ft.energy),        4)  AS avg_energy,
            round(avg(ft.danceability),  4)  AS avg_danceability,
            round(avg(ft.valence),       4)  AS avg_valence
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
        WHERE a.artist_id = {artist_id:Int32}
        GROUP BY a.artist_id, a.name, a.country, a.record_label
        """,
        {"artist_id": artist_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Artist not found")
    return row


# ── Albums ────────────────────────────────────────────────────────────────────

@router.get("/albums/search")
def albums_search(q: str = Query(""), limit: int = Query(20, ge=1, le=100)):
    pattern = f"%{q.strip()}%" if q.strip() else "%"
    rows = query_rows(
        """
        SELECT
            al.album_id, al.name, al.release_year,
            count() AS track_count
        FROM FACT_TRACKS ft
        JOIN DIM_ALBUMS al ON ft.album_id = al.album_id
        WHERE lower(al.name) LIKE lower({pattern:String})
        GROUP BY al.album_id, al.name, al.release_year
        ORDER BY track_count DESC
        LIMIT {limit:UInt32}
        """,
        {"pattern": pattern, "limit": limit},
    )
    return {"data": rows}


@router.get("/albums/{album_id}")
def album_detail(album_id: int):
    row = query_one(
        """
        SELECT
            al.album_id, al.name, al.release_year, al.album_type,
            al.total_tracks_listed, al.language,
            count()                      AS track_count,
            round(avg(ft.popularity), 2) AS avg_popularity
        FROM FACT_TRACKS ft
        JOIN DIM_ALBUMS al ON ft.album_id = al.album_id
        WHERE al.album_id = {album_id:Int32}
        GROUP BY al.album_id, al.name, al.release_year, al.album_type,
                 al.total_tracks_listed, al.language
        """,
        {"album_id": album_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Album not found")
    return row


# ── Genres ────────────────────────────────────────────────────────────────────

@router.get("/genres")
def genres_list():
    rows = query_rows("SELECT genre_id, name, mood FROM DIM_GENRES ORDER BY name")
    return {"data": rows}


@router.get("/genres/{genre_id}")
def genre_detail(genre_id: int):
    row = query_one(
        """
        SELECT
            g.genre_id, g.name, g.parent_genre, g.mood, g.origin_decade,
            count()                      AS track_count,
            round(avg(ft.popularity), 2) AS avg_popularity
        FROM FACT_TRACKS ft
        JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
        WHERE g.genre_id = {genre_id:Int32}
        GROUP BY g.genre_id, g.name, g.parent_genre, g.mood, g.origin_decade
        """,
        {"genre_id": genre_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Genre not found")
    return row
