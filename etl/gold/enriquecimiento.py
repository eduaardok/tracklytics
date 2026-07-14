"""Enriquecimiento determinista de catálogo: año/país plausibles para álbumes y
artistas sin dato informado, y perfiles de audio empíricos por género (usados
por `synthetic.py` para generar tracks coherentes con su género y por
`recalificacion.py` para corregir registros ya cargados)."""

import hashlib
from datetime import date

import numpy as np

AUDIO_FEATURES_GENERO = [
    "energy", "danceability", "acousticness", "instrumentalness", "valence", "tempo",
]
MIN_MUESTRA_GENERO = 30

# Mismo catálogo de países que `DIM_PAIS` (capability `distribucion`), ponderado
# hacia mercados con mayor volumen real de industria musical — no se inventa una
# segunda lista de países.
PAISES_INDUSTRIA_MUSICAL = [
    ("Estados Unidos", 20), ("Reino Unido", 12), ("Brasil", 10), ("México", 10),
    ("España", 8), ("Argentina", 8), ("Colombia", 7), ("Francia", 6),
    ("Alemania", 6), ("Canadá", 5), ("Japón", 5), ("Chile", 4),
    ("Perú", 4), ("Ecuador", 3),
]

RELEASE_YEAR_MIN = 1950


def _stable_hash(*parts) -> int:
    """Hash estable (no `random`) — mismo input siempre produce el mismo entero."""
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()
    return int(digest, 16)


def asignar_release_year(album_id: int, current_year: int | None = None) -> int:
    """Año de lanzamiento plausible, determinista por `album_id`, ponderado
    hacia décadas recientes (coherente con el volumen real de un catálogo de
    streaming)."""
    current_year = current_year or date.today().year
    decades = list(range(RELEASE_YEAR_MIN, current_year - current_year % 10 + 1, 10))
    weights = list(range(1, len(decades) + 1))  # más peso a décadas más recientes
    total = sum(weights)

    h = _stable_hash("release_year", album_id)
    pick = h % total
    cum = 0
    decade = decades[-1]
    for d, w in zip(decades, weights):
        cum += w
        if pick < cum:
            decade = d
            break

    year_offset = (h // total) % 10
    return min(decade + year_offset, current_year)


def asignar_country(artist_id: int) -> str:
    """País de origen plausible, determinista por `artist_id`, ponderado hacia
    mercados con industria musical relevante."""
    h = _stable_hash("country", artist_id)
    total = sum(w for _, w in PAISES_INDUSTRIA_MUSICAL)
    pick = h % total
    cum = 0
    for nombre, w in PAISES_INDUSTRIA_MUSICAL:
        cum += w
        if pick < cum:
            return nombre
    return PAISES_INDUSTRIA_MUSICAL[-1][0]


def calcular_perfiles_por_genero(client, min_muestra: int = MIN_MUESTRA_GENERO) -> dict[int, dict[str, np.ndarray]]:
    """Perfil empírico de audio por género, calculado sobre los tracks reales
    (`source_type = 'real'`) ya integrados. Géneros con menos de `min_muestra`
    tracks reales no obtienen perfil propio (respaldo: pool global)."""
    cols = ", ".join(AUDIO_FEATURES_GENERO)
    df = client.query_df(f"""
        SELECT genre_id, {cols}
        FROM FACT_TRACKS
        WHERE source_type = 'real'
    """)
    perfiles: dict[int, dict[str, np.ndarray]] = {}
    if df.empty:
        return perfiles
    for genre_id, group in df.groupby("genre_id"):
        if len(group) >= min_muestra:
            perfiles[int(genre_id)] = {col: group[col].to_numpy() for col in AUDIO_FEATURES_GENERO}
    return perfiles
