"""Frame quality gates: blur (Laplacian variance) and exposure checks.

Applied to every uploaded enrolment sample and live-verification frame before
any face processing. Thresholds are conservative MVP defaults.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class QualityResult:
    ok: bool
    reason_code: str | None = None  # "BLURRED_IMAGE" | "TOO_DARK"
    blur_variance: float = 0.0
    brightness: float = 0.0


MIN_BLUR_VARIANCE = 60.0   # Laplacian variance below this => blurred
MIN_BRIGHTNESS = 45.0      # mean grayscale below this => too dark
MAX_BRIGHTNESS = 238.0     # mean grayscale above this => washed out / overexposed


def assess_quality(bgr: np.ndarray) -> QualityResult:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blur_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())

    if blur_variance < MIN_BLUR_VARIANCE:
        return QualityResult(False, "BLURRED_IMAGE", blur_variance, brightness)
    if brightness < MIN_BRIGHTNESS or brightness > MAX_BRIGHTNESS:
        return QualityResult(False, "TOO_DARK", blur_variance, brightness)
    return QualityResult(True, None, blur_variance, brightness)


def pick_sharpest(frames: list[np.ndarray]) -> int:
    """Index of the frame with the highest Laplacian variance (best embed candidate)."""
    if not frames:
        raise ValueError("No frames provided")
    scores = [
        float(cv2.Laplacian(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
        for f in frames
    ]
    return int(max(range(len(scores)), key=lambda i: scores[i]))
