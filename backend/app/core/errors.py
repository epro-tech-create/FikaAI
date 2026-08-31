"""Consistent API error envelope.

Every error returned by the API has the shape:
    {"error": {"code": "MACHINE_READABLE_CODE", "message": "Human message", "details": {...}}}
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("ccd.errors")


class ErrorCode(str, Enum):
    # Auth / RBAC
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    EMAIL_ALREADY_REGISTERED = "EMAIL_ALREADY_REGISTERED"
    REGISTRATION_NUMBER_EXISTS = "REGISTRATION_NUMBER_EXISTS"
    DEVICE_ALREADY_REGISTERED = "DEVICE_ALREADY_REGISTERED"
    ACCOUNT_DISABLED = "ACCOUNT_DISABLED"
    TOKEN_INVALID = "TOKEN_INVALID"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    # Session rules
    NO_ACTIVE_SESSION = "NO_ACTIVE_SESSION"
    SESSION_INACTIVE = "SESSION_INACTIVE"
    SESSION_NOT_STARTED = "SESSION_NOT_STARTED"
    CHECK_IN_CLOSED = "CHECK_IN_CLOSED"
    SESSION_CLOSED = "SESSION_CLOSED"
    # Geofencing
    INVALID_COORDS = "INVALID_COORDS"
    STALE_LOCATION = "STALE_LOCATION"
    POOR_GPS_ACCURACY = "POOR_GPS_ACCURACY"
    OUTSIDE_RADIUS = "OUTSIDE_RADIUS"
    LOCATION_PERMISSION_DENIED = "LOCATION_PERMISSION_DENIED"
    GPS_UNAVAILABLE = "GPS_UNAVAILABLE"
    # Face enrolment
    FACE_NOT_ENROLLED = "FACE_NOT_ENROLLED"
    FACE_REENROLL_REQUIRED = "FACE_REENROLL_REQUIRED"
    ALREADY_ENROLLED = "ALREADY_ENROLLED"
    SAMPLE_COUNT_INVALID = "SAMPLE_COUNT_INVALID"
    UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    BLURRED_IMAGE = "BLURRED_IMAGE"
    TOO_DARK = "TOO_DARK"
    NO_FACE = "NO_FACE"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    INCONSISTENT_SAMPLES = "INCONSISTENT_SAMPLES"
    CONSENT_REQUIRED = "CONSENT_REQUIRED"
    # Live verification
    CHALLENGE_INVALID = "CHALLENGE_INVALID"
    CHALLENGE_EXPIRED = "CHALLENGE_EXPIRED"
    LIVENESS_FAILED = "LIVENESS_FAILED"
    LIVENESS_NOT_COMPLETED = "LIVENESS_NOT_COMPLETED"
    FACE_MISMATCH = "FACE_MISMATCH"
    FRAME_LIMIT_EXCEEDED = "FRAME_LIMIT_EXCEEDED"
    # Attendance submission
    INVALID_LOCATION_TOKEN = "INVALID_LOCATION_TOKEN"
    INVALID_FACE_TOKEN = "INVALID_FACE_TOKEN"
    INVALID_VENUE_TOKEN = "INVALID_VENUE_TOKEN"
    INVALID_VENUE_CODE = "INVALID_VENUE_CODE"
    VENUE_CODE_EXPIRED = "VENUE_CODE_EXPIRED"
    VENUE_NOT_CONFIGURED = "VENUE_NOT_CONFIGURED"
    TOKEN_ALREADY_USED = "TOKEN_ALREADY_USED"
    DUPLICATE_CHECK_IN = "DUPLICATE_CHECK_IN"
    CHECKOUT_WITHOUT_CHECKIN = "CHECKOUT_WITHOUT_CHECKIN"
    CHECKOUT_TOO_EARLY = "CHECKOUT_TOO_EARLY"
    ALREADY_CHECKED_OUT = "ALREADY_CHECKED_OUT"
    IDEMPOTENCY_KEY_REQUIRED = "IDEMPOTENCY_KEY_REQUIRED"
    # Generic
    VALIDATION_ERROR = "VALIDATION_ERROR"
    RATE_LIMITED = "RATE_LIMITED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ApiError(Exception):
    """Raised by services; converted to the standard error envelope."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)


def error_response(status_code: int, code: str, message: str, details: Any = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status_code, exc.code.value, exc.message, exc.details or None)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Pydantic custom validators include the original ValueError object in
        # `ctx`; JSONResponse cannot serialize that object and used to turn a
        # normal 422 (e.g. weak signup password) into an internal server error.
        errors = exc.errors()
        details = [
            {
                "field": ".".join(str(part) for part in error.get("loc", []) if part != "body"),
                "message": str(error.get("msg", "Invalid value")).removeprefix("Value error, "),
                "type": str(error.get("type", "validation_error")),
            }
            for error in errors
        ]
        first_message = details[0]["message"] if details else "Invalid request payload."
        return error_response(422, ErrorCode.VALIDATION_ERROR.value, first_message, details)

    @app.exception_handler(Exception)
    async def unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled server error")  # logs type only, never payloads/images/embeddings
        return error_response(500, ErrorCode.INTERNAL_ERROR.value, "Internal server error.")
