import base64
import uuid
from datetime import datetime, timezone

import numpy as np
import pytest

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.face_ai.liveness_service import MediaPipeLivenessAnalyzer, _FrameSignals
from app.face_ai.quality import MIN_BLUR_VARIANCE, assess_quality, select_temporally_distributed
from app.face_ai.recognition_service import FakeRecognitionService
from app.models.entities import LivenessChallengeType
from app.models.entities import Student
from app.schemas import ChallengeResponse, EnrollmentStatusResponse
from app.services.enrollment_service import decode_frame, enroll_face
from app.services.verification_service import aggregate_match_scores, is_robust_match


class StubSignalAnalyzer(MediaPipeLivenessAnalyzer):
    def __init__(self, signals: list[_FrameSignals]) -> None:
        super().__init__()
        self.signals = iter(signals)

    def _signals(self, _frame: np.ndarray) -> _FrameSignals:
        return next(self.signals)


def test_challenge_response_preserves_camel_case_challenge_type():
    response = ChallengeResponse(
        challengeToken=uuid.uuid4(),
        challengeType="SMILE",
        instruction="Smile at the camera",
        expiresAt=datetime.now(timezone.utc),
    )

    assert response.model_dump(by_alias=True)["challengeType"] == "SMILE"


def test_enrollment_status_returns_persisted_face_id():
    face_id = uuid.uuid4()

    response = EnrollmentStatusResponse(enrolled=True, faceId=face_id)

    assert response.model_dump(by_alias=True)["faceId"] == face_id


def test_liveness_returns_original_indices_for_near_frontal_faces():
    signals = [
        _FrameSignals(0, 0.0, 0.0, 0.0),
        _FrameSignals(1, 0.0, 0.6, 0.02),
        _FrameSignals(0, 0.0, 0.0, 0.0),
        _FrameSignals(1, 0.0, 0.1, 0.01),
        _FrameSignals(1, 0.0, 0.1, 0.2),
    ]
    frames = [np.full((20, 20, 3), value, dtype=np.uint8) for value in (0, 10, 20, 30, 40)]
    frames[3][::2, ::2] = 255

    result = StubSignalAnalyzer(signals).analyze(frames, LivenessChallengeType.SMILE)

    assert result.passed
    assert result.best_frame_index == 3
    assert result.candidate_frame_indices == (1, 3)


def test_no_face_frame_cannot_supply_challenge_signal():
    signals = [
        _FrameSignals(1, 0.0, 0.1, 0.0),
        _FrameSignals(1, 0.0, 0.1, 0.0),
        _FrameSignals(0, 0.0, 1.0, 0.0),
        _FrameSignals(0, 0.0, 1.0, 0.0),
        _FrameSignals(1, 0.0, 0.1, 0.0),
        _FrameSignals(1, 0.0, 0.1, 0.0),
    ]
    frames = [np.zeros((10, 10, 3), dtype=np.uint8) for _ in signals]

    result = StubSignalAnalyzer(signals).analyze(frames, LivenessChallengeType.SMILE)

    assert not result.passed
    assert result.failure_reason == ErrorCode.LIVENESS_FAILED


def test_quality_reports_low_light_before_blur():
    dark_noise = np.random.default_rng(2).integers(0, 40, size=(100, 100, 3), dtype=np.uint8)
    result = assess_quality(dark_noise)

    assert not result.ok
    assert result.reason_code == "TOO_DARK"


def test_quality_reports_blur_separately():
    blurred = np.full((100, 100, 3), 120, dtype=np.uint8)

    assert assess_quality(blurred).reason_code == "BLURRED_IMAGE"


def test_quality_accepts_normal_webcam_edge_detail():
    image = np.full((120, 160, 3), 120, dtype=np.uint8)
    image[:, ::8] = 155

    result = assess_quality(image)

    assert result.blur_variance >= MIN_BLUR_VARIANCE
    assert result.ok


@pytest.mark.asyncio
async def test_enrollment_stops_inference_after_five_good_samples(monkeypatch):
    import cv2

    good = np.full((120, 160, 3), 120, dtype=np.uint8)
    good[:, ::8] = 155
    blurred = np.full((120, 160, 3), 120, dtype=np.uint8)

    def encode(image: np.ndarray) -> str:
        success, data = cv2.imencode(".jpg", image)
        assert success
        return base64.b64encode(data).decode()

    class FakeDb:
        enrollment = None

        async def execute(self, _statement):
            return None

        def add(self, enrollment):
            self.enrollment = enrollment

        async def commit(self):
            self.enrollment.id = uuid.uuid4()
            self.enrollment.created_at = datetime.now(timezone.utc)

    class CountingRecognizer(FakeRecognitionService):
        calls = 0

        def detect_and_embed(self, bgr):
            self.calls += 1
            return super().detect_and_embed(bgr)

    async def no_audit(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.services.enrollment_service.audit_detached_safe", no_audit)
    student = Student(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        registration_number="TEST-001",
        consent_given_at=None,
    )
    db = FakeDb()
    recognizer = CountingRecognizer(always_match=True)

    result = await enroll_face(
        db,
        student=student,
        actor_user_id=student.user_id,
        samples_b64=[encode(good)] * 5 + [encode(blurred)] * 2,
        consent_granted=True,
        ip_address=None,
        recognizer=recognizer,
    )

    assert result["enrolled"]
    assert result["sampleCount"] == 5
    assert recognizer.calls == 5


def test_candidate_selection_spreads_five_frames_across_sequence():
    assert select_temporally_distributed(list(range(10))) == [0, 2, 4, 7, 9]


def test_match_aggregation_uses_majority_not_single_best_score():
    assert aggregate_match_scores([0.99, 0.2, 0.3]) == pytest.approx(0.3)
    assert is_robust_match([0.8, 0.7, 0.6, 0.4], 0.6)
    assert not is_robust_match([0.9, 0.8, 0.4, 0.3], 0.6)
    with pytest.raises(ValueError):
        aggregate_match_scores([0.9, 0.9])


def test_decode_frame_enforces_frame_limit_not_enrollment_limit(monkeypatch):
    monkeypatch.setattr(settings, "max_frame_bytes", 10)
    encoded = base64.b64encode(b"\xff\xd8\xff" + b"x" * 8).decode()

    with pytest.raises(ApiError) as error:
        decode_frame(encoded)

    assert error.value.code == ErrorCode.FILE_TOO_LARGE
    assert "10 bytes" in error.value.message
