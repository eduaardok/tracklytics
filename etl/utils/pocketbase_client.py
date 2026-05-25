"""Cliente PocketBase con autenticación y paginación automática."""
import math
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx

from utils.config import get_config


def get_token(cfg: dict | None = None) -> str:
    if cfg is None:
        cfg = get_config()
    resp = httpx.post(
        f"{cfg['pb_url']}/api/collections/_superusers/auth-with-password",
        json={"identity": cfg["pb_email"], "password": cfg["pb_pass"]},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["token"]


def fetch_all_pages(cfg: dict | None = None) -> list[dict]:
    """Descarga todos los registros con paginación paralela (hasta 10 workers)."""
    if cfg is None:
        cfg = get_config()

    per_page = 1000
    token    = get_token(cfg)
    headers  = {"Authorization": f"Bearer {token}"}
    base_url = f"{cfg['pb_url']}/api/collections/{cfg['pb_coll']}/records"

    resp = httpx.get(
        base_url,
        params={"page": 1, "perPage": 1, "skipTotal": "false"},
        headers=headers,
        timeout=30,
    )
    resp.raise_for_status()
    total = resp.json().get("totalItems", 0)
    pages = math.ceil(total / per_page)
    print(f"[pocketbase_client] {total} registros — {pages} páginas (perPage={per_page})")

    def _fetch_page(page: int) -> tuple[int, list]:
        r = httpx.get(
            base_url,
            params={"page": page, "perPage": per_page, "skipTotal": "true"},
            headers=headers,
            timeout=60,
        )
        r.raise_for_status()
        items = r.json().get("items", [])
        print(f"[pocketbase_client] página {page}/{pages} — {len(items)} items")
        return page, items

    results: dict[int, list] = {}
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(_fetch_page, p): p for p in range(1, pages + 1)}
        for future in as_completed(futures):
            page_num, items = future.result()
            results[page_num] = items

    records = []
    for p in range(1, pages + 1):
        records.extend(results[p])
    return records
