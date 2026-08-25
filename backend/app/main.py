"""FikaAI Attendance API - application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.responses import JSONResponse

from app.api.v1 import api_router
from app.core.config import settings
from app.core.deps import limiter
from app.core.errors import error_response

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("fikaai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    provider = settings.face_embedding_provider
    logger.info(
        "FikaAI starting | face_provider=%s | threshold=%.2f (dev default - calibrate!)",
        "fake(dev)" if provider == "fake" else provider,
        settings.face_match_threshold,
    )
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="FikaAI Attendance API",
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
        return {"status": "ok", "service": "fikaai-backend"}

    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
