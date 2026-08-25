#!/usr/bin/env python
"""Download pretrained AI models into MODELS_DIR (default: ./models_data).

Downloads:
  1. InsightFace buffalo_l pack   (~330 MB, ArcFace embeddings + SCRFD detector)
     https://github.com/deepinsight/insightface  (model weights: non-commercial research licence)
  2. MediaPipe face_landmarker.task (~3.7 MB, Apache-2.0)

Run once before starting the backend with FACE_EMBEDDING_PROVIDER=insightface.
Offline install: place files manually as described in the README.
"""

from __future__ import annotations

import sys
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402

BUFFALO_URL = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/latest/face_landmarker.task"
)


def download(url: str, dest: Path) -> None:
    print(f"Downloading {url}")
    print(f"       -> {dest}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    existing = tmp.stat().st_size if tmp.exists() else 0
    request = urllib.request.Request(url)
    if existing:
        request.add_header("Range", f"bytes={existing}-")
    with urllib.request.urlopen(request) as response:
        resume = existing and response.status == 206
        if existing and not resume:
            existing = 0
        mode = "ab" if resume else "wb"
        with open(tmp, mode) as out:
            done = existing
            while chunk := response.read(1 << 20):
                out.write(chunk)
                done += len(chunk)
                print(f"\r  {done / 1e6:.1f} MB", end="", flush=True)
    print()
    tmp.rename(dest)


def main() -> int:
    models_dir = settings.models_dir
    insightface_root = models_dir / "models"
    pack_dir = insightface_root / "buffalo_l"

    # --- buffalo_l (FaceAnalysis looks under <root>/models/buffalo_l) ---
    if all((pack_dir / name).exists() for name in ("det_10g.onnx", "w600k_r50.onnx")):
        print("buffalo_l already present - skipping")
    else:
        pack_dir.mkdir(parents=True, exist_ok=True)
        zip_path = models_dir / "buffalo_l.zip"
        if not zip_path.exists():
            download(BUFFALO_URL, zip_path)
        print("Extracting buffalo_l ...")
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(pack_dir)
        zip_path.unlink()
    print(f"buffalo_l contents: {sorted(p.name for p in pack_dir.glob('*'))}")

    # --- MediaPipe Face Landmarker ---
    landmarker_path = models_dir / "face_landmarker.task"
    if landmarker_path.exists():
        print("face_landmarker.task already present - skipping")
    else:
        models_dir.mkdir(parents=True, exist_ok=True)
        download(LANDMARKER_URL, landmarker_path)

    print("\nAll models ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
