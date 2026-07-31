"""Detección de featuring (S14-P1) — derivada, en tiempo de consulta.

`FACT_TRACKS` no tiene un campo `artists` (plural) que llegue desde el
dataset crudo: `etl/gold/loader.py` ya reduce la columna original
`"A; B"` de `STG_RAW_TRACKS.artists` a un único `artist_id` (el primero de
la lista) antes de que la fila llegue a Gold. El string multi-artista crudo
no está unido a ningún Fact/Dim de Gold ni se expone en ningún endpoint —
por eso la detección se hace exclusivamente sobre `track_name`, que sí es un
campo real de `FACT_TRACKS` y viaja en cada respuesta. Es además la señal
correcta: el propio dataset marca colaboraciones así ("Song (feat. X)"), y
aunque `artists` existiera, múltiples artistas separados por ";" no implica
featuring por sí solo (una banda con varios integrantes también lo tendría).

No escribe nada a ClickHouse — se llama sobre filas ya obtenidas de una
consulta paginada (20-60 filas típicas de catálogo/biblioteca), así que el
costo del regex es despreciable sin necesidad de materializar una tabla.
"""

import re

# Paréntesis/corchetes primero: "(feat. X)", "[ft. X]", "(with X)" — `with`
# SOLO se reconoce en esta forma (fuera de paréntesis es una palabra común en
# inglés, generaría demasiados falsos positivos).
_PATRON_ENCERRADO = re.compile(
    r"[\(\[]\s*(?:feat\.?|ft\.?|featuring|with)\s+(?P<nombres>[^)\]]+)[\)\]]",
    re.IGNORECASE,
)
# Forma suelta sin encerrar: "Song Title feat. Artist" — sin `with` (mismo
# motivo de falso positivo que arriba).
_PATRON_SUELTO = re.compile(
    r"\b(?:feat\.?|ft\.?|featuring)\s+(?P<nombres>.+)$",
    re.IGNORECASE,
)
_SEPARADOR_NOMBRES = re.compile(r"\s*(?:,|&)\s*")


def detectar_featuring(track_name: str | None, artist_name: str | None) -> dict:
    """Devuelve `es_featuring`, `artista_principal` y `artistas_feat` a
    partir del nombre del track. `artista_principal` es siempre el artista ya
    resuelto de la fila (no hay una "lista" de la que tomar el primero,
    porque `FACT_TRACKS` solo trae un artist_id por diseño — ver docstring
    del módulo)."""
    nombre = track_name or ""
    match = _PATRON_ENCERRADO.search(nombre) or _PATRON_SUELTO.search(nombre)

    if not match:
        return {"es_featuring": False, "artista_principal": artist_name or "", "artistas_feat": []}

    crudo = match.group("nombres").strip().rstrip(").]")
    artistas_feat = [n.strip() for n in _SEPARADOR_NOMBRES.split(crudo) if n.strip()]
    return {"es_featuring": True, "artista_principal": artist_name or "", "artistas_feat": artistas_feat}


def enriquecer_featuring(rows: list[dict]) -> list[dict]:
    """Agrega los 3 campos derivados a cada fila de un resultado de consulta
    que ya tenga `track_name`/`artist_name` (mutación in-place + devuelve la
    misma lista, para poder usarse como `rows = enriquecer_featuring(rows)`)."""
    for row in rows:
        row.update(detectar_featuring(row.get("track_name"), row.get("artist_name")))
    return rows
