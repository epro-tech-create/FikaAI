"""Venue proof service — static 8-char code / QR for entire IPT.

The code is stored only as sha256 hash in settings.VENUE_STATIC_CODE_HASH.
Verification mints a one-time single-use VenueVerification token
consumed atomically by check-in/out like LocationVerification.

Flow is fully automatic on the frontend: scan QR / type code + GPS
are verified together without extra student taps.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.models.entities import AttendanceRecord, Student, VenueVerification
from app.services.audit_service import audit_detached
from app.services.session_service import get_active_session_or_error, validate_window

CODE_PATTERN = re.compile(r"^[A-Z0-9]{8}$")


def _normalize_code(raw: str) -> str:
    return raw.strip().upper()


def _hash_code(normalized: str) -> str:
    return hashlib.sha256(normalized.encode()).hexdigest()


def _ensure_configured() -> None:
    if not settings.venue_static_code_hash or len(settings.venue_static_code_hash) != 64:
        raise ApiError(
            ErrorCode.VENUE_NOT_CONFIGURED,
            "Venue code is not configured. Ask admin to set VENUE_STATIC_CODE_HASH.",
            503,
        )


async def verify_venue(
    db: AsyncSession,
    *,
    student: Student,
    actor_user_id: uuid.UUID,
    session_id: uuid.UUID,
    code: str | None = None,
    qr_token: str | None = None,
    ip_address: str | None = None,
) -> VenueVerification:
    """Validate code/QR against static hash, check session window, mint venue token."""
    _ensure_configured()

    session = await get_active_session_or_error(db, session_id)

    # Determine purpose for window validation (check_in vs check_out)
    existing = (
        await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.session_id == session_id,
                AttendanceRecord.student_id == student.id,
            )
        )
    ).scalar_one_or_none()
    purpose = "check_out" if (existing is not None and existing.check_in_at is not None) else "check_in"
    validate_window(session, purpose)  # type: ignore[arg-type]

    # Extract normalized 8-char code from either field
    if code is not None:
        normalized = _normalize_code(code)
    elif qr_token is not None:
        # QR token is the same 8-char string (or contains it); allow raw QR data
        # For flexible deployment, qr_token may be the code itself or a string containing it
        # Extract last 8-alnum block if needed
        candidate = _normalize_code(qr_token)
        # If qr_token is longer (e.g. URL with code param), extract 8-char block
        if not CODE_PATTERN.fullmatch(candidate):
            m = re.search(r"[A-Z0-9]{8}", candidate)
            normalized = m.group(0) if m else candidate
        else:
            normalized = candidate
    else:
        raise ApiError(ErrorCode.INVALID_VENUE_CODE, "Provide venue code or QR token.", 400)

    if not CODE_PATTERN.fullmatch(normalized):
        await audit_detached(
            action="venue_verification_failed",
            actor_user_id=actor_user_id,
            entity_type="attendance_session",
            entity_id=session_id,
            details={"reason": "BAD_FORMAT"},
            ip_address=ip_address,
        )
        raise ApiError(ErrorCode.INVALID_VENUE_CODE, "Venue code must be exactly 8 alphanumeric characters.", 400)

    expected_hash = settings.venue_static_code_hash.strip().lower()
    actual_hash = _hash_code(normalized)

    if not hmac.compare_digest(actual_hash, expected_hash):
        await audit_detached(
            action="venue_verification_failed",
            actor_user_id=actor_user_id,
            entity_type="attendance_session",
            entity_id=session_id,
            details={"reason": "INVALID_CODE"},
            ip_address=ip_address,
        )
        raise ApiError(ErrorCode.INVALID_VENUE_CODE, "Invalid venue code. Check the code displayed in the RAFIC room.", 400)

    # Success — mint one-time venue verification token (same TTL as location/face)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=settings.venue_token_ttl_seconds)
    row = VenueVerification(
        student_id=student.id,
        session_id=session_id,
        verified=True,
        code_hash=actual_hash,
        token=uuid.uuid4(),
        expires_at=expires_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
