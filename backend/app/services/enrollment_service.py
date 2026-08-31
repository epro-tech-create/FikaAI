"""Face enrolment: 5-10 quality-gated samples -> consistent embeddings ->
averaged, normalized, encrypted embedding persisted for the student.

Raw images are processed in memory and NEVER stored. Embeddings never appear
in API responses or logs.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

import numpy as np
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import cipher
from app.core.errors import ApiError, ErrorCode
from app.face_ai.recognition_service import BaseFaceRecognitionService, cosine_similarity
from app.models.entities import FaceEnrollment, Student

logger = logging.getLogger("ccd.enroll")

MIN_SAMPLES = 5
MAX_SAMPLES = 10


def decode_image(encoded: str, *, max_bytes: int, label: str) -> bytes:
    """Accept raw base64 or data URLs and enforce the supplied decoded-byte limit."""
    import base64
    import binascii

    payload = encoded.strip()
    if payload.startswith("data:"):
        _, _, payload = payload.partition(",")
    try:
        blob = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise ApiError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, f"{label} is not valid base64.", 422) from exc

    if len(blob) > max_bytes:
        raise ApiError(ErrorCode.FILE_TOO_LARGE,
                       f"{label} {len(blob)} exceeds the size limit of {max_bytes} bytes.", 413)
    if not (blob[:3] == b"\xff\xd8\xff" or blob[:8] == b"\x89PNG\r\n\x1a\n"):
        raise ApiError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, f"{label} must be a JPEG or PNG image.", 415)
    return blob


def decode_sample(encoded: str) -> bytes:
    return decode_image(encoded, max_bytes=settings.max_sample_bytes, label="Sample")


def decode_frame(encoded: str) -> bytes:
    return decode_image(encoded, max_bytes=settings.max_frame_bytes, label="Frame")


def _consistency(embeddings: list[np.ndarray]) -> float:
    """Mean pairwise cosine similarity across all accepted samples."""
    n = len(embeddings)
    sims = [
        cosine_similarity(embeddings[i], embeddings[j])
        for i in range(n)
        for j in range(i + 1, n)
    ]
    return float(sum(sims) / len(sims)) if sims else 1.0


async def get_enrollment_status(
    db: AsyncSession, student: Student, provider_name: str | None = None
) -> dict:
    result = await db.execute(
        select(FaceEnrollment).where(
            FaceEnrollment.student_id == student.id,
            FaceEnrollment.is_active.is_(True),
        )
    )
    active = result.scalar_one_or_none()
    provider_matches = active is not None and (
        provider_name is None or active.provider == provider_name
    )
    return {
        "enrolled": provider_matches,
        "faceId": str(active.id) if active and provider_matches else None,
        "enrolledAt": active.created_at.isoformat() if active else None,
        "sampleCount": active.sample_count if active else 0,
        "provider": active.provider if active else None,
        "consentGivenAt": student.consent_given_at.isoformat() if student.consent_given_at else None,
    }


async def enroll_face(
    db: AsyncSession,
    *,
    student: Student,
    actor_user_id: uuid.UUID,
    samples_b64: list[str],
    consent_granted: bool,
    ip_address: str | None,
    recognizer: BaseFaceRecognitionService,
) -> dict:
    if not consent_granted:
        await audit_detached_safe(actor_user_id, ip_address, "CONSENT_REQUIRED")
        raise ApiError(ErrorCode.CONSENT_REQUIRED, "Biometric consent must be granted before enrolment.", 400)

    if not (MIN_SAMPLES <= len(samples_b64) <= MAX_SAMPLES):
        raise ApiError(
            ErrorCode.SAMPLE_COUNT_INVALID,
            f"Between {MIN_SAMPLES} and {MAX_SAMPLES} face samples are required (received {len(samples_b64)}).",
            422,
        )

    blobs = [decode_sample(s) for s in samples_b64]

    # Keep enough good samples rather than rejecting an otherwise usable batch
    # because one camera frame was blurred or missed by the detector.
    import cv2

    embeddings: list[np.ndarray] = []
    rejected: list[dict] = []
    from app.face_ai.quality import assess_quality

    for index, blob in enumerate(blobs):
        img = cv2.imdecode(np.frombuffer(blob, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            rejected.append({"sampleIndex": index, "code": ErrorCode.UNSUPPORTED_MEDIA_TYPE.value})
            continue
        quality = assess_quality(img)
        if not quality.ok:
            code = ErrorCode.BLURRED_IMAGE if quality.reason_code == "BLURRED_IMAGE" else ErrorCode.TOO_DARK
            rejected.append({"sampleIndex": index, "code": code.value})
            continue
        try:
            embedding = await run_in_threadpool(recognizer.detect_and_embed, img)
        except ApiError as exc:
            rejected.append({"sampleIndex": index, "code": exc.code.value})
            continue
        embeddings.append(embedding)
        if len(embeddings) == MIN_SAMPLES:
            break

    if len(embeddings) < MIN_SAMPLES:
        raise ApiError(
            ErrorCode.SAMPLE_COUNT_INVALID,
            f"Only {len(embeddings)} usable face samples were captured. Hold still in even lighting and try again.",
            422,
            {"acceptedCount": len(embeddings), "rejectedSamples": rejected},
        )

    consistency = _consistency(embeddings)
    if consistency < settings.face_min_consistency:
        await audit_detached_safe(actor_user_id, ip_address, "INCONSISTENT_SAMPLES",
                                  {"consistency": round(consistency, 3)})
        raise ApiError(
            ErrorCode.INCONSISTENT_SAMPLES,
            "The samples do not appear to belong to the same person. Retake them in even lighting.",
            422,
            {"meanConsistency": round(consistency, 3)},
        )

    # Average -> L2 normalize -> encrypt. Raw vectors are dropped here.
    mean_vector = np.mean(np.stack(embeddings), axis=0)
    normalized = cipher.normalize(mean_vector)
    encrypted = cipher.encrypt(normalized)

    now = datetime.now(timezone.utc)
    # Revoke any previous active enrolment (admin/student re-enrolment path)
    await db.execute(
        update(FaceEnrollment)
        .where(FaceEnrollment.student_id == student.id, FaceEnrollment.is_active.is_(True))
        .values(is_active=False, revoked_at=now)
    )

    enrollment = FaceEnrollment(
        student_id=student.id,
        embedding_encrypted=encrypted,
        provider=recognizer.provider_name,
        embedding_dim=int(normalized.shape[0]),
        sample_count=len(embeddings),
        mean_consistency=round(consistency, 4),
        is_active=True,
        consent_given_at=now,
    )
    db.add(enrollment)

    if student.consent_given_at is None:
        student.consent_given_at = now

    await audit_detached_safe(actor_user_id, ip_address, "face_enrolled",
                              {"samples": len(embeddings), "consistency": round(consistency, 3)})
    await db.commit()
    logger.info("Face enrolled student=%s provider=%s samples=%d", student.id, recognizer.provider_name,
                 len(embeddings))
    return {
        "enrolled": True,
        "faceId": str(enrollment.id),
        "enrolledAt": enrollment.created_at.isoformat(),
        "sampleCount": enrollment.sample_count,
        "provider": enrollment.provider,
        "consentGivenAt": enrollment.consent_given_at.isoformat(),
    }


async def audit_detached_safe(actor_user_id: uuid.UUID, ip_address: str | None, action: str,
                              details: dict | None = None) -> None:
    from app.services.audit_service import audit_detached

    await audit_detached(action=action, actor_user_id=actor_user_id, entity_type="face_enrollment",
                         entity_id=None, details=details or {}, ip_address=ip_address)


async def load_active_enrollment(
    db: AsyncSession, student_id: uuid.UUID, expected_provider: str | None = None
) -> tuple[FaceEnrollment, np.ndarray]:
    """Return the active FaceID row and its decrypted reference embedding."""
    result = await db.execute(
        select(FaceEnrollment).where(
            FaceEnrollment.student_id == student_id,
            FaceEnrollment.is_active.is_(True),
        )
    )
    enrollment = result.scalar_one_or_none()
    if enrollment is None:
        raise ApiError(ErrorCode.FACE_NOT_ENROLLED,
                       "No face enrolment found. Complete face enrolment first.", 409)
    if expected_provider and enrollment.provider != expected_provider:
        raise ApiError(
            ErrorCode.FACE_REENROLL_REQUIRED,
            "Your face profile was created with an old recognition provider. Please enrol your face again.",
            409,
        )
    try:
        return enrollment, cipher.decrypt(bytes(enrollment.embedding_encrypted))
    except RuntimeError as exc:
        raise ApiError(
            ErrorCode.FACE_REENROLL_REQUIRED,
            "Your encrypted face profile is no longer readable. Please enrol your face again.",
            409,
        ) from exc


async def load_active_embedding(
    db: AsyncSession, student_id: uuid.UUID, expected_provider: str | None = None
) -> np.ndarray:
    """Compatibility helper for callers that only need the embedding."""
    _, embedding = await load_active_enrollment(db, student_id, expected_provider)
    return embedding
