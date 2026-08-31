"""Transactional check-in / check-out.

Guarantees (all enforced server-side inside ONE database transaction):
    * student identity from JWT only
    * session is globally ACTIVE today
    * session date / time window valid for the operation
    * location + face verification tokens belong to this student+session,
      are verified, unexpired and UNUSED - consumed atomically via
      UPDATE ... WHERE used_at IS NULL RETURNING
    * UNIQUE(session_id, student_id) + pg_advisory_xact_lock serialize
      concurrent duplicates; idempotency keys make retries safe
"""

from __future__ import annotations

import logging
import uuid
import zlib
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    AttendanceStatus,
    FaceVerification,
    LocationVerification,
    RecordSource,
    SessionStatus,
    Student,
    VenueVerification,
    VerificationMethod,
)
from app.services.audit_service import audit_detached
from app.services.session_service import campus_now, validate_window

logger = logging.getLogger("ccd.attendance")


def _advisory_key(session_id: uuid.UUID, student_id: uuid.UUID) -> int:
    """Stable positive 63-bit int for pg_advisory_xact_lock."""
    return zlib.crc32(f"{session_id}:{student_id}".encode()) | (1 << 31)


async def _lock_attendance_row(db: AsyncSession, session_id: uuid.UUID, student_id: uuid.UUID) -> None:
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _advisory_key(session_id, student_id)})


async def _consume_token(
    db: AsyncSession,
    model: type[LocationVerification] | type[FaceVerification] | type[VenueVerification],
    *,
    raw_token: str,
    student_id: uuid.UUID,
    session_id: uuid.UUID,
    invalid_code: ErrorCode,
    label: str,
) -> uuid.UUID:
    try:
        token_uuid = uuid.UUID(raw_token)
    except (ValueError, TypeError) as exc:
        raise ApiError(invalid_code, f"The {label} token is malformed.", 400) from exc

    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(model)
        .where(
            model.token == token_uuid,
            model.student_id == student_id,
            model.session_id == session_id,
            model.verified.is_(True),
            model.used_at.is_(None),
            model.expires_at > now,
        )
        .values(used_at=now)
        .returning(model.id)
    )
    consumed_id = result.scalar_one_or_none()
    if consumed_id is not None:
        return consumed_id

    # Diagnose why consumption failed for a precise error message
    row = (
        await db.execute(select(model).where(model.token == token_uuid))
    ).scalar_one_or_none()
    if row is None or str(row.student_id) != str(student_id) or str(row.session_id) != str(session_id):
        raise ApiError(invalid_code, f"The {label} verification is missing or does not match this attempt.", 400)
    if not row.verified:
        raise ApiError(invalid_code, f"The {label} verification did not succeed.", 400)
    if row.used_at is not None:
        await audit_detached(
            action="attendance_rejected",
            actor_user_id=None,
            entity_type="attendance_session",
            entity_id=session_id,
            details={"reason": "TOKEN_ALREADY_USED", "token_type": label},
        )
        raise ApiError(ErrorCode.TOKEN_ALREADY_USED,
                       f"The {label} verification was already used. Repeat the verification step.", 409)
    if row.expires_at <= now:
        raise ApiError(invalid_code,
                       f"The {label} verification has expired. Repeat the verification step.", 410)
    raise ApiError(invalid_code, f"The {label} verification could not be used.", 400)


async def _get_locked_record(
    db: AsyncSession, session_id: uuid.UUID, student_id: uuid.UUID
) -> AttendanceRecord | None:
    result = await db.execute(
        select(AttendanceRecord)
        .where(AttendanceRecord.session_id == session_id, AttendanceRecord.student_id == student_id)
        .with_for_update()
    )
    return result.scalar_one_or_none()


def _record_dto(record: AttendanceRecord, replay: bool = False) -> dict[str, Any]:
    return {
        "sessionId": str(record.session_id),
        "faceId": str(record.face_enrollment_id) if record.face_enrollment_id else None,
        "checkInAt": record.check_in_at.isoformat(),
        "checkOutAt": record.check_out_at.isoformat() if record.check_out_at else None,
        "status": record.status.value if hasattr(record.status, "value") else str(record.status),
        "minutesLate": record.minutes_late,
        "timeSpentMinutes": record.time_spent_minutes,
        "replay": replay,
    }


