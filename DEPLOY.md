# FikaAI Production Deployment

Managed-cloud split:

| Concern | Provider | Notes |
| --- | --- | --- |
| Frontends (student / admin / instructor) | Vercel | three projects from `frontend/`, ports irrelevant, HTTPS + CDN included |
| FastAPI backend + InsightFace | Render | Docker web service, Pro 4 GB/2 CPU, Frankfurt |
| PostgreSQL 16 | Neon | fresh production database, free tier to start |

The legacy single-VPS layout (`docker-compose.prod.yml` + Caddy) still works and is documented at the bottom.

InsightFace `buffalo_l` weights are non-commercial research licensed. Review the license before commercial deployment. Liveness is MVP-level (`docs/LIVENESS_MVP_NOTICE.md`).

## 1. Neon — create the database

1. Create a project (region: AWS **Frankfurt/eu-central-1**, near Render).
2. Dashboard → **Connect** → copy the connection string.
3. Convert it for SQLAlchemy asyncpg before use:

```text
postgresql://user:pass@ep-xxx-pooler.eu-central-1.aws.neon.tech/db?sslmode=require&channel_binding=require
```
becomes
```text
postgresql+asyncpg://user:pass@ep-xxx.eu-central-1.aws.neon.tech/db?ssl=require
```

- scheme → `postgresql+asyncpg://`
- `sslmode=require` → `ssl=require`, drop `channel_binding`
- start with the **direct** endpoint (no `-pooler`) — the app already pools connections

Keep this converted URL; it is the Render `DATABASE_URL`. Migrations run automatically on backend start (`start.sh`). Do **not** run `scripts/seed.py` against it.

## 2. Render — deploy the backend

1. Push this repository to GitHub/GitLab/Bitbucket (it is not yet a git repo).
2. Render dashboard → **New → Blueprint**, select the repo. `render.yaml` provisions:
   - web service `fikaai-backend` (Docker, root dir `backend`, plan **pro** 4 GB/2 CPU, region frankfurt)
   - health check `/ready` (verifies Neon `SELECT 1` + model files)
   - persistent disk 2 GB at `/app/models_data` (models survive deploys)
3. When prompted for the `sync: false` variables:
   - `DATABASE_URL`: paste the converted Neon URL
   - `EMBEDDING_ENCRYPTION_KEY`: generate with
     `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and back it up in a password manager. Losing it makes existing FaceIDs unreadable.
   - `CORS_ORIGINS`: set after step 3, then save (triggers redeploy):
     ```text
     https://<student>.vercel.app,https://<admin>.vercel.app,https://<instructor>.vercel.app
     ```
4. First deploy takes several minutes (Docker build + ~330 MB model download into the disk).

Verify: `https://<service>.onrender.com/ready` → `{"status":"ready",...}`.

Notes:
- `WEB_CONCURRENCY=1` keeps one InsightFace copy in RAM. The attached disk disables autoscaling/zero-downtime deploys (brief swap on release).
- Admin bootstrap after first successful deploy: Render service → **Shell** →
  ```bash
  python scripts/bootstrap_admin.py --email you@example.com --full-name "Admin"
  ```
  (interactive password prompt; never use dev seed credentials).

## 3. Vercel — deploy the three frontends

Create **three** projects from the same repo, each with Root Directory `frontend`, Framework preset **Vite**, Install Command `npm ci`:

| Project | Build command | `VITE_APP_ROLE` |
| --- | --- | --- |
| fikaai-student | `npm run build:student` | `student` |
| fikaai-admin | `npm run build:admin` | `admin` |
| fikaai-instructor | `npm run build:instructor` | `instructor` |

For every project set (Production + Preview):

```text
VITE_API_BASE_URL=https://<service>.onrender.com/api
```

All Vite variables are embedded in the browser bundle — never put backend secrets in `VITE_*`.

`frontend/vercel.json` adds the SPA rewrite so deep links like `/admin/dashboard` survive refresh.

Wrong-role logins are rejected per app (e.g. an instructor token cannot enter the admin build) — users open the app matching their role. Storage is isolated per origin, so sessions are independent across the three apps.

## 4. Initialize & verify

```bash
# backend
curl -fsS https://<service>.onrender.com/health
curl -fsS https://<service>.onrender.com/ready

# CORS preflight (expect access-control-allow-origin = student origin)
curl -i -X OPTIONS https://<service>.onrender.com/api/auth/login \
  -H 'Origin: https://<student>.vercel.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Browser checklist (real phone or laptop camera):
1. Student app → signup → face enrollment → **Continue to check-in** lands on the attendance scan (never back to enrollment).
2. Liveness challenge completes; attendance records.
3. Admin console login → dashboards load; direct-route refresh works on all three apps.
4. Camera/geolocation permissions grant on HTTPS origins.

Warm up the model once before the first real class (first face request loads weights lazily): perform one enrollment or scan, expect a slower first response.

## Costs

- Render Pro ~$85/mo + 2 GB disk ~$0.50/mo
- Neon: free tier initially (no SLA; scale when needed)
- Vercel Hobby is non-commercial only; institutional/commercial use needs Vercel Pro

## Backups

- Neon: enable daily backups/PITR (paid) before real attendance data lands; also take periodic `pg_dump`s via the Neon connection string.
- Store `EMBEDDING_ENCRYPTION_KEY` + database dumps together securely — dumps without the key cannot decrypt FaceIDs.

---

# Legacy single-VPS deployment

```bash
cp .env.production.example .env.production  # see git history for the VPS-era template
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Requires Docker + Compose on a 4 GB VPS, DNS A record, ports 80/443 open; Caddy terminates HTTPS. Alembic migrations and model downloads run automatically before Uvicorn starts. Back up with `pg_dump` from the `db` service plus `EMBEDDING_ENCRYPTION_KEY`.
