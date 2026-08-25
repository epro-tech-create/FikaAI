# Calibrating the Face-Match Threshold

`FACE_MATCH_THRESHOLD` (default **0.45**) is an **initial development value only**.
It is NOT universally accurate. Before any real deployment you MUST calibrate it
against your own population, camera hardware and lighting conditions.

## What the threshold means

Verification compares the live embedding with the enrolled embedding using
**cosine similarity** in [-1, 1] (1 = identical direction). A candidate
threshold `t` accepts a match when `similarity >= t`.

- Set `t` too low  → impostors are accepted (false accepts, FAR ↑)
- Set `t` too high → genuine users are rejected (false rejects, FRR ↑)

## Calibration procedure

1. **Collect genuine samples.** For at least 20 volunteers, enrol a face, then
   perform several genuine verification captures across a few days, lighting
   conditions and poses. Record each genuine similarity score.

2. **Collect impostor samples.** For each volunteer, attempt verification using
   *other* volunteers' enrolments (each impostor tries many targets). Record
   those scores.

3. **Plot distributions.** Genuine scores should cluster near 0.5–0.8;
   impostor scores near 0.0–0.25 for ArcFace embeddings.

4. **Choose the operating point.** Pick `t` at your acceptable False Accept
   Rate, e.g. the 1st percentile of impostor scores gives FAR ≈ 1%:

   ```text
   t = quantile(impostor_scores, 0.99)   # 99% of impostors fall below t
   ```

   Then check the resulting false-reject rate on genuine scores and tune
   between FAR and convenience.

5. **Configure and monitor.**

   ```env
   FACE_MATCH_THRESHOLD=0.55   # example calibrated value
   ```

   Review `audit_logs` (`action = 'face_verification_failed'`) weekly during
   rollout; a high rejection rate means `t` is too aggressive for your cameras.

## Quick measurement helper

The similarity computation lives in
`backend/app/face_ai/recognition_service.py::cosine_similarity`. A minimal
calibration script:

```python
import numpy as np
from app.face_ai.recognition_service import cosine_similarity

genuine  = []   # append scores from genuine attempts
impostor = []   # append scores from impostor attempts

for t in np.arange(0.30, 0.70, 0.01):
    far = np.mean(np.array(impostor) >= t)
    frr = np.mean(np.array(genuine)  <  t)
    print(f"t={t:.2f}  FAR={far:.3f}  FRR={frr:.3f}")
```

Choose the smallest `t` whose FAR meets your policy, then verify FRR is
operationally acceptable.
