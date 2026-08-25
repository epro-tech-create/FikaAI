"""AES-style symmetric encryption for facial embeddings at rest.

Embeddings are encrypted with Fernet (AES-128-CBC + HMAC-SHA256). The key comes
from EMBEDDING_ENCRYPTION_KEY; raw vectors never leave this module unencrypted.
Decryption happens only inside the verification service and embeddings are
never included in any API response or log record.
"""

from __future__ import annotations

import numpy as np
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class EmbeddingCipher:
    def __init__(self, key: bytes | None = None) -> None:
        self._fernet = Fernet(key or settings.fernet_key)

    def encrypt(self, vector: np.ndarray) -> bytes:
        vec = np.ascontiguousarray(vector, dtype="<f4")
        header = np.array([vec.shape[0]], dtype="<i4").tobytes()
        return self._fernet.encrypt(header + vec.tobytes())

    def decrypt(self, blob: bytes) -> np.ndarray:
        try:
            plain = self._fernet.decrypt(blob)
        except InvalidToken as exc:  # wrong/rotated key
            raise RuntimeError("Stored embedding cannot be decrypted with the current key.") from exc
        dim = int(np.frombuffer(plain[:4], dtype="<i4")[0])
        vec = np.frombuffer(plain[4:], dtype="<f4")
        if vec.size != dim:
            raise RuntimeError("Corrupted embedding payload.")
        return vec.copy()

    @staticmethod
    def normalize(vector: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(vector)
        if norm == 0:
            raise ValueError("Cannot normalize a zero vector.")
        return (np.asarray(vector, dtype=np.float32) / norm).astype(np.float32)


cipher = EmbeddingCipher()
