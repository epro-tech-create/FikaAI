"""Reusable liveness detection service (MVP - see docs/LIVENESS_MVP_NOTICE.md).

Randomized challenges are evaluated SERVER-SIDE over a short sequence of
frames using MediaPipe Face Landmarker landmarks + blendshapes:

    BLINK_TWICE   eyeBlinkLeft/Right blendshape: two peaks separated by valleys
    TURN_LEFT     nose-tip yaw ratio beyond +YAW_THRESHOLD
    TURN_RIGHT    nose-tip yaw ratio beyond -YAW_THRESHOLD
    SMILE         mouthSmile blendshape beyond threshold
    LOOK_STRAIGHT |yaw| stays small and eyes open

The analyzer interface (`LivenessAnalyzer`) exists so a stronger pretrained
anti-spoofing model can replace/augment it later without touching services.

This is basic MVP protection, NOT production-grade anti-spoofing.
"""

from __future__ import annotations

import logging
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.models.entities import LivenessChallengeType

logger = logging.getLogger("fikaai.liveness")

# MediaPipe FaceMesh canonical landmark indices
NOSE_TIP = 1
LEFT_EYE_OUTER = 33    # subject's left appears on image right for a selfie view
RIGHT_EYE_OUTER = 263

MIN_FRAMES = 5
FACE_PRESENCE_RATIO = 0.6   # >=60% of frames must contain exactly one face
BLINK_PEAK = 0.55
BLINK_VALLEY = 0.35
SMILE_THRESHOLD = 0.45
YAW_THRESHOLD = 0.12
LOOK_STRAIGHT_YAW = 0.10


@dataclass(frozen=True)
class LivenessResult:
    passed: bool
    best_frame_index: int = 0
    failure_reason: ErrorCode | None = None
    metrics: dict = field(default_factory=dict)


class LivenessAnalyzer(ABC):
    @abstractmethod
    def analyze(self, frames: list[np.ndarray], challenge: LivenessChallengeType) -> LivenessResult:
        ...


@dataclass(frozen=True)
class _FrameSignals:
    face_count: int
    blink: float
    smile: float
    yaw: float


def _yaw_ratio(landmarks) -> float:
    """Horizontal nose position between the outer eye corners, in [-1, 1].

    Positive values mean the nose shifted toward the image-left side of the
    face box, which corresponds to the subject turning their head to their own
    right in an unmirrored camera frame. Sign conventions are calibrated for
    selfie (unmirrored) frames; thresholds are intentionally generous for MVP.
    """
    nose = landmarks[NOSE_TIP]
    le = landmarks[LEFT_EYE_OUTER]
    re = landmarks[RIGHT_EYE_OUTER]
    span = abs(re.x - le.x)
    if span < 1e-6:
        return 0.0
    return ((nose.x - le.x) - (re.x - nose.x)) / span


