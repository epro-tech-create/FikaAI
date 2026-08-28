"""Reusable face recognition service built on an InsightFace model pack.

Pipeline: detect (SCRFD) -> enforce EXACTLY ONE face -> align (5-point kps) ->
ArcFace embedding (CPUExecutionProvider) -> L2 normalization.

The service is a singleton created via `get_face_recognition_service()` and is
safe to call through FastAPI's threadpool. A pluggable interface allows a
different pretrained provider to be substituted without touching services.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from abc import ABC, abstractmethod
from functools import lru_cache

import numpy as np

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode

logger = logging.getLogger("fikaai.face")


class NoFaceError(ApiError):
    def __init__(self, detail: str | None = None) -> None:
        super().__init__(ErrorCode.NO_FACE, "No face detected. Please center your face and retry.", 422,
                         {"sample": detail} if detail else None)


class MultipleFacesError(ApiError):
    def __init__(self, detail: str | None = None) -> None:
        super().__init__(ErrorCode.MULTIPLE_FACES,
                         "Multiple faces detected. Only one person may be visible.", 422,
                         {"sample": detail} if detail else None)


def cosine_similarity(first: np.ndarray, second: np.ndarray) -> float:
    first = np.asarray(first, dtype=np.float32)
    second = np.asarray(second, dtype=np.float32)
    norm_first = np.linalg.norm(first)
    norm_second = np.linalg.norm(second)
    if norm_first == 0 or norm_second == 0:
        return 0.0
    return float(np.dot(first / norm_first, second / norm_second))


class BaseFaceRecognitionService(ABC):
    """Interface so stronger providers can be swapped in later."""

    provider_name: str = "base"
    embedding_dim: int = 512

    @abstractmethod
    def detect_and_embed(self, bgr: np.ndarray) -> np.ndarray:
        """Return a normalized embedding for the single face in the image."""

    def warm_up(self) -> None:
        """Load provider resources before serving verification requests."""

    def embed_bytes(self, encoded_image: bytes) -> tuple[np.ndarray, float]:
        """Decode an encoded image, run quality gate, return (embedding, blur_variance)."""
        import cv2  # local import keeps module import light for tests

        buf = np.frombuffer(encoded_image, dtype=np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if img is None:
            raise ApiError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, "Frame could not be decoded as an image.", 422)

        from app.face_ai.quality import assess_quality
        quality = assess_quality(img)
        if not quality.ok:
            code = ErrorCode.BLURRED_IMAGE if quality.reason_code == "BLURRED_IMAGE" else ErrorCode.TOO_DARK
            messages = {
                ErrorCode.BLURRED_IMAGE: "Image is blurred. Hold the camera steady.",
                ErrorCode.TOO_DARK: "Image is too dark or washed out. Improve lighting.",
            }
            raise ApiError(code, messages[code], 422)
        return self.detect_and_embed(img), quality.blur_variance


class InsightFaceRecognitionService(BaseFaceRecognitionService):
    """InsightFace detection + ArcFace recognition - non-commercial weights."""

    embedding_dim = 512

    def __init__(self) -> None:
        self._model = None
        self._load_lock = threading.Lock()
        self._inference_lock = threading.Lock()
        self.provider_name = f"insightface_{settings.insightface_model_name}"

    def _load(self):
        with self._load_lock:
            if self._model is not None:
                return self._model
            try:
                from insightface.app import FaceAnalysis
            except ImportError as exc:
                raise RuntimeError(
                    "insightface is not installed. Install backend dependencies or set "
                    "FACE_EMBEDDING_PROVIDER=fake for development."
                ) from exc
            det = settings.insightface_det_size
            model = FaceAnalysis(
                name=settings.insightface_model_name,
                root=str(settings.models_dir),
                allowed_modules=["detection", "recognition"],
                providers=["CPUExecutionProvider"],
            )
            model.prepare(ctx_id=-1, det_size=(det, det))
            self._model = model
            logger.info("InsightFace %s loaded (CPU)", settings.insightface_model_name)
            return self._model

    def warm_up(self) -> None:
        self._load()

    def detect_and_embed(self, bgr: np.ndarray) -> np.ndarray:
        model = self._load()
        # InsightFace/ONNX model objects are shared by threadpool requests.
        # Bound each worker to one inference at a time instead of CPU thrashing.
        with self._inference_lock:
            faces = model.get(bgr)
        if len(faces) == 0:
            raise NoFaceError()
        if len(faces) > 1:
            areas = [max(0.0, float(face.bbox[2] - face.bbox[0])) * max(0.0, float(face.bbox[3] - face.bbox[1])) for face in faces]
            largest_area = max(areas)
            faces = [
                face for face, area in zip(faces, areas)
                if largest_area > 0 and area / largest_area >= settings.face_min_relative_area
            ]
            if len(faces) > 1:
                raise MultipleFacesError()
            logger.info("Ignored %d small secondary face detection(s)", len(areas) - len(faces))
        embedding = np.asarray(faces[0].normed_embedding, dtype=np.float32)
        return EmbeddingNormalize(embedding)


def EmbeddingNormalize(vector: np.ndarray) -> np.ndarray:  # noqa: N802 - kept explicit for clarity
    norm = np.linalg.norm(vector)
    if norm == 0:
        raise ValueError("Cannot normalize a zero embedding.")
    return (np.asarray(vector, dtype=np.float32) / norm).astype(np.float32)


class FakeRecognitionService(BaseFaceRecognitionService):
    """DEVELOPMENT/DEMO ONLY - never for production.

    When FAKE_FACE_ALWAYS_MATCH=true every detection yields the SAME unit
    vector so the full enrolment->verification flow works without downloading
    InsightFace weights. Otherwise a deterministic hash-of-image vector is
    produced (same pixels => same embedding).
    """

    provider_name = "fake_dev"
    embedding_dim = 128

    def __init__(self, always_match: bool | None = None) -> None:
        self.always_match = settings.fake_face_always_match if always_match is None else always_match
        self._constant = EmbeddingNormalize(np.ones(self.embedding_dim, dtype=np.float32))

    def detect_and_embed(self, bgr: np.ndarray) -> np.ndarray:
        if self.always_match:
            return self._constant.copy()
        digest = hashlib.sha256(np.ascontiguousarray(bgr).tobytes()).digest()
        seed = np.frombuffer(digest, dtype=np.uint8).astype(np.float32)
        tiled = np.resize(seed, self.embedding_dim)
        return EmbeddingNormalize(tiled * 2.0 - 1.0)


@lru_cache(maxsize=1)
def get_face_recognition_service() -> BaseFaceRecognitionService:
    provider = settings.face_embedding_provider.lower().strip()
    if provider == "fake":
        logger.warning("Using FAKE face recognition service - development/demo only!")
        return FakeRecognitionService()
    if provider == "insightface":
        return InsightFaceRecognitionService()
    raise RuntimeError(f"Unknown FACE_EMBEDDING_PROVIDER '{provider}'. Use 'insightface' or 'fake'.")
