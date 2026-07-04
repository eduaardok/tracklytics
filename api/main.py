from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.database import get_client
from paquetes.analitica.router import router as analitica_router
from paquetes.analitica.router import v1_router as analitica_v1_router
from paquetes.biblioteca.router import router as biblioteca_router
from paquetes.catalogo.router import router as catalogo_router
from paquetes.creadores.router import router as creadores_router
from paquetes.distribucion.router import router as distribucion_router
from paquetes.experiencia.router import router as experiencia_router
from paquetes.facturacion.router import router as facturacion_router
from paquetes.gestion_datos.router import router as gestion_router
from paquetes.gestion_datos.router import v1_router as gestion_v1_router
from paquetes.partners.logging_mw import partner_call_logger
from paquetes.partners.router import router as partners_router
from paquetes.seguridad.router import router as seguridad_router
from paquetes.social.router import router as social_router
from paquetes.suscripciones.router import router as suscripciones_router


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

app.middleware("http")(partner_call_logger)


# RF: Registro y consulta de errores de sistema (capability `seguridad`,
# CU-O19) — captura toda excepción no controlada de la API en
# FACT_ERROR_SISTEMA, sin exponer detalles internos al cliente. Es la única
# pieza de `seguridad` que toca main.py de forma transversal (design.md,
# decisión "Captura de errores de sistema vía exception handler global").
@app.exception_handler(Exception)
async def registrar_error_sistema(request: Request, exc: Exception):
    try:
        usuario_id = getattr(request.state, "usuario_id", None)
        get_client().insert(
            "FACT_ERROR_SISTEMA",
            [(type(exc).__name__, str(exc), request.url.path, usuario_id)],
            column_names=["codigo", "mensaje", "servicio", "usuario_id"],
        )
    except Exception:
        pass  # el logging de errores nunca debe enmascarar el error original
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})


app.include_router(catalogo_router)
app.include_router(analitica_router)
app.include_router(analitica_v1_router)
app.include_router(gestion_router)
app.include_router(gestion_v1_router)
app.include_router(biblioteca_router)
app.include_router(suscripciones_router)
app.include_router(partners_router)
app.include_router(seguridad_router)
app.include_router(facturacion_router)
app.include_router(creadores_router)
app.include_router(social_router)
app.include_router(distribucion_router)
app.include_router(experiencia_router)
