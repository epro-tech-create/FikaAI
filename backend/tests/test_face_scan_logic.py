import base64
import uuid
from datetime import datetime, timezone

import numpy as np
import pytest

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.face_ai.liveness_service import MediaPipeLivenessAnalyzer, _FrameSignals
from app.face_ai.quality import assess_quality, select_temporally_distributed
from app.models.entities import LivenessChallengeType
from app.schemas import ChallengeResponse
from app.services.enrollment_service import decode_frame
from app.services.verification_service import aggregate_match_scores, is_robust_match


class StubSignalAnalyzer(MediaPipeLivenessAnalyzer):
    def __init__(self, signals: list[_FrameSignals]) -> None:
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
