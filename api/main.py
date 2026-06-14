from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.database import get_client
from paquetes.analitica.router import router as analitica_router
from paquetes.biblioteca.router import router as biblioteca_router
from paquetes.catalogo.router import router as catalogo_router
from paquetes.gestion_datos.router import router as gestion_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        client = get_client()
        client.command("SELECT 1")
    except Exception as exc:
        raise RuntimeError(f"ClickHouse unreachable at startup: {exc}") from exc
    yield


app = FastAPI(
    title="Tracklytics API",
    version="2.0.0",
    description="Analytics API for Tracklytics — powered by ClickHouse",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(catalogo_router)
app.include_router(analitica_router)
app.include_router(gestion_router)
app.include_router(biblioteca_router)
