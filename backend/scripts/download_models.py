#!/usr/bin/env python
"""Download pretrained AI models into MODELS_DIR (default: ./models_data).

Downloads:
  1. InsightFace model pack (buffalo_sc by default, ~16 MB)
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

MODEL_FILES = {
    "buffalo_sc": ("det_500m.onnx", "w600k_mbf.onnx"),
    "buffalo_l": ("det_10g.onnx", "w600k_r50.onnx"),
}
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
    model_name = settings.insightface_model_name
    required_files = MODEL_FILES.get(model_name)
    if required_files is None:
        raise ValueError(f"Unsupported InsightFace model pack: {model_name}")
    pack_dir = models_dir / "models" / model_name

    # FaceAnalysis looks under <root>/models/<model_name>.
    if all((pack_dir / name).exists() for name in required_files):
        print(f"{model_name} already present - skipping")
    else:
        pack_dir.mkdir(parents=True, exist_ok=True)
        zip_path = models_dir / f"{model_name}.zip"
        if not zip_path.exists():
            download(
                f"https://github.com/deepinsight/insightface/releases/download/v0.7/{model_name}.zip",
                zip_path,
            )
        print(f"Extracting {model_name} ...")
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(pack_dir)
        zip_path.unlink()
    print(f"{model_name} contents: {sorted(p.name for p in pack_dir.glob('*'))}")

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
