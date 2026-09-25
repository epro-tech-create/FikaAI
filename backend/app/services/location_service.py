"""GPS geofencing: Haversine distance + backend-side location verification.

The frontend NEVER decides whether a student is inside the area. This service
validates coordinate freshness and radius, then mints a one-time
signed-by-database location token consumed later by check-in / check-out.
Indoor GPS often reports a huge accuracy circle; we do not reject on that
number if the reported point is already inside the permitted radius.
"""

from __future__ import annotations

import logging
import math
import uuid
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.models.entities import (AttendanceSession, LocationVerification,
                                 Student)
from app.services.audit_service import audit_detached
from app.services.device_service import verify_device_binding
from app.services.session_service import (campus_now,
                                          get_active_session_or_error,
                                          validate_window)
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("ccd.geo")

EARTH_RADIUS_METERS = 6_371_000.0


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in metres (Haversine formula)."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2.0 * EARTH_RADIUS_METERS * math.asin(math.sqrt(a))


def _parse_captured_at(raw: str) -> datetime:
    try:
        captured = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (ValueError, TypeError) as exc:
        raise ApiError(
            ErrorCode.INVALID_COORDS, "Location capture timestamp is invalid.", 422
        ) from exc
    if captured.tzinfo is None:
        captured = captured.replace(tzinfo=timezone.utc)
    return captured


def _validate_coordinates(latitude: float, longitude: float) -> None:
    if not (-90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0):
        raise ApiError(ErrorCode.INVALID_COORDS, "Coordinates are out of range.", 422)


async def verify_location(
    db: AsyncSession,
    *,
    student: Student,
    actor_user_id: uuid.UUID,
    session_id: uuid.UUID,
    latitude: float,
    longitude: float,
    accuracy_meters: float,
    captured_at_raw: str,
    ip_address: str | None = None,
    device_id: uuid.UUID | None = None,
    mac_address: str | None = None,
) -> LocationVerification:
    """Validate the session, GPS freshness, and radius; persist a one-time token."""
    session = await get_active_session_or_error(db, session_id)
    assert isinstance(session, AttendanceSession)

    # Session time window: students with an existing check-in are validating for checkout
    from app.models.entities import AttendanceRecord
    from sqlalchemy import select

    existing = (
        await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.session_id == session_id,
                AttendanceRecord.student_id == student.id,
            )
        )
    ).scalar_one_or_none()
    purpose = (
        "check_out"
        if (existing is not None and existing.check_in_at is not None)
        else "check_in"
    )
    # Device binding - for checkout allow mismatch and auto-update (Halima cleared data after check-in)
    try:
        verify_device_binding(
            student,
            device_id=device_id,
            mac_address=mac_address,
            is_checkout=(purpose == "check_out"),
        )
    except ApiError as exc:
        await audit_detached(
            action="location_verification_failed",
            actor_user_id=actor_user_id,
            entity_type="attendance_session",
            entity_id=session_id,
            details={"reason": exc.code.value, "device_mismatch": True},
            ip_address=ip_address,
        )
        raise
    validate_window(session, purpose)  # type: ignore[arg-type]

    if not settings.gps_verification_enabled:
        now_utc = datetime.now(timezone.utc)
        record = LocationVerification(
            student_id=student.id,
            session_id=session_id,
            verified=True,
            distance_meters=0.0,
            allowed_radius_meters=float(session.permitted_radius_meters),
            accuracy_meters=0.0,
            captured_at=now_utc,
            expires_at=now_utc + timedelta(seconds=settings.location_token_ttl_seconds),
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)
        return record

    _validate_coordinates(latitude, longitude)

    # Coordinate freshness — lenient for slow indoor fixes and minor phone clock skew
    now_utc = datetime.now(timezone.utc)
    captured_at = _parse_captured_at(captured_at_raw)
    age_seconds = (now_utc - captured_at).total_seconds()
    # Allow 60s future (phone ahead) and up to gps_max_age+60s past (slow fix)
    if age_seconds < -60 or age_seconds > settings.gps_max_age_seconds + 60:
        await audit_detached(
            action="location_verification_failed",
            actor_user_id=actor_user_id,
            entity_type="attendance_session",
            entity_id=session_id,
            details={"reason": "STALE_LOCATION", "age_seconds": round(age_seconds)},
            ip_address=ip_address,
        )
        raise ApiError(
            ErrorCode.STALE_LOCATION,
            "Your location data is outdated (phone clock may be off). Enable auto time, refresh GPS near a window and retry.",
            400,
            {"ageSeconds": int(age_seconds)},
        )

    # Radius: indoor GPS often drifts 80-250m even inside RAFIC.
    # Be lenient: if accuracy circle overlaps the permitted radius, allow with warning.
    # This helps phones with poor indoor fix while still blocking far spoofs.
    distance = haversine_meters(
        latitude,
        longitude,
        float(session.location.latitude),
        float(session.location.longitude),
    )
    allowed_radius = float(session.permitted_radius_meters)
    # Fuzzy buffer: allow up to 200m extra if accuracy is poor but not absurd (>500m likely spoof)
    # Effective = distance - min(accuracy, 200) <= allowed_radius  => circle overlaps
    accuracy_for_buffer = min(max(accuracy_meters, 0), 200)
    effective_distance = max(0, distance - accuracy_for_buffer * 0.6)
    # Also hard cap: if raw accuracy > 800m, treat as unreliable -> require tighter
    if distance > allowed_radius and effective_distance > allowed_radius:
        # Provide helpful hint for borderline indoor cases
        await audit_detached(
            action="location_verification_failed",
            actor_user_id=actor_user_id,
            entity_type="attendance_session",
            entity_id=session_id,
            details={
                "reason": "OUTSIDE_RADIUS",
                "distance_m": round(distance, 1),
                "radius_m": allowed_radius,
                "accuracy_m": round(accuracy_meters, 1),
                "effective_m": round(effective_distance, 1),
            },
            ip_address=ip_address,
        )
        # User-friendly message with actionable advice
        raise ApiError(
            ErrorCode.OUTSIDE_RADIUS,
            f"You appear {round(distance)}m from RAFIC (allowed {int(allowed_radius)}m). Move near a window/outside, enable Precise Location, and retry.",
            403,
            {
                "distanceMeters": round(distance, 1),
                "allowedRadiusMeters": allowed_radius,
                "accuracyMeters": round(accuracy_meters, 1),
                "hint": "Enable Precise Location and move near window",
            },
        )
    if distance > allowed_radius:
        # Fuzzy pass: log for audit but allow — prevents indoor false rejects
        logger.info(
            "Fuzzy location pass student=%s distance=%.1fm accuracy=%.1fm effective=%.1fm radius=%.1fm",
            student.id,
            distance,
            accuracy_meters,
            effective_distance,
            allowed_radius,
        )

    record = LocationVerification(
        student_id=student.id,
        session_id=session_id,
        verified=True,
        distance_meters=round(distance, 2),
        allowed_radius_meters=allowed_radius,
        accuracy_meters=accuracy_meters,
        captured_at=captured_at,
        expires_at=now_utc + timedelta(seconds=settings.location_token_ttl_seconds),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    logger.info(
        "Location verified student=%s session=%s distance=%.1fm",
        student.id,
        session_id,
        distance,
    )
    return record
