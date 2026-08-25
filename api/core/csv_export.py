import csv
import io

from fastapi import Response

BOM_UTF8 = "﻿"


def filas_a_csv_response(filas: list[dict], nombre_archivo: str) -> Response:
    """Serializa una lista de dicts (filas de ClickHouse) a un adjunto CSV.

    BOM UTF-8 al inicio: sin esto, Excel en Windows interpreta el archivo
    como Latin-1 y rompe cualquier acento/ñ del contenido (nombres de
    track, motivos, etc.).
    """
    buffer = io.StringIO()
    if filas:
        writer = csv.DictWriter(buffer, fieldnames=list(filas[0].keys()))
        writer.writeheader()
        writer.writerows(filas)
    contenido = BOM_UTF8 + buffer.getvalue()
    return Response(
        content=contenido.encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{nombre_archivo}"'},
    )
