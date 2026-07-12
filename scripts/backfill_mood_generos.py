"""scripts/backfill_mood_generos.py — S10 ronda 2 (QA): `DIM_GENRES.mood`
nacía hardcodeado a "Neutral" para los 114 géneros (`etl/gold/loader.py`,
`[(i, g, "", "", "", "Neutral", "") for i, g in enumerate(genres, 1)]`) — nunca
se calculaba de verdad, así que toda tarjeta de género en Catálogo mostraba el
mismo mood sin importar el género real (encontrado en QA visual).

Heurística de cuadrante valence/energy (Russell's circumplex, la misma idea ya
usada en `experiencia` para similitud de audio — heurística documentada, no
ML) sobre el promedio real de valence/energy por género en FACT_TRACKS
(source_type='real'): 4 cuadrantes, sin género con menos de 1 track real
(nunca debería pasar, DIM_GENRES solo tiene géneros con tracks reales, pero
se salta por seguridad).

Uso:
    docker compose exec -T api python - < scripts/backfill_mood_generos.py
"""

import sys

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from core.database import execute, query_rows  # noqa: E402


def clasificar_mood(valence: float, energy: float) -> str:
    if valence >= 0.5 and energy >= 0.5:
        return "Enérgico"
    if valence >= 0.5 and energy < 0.5:
        return "Relajado"
    if valence < 0.5 and energy >= 0.5:
        return "Intenso"
    return "Melancólico"


def main() -> None:
    filas = query_rows("""
        SELECT genre_id, avg(valence) AS avg_valence, avg(energy) AS avg_energy
        FROM FACT_TRACKS
        WHERE source_type = 'real'
        GROUP BY genre_id
    """)
    if not filas:
        print("[backfill_mood] sin tracks reales agrupables por género — nada que hacer.")
        return

    actualizados = 0
    for fila in filas:
        mood = clasificar_mood(fila["avg_valence"], fila["avg_energy"])
        execute(
            "ALTER TABLE DIM_GENRES UPDATE mood = {mood:String} WHERE genre_id = {gid:UInt16}",
            {"mood": mood, "gid": fila["genre_id"]},
        )
        actualizados += 1

    print(f"[backfill_mood] {actualizados} géneros actualizados con mood real "
          f"(valence/energy promedio de FACT_TRACKS).")


if __name__ == "__main__":
    main()