async def _load_locked_session(db: AsyncSession, session_id: uuid.UUID) -> AttendanceSession:
    result = await db.execute(
        # Joined relationships include nullable outer joins. PostgreSQL cannot
        # lock the nullable side, so explicitly lock only the session table.
        select(AttendanceSession)
        .where(AttendanceSession.id == session_id)
        .with_for_update(of=AttendanceSession)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Session not found.", 404)
    return session


async def check_in(
    db: AsyncSession,
    *,
    student: Student,
    actor_user_id: uuid.UUID,
    session_id: uuid.UUID,
    location_verification_token: str,
    face_verification_token: str | None = None,
    venue_verification_token: str | None = None,
    idempotency_key: str,
    ip_address: str | None,
) -> dict[str, Any]:
    try:
        idem_uuid = uuid.UUID(idempotency_key)
    except (ValueError, TypeError) as exc:
        raise ApiError(ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
                       "A valid UUID idempotency key is required.", 400) from exc

    # get_current_student may have started an implicit read transaction on this
    # request's shared session. Close it before opening the atomic write tx.
    if db.in_transaction():
        await db.commit()
    async with db.begin():
        session = await _load_locked_session(db, session_id)
        if session.status != SessionStatus.ACTIVE:
            raise ApiError(ErrorCode.SESSION_INACTIVE, "This attendance session is no longer active.", 409)

        clock = campus_now()
        validate_window(session, "check_in", clock)

        await _lock_attendance_row(db, session.id, student.id)

        existing = await _get_locked_record(db, session.id, student.id)
        if existing is not None:
            if existing.idempotency_key == idem_uuid:
                return _record_dto(existing, replay=True)  # safe retry of the same submission
            await audit_detached(
                action="attendance_rejected",
                actor_user_id=actor_user_id,
                entity_type="attendance_session",
                entity_id=session.id,
                details={"reason": "DUPLICATE_CHECK_IN"},
                ip_address=ip_address,
            )
            raise ApiError(ErrorCode.DUPLICATE_CHECK_IN,
                           "You have already checked in to this session.", 409)

        # Both verifications must exist, match, be unused & unexpired; consumed atomically.
        await _consume_token(
            db, LocationVerification,
            raw_token=location_verification_token,
            student_id=student.id, session_id=session.id,
            invalid_code=ErrorCode.INVALID_LOCATION_TOKEN, label="location",
        )
        face_enrollment_id = None
        verification_method = VerificationMethod.VENUE_GPS
        if face_verification_token:
            face_verification_id = await _consume_token(
                db, FaceVerification,
                raw_token=face_verification_token,
                student_id=student.id, session_id=session.id,
                invalid_code=ErrorCode.INVALID_FACE_TOKEN, label="face",
            )
            face_enrollment_id = (
                await db.execute(
                    select(FaceVerification.face_enrollment_id).where(FaceVerification.id == face_verification_id)
                )
            ).scalar_one()
            if face_enrollment_id is None:
                raise ApiError(ErrorCode.INVALID_FACE_TOKEN, "The face verification has no enrolled FaceID reference.", 400)
            verification_method = VerificationMethod.FACE_GPS
        elif venue_verification_token:
            await _consume_token(
                db, VenueVerification,
                raw_token=venue_verification_token,
                student_id=student.id, session_id=session.id,
                invalid_code=ErrorCode.INVALID_VENUE_TOKEN, label="venue",
            )
            verification_method = VerificationMethod.VENUE_GPS
        else:
            raise ApiError(ErrorCode.INVALID_FACE_TOKEN, "Provide face or venue verification token.", 400)

        # Server time is authoritative; LATE beyond open + threshold
        now_local = clock.now_local
        official_start = datetime.combine(
            session.session_date, session.official_start, tzinfo=clock.now_local.tzinfo
        )
        grace_deadline = official_start + timedelta(minutes=session.late_threshold_minutes)
        late = now_local > grace_deadline
        minutes_late = max(0, int((now_local - official_start).total_seconds() // 60)) if late else 0
        status = AttendanceStatus.LATE if late else AttendanceStatus.PRESENT

        record = AttendanceRecord(
            session_id=session.id,
            student_id=student.id,
            face_enrollment_id=face_enrollment_id,
            check_in_at=now_local,
            minutes_late=minutes_late,
            status=status,
            verification_method=verification_method,
            source=RecordSource.ONLINE,
            idempotency_key=idem_uuid,
        )
        db.add(record)
        try:
            await db.flush()
        except IntegrityError:
            # Unique constraint raced (defense in depth behind advisory locks).
            # Roll back everything - including token consumption - so nothing
            # is half-consumed; the client's retry replays via idempotency key.
            await db.rollback()
            raise ApiError(ErrorCode.DUPLICATE_CHECK_IN,
                           "You have already checked in to this session.", 409)

    await audit_detached(
        action=f"attendance_{status.value.lower()}",
        actor_user_id=actor_user_id,
        entity_type="attendance_record",
        entity_id=record.id,
        details={"session_id": str(session.id), "face_id": str(face_enrollment_id) if face_enrollment_id else None, "verification_method": verification_method.value, "minutes_late": minutes_late},
        ip_address=ip_address,
    )
    logger.info("Check-in recorded student=%s session=%s status=%s method=%s", student.id, session.id, status.value, verification_method.value)
    return _record_dto(record)


async def check_out(
    db: AsyncSession,
    *,
    student: Student,
    actor_user_id: uuid.UUID,
    session_id: uuid.UUID,
    location_verification_token: str,
    face_verification_token: str | None = None,
    venue_verification_token: str | None = None,
    idempotency_key: str,
    ip_address: str | None,
) -> dict[str, Any]:
    try:
        idem_uuid = uuid.UUID(idempotency_key)
    except (ValueError, TypeError) as exc:
        raise ApiError(ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
                       "A valid UUID idempotency key is required.", 400) from exc

    if db.in_transaction():
        await db.commit()
    async with db.begin():
        session = await _load_locked_session(db, session_id)
        if session.status != SessionStatus.ACTIVE:
            raise ApiError(ErrorCode.SESSION_INACTIVE, "This attendance session is no longer active.", 409)

        clock = campus_now()
        validate_window(session, "check_out", clock)

        await _lock_attendance_row(db, session.id, student.id)

        record = await _get_locked_record(db, session.id, student.id)
        if record is None or record.check_in_at is None:
            raise ApiError(ErrorCode.CHECKOUT_WITHOUT_CHECKIN,
                           "You must check in before checking out.", 409)
        if record.check_out_at is not None or record.status == AttendanceStatus.CHECKED_OUT:
            if record.idempotency_key == idem_uuid:
                return _record_dto(record, replay=True)
            raise ApiError(ErrorCode.ALREADY_CHECKED_OUT, "You have already checked out of this session.", 409)

        await _consume_token(
            db, LocationVerification,
            raw_token=location_verification_token,
            student_id=student.id, session_id=session.id,
            invalid_code=ErrorCode.INVALID_LOCATION_TOKEN, label="location",
        )
        checkout_face_id = None
        if face_verification_token:
            face_verification_id = await _consume_token(
                db, FaceVerification,
                raw_token=face_verification_token,
                student_id=student.id, session_id=session.id,
                invalid_code=ErrorCode.INVALID_FACE_TOKEN, label="face",
            )
            checkout_face_id = (
                await db.execute(
                    select(FaceVerification.face_enrollment_id).where(FaceVerification.id == face_verification_id)
                )
            ).scalar_one()
            if checkout_face_id is None:
                raise ApiError(ErrorCode.INVALID_FACE_TOKEN, "The face verification has no enrolled FaceID reference.", 400)
        elif venue_verification_token:
            await _consume_token(
                db, VenueVerification,
                raw_token=venue_verification_token,
                student_id=student.id, session_id=session.id,
                invalid_code=ErrorCode.INVALID_VENUE_TOKEN, label="venue",
            )
        else:
            raise ApiError(ErrorCode.INVALID_FACE_TOKEN, "Provide face or venue verification token.", 400)

        now_local = clock.now_local
        record.check_out_at = now_local
        record.time_spent_minutes = max(0, int((now_local - record.check_in_at).total_seconds() // 60))
        record.status = AttendanceStatus.CHECKED_OUT

    await audit_detached(
        action="attendance_checked_out",
        actor_user_id=actor_user_id,
        entity_type="attendance_record",
        entity_id=record.id,
        details={"session_id": str(session.id), "face_id": str(checkout_face_id) if checkout_face_id else None, "time_spent_minutes": record.time_spent_minutes},
        ip_address=ip_address,
    )
    logger.info("Check-out recorded student=%s session=%s", student.id, session.id)
    return _record_dto(record)