class MediaPipeLivenessAnalyzer(LivenessAnalyzer):
    """Analyzes uploaded frames with MediaPipe Face Landmarker (CPU)."""

    def __init__(self) -> None:
        self._landmarker = None
        self._lock = threading.Lock()

    def _load(self):
        with self._lock:
            if self._landmarker is not None:
                return self._landmarker
            model_path = settings.models_dir / "face_landmarker.task"
            if not model_path.exists():
                raise RuntimeError(
                    f"MediaPipe face_landmarker.task not found at {model_path}. "
                    "Run `python scripts/download_models.py` first."
                )
            import mediapipe as mp

            options = mp.tasks.vision.FaceLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path)),
                running_mode=mp.tasks.vision.RunningMode.IMAGE,
                num_faces=1,
                output_face_blendshapes=True,
            )
            self._landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
            logger.info("MediaPipe Face Landmarker loaded")
            return self._landmarker

    def _signals(self, bgr: np.ndarray) -> _FrameSignals:
        landmarker = self._load()
        import mediapipe as mp

        rgb = cv2_cvt_rgb(bgr)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_image)

        if not result.face_landmarks:
            return _FrameSignals(face_count=0, blink=0.0, smile=0.0, yaw=0.0)

        landmarks = result.face_landmarks[0]
        blink = 0.0
        smile = 0.0
        if result.face_blendshapes:
            categories = {c.category_name: c.score for c in result.face_blendshapes[0]}
            blink = max(categories.get("eyeBlinkLeft", 0.0), categories.get("eyeBlinkRight", 0.0))
            smile = max(categories.get("mouthSmileLeft", 0.0), categories.get("mouthSmileRight", 0.0))
        yaw = _yaw_ratio(landmarks)
        # num_faces=1 makes >1 undetectable by the landmarker itself; the
        # recognition service enforces the multi-face rule on the chosen frame.
        return _FrameSignals(face_count=len(result.face_landmarks), blink=float(blink),
                             smile=float(smile), yaw=float(yaw))

    def analyze(self, frames: list[np.ndarray], challenge: LivenessChallengeType) -> LivenessResult:
        if len(frames) < MIN_FRAMES:
            return LivenessResult(False, 0, ErrorCode.LIVENESS_NOT_COMPLETED,
                                  {"reason": f"At least {MIN_FRAMES} frames required", "frames": len(frames)})

        signals = [self._signals(f) for f in frames]
        faces_ok = [s.face_count == 1 for s in signals]

        metrics = {
            "frames": len(frames),
            "faces_ok_frames": int(sum(faces_ok)),
            "max_blink": round(max(s.blink for s in signals), 3),
            "max_smile": round(max(s.smile for s in signals), 3),
            "max_yaw_left": round(max(s.yaw for s in signals), 3),
            "max_yaw_right": round(min(s.yaw for s in signals), 3),
        }

        if sum(faces_ok) / len(frames) < FACE_PRESENCE_RATIO:
            zero_face = all(not ok for ok in faces_ok)
            reason = ErrorCode.NO_FACE if zero_face else ErrorCode.MULTIPLE_FACES
            return LivenessResult(False, 0, reason, metrics)
        if not faces_ok[-1]:
            return LivenessResult(False, 0, ErrorCode.NO_FACE,
                                  {**metrics, "reason": "Face missing at end of sequence"})

        from app.face_ai.quality import pick_sharpest
        sharp_idx = pick_sharpest([f for f, ok in zip(frames, faces_ok) if ok])

        challenge_result = self._evaluate_challenge(signals, challenge)
        if not challenge_result.passed:
            return LivenessResult(False, sharp_idx, ErrorCode.LIVENESS_FAILED, {**metrics, **challenge_result.metrics})
        return LivenessResult(True, sharp_idx, None, {**metrics, **challenge_result.metrics})

    def _evaluate_challenge(self, signals: list[_FrameSignals], challenge: LivenessChallengeType) -> LivenessResult:
        blinks = [s.blink for s in signals]
        yaws = [s.yaw for s in signals]
        smiles = [s.smile for s in signals]

        def blink_peaks() -> int:
            """Count contiguous runs of closed-eye frames (>= BLINK_PEAK)."""
            peaks = 0
            above = [b >= BLINK_PEAK for b in blinks]
            i = 0
            while i < len(above):
                if above[i]:
                    peaks += 1
                    while i < len(above) and above[i]:
                        i += 1
                else:
                    i += 1
            return peaks

        if challenge == LivenessChallengeType.BLINK_TWICE:
            peaks = blink_peaks()
            ok = peaks >= 2 and min(blinks) <= BLINK_VALLEY * 1.4
            return LivenessResult(ok, 0, None, {"blink_peaks": peaks})

        if challenge == LivenessChallengeType.SMILE:
            ok = max(smiles) >= SMILE_THRESHOLD
            return LivenessResult(ok, 0, None, {})

        if challenge == LivenessChallengeType.TURN_LEFT:
            # Subject turns to THEIR left => nose moves toward image-right => negative ratio
            ok = min(yaws) <= -YAW_THRESHOLD
            return LivenessResult(ok, 0, None, {})

        if challenge == LivenessChallengeType.TURN_RIGHT:
            ok = max(yaws) >= YAW_THRESHOLD
            return LivenessResult(ok, 0, None, {})

        if challenge == LivenessChallengeType.LOOK_STRAIGHT:
            median_abs_yaw = float(np.median(np.abs(yaws)))
            ok = median_abs_yaw <= LOOK_STRAIGHT_YAW
            return LivenessResult(ok, 0, None, {"median_abs_yaw": round(median_abs_yaw, 3)})

        return LivenessResult(False, 0, ErrorCode.LIVENESS_FAILED, {})


def cv2_cvt_rgb(bgr: np.ndarray) -> np.ndarray:
    import cv2

    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


class FakeLivenessAnalyzer(LivenessAnalyzer):
    """Test double: configurable pass/fail without any real CV work."""

    def __init__(self, passed: bool = True, failure_reason: ErrorCode | None = None) -> None:
        self.passed = passed
        self.failure_reason = failure_reason

    def analyze(self, frames: list[np.ndarray], challenge: LivenessChallengeType) -> LivenessResult:
        if self.passed:
            return LivenessResult(True, 0, None, {"analyzer": "fake"})
        return LivenessResult(False, 0, self.failure_reason or ErrorCode.LIVENESS_FAILED, {"analyzer": "fake"})


@lru_cache(maxsize=1)
def get_liveness_analyzer() -> LivenessAnalyzer:
    if settings.face_embedding_provider == "fake":
        # In fake demo mode keep the real MediaPipe analyzer when weights exist;
        # fall back to auto-pass so the flow is clickable without downloads.
        if not (settings.models_dir / "face_landmarker.task").exists():
            logger.warning("face_landmarker.task missing - FakeLivenessAnalyzer active (dev only)")
            return FakeLivenessAnalyzer(passed=True)
    return MediaPipeLivenessAnalyzer()
