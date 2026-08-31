"""CCD-Attendance API - application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.responses import JSONResponse

from app.api.v1 import api_router
from app.core.config import settings
from app.core.deps import limiter
from app.core.errors import error_response

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ccd")


@asynccontextmanager
async def lifespan(app: FastAPI):
    provider = settings.face_embedding_provider
    logger.info(
        "CCD-Attendance starting | face_provider=%s | threshold=%.2f (dev default - calibrate!)",
        "fake(dev)" if provider == "fake" else provider,
        settings.face_match_threshold,
    )
    if provider == "insightface":
        from app.face_ai.liveness_service import get_liveness_analyzer
        from app.face_ai.recognition_service import get_face_recognition_service

        logger.info("Preloading face recognition and liveness models")
        await run_in_threadpool(get_face_recognition_service().warm_up)
        await run_in_threadpool(get_liveness_analyzer().warm_up)
        logger.info("Face models ready")
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="CCD-Attendance API",
        version="0.1.0",
        description="Student attendance with geofencing + live face verification.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request-body size guard for frame uploads (defense in depth)
    app.add_middleware(SlowAPIMiddleware)
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(_: Request, exc: RateLimitExceeded) -> JSONResponse:
        return error_response(429, "RATE_LIMITED", "Too many requests. Please wait a moment and retry.")

    from app.core.errors import register_exception_handlers

    register_exception_handlers(app)

    @app.get("/health", tags=["system"])
    async def health() -> dict:
        return {"status": "ok", "service": "ccd-attendance-backend"}

    @app.get("/ready", tags=["system"])
    async def ready() -> JSONResponse:
        from sqlalchemy import text

        problems: list[str] = []
        try:
            from app.db.session import engine

            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
        except Exception as database_error:  # noqa: BLE001 - readiness must never raise
            logger.warning("Readiness database check failed: %s", database_error)
            problems.append("database")

        if settings.face_embedding_provider == "insightface":
            model_files = {
                "buffalo_sc": ("det_500m.onnx", "w600k_mbf.onnx"),
                "buffalo_l": ("det_10g.onnx", "w600k_r50.onnx"),
            }
            required = model_files.get(settings.insightface_model_name, ())
            pack_dir = settings.models_dir / "models" / settings.insightface_model_name
            missing = [name for name in required if not (pack_dir / name).is_file()]
            if not required:
                missing.append("unsupported-model-pack")
            if missing:
                problems.append("models:" + ",".join(missing))

        if problems:
            return JSONResponse(
                status_code=503,
                content={"status": "unavailable", "service": "ccd-attendance-backend", "problems": problems},
            )
        return JSONResponse(content={"status": "ready", "service": "ccd-attendance-backend"})

    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
