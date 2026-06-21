from fastapi import APIRouter, Depends, HTTPException, Query

from core.database import get_client, query_one, query_rows
from core.deps import require_b2c_user
from paquetes.biblioteca.queries import FACT_ID_EXISTS, FAVORITOS_ACTUALES, HISTORIAL_RECIENTE

router = APIRouter(prefix="/app/v1/biblioteca", tags=["Biblioteca"])


def _assert_fact_exists(fact_id: int) -> None:
    if not query_one(FACT_ID_EXISTS, {"fact_id": fact_id}):
        raise HTTPException(status_code=404, detail=f"fact_id {fact_id} not found")


def _insert_event(user_id: str, fact_id: int, event_type: str) -> None:
    get_client().insert(
        "FACT_ENGAGEMENT_USUARIO",
        [(user_id, fact_id, event_type, False, "app")],
        column_names=["user_id", "fact_id", "event_type", "is_synthetic", "source"],
    )


@router.get("/favoritos")
async def get_favoritos(user: dict = Depends(require_b2c_user)):
    user_id = user["record"]["id"]
    rows = query_rows(FAVORITOS_ACTUALES, {"user_id": user_id})
    return {"data": rows, "total": len(rows)}


@router.post("/favoritos/{fact_id}")
async def add_favorito(fact_id: int, user: dict = Depends(require_b2c_user)):
    user_id = user["record"]["id"]
    _assert_fact_exists(fact_id)
    _insert_event(user_id, fact_id, "favorito_add")
    return {"status": "ok"}


@router.delete("/favoritos/{fact_id}")
async def remove_favorito(fact_id: int, user: dict = Depends(require_b2c_user)):
    user_id = user["record"]["id"]
    _assert_fact_exists(fact_id)
    _insert_event(user_id, fact_id, "favorito_remove")
    return {"status": "ok"}


@router.get("/historial")
async def get_historial(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(require_b2c_user),
):
    user_id = user["record"]["id"]
    rows = query_rows(HISTORIAL_RECIENTE, {"user_id": user_id, "limit": limit})
    return {"data": rows, "total": len(rows)}


@router.post("/historial/{fact_id}")
async def add_historial(fact_id: int, user: dict = Depends(require_b2c_user)):
    user_id = user["record"]["id"]
    _assert_fact_exists(fact_id)
    _insert_event(user_id, fact_id, "reproduccion")
    return {"status": "ok"}
