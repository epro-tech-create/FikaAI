"""Application settings loaded from environment / .env file.

All secrets are provided via environment variables - nothing is hard-coded.
See .env.example for documentation of every variable.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("fikaai.config")


class Settings(BaseSettings):
    # Support running from either the repository root or backend/.
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://fikaai:fikaai_dev@localhost:5433/fikaai_db"

    # Security
    jwt_secret: str = "dev-insecure-jwt-secret-change-me-please-1234567890abcdef"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    embedding_encryption_key: str = ""

    # Face AI
    face_embedding_provider: str = "insightface"  # insightface | fake (dev-only)
    face_match_threshold: float = 0.45
    face_min_consistency: float = 0.35
    fake_face_always_match: bool = True
    models_dir: Path = Path("./models_data")
    insightface_det_size: int = 640
    # Ignore tiny secondary detections caused by reflections/background patterns.
    # A second face is rejected only when it is comparable to the dominant face.
    face_min_relative_area: float = 0.25

    # Campus timezone for session date/time evaluation
    campus_timezone: str = "Africa/Dar_es_Salaam"
    training_latitude: float = -6.7924000
    training_longitude: float = 39.2083000
    training_radius_meters: int = 50000

    # Liveness / verification tokens
    liveness_challenge_ttl_seconds: int = 120
    location_token_ttl_seconds: int = 300
    face_token_ttl_seconds: int = 300

    # Geofencing
    gps_verification_enabled: bool = False
    # Phone/browser GPS, especially indoors, commonly reports 30-100m accuracy.
    # Keep this configurable and calibrate it for the real training site.
    gps_max_accuracy_meters: float = 100.0
    gps_max_age_seconds: int = 120

    # Attendance
    default_late_threshold_minutes: int = 15

    # Upload limits
    max_frames_per_request: int = 60
    max_frame_bytes: int = 400_000
    max_sample_bytes: int = 800_000

    # CORS
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Rate limits
    rate_limit_login: str = "5/minute"
    rate_limit_face: str = "10/minute"
    rate_limit_attendance: str = "20/minute"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def campus_tz(self) -> ZoneInfo:
        return ZoneInfo(self.campus_timezone)

    @property
    def fernet_key(self) -> bytes:
        """Encryption key for embeddings; ephemeral key generated when unset.

        An ephemeral key keeps local development frictionless but means stored
        embeddings become unreadable after restart until re-enrolment. Set
        EMBEDDING_ENCRYPTION_KEY for any persistent environment.
        """
        if self.embedding_encryption_key:
            return self.embedding_encryption_key.encode()
        cached = os.environ.get("_FIKAAI_EPHEMERAL_KEY")
        if not cached:
            cached = Fernet.generate_key().decode()
            os.environ["_FIKAAI_EPHEMERAL_KEY"] = cached
            logger.warning(
                "EMBEDDING_ENCRYPTION_KEY is empty - using an EPHEMERAL key. "
                "Stored embeddings will be unreadable after restart."
            )
        return cached.encode() if isinstance(cached, str) else cached


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
