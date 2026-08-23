"""Notificaciones (S10 ronda 2) — helper reusado por `social` y por las
capabilities que disparan una notificación como efecto de otra acción
(`creadores` al aprobar un track, `biblioteca` al agregar un colaborador).
Vive en `social` porque es la capability dueña de FACT_NOTIFICACION, mismo
criterio que `paquetes.seguridad.audit` para FACT_AUDIT_LOG.
"""

import random
from datetime import datetime, timezone
from typing import Literal

from core.database import get_client, query_rows
from paquetes.social.queries import (
    PREFERENCIAS_DESACTIVADAS_DE_USUARIOS, SEGUIDORES_ACTIVOS_DE_ARTISTA,
)

TipoNotificacion = Literal[
    "nuevo_track_artista_seguido", "comentario_en_tu_contenido", "nuevo_colaborador_playlist",
]
ReferenciaTipo = Literal["track", "playlist", "comentario"]

_COLS = [
    "fact_id", "usuario_destino_id", "tipo", "referencia_tipo",
    "referencia_id", "mensaje", "leido", "fecha_creacion", "fecha_lectura",
]


def _gen_fact_id() -> int:
    # Mismo patrón que `social/router.py::_gen_fact_id` — UInt64 aleatorio de
    # 50 bits sin lock, dentro del rango seguro de Number.MAX_SAFE_INTEGER de JS.
    return random.getrandbits(50)


def _desactivada_para(usuario_id: str, tipo: TipoNotificacion) -> bool:
    return bool(query_rows(
        PREFERENCIAS_DESACTIVADAS_DE_USUARIOS, {"usuario_ids": [usuario_id], "tipo": tipo},
    ))


def crear(
    usuario_destino_id: str, tipo: TipoNotificacion, referencia_tipo: ReferenciaTipo,
    referencia_id: str, mensaje: str,
) -> int | None:
    # Opt-out (P2, S16): el destinatario desactivó este tipo — no se inserta
    # nada, ni siquiera en estado "silenciado", para no acumular ruido que
    # nadie va a leer.
    if _desactivada_para(usuario_destino_id, tipo):
        return None
    fact_id = _gen_fact_id()
    get_client().insert(
        "FACT_NOTIFICACION",
        [(
            fact_id, usuario_destino_id, tipo, referencia_tipo, referencia_id,
            mensaje, 0, datetime.now(timezone.utc), None,
        )],
        column_names=_COLS,
    )
    return fact_id


def crear_para_seguidores_de_artista(
    artista_id: int, tipo: TipoNotificacion, referencia_tipo: ReferenciaTipo,
    referencia_id: str, mensaje: str,
) -> int:
    """Notifica a todos los seguidores activos de un artista (ej. track nuevo
    aprobado). Retorna cuántas notificaciones se crearon."""
    seguidores = query_rows(SEGUIDORES_ACTIVOS_DE_ARTISTA, {"artista_id": artista_id})
    if not seguidores:
        return 0
    usuario_ids = [s["usuario_id"] for s in seguidores]
    # Opt-out en batch (P2, S16): una sola consulta filtra a quienes
    # desactivaron este tipo, en vez de una consulta por seguidor.
    desactivados = {
        r["usuario_id"] for r in query_rows(
            PREFERENCIAS_DESACTIVADAS_DE_USUARIOS, {"usuario_ids": usuario_ids, "tipo": tipo},
        )
    }
    ahora = datetime.now(timezone.utc)
    filas = [
        (_gen_fact_id(), uid, tipo, referencia_tipo, referencia_id, mensaje, 0, ahora, None)
        for uid in usuario_ids if uid not in desactivados
    ]
    if not filas:
        return 0
    get_client().insert("FACT_NOTIFICACION", filas, column_names=_COLS)
    return len(filas)
