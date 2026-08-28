# CCD-Attendance System

Student attendance MVP based on **active session + GPS geofence + backend live face verification**.

The application serves one student population. Attendance sessions connect a
course and instructor directly, and student accounts require no subdivision or
session assignment.

The production geofence is centered on DIT's RAFIC Building
(`-6.8150`, `39.2792`) with a 50 m radius. Verify and calibrate the radius on
real devices before relying on it for attendance enforcement.

## Quick start

```bash
cp .env.example .env
cd backend
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -e '.[test]'
alembic upgrade head
FACE_EMBEDDING_PROVIDER=fake python scripts/seed.py
uvicorn app.main:app --reload
```

If you are already inside `backend/`, run the model command without the
additional `backend/` prefix:

```bash
.venv/bin/python scripts/download_models.py
```

From the repository root, the equivalent is:

```bash
backend/.venv/bin/python backend/scripts/download_models.py
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Demo student: `student01@fikaai.dev` / `Student@123`.
The fake provider is for development only. For the requested InsightFace pack:

```bash
python backend/scripts/download_models.py
```

Set `FACE_EMBEDDING_PROVIDER=insightface` and provide a persistent
`EMBEDDING_ENCRYPTION_KEY` before using real biometric data. InsightFace
InsightFace model weights have a non-commercial research license; review that license
before commercial deployment. MediaPipe landmark liveness is MVP-level only;
see `docs/LIVENESS_MVP_NOTICE.md`.

## Docker / Podman

```bash
cp .env.example .env
docker compose up --build
```

The compose backend downloads models on first startup. With Podman, use a
Compose-compatible wrapper or run PostgreSQL separately and use the native
setup above.

For a live HTTPS deployment on a VPS and domain, use the hardened production
stack documented in [`DEPLOY.md`](DEPLOY.md). Do not expose the development
Compose stack publicly; browsers require HTTPS for camera access.

## First administrator

After migration:

```bash
python backend/scripts/bootstrap_admin.py --email admin@example.com --full-name "First Admin"
```

## Privacy and calibration

Embeddings are encrypted at rest, raw images are processed in memory, and
embeddings are never returned by APIs. Calibrate `FACE_MATCH_THRESHOLD` with
genuine and impostor samples before deployment. See
`docs/THRESHOLD_CALIBRATION.md`.
