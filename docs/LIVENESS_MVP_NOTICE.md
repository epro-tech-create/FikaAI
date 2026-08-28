# Liveness Detection — MVP Scope Notice

## What CCD-Attendance implements today

CCD-Attendance's `LivenessDetectionService` uses **MediaPipe Face Landmarker**
(478 landmarks + blendshapes) evaluated **on the backend** over a short,
timestamped sequence of camera frames. Randomized challenges supported:

| Challenge       | Signal used                                        |
|-----------------|----------------------------------------------------|
| Blink twice     | `eyeBlinkLeft/Right` blendshape peaks + valleys     |
| Turn head left  | nose-tip yaw ratio beyond threshold                 |
| Turn head right | nose-tip yaw ratio beyond threshold (opposite sign) |
| Smile           | `mouthSmileLeft/Right` blendshape                   |
| Look straight   | small yaw + eyes open                               |

All frames are processed in memory, never persisted, and the pass/fail decision
happens exclusively server-side. The client cannot assert liveness.

## Honest limitation — this is NOT production-grade anti-spoofing

Landmark-based challenges are an **MVP protection** against the laziest attacks
(a static photo held in front of the camera). They do **not** reliably stop:

* Printed-photo cut-outs animated by hand
* High-quality screen replays
* 3-D masks
* Deepfake-driven virtual cameras
* Bypassing the browser and calling the API with pre-rendered frames crafted to
  satisfy the geometric checks

Because frames arrive as ordinary JPEGs, a determined attacker who reverse-
engineers the API could synthesize a frame sequence. This is an accepted risk
for the MVP deployment stage.

## Upgrade path (designed for)

`face_ai/liveness_service.py` sits behind the `LivenessAnalyzer` interface
(`analyze(frames, challenge) -> LivenessResult`). To harden later, implement a
new analyzer and swap it in — e.g.:

1. **Pretrained passive anti-spoofing model** (e.g. ONNX MiniFASNet /
   Silent-Face-Anti-Spoofing) scoring each frame for print/replay artifacts;
   combine its score with challenge results.
2. **Active depth/IR capture** where device support allows.
3. **Server-side motion coherence analysis** across frames (optical-flow
   plausibility, texture statistics).
4. Attestation-bound mobile apps instead of browser capture.

No changes to routers, services or schemas are required — only a new analyzer
implementation registered in `face_ai/liveness_service.py`.
