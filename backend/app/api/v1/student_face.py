"""Student face endpoints: enrolment status, enrolment, challenges, verification."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_student, get_db, limiter
from app.face_ai.liveness_service import get_liveness_analyzer
from app.face_ai.recognition_service import get_face_recognition_service
from app.models.entities import Student
from app.schemas import (
    ChallengeRequest,
    ChallengeResponse,
    EnrollmentStatusResponse,
    FaceEnrollmentRequest,
    FaceVerificationResponse,
    VerifyFaceRequest,
)
from app.services.enrollment_service import enroll_face, get_enrollment_status
from app.services.verification_service import issue_challenge, verify_face

router = APIRouter(prefix="/student", tags=["student-face"])


@router.get("/face-enrollment/status", response_model=EnrollmentStatusResponse)
async def face_enrollment_status(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> EnrollmentStatusResponse:
    return EnrollmentStatusResponse(**await get_enrollment_status(
        db, student, get_face_recognition_service().provider_name
    ))


@router.post("/face-enrollment", response_model=EnrollmentStatusResponse)
@limiter.limit(settings.rate_limit_face)
async def create_face_enrollment(
    payload: FaceEnrollmentRequest,
    request: Request,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> EnrollmentStatusResponse:
    status = await enroll_face(
        db,
        student=student,
        actor_user_id=student.user_id,
        samples_b64=payload.samples,
        consent_granted=payload.consent_granted,
        ip_address=request.client.host if request.client else None,
        recognizer=get_face_recognition_service(),
    )
    return EnrollmentStatusResponse(**status)


@router.post("/liveness/challenge", response_model=ChallengeResponse)
@limiter.limit(settings.rate_limit_face)
async def create_liveness_challenge(
    payload: ChallengeRequest,
    request: Request,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> ChallengeResponse:
    data = await issue_challenge(db, student=student, session_id=payload.session_id)
    return ChallengeResponse(
        challenge_token=data["challengeToken"],
        instruction=data["instruction"],
        expires_at=data["expiresAt"],
    )


@router.post("/attendance/verify-face", response_model=FaceVerificationResponse)
@limiter.limit(settings.rate_limit_face)
async def verify_face_endpoint(
    payload: VerifyFaceRequest,
    request: Request,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> FaceVerificationResponse:
    # Model inference is CPU-bound; run in the threadpool to keep the loop free.
    result = await verify_face(
        db,
        student=student,
        actor_user_id=student.user_id,
        session_id=payload.session_id,
        challenge_token=payload.challenge_token,
        frames_b64=payload.frames,
        ip_address=request.client.host if request.client else None,
        recognizer=get_face_recognition_service(),
        liveness=get_liveness_analyzer(),
    )
    return FaceVerificationResponse(
        verified=result["verified"],
        face_verification_token=result.get("faceVerificationToken"),
        expires_at=result.get("expiresAt"),
        message=result["message"],
    )
