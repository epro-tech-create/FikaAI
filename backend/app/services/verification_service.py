"""Liveness challenges + one-time face verification tokens.

Flow:
    1. issue_challenge  -> randomized challenge persisted with its own TTL
    2. verify_face      -> frames analysed server-side (MediaPipe), then the
                           live embedding is compared ONLY against this
                           authenticated student's stored embedding (1:1)
    3. on success a short-lived one-time token is minted for check-in/out

The client NEVER decides match or liveness outcomes.
"""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.face_ai.liveness_service import LivenessAnalyzer
from app.face_ai.recognition_service import BaseFaceRecognitionService, cosine_similarity
from app.models.entities import (
    CHALLENGE_INSTRUCTIONS,
    FaceEnrollment,
    FaceVerification,
    LivenessChallengeType,
    Student,
)
from app.services.audit_service import audit_detached
from app.services.enrollment_service import decode_sample, load_active_enrollment
from app.services.session_service import get_active_assigned_session_or_error

logger = logging.getLogger("fikaai.verify")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def issue_challenge(
    db: AsyncSession,
    *,
    student: Student,
    session_id: uuid.UUID,
) -> dict:
    # Enrolment is a prerequisite for verification
    active = (
        await db.execute(
            select(FaceEnrollment.id).where(
                FaceEnrollment.student_id == student.id,
                FaceEnrollment.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if active is None:
        raise ApiError(ErrorCode.FACE_NOT_ENROLLED,
                       "No face enrolment found. Complete face enrolment first.", 409)

    await get_active_assigned_session_or_error(db, student.id, session_id)

    challenge_type = random.choice(list(LivenessChallengeType))
    record = FaceVerification(
        student_id=student.id,
        session_id=session_id,
        challenge_type=challenge_type,
        challenge_expires_at=_now_utc() + timedelta(seconds=settings.liveness_challenge_ttl_seconds),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return {
        "challengeToken": str(record.challenge_token),
        "challengeType": record.challenge_type.value,
        "instruction": CHALLENGE_INSTRUCTIONS[record.challenge_type],
        "expiresAt": record.challenge_expires_at.isoformat(),
        # The frontend may show the instruction text; it cannot influence scoring.
    }


async def verify_face(
    db: AsyncSession,
    *,
    student: Student,
    actor_user_id: uuid.UUID,
    session_id: uuid.UUID,
    challenge_token: str,
    frames_b64: list[str],
    ip_address: str | None,
    recognizer: BaseFaceRecognitionService,
    liveness: LivenessAnalyzer,
) -> dict:
    if len(frames_b64) > settings.max_frames_per_request:
        raise ApiError(ErrorCode.FRAME_LIMIT_EXCEEDED,
                       f"Too many frames (max {settings.max_frames_per_request}).", 413)
    try:
        token_uuid = uuid.UUID(challenge_token)
    except ValueError as exc:
        raise ApiError(ErrorCode.CHALLENGE_INVALID, "Unknown liveness challenge.", 404) from exc

    row = (
        await db.execute(
            select(FaceVerification).where(
                FaceVerification.challenge_token == token_uuid,
                FaceVerification.student_id == student.id,
                FaceVerification.session_id == session_id,
                FaceVerification.completed_at.is_(None),
            )
        )
    ).scalar_one_or_none()

    now = _now_utc()
    if row is None:
        raise ApiError(ErrorCode.CHALLENGE_INVALID,
                       "No pending liveness challenge. Start a new face scan.", 404)
    if row.challenge_expires_at < now:
        row.completed_at = now
        row.verified = False
        row.failure_reason = ErrorCode.CHALLENGE_EXPIRED.value
        await db.commit()
        raise ApiError(ErrorCode.CHALLENGE_EXPIRED,
                       "The liveness challenge expired. Start a new face scan.", 410)

    blobs = [decode_sample(f) for f in frames_b64]

    import cv2

    decoded: list[np.ndarray] = []
    for blob in blobs:
        img = cv2.imdecode(np.frombuffer(blob, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is not None:
            decoded.append(img)
    if not decoded:
        raise ApiError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, "Frames could not be decoded.", 422)

    # ---- server-side liveness decision ----
    result = await run_in_threadpool(liveness.analyze, decoded, row.challenge_type)
    row.liveness_passed = result.passed
    row.liveness_metrics = result.metrics

    if not result.passed:
        reason = result.failure_reason or ErrorCode.LIVENESS_FAILED
        row.completed_at = now
        row.verified = False
        row.failure_reason = reason.value
        await db.commit()
        await audit_detached(
            action="face_verification_failed",
            actor_user_id=actor_user_id,
            entity_type="attendance_session",
            entity_id=session_id,
            details={"reason": reason.value},
            ip_address=ip_address,
        )
        messages = {
            ErrorCode.NO_FACE: "No face was visible during the scan. Try again.",
            ErrorCode.MULTIPLE_FACES: "More than one face was visible. Only one person may be in frame.",
            ErrorCode.LIVENESS_NOT_COMPLETED: "Liveness could not be confirmed. Retake the scan.",
        }
        message = messages.get(reason, "Liveness check failed. Please perform the requested action.")
        raise ApiError(reason, message, 422)

    # ---- 1:1 face match against THIS student's enrolled embedding ----
    from app.face_ai.quality import pick_sharpest

    best_frame = decoded[pick_sharpest(decoded)]
    try:
        live_embedding = await run_in_threadpool(recognizer.detect_and_embed, best_frame)
        enrollment, enrolled_embedding = await load_active_enrollment(db, student.id, recognizer.provider_name)
    except ApiError as exc:
        row.completed_at = now
        row.verified = False
        row.failure_reason = exc.code.value
        await db.commit()
        raise

    similarity = cosine_similarity(live_embedding, enrolled_embedding)
    row.similarity_score = round(float(similarity), 4)
    row.face_enrollment_id = enrollment.id
    threshold = settings.face_match_threshold

    if similarity < threshold:
        row.completed_at = now
        row.verified = False
        row.failure_reason = ErrorCode.FACE_MISMATCH.value
        await db.commit()
        await audit_detached(
            action="face_verification_failed",
            actor_user_id=actor_user_id,
            entity_type="attendance_session",
            entity_id=session_id,
            details={"reason": "FACE_MISMATCH"},  # score stays internal
            ip_address=ip_address,
        )
        raise ApiError(ErrorCode.FACE_MISMATCH,
                       "Your face did not match the enrolled face. Retry in even lighting.", 422)

    # Success -> mint one-time short-lived token
    row.completed_at = now
    row.verified = True
    row.token = uuid.uuid4()
    row.expires_at = now + timedelta(seconds=settings.face_token_ttl_seconds)
    await db.commit()
    logger.info("Face verified student=%s session=%s", student.id, session_id)
    return {
        "verified": True,
        "faceId": str(enrollment.id),
        "faceVerificationToken": str(row.token),
        "expiresAt": row.expires_at.isoformat(),
        "message": "Face verified successfully.",
    }
